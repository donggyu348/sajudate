import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { Product, Agent, Report } from '../../models/index.js';
import { AXES, scoreBand, gaslightingBand } from './logic/axes.js';
import { prepareImageForVision, transcribeKakaoImages } from './logic/parseKakaoScreenshots.js';
import {
  computeStatPatterns,
  buildCandidateSegments,
  formatConfirmedContext,
  CATEGORY_LABELS,
} from './logic/chatStats.js';
import { assessCounsel } from './logic/assessCounsel.js';
import { generatePremiumReport, normalizePremiumReport } from './logic/premiumReport.js';
import { analyzeChatFlow } from './logic/analyzeChatFlow.js';
import { REPORT_DISCLAIMER, REPORT_TOC } from './logic/safety.js';
import {
  REPORT_UNLOCK_PRICE,
  getTossClientKey,
  isTossEnabled,
  buildOrderId,
  confirmTossPayment,
  resolvePrice,
} from './logic/payments.js';
import { sendReportLinkSms, isValidKoreanPhone } from './logic/sms.js';
import {
  streamCounsel,
  isCounselorEnabled,
  buildCounselSystemPrompt,
  isTransientLlmError,
  retryDelayMs,
  MAX_USER_TURNS,
  EXTEND_TURNS,
} from './logic/counselor.js';

// 세션당 한 번만 연장 가능 — 이 한도를 넘으면 연장했는지 여부로 유효 한도를 계산
function effectiveMaxTurns(req) {
  return req.session.counselExtended ? MAX_USER_TURNS + EXTEND_TURNS : MAX_USER_TURNS;
}

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
    cb(ok ? null : new Error('대화 캡처 이미지(.png, .jpg, .webp)만 업로드할 수 있습니다.'), ok);
  },
});

// LLM/비전 API를 호출하는 엔드포인트는 요청마다 실제 비용이 발생하므로, 스크립트로 반복 호출해
// 비용을 무제한으로 불릴 수 없도록 IP당 요청 한도를 둔다. 세션을 새로 만들면(쿠키 초기화) 우회는
// 가능하지만, 최소한 단순 반복 스크립트로 인한 비용 폭탄은 막아준다.
function llmRateLimit({ windowMinutes, max }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  });
}
const uploadAnalyzeLimiter = llmRateLimit({ windowMinutes: 15, max: 15 });
const counselStreamLimiter = llmRateLimit({ windowMinutes: 10, max: 40 });
const reportGenLimiter = llmRateLimit({ windowMinutes: 60, max: 10 });

async function getProduct() {
  return Product.findOne({ where: { slug: SLUG } });
}

/**
 * 외부에 노출되는 서비스 주소.
 *
 * 토스는 successUrl/failUrl이 https가 아니면 결제창을 거부한다(COMMON_ERROR).
 * 그런데 Nginx가 X-Forwarded-Proto를 넘기지 않으면 req.protocol이 http로 잡혀
 * http:// successUrl이 만들어진다. Nginx를 손대기 어려운 환경도 있으므로,
 * PUBLIC_ORIGIN이 설정돼 있으면 그 값을 최우선으로 쓴다.
 * 예) PUBLIC_ORIGIN=https://www.sajudate.store
 */
function publicOrigin(req) {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
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
      // 랜딩은 자체 CTA와 고지로 끝나는 구성이라 공통 푸터를 넣지 않는다
      hideFooter: true,
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
  });
});

