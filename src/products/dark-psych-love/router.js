import { Router } from 'express';
import multer from 'multer';
import { Product, Agent, Report } from '../../models/index.js';
import { AXES, scoreBand } from './logic/axes.js';
import { prepareImageForVision, transcribeKakaoImages } from './logic/parseKakaoScreenshots.js';
import {
  computeStatPatterns,
  buildCandidateSegments,
  computePreviewRiskScore,
  formatConfirmedContext,
  CATEGORY_LABELS,
} from './logic/chatStats.js';
import { assessCounsel } from './logic/assessCounsel.js';
import { analyzeChatFlow } from './logic/analyzeChatFlow.js';
import { PRIVACY_NOTICE, REPORT_DISCLAIMER, HELP_RESOURCES, ACTION_GUIDES } from './logic/safety.js';
import { streamCounsel, isCounselorEnabled, buildCounselSystemPrompt, MAX_USER_TURNS } from './logic/counselor.js';

const SLUG = 'dark-psych-love';
const BASE = `/products/${SLUG}`;

const router = Router();

// 원본 이미지를 디스크에 남기지 않도록 메모리 스토리지 사용. 캡처 이미지 최대 10장, 장당 15MB
// (긴 스크롤 캡처는 세로가 길어 용량이 큰 편이라 여유를 둠 — 8000px 초과분은 서버에서 자동 분할).
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const ok = IMAGE_MIME_TYPES.has(file.mimetype);
    cb(ok ? null : new Error('카카오톡 캡처 이미지(.png, .jpg, .webp)만 업로드할 수 있습니다.'), ok);
  },
});

async function getProduct() {
  return Product.findOne({ where: { slug: SLUG } });
}

function view(name) {
  return `products/dark-psych-love/${name}`;
}

// ── 1. 상품 소개 ────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const product = await getProduct();
    if (!product) return res.status(404).render('platform/404', { title: '준비 중' });
    res.render(view('intro'), {
      title: product.name,
      product,
      base: BASE,
      activeTab: 'home',
      axes: AXES,
    });
  } catch (err) {
    next(err);
  }
});

// ── 2. 카카오톡 대화 캡처 업로드 (선택 — 상담 컨텍스트로만 사용) ──
router.get('/upload', (req, res) => {
  res.render(view('upload'), {
    title: '대화 업로드',
    base: BASE,
    activeTab: 'home',
    privacyNotice: PRIVACY_NOTICE,
  });
});

router.post('/upload', upload.array('chatImages', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).render(view('upload'), {
        title: '대화 업로드',
        base: BASE,
        activeTab: 'home',
        privacyNotice: PRIVACY_NOTICE,
        error: '카카오톡 캡처 이미지를 1장 이상 선택해 주세요.',
      });
    }

    // 여기서는 리사이즈/분할처럼 빠른 이미지 처리만 하고 무거운 LLM 판독은 하지 않는다 —
    // 업로드하자마자 '분석 중' 화면으로 바로 넘어가 실제 캡처가 곧바로 보이게 하고,
    // 진짜 분석(AI 판독)은 그 화면에서 비동기로(/analyzing/analyze) 진행한다.
    const preparedLists = await Promise.all(req.files.map(prepareImageForVision));
    const images = preparedLists.flat();

    // 서버 세션 메모리에만 임시 보관 — 이미지는 분석 완료 후(상담 시작 시) 즉시 폐기
    req.session.dpl = {
      captureImages: images.map((img) => ({ mimetype: img.mimetype, base64: img.buffer.toString('base64') })),
      analyzed: false,
    };

    res.redirect(`${BASE}/analyzing`);
  } catch (err) {
    next(err);
  }
});

// 업로드 직후 연출 화면 — 실제 업로드된 캡처 이미지를 즉시 보여준다. AI 판독은 아직 시작 전이며,
// 클라이언트가 로드되자마자 /analyzing/analyze 를 호출해 비동기로 진행한다.
router.get('/analyzing', (req, res) => {
  const captureImages = req.session.dpl?.captureImages;
  if (!captureImages || !captureImages.length) {
    return res.redirect(`${BASE}/counsel`);
  }
  res.render(view('analyzing'), {
    title: '대화 분석 중',
    base: BASE,
    activeTab: 'home',
    captureImages,
    analyzeUrl: `${BASE}/analyzing/analyze`,
    nextUrl: `${BASE}/counsel`,
  });
});