router.post('/upload', uploadAnalyzeLimiter, upload.array('chatImages', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).render(view('upload'), {
        title: '대화 업로드',
        base: BASE,
        activeTab: 'home',
        error: '대화 캡처 이미지를 1장 이상 선택해 주세요.',
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
router.post('/analyzing/analyze', uploadAnalyzeLimiter, async (req, res) => {
  try {
    const dpl = req.session.dpl;
    if (!dpl?.captureImages?.length) {
      return res.status(400).json({ error: '분석할 이미지가 없습니다.' });
    }
    if (dpl.analyzed) {
      return res.json({ highlights: dpl.highlights || [] });
    }

    const preparedImages = dpl.captureImages.map((img) => ({
      buffer: Buffer.from(img.base64, 'base64'),
      mimetype: img.mimetype,
    }));

    const { messages } = await transcribeKakaoImages(preparedImages);
    if (messages.length === 0) {
      dpl.analyzed = true;
      dpl.highlights = [];
      return res.json({ highlights: [], empty: true });
    }

    const { stats, candidateIndexes } = computeStatPatterns(messages);
    const segments = buildCandidateSegments(messages, candidateIndexes);

    // 통계(키워드)는 후보 구간을 좁히는 용도로만 쓰고, 실제 조종 발화 판정은 대화 흐름을 본 LLM이 확정
    const flowFlags = await analyzeChatFlow(segments);
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
    // 상담 시작 인사말에서 "이 부분이 문제다"처럼 실제 발화를 바로 짚어주기 위해 보관 —
    // 리포트에는 원문을 인용하지 않지만, 이건 본인이 방금 업로드한 내용을 본인에게 그대로 보여주는 것뿐이라 괜찮다.
    dpl.confirmedQuotes = flowFlags
      .map((f) => {
        const msg = messages[f.idx];
        if (!msg) return null;
        return { label: CATEGORY_LABELS[f.category] || f.category, text: msg.text };
      })
      .filter(Boolean);
    dpl.analyzed = true;

    res.json({ highlights });
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

    // 캡처를 분석했다면, 정적 인사말 대신 그 결과부터 바로 말하고 시작한다 —
    // 확정된 패턴이 있으면 실제 발화를 짚어서 "이 부분이 문제"라고 말하고, 없으면 없다고 말한 뒤 대화로 넘어간다.
    const defaultGreeting = current?.greeting || '안녕하세요. 어떤 이야기가 있으신가요? 편하게 말씀해 주세요.';
    let greeting = defaultGreeting;
    if (req.session.dpl?.analyzed) {
      const quotes = req.session.dpl.confirmedQuotes || [];
      if (quotes.length > 0) {
        const first = quotes[0];
        const more = quotes.length > 1 ? ` 이 부분 말고도 비슷한 부분이 ${quotes.length - 1}군데 더 있었는데, 일단 여기부터 여쭤볼게요.` : '';
        greeting = `대화 내용을 확인해봤는데, "${first.text}"라고 한 부분이 ${first.label}(으)로 보여요. 이 부분이 문제예요.${more} 그때 어떤 상황이었는지 편하게 말씀해 주세요.`;
      } else {
        greeting = '대화 내용을 확인해봤는데, 특별히 의심되는 부분은 눈에 띄지 않았어요. 혹시 다른 힘드셨던 경험이 있으신가요?';
      }
    }

    res.render(view('counsel'), {
      title: '관계 상담',
      base: BASE,
      activeTab: 'home',
      // 채팅은 화면 높이를 꽉 채우는 전용 UI라 하단 푸터를 넣지 않는다
      hideFooter: true,
      enabled: isCounselorEnabled(),
      agents,
      current,
      greeting,
      hasChatContext: Boolean(req.session.dpl?.chatContext),
      maxUserTurns: effectiveMaxTurns(req),
      extendTurns: EXTEND_TURNS,
      canExtend: !req.session.counselExtended,
    });
  } catch (err) {
    next(err);
  }
});

// 대화 스트리밍: 요청 body = { agentSlug, messages: [{role, content}, ...] }
router.post('/counsel/stream', counselStreamLimiter, async (req, res) => {
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
    if (userTurns > effectiveMaxTurns(req)) {
      res.end('대화 한도에 도달했어요. 지금까지 나눈 이야기로 결과를 확인해 주세요.');
      return;
    }

    const systemPrompt = buildCounselSystemPrompt(agent.systemPrompt, {
      chatContext: req.session.dpl?.chatContext,
    });
    // 스트리밍 오류는 SDK가 재시도해 주지 않는다 —
    // HTTP 200으로 스트림이 열린 뒤 본문 안에서 오류가 오기 때문에 SDK의 maxRetries 범위 밖이다.
    // 그래서 여기서 직접 재시도하되, "아직 한 글자도 내보내지 않았을 때"만 다시 시도한다.
    // 이미 응답이 나가기 시작한 뒤에 재시도하면 같은 말이 두 번 이어붙어 버린다.
    const MAX_STREAM_RETRIES = 3;
    let wroteAny = false;
    let aborted = false;
    let currentStream = null;
    // 리스너는 한 번만 등록하고 현재 스트림을 참조 — 루프 안에서 등록하면 재시도할 때마다 쌓인다
    req.on('close', () => {
      aborted = true;
      currentStream?.abort?.();
    });

    for (let attempt = 0; ; attempt++) {
      const stream = streamCounsel({
        history,
        systemPrompt,
        model: agent.model,
        maxTokens: agent.maxTokens,
        effort: agent.effort,
      });
      currentStream = stream;
      stream.on('text', (delta) => {
        wroteAny = true;
        res.write(delta);
      });

      try {
        await stream.finalMessage();
        return res.end();
      } catch (err) {
        const canRetry =
          !wroteAny && !aborted && attempt < MAX_STREAM_RETRIES && isTransientLlmError(err);
        if (!canRetry) throw err;
        console.warn(
          `[counsel/stream] 일시적 오류로 재시도 ${attempt + 1}/${MAX_STREAM_RETRIES}:`,
          err?.error?.error?.type || err?.status || err?.message
        );
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
      }
    }
  } catch (err) {
    console.error('[counsel/stream]', err);
    const msg = isTransientLlmError(err)
      ? '\n\n(지금 요청이 몰려 답변을 받지 못했어요. 잠시 후 다시 보내주세요.)'
      : '\n\n(응답 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.)';
    res.write(msg);
    res.end();
  }
});

// 대화 한도 도달 시 한 번만 연장 — 이미 연장했으면 그대로 현재 유효 한도만 반환(중복 연장 방지)
router.post('/counsel/extend', (req, res) => {
  req.session.counselExtended = true;
  res.json({ maxUserTurns: effectiveMaxTurns(req) });
});

// 상담 종료 → 대화 전체를 근거로 최종 리포트 생성
router.post('/counsel/report', reportGenLimiter, async (req, res) => {
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
        keyFindings: assessment.keyFindings,
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

    res.json({ reportId: report.publicId });
  } catch (err) {
    console.error('[counsel/report]', err);
    // 529(overloaded)/429는 우리 쪽 문제가 아니라 일시적 혼잡 — 대화 내용은 브라우저에 그대로 남아 있으므로
    // "다시 눌러보라"고 분명히 안내해야 사용자가 대화를 날렸다고 오해하지 않는다.
    // status만 보면 스트리밍 경로의 오류(status undefined)를 놓치므로 공통 헬퍼로 판정한다.
    const transient = isTransientLlmError(err);
    res.status(transient ? 503 : 500).json({
      error: transient
        ? '지금 요청이 몰려 결과를 만들지 못했어요. 대화 내용은 그대로 있으니 잠시 후 다시 눌러주세요.'
        : '리포트 생성 중 오류가 발생했습니다.',
    });
  }
});

// ── 4. 최종 리포트 ──────────────────────────────
// 리포트는 로그인 없이 링크만으로 접근하는 구조라, 라우트 파라미터는 반드시
// 순차 추측이 불가능한 publicId(UUID)로만 조회한다 — 정수 PK로 조회하면 다른 사람 리포트를 열람당함.
router.get('/report/:publicId', async (req, res, next) => {
  try {
    const report = await Report.findOne({ where: { publicId: req.params.publicId } });
    if (!report) return res.status(404).render('platform/404', { title: '리포트 없음' });

    const fs = report.finalScores || {};
    // 높은 성향부터 보여야 "뭐가 두드러지는지" 직관적으로 읽힘
    const rows = Object.keys(AXES)
      .map((key) => ({
        key,
        label: AXES[key].label,
        short: AXES[key].short,
        description: AXES[key].description,
        example: AXES[key].example,
        advice: AXES[key].advice,
        score: fs.axisScores?.[key] ?? 0,
        score100: fs.axisScores100?.[key] ?? 0,
        band: scoreBand(fs.axisScores?.[key] ?? 0),
      }))
      .sort((a, b) => b.score - a.score);

    const rawPatterns = fs.patterns || [];
    const patterns = rawPatterns.map((p) => ({
      label: p.label,
      count: p.count,
      confidence: Math.round((p.confidence || 0) * 100),
    }));

    // 헤드라인 수치 — 다크테트라드 평균이 아니라 "가스라이팅 확률" 자체를 맨 앞에 보여준다
    const gaslightPattern = rawPatterns.find((p) => p.type === 'gaslighting');
    // 가스라이팅 패턴이 조금이라도 확인됐다면(count>=1) 확신도가 낮아도 30% 밑으로는 안 보여준다 —
    // 아예 감지된 게 없을 때만 0%.
    const gaslightingPercent = gaslightPattern ? Math.max(30, Math.round((gaslightPattern.confidence || 0) * 100)) : 0;

    // 종합 배지 — 상대방 4축 평균으로 첫 화면에서 바로 결론이 보이게 함
    const axisVals = rows.map((r) => r.score);
    const avgAxis = axisVals.length ? axisVals.reduce((a, b) => a + b, 0) / axisVals.length : 0;
    const overallScore100 = Math.round(((avgAxis - 1) / 4) * 100);
    const overallBand = scoreBand(avgAxis);
    const topAxis = rows[0] || null;
    const bottomAxis = rows[rows.length - 1] || null;

    const selfPattern = fs.selfPattern
      ? { ...fs.selfPattern, band: scoreBand(fs.selfPattern.score ?? 0) }
      : null;

    // 결제 완료 후 이 리포트를 처음 볼 때만 1회 생성해 캐싱 — 원본 대화는 저장하지 않으므로
    // 이미 있는 무료 결과(summary/axisScores/patterns/selfPattern)만 입력으로 쓴다.
    if (report.paid && !report.premiumReport) {
      try {
        const raw = await generatePremiumReport({
          summary: report.summaryText,
          axisScores: fs.axisScores,
          patterns: fs.patterns,
          selfPattern: fs.selfPattern,
        });
        if (raw) {
          report.premiumReport = normalizePremiumReport(raw);
          await report.save();
        }
      } catch (err) {
        console.error('[report] 프리미엄 리포트 생성 실패', err);
        // premiumReport는 null로 유지 — 템플릿에서 안내만 보여주고, 다음 새로고침 때 재시도
      }
    }

    const origin = publicOrigin(req);
    const orderId = buildOrderId(report.id);
    res.render(view('report'), {
      title: '최종 리포트',
      base: BASE,
      activeTab: 'home',
      report,
      rows,
      patterns,
      keyFindings: fs.keyFindings || [],
      gaslightingPercent,
      gaslightingBand: gaslightingBand(gaslightingPercent),
      overallScore100,
      overallBand,
      topAxis,
      bottomAxis,
      selfPattern,
      reportToc: REPORT_TOC,
      premium: report.premiumReport || null,
      disclaimer: REPORT_DISCLAIMER,
      reportUnlockPrice: REPORT_UNLOCK_PRICE,
      tossEnabled: isTossEnabled(),
      clientKey: isTossEnabled() ? getTossClientKey() : null,
      orderId,
      orderName: '전체 리포트 잠금 해제',
      // 전화번호는 별도 prepare-phone 호출로 서버 세션에 먼저 저장해두고, 결제 성공 콜백에서
      // orderId로 꺼내 쓴다 — URL 쿼리스트링에 실어 보내면 접속 로그(morgan)에 평문으로 남기 때문.
      successUrl: `${origin}${BASE}/report/${report.publicId}/checkout/success`,
      failUrl: `${origin}${BASE}/report/${report.publicId}/checkout/fail`,
    });
  } catch (err) {
    next(err);
  }
});

// ── 5. 결제 (전체 리포트 잠금 해제) ──────────────

// 결제 시작 전 전화번호를 서버 세션에 orderId로 매칭해 저장 — successUrl 쿼리스트링에
// 전화번호를 실어 보내지 않기 위함(접속 로그에 PII가 남는 걸 막음).
router.post('/report/:publicId/checkout/prepare-phone', async (req, res) => {
  // 진단용: 토스는 successUrl이 https가 아니면 결제창을 거부한다.
  // Nginx 뒤에서 req.protocol이 https로 잡히는지(=trust proxy + X-Forwarded-Proto)를
  // 여기서 바로 확인할 수 있게 남긴다. 원인 확정 후 제거해도 된다.
  console.log('[checkout] origin 판정:', {
    protocol: req.protocol,
    host: req.get('host'),
    'x-forwarded-proto': req.get('x-forwarded-proto') || '(없음)',
    trustProxy: req.app.get('trust proxy'),
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || '(미설정)',
    // 실제로 토스에 넘어가는 주소 — https로 시작해야 결제창이 열린다
    '최종 successUrl': `${publicOrigin(req)}${BASE}/report/${req.params.publicId}/checkout/success`,
  });

  const { orderId, phone } = req.body || {};
  if (!orderId || !isValidKoreanPhone(phone)) {
    return res.status(400).json({ error: '전화번호 또는 주문 정보가 올바르지 않습니다.' });
  }

  // 금액은 여기(서버)에서만 결정한다. 클라이언트가 보낸 금액을 쓰면 누구나 1원 결제를 만들 수 있다.
  // 결정된 금액은 세션에 저장했다가 승인(confirm) 때 그대로 사용한다.
  const normalizedPhone = String(phone).replace(/[^0-9]/g, '');
  const amount = resolvePrice(normalizedPhone);

  req.session.pendingPayments = req.session.pendingPayments || {};
  req.session.pendingPayments[orderId] = { phone: normalizedPhone, amount };

  if (amount !== REPORT_UNLOCK_PRICE) {
    console.log(`[checkout] 테스트 결제 금액 적용: ${amount}원 (orderId=${orderId})`);
  }

  // 클라이언트는 이 금액으로 결제위젯 금액을 갱신한다(표시용) — 신뢰의 근거는 세션 값이다
  res.json({ ok: true, amount });
});

router.get('/report/:publicId/checkout', async (req, res, next) => {
  try {
    const report = await Report.findOne({ where: { publicId: req.params.publicId } });
    if (!report) return res.status(404).render('platform/404', { title: '리포트 없음' });
    if (!isTossEnabled()) {
      return res.status(503).send('결제 기능이 아직 설정되지 않았습니다(토스페이먼츠 키 미설정).');
    }
    if (report.paid) {
      return res.redirect(`${BASE}/report/${report.publicId}`);
    }

    const origin = publicOrigin(req);
    res.render(view('checkout'), {
      title: '결제하기',
      layout: 'layouts/plain',
      base: BASE,
      reportId: report.publicId,
      clientKey: getTossClientKey(),
      amount: REPORT_UNLOCK_PRICE,
      orderId: buildOrderId(report.id),
      orderName: '전체 리포트 잠금 해제',
      successUrl: `${origin}${BASE}/report/${report.publicId}/checkout/success`,
      failUrl: `${origin}${BASE}/report/${report.publicId}/checkout/fail`,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/report/:publicId/checkout/success', async (req, res, next) => {
  const { paymentKey, orderId } = req.query;
  try {
    const report = await Report.findOne({ where: { publicId: req.params.publicId } });
    if (!report) return res.status(404).render('platform/404', { title: '리포트 없음' });

    // 이미 결제 처리된 리포트인데 successUrl을 새로고침/재방문한 경우 —
    // paymentKey를 다시 confirm하면 토스 쪽에서 거부해 실패 페이지로 튕기던 버그.
    // 이미 처리됐다면 그냥 리포트로 보낸다.
    if (report.paid) {
      return res.redirect(`${BASE}/report/${report.publicId}`);
    }

    if (!paymentKey || !orderId) {
      const message = encodeURIComponent('결제 정보가 올바르지 않습니다.');
      return res.redirect(`${BASE}/report/${report.publicId}/checkout/fail?message=${message}`);
    }

    // 금액은 쿼리스트링을 신뢰하지 않고, 결제 시작 때 서버가 정해 세션에 넣어둔 값을 쓴다.
    // 세션이 없으면(만료·다른 브라우저 등) 정가로 승인 — 임의 금액이 끼어들 여지를 두지 않는다.
    const pending = req.session.pendingPayments?.[String(orderId)];
    const amount = Number.isInteger(pending?.amount) ? pending.amount : REPORT_UNLOCK_PRICE;

    await confirmTossPayment({ paymentKey: String(paymentKey), orderId: String(orderId), amount });

    report.paid = true;
    report.orderId = String(orderId);
    report.paymentKey = String(paymentKey);
    report.amount = amount; // 실제 승인된 금액을 그대로 기록 (매출 집계가 어긋나지 않도록)
    if (isValidKoreanPhone(pending?.phone)) {
      report.phone = String(pending.phone).replace(/[^0-9]/g, '');
    }
    if (req.session.pendingPayments) delete req.session.pendingPayments[String(orderId)];
    await report.save();

    if (report.phone) {
      const origin = publicOrigin(req);
      sendReportLinkSms({ phone: report.phone, reportUrl: `${origin}${BASE}/report/${report.publicId}` }).catch(
        (err) => console.error('[checkout/success] sms 발송 실패', err)
      );
    }

    res.redirect(`${BASE}/report/${report.publicId}`);
  } catch (err) {
    console.error('[checkout/success]', err);
    const message = encodeURIComponent(err.message || '결제 승인에 실패했습니다.');
    res.redirect(`${BASE}/report/${req.params.publicId}/checkout/fail?message=${message}`);
  }
});

router.get('/report/:publicId/checkout/fail', (req, res) => {
  res.render(view('checkout-fail'), {
    title: '결제 실패',
    layout: 'layouts/plain',
    base: BASE,
    reportId: req.params.publicId,
    message: req.query.message || '결제가 완료되지 않았습니다.',
  });
});

export default router;
export { SLUG, BASE };