// 실제 AI 판독(비전 OCR + 통계 후보 좁히기 + 대화 흐름 판정) — '분석 중' 화면이 뜬 뒤 클라이언트가 호출.
// 새로고침 등으로 다시 호출되면 이미 만들어둔 결과를 그대로 재사용한다.
router.post('/analyzing/analyze', async (req, res) => {
  try {
    const dpl = req.session.dpl;
    if (!dpl?.captureImages?.length) {
      return res.status(400).json({ error: '분석할 이미지가 없습니다.' });
    }
    if (dpl.analyzed) {
      return res.json({ highlights: dpl.highlights || [], previewScore: dpl.previewScore || null });
    }

    const preparedImages = dpl.captureImages.map((img) => ({
      buffer: Buffer.from(img.base64, 'base64'),
      mimetype: img.mimetype,
    }));

    const { messages } = await transcribeKakaoImages(preparedImages);
    if (messages.length === 0) {
      dpl.analyzed = true;
      dpl.highlights = [];
      dpl.previewScore = null;
      return res.json({ highlights: [], previewScore: null, empty: true });
    }

    const { stats, candidateIndexes } = computeStatPatterns(messages);
    const segments = buildCandidateSegments(messages, candidateIndexes);

    // 통계(키워드)는 후보 구간을 좁히는 용도로만 쓰고, 실제 조종 발화 판정은 대화 흐름을 본 LLM이 확정
    const flowFlags = await analyzeChatFlow(segments);
    // 1차 위험점수도 키워드가 아니라 위에서 LLM이 확정한 flowFlags를 근거로 계산
    const previewScore = computePreviewRiskScore(flowFlags, stats.messageCount);
    // 상담봇에 넘길 컨텍스트도 키워드 후보가 아니라 LLM이 확정한 flowFlags만 사용 —
    // 확정되지 않은 후보를 넘기면 상담봇이 근거 없는 의심을 앞세우게 되므로 제외한다.
    const chatContext = formatConfirmedContext(messages, flowFlags);

    // '분석 중' 화면에서 실제 캡처 이미지 위에 겹쳐 보여줄 라벨 — 확정된 조종 발화가
    // 몇 번째 이미지, 세로 몇 % 지점에 있는지를 transcribeKakaoImages가 태깅한 값으로 만든다.
    const highlights = flowFlags
      .map((f) => {
        const msg = messages[f.idx];
        if (!msg) return null;
        return {
          imageIndex: msg.imageIndex ?? 0,
          positionPercent: msg.positionPercent ?? 50,
          category: f.category,
          label: CATEGORY_LABELS[f.category] || f.category,
        };
      })
      .filter(Boolean);

    dpl.chatContext = chatContext || null;
    dpl.partnerName = stats.partnerName || null;
    dpl.highlights = highlights;
    dpl.previewScore = previewScore;
    dpl.analyzed = true;

    res.json({ highlights, previewScore });
  } catch (err) {
    console.error('[analyzing/analyze]', err);
    res.status(500).json({ error: '분석 중 오류가 발생했습니다.' });
  }
});

// ── 3. AI 상담 ──────────────────────────────────
router.get('/counsel', async (req, res, next) => {
  try {
    const agents = await Agent.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    // ?agent=slug 로 선택, 없으면 첫 번째 활성 에이전트
    const current =
      (req.query.agent && agents.find((a) => a.slug === req.query.agent)) || agents[0] || null;

    // 캡처 이미지는 '분석 중' 화면까지만 필요 — 상담 시작 시점에 세션에서 즉시 폐기
    if (req.session.dpl?.captureImages) {
      delete req.session.dpl.captureImages;
      delete req.session.dpl.highlights;
    }

    res.render(view('counsel'), {
      title: '관계 상담',
      base: BASE,
      activeTab: 'home',
      enabled: isCounselorEnabled(),
      helpResources: HELP_RESOURCES,
      agents,
      current,
      hasChatContext: Boolean(req.session.dpl?.chatContext),
      maxUserTurns: MAX_USER_TURNS,
    });
  } catch (err) {
    next(err);
  }
});

// 대화 스트리밍: 요청 body = { agentSlug, messages: [{role, content}, ...] }
router.post('/counsel/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no'); // 프록시 버퍼링 방지

  if (!isCounselorEnabled()) {
    res.end('상담 봇이 아직 설정되지 않았습니다(API 키 미설정). 관리자에게 문의해 주세요.');
    return;
  }

  try {
    const agent = req.body?.agentSlug
      ? await Agent.findOne({ where: { slug: req.body.agentSlug, isActive: true } })
      : null;
    if (!agent) {
      res.end('선택된 상담 봇을 찾을 수 없습니다. 페이지를 새로고침해 주세요.');
      return;
    }

    const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const userTurns = history.filter((m) => m?.role === 'user').length;
    if (userTurns > MAX_USER_TURNS) {
      res.end('대화 한도에 도달했어요. 지금까지 나눈 이야기로 결과를 확인해 주세요.');
      return;
    }

    const systemPrompt = buildCounselSystemPrompt(agent.systemPrompt, {
      chatContext: req.session.dpl?.chatContext,
    });
    const stream = streamCounsel({
      history,
      systemPrompt,
      model: agent.model,
      maxTokens: agent.maxTokens,
      effort: agent.effort,
    });
    stream.on('text', (delta) => res.write(delta));
    req.on('close', () => stream.abort?.()); // 클라이언트 이탈 시 중단
    await stream.finalMessage();
    res.end();
  } catch (err) {
    console.error('[counsel/stream]', err);
    res.write('\n\n(응답 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.)');
    res.end();
  }
});

// 상담 종료 → 대화 전체를 근거로 최종 리포트 생성
router.post('/counsel/report', async (req, res) => {
  try {
    const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (history.length === 0) {
      return res.status(400).json({ error: '대화 내용이 없습니다.' });
    }

    const assessment = await assessCounsel({
      history,
      chatContext: req.session.dpl?.chatContext,
    });
    if (!assessment) {
      return res.status(503).json({ error: '상담 봇이 아직 설정되지 않았습니다(API 키 미설정).' });
    }

    const report = await Report.create({
      userId: req.session.userId ?? null,
      finalScores: {
        axisScores: assessment.axisScores,
        axisScores100: assessment.axisScores100,
        patterns: assessment.patterns,
        selfPattern: {
          score: assessment.selfPatternScore,
          score100: assessment.selfPatternScore100,
          note: assessment.selfPatternNote,
        },
      },
      summaryText: assessment.summary,
    });

    // 업로드했던 카톡 참고 컨텍스트는 리포트 생성 후 폐기
    delete req.session.dpl;

    res.json({ reportId: report.id });
  } catch (err) {
    console.error('[counsel/report]', err);
    res.status(500).json({ error: '리포트 생성 중 오류가 발생했습니다.' });
  }
});

// ── 4. 최종 리포트 ──────────────────────────────
router.get('/report/:id', async (req, res, next) => {
  try {
    const report = await Report.findByPk(req.params.id);
    if (!report) return res.status(404).render('platform/404', { title: '리포트 없음' });

    const fs = report.finalScores || {};
    const rows = Object.keys(AXES).map((key) => ({
      key,
      label: AXES[key].label,
      short: AXES[key].short,
      score: fs.axisScores?.[key] ?? 0,
      score100: fs.axisScores100?.[key] ?? 0,
      band: scoreBand(fs.axisScores?.[key] ?? 0),
    }));

    const patterns = (fs.patterns || []).map((p) => ({
      label: p.label,
      count: p.count,
      confidence: Math.round((p.confidence || 0) * 100),
    }));

    // 종합 배지 — 상대방 4축 평균으로 첫 화면에서 바로 결론이 보이게 함
    const axisVals = rows.map((r) => r.score);
    const avgAxis = axisVals.length ? axisVals.reduce((a, b) => a + b, 0) / axisVals.length : 0;
    const overallScore100 = Math.round(((avgAxis - 1) / 4) * 100);
    const overallBand = scoreBand(avgAxis);
    const topAxis = [...rows].sort((a, b) => b.score - a.score)[0] || null;

    const selfPattern = fs.selfPattern
      ? { ...fs.selfPattern, band: scoreBand(fs.selfPattern.score ?? 0) }
      : null;

    res.render(view('report'), {
      title: '최종 리포트',
      base: BASE,
      activeTab: 'home',
      report,
      rows,
      patterns,
      overallScore100,
      overallBand,
      topAxis,
      selfPattern,
      actionGuide: ACTION_GUIDES[overallBand.level] || null,
      disclaimer: REPORT_DISCLAIMER,
      helpResources: HELP_RESOURCES,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
export { SLUG, BASE };
