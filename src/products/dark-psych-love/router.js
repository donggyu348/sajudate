import { Router } from 'express';
import multer from 'multer';
import { Product, ChecklistResponse, ChatAnalysis, Report } from '../../models/index.js';
import {
  CHECKLIST_ITEMS,
  SCALE,
  AXES,
  scoreChecklist,
  scoreBand,
  TOTAL_ITEMS,
} from './logic/checklist.js';
import { analyzeChat } from './logic/analyzeChat.js';
import { buildFinalScores, buildSummaryText } from './logic/reportBuilder.js';
import { PATTERN_TYPES } from './logic/llmPrompt.js';
import { PRIVACY_NOTICE, REPORT_DISCLAIMER, HELP_RESOURCES } from './logic/safety.js';

const SLUG = 'dark-psych-love';
const BASE = `/products/${SLUG}`;

const router = Router();

// 원문을 디스크에 남기지 않도록 메모리 스토리지 사용, 5MB 제한, .txt 만 허용
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'text/plain' || file.originalname.toLowerCase().endsWith('.txt');
    cb(ok ? null : new Error('카카오톡 대화 .txt 파일만 업로드할 수 있습니다.'), ok);
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
      activeTab: 'check',
      totalItems: TOTAL_ITEMS,
      axes: AXES,
    });
  } catch (err) {
    next(err);
  }
});

// ── 2. 체크리스트 ──────────────────────────────
router.get('/checklist', async (req, res, next) => {
  try {
    const product = await getProduct();
    res.render(view('checklist'), {
      title: '관계 체크리스트',
      product,
      base: BASE,
      activeTab: 'check',
      items: CHECKLIST_ITEMS,
      scale: SCALE,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/checklist', async (req, res, next) => {
  try {
    const product = await getProduct();
    // body: { q1..q20 }
    const answers = {};
    for (const item of CHECKLIST_ITEMS) {
      const v = Number(req.body[`q${item.id}`]);
      if (Number.isFinite(v)) answers[item.id] = v;
    }
    const { axisScores, axisScores100, answered } = scoreChecklist(answers);
    if (answered < TOTAL_ITEMS) {
      return res.status(400).render(view('checklist'), {
        title: '관계 체크리스트',
        product,
        base: BASE,
        activeTab: 'check',
        items: CHECKLIST_ITEMS,
        scale: SCALE,
        error: '모든 문항에 응답해 주세요.',
        prev: req.body,
      });
    }

    const saved = await ChecklistResponse.create({
      userId: req.session.userId ?? null,
      productId: product.id,
      axisScores: { ...axisScores, _norm100: axisScores100 },
      rawAnswers: answers,
    });

    req.session.dpl = { checklistResponseId: saved.id };
    res.redirect(`${BASE}/result/${saved.id}`);
  } catch (err) {
    next(err);
  }
});

// ── 3. 1차 결과 (축별 점수 요약) ─────────────────
router.get('/result/:id', async (req, res, next) => {
  try {
    const response = await ChecklistResponse.findByPk(req.params.id);
    if (!response) return res.status(404).render('platform/404', { title: '결과 없음' });

    const axisScores = response.axisScores;
    const rows = Object.keys(AXES).map((key) => ({
      key,
      label: AXES[key].label,
      short: AXES[key].short,
      score: axisScores[key],
      score100: axisScores._norm100?.[key] ?? Math.round(((axisScores[key] - 1) / 4) * 100),
      band: scoreBand(axisScores[key]),
    }));

    res.render(view('result'), {
      title: '1차 결과',
      base: BASE,
      activeTab: 'check',
      responseId: response.id,
      rows,
      privacyNotice: PRIVACY_NOTICE,
    });
  } catch (err) {
    next(err);
  }
});

// ── 4. 카카오톡 업로드 ──────────────────────────
router.get('/upload/:id', async (req, res, next) => {
  try {
    const response = await ChecklistResponse.findByPk(req.params.id);
    if (!response) return res.status(404).render('platform/404', { title: '결과 없음' });
    res.render(view('upload'), {
      title: '대화 분석',
      base: BASE,
      activeTab: 'chat',
      responseId: response.id,
      privacyNotice: PRIVACY_NOTICE,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/upload/:id', upload.single('chatFile'), async (req, res, next) => {
  try {
    const response = await ChecklistResponse.findByPk(req.params.id);
    if (!response) return res.status(404).render('platform/404', { title: '결과 없음' });
    const product = await getProduct();

    let chatAnalysis = null;

    if (req.file && req.file.buffer) {
      // 원문은 버퍼에서만 다루고 저장하지 않음
      const rawText = req.file.buffer.toString('utf-8');
      const selfName = (req.body.selfName || '').trim() || undefined;
      const result = await analyzeChat(rawText, { selfName });

      chatAnalysis = await ChatAnalysis.create({
        userId: req.session.userId ?? null,
        productId: product.id,
        statPatterns: result.statPatterns,
        llmTaggedPatterns: result.llmTaggedPatterns,
      });
    }
    // 대화 업로드는 선택 — 없으면 체크리스트만으로 리포트 생성

    // 최종 리포트 생성
    const finalScores = buildFinalScores(
      { axisScores: response.axisScores },
      chatAnalysis
        ? {
            llmTaggedPatterns: chatAnalysis.llmTaggedPatterns,
            statPatterns: chatAnalysis.statPatterns,
          }
        : null
    );
    const summaryText = buildSummaryText(
      finalScores,
      chatAnalysis ? { llmTaggedPatterns: chatAnalysis.llmTaggedPatterns } : null
    );

    const report = await Report.create({
      userId: req.session.userId ?? null,
      checklistResponseId: response.id,
      chatAnalysisId: chatAnalysis?.id ?? null,
      finalScores,
      summaryText,
    });

    res.redirect(`${BASE}/report/${report.id}`);
  } catch (err) {
    next(err);
  }
});

// 대화 없이 리포트로 바로 (체크리스트만)
router.post('/report/from-checklist/:id', async (req, res, next) => {
  try {
    const response = await ChecklistResponse.findByPk(req.params.id);
    if (!response) return res.status(404).render('platform/404', { title: '결과 없음' });

    const finalScores = buildFinalScores({ axisScores: response.axisScores }, null);
    const summaryText = buildSummaryText(finalScores, null);
    const report = await Report.create({
      userId: req.session.userId ?? null,
      checklistResponseId: response.id,
      chatAnalysisId: null,
      finalScores,
      summaryText,
    });
    res.redirect(`${BASE}/report/${report.id}`);
  } catch (err) {
    next(err);
  }
});

// ── 5. 최종 리포트 ──────────────────────────────
router.get('/report/:id', async (req, res, next) => {
  try {
    const report = await Report.findByPk(req.params.id, { include: [ChatAnalysis] });
    if (!report) return res.status(404).render('platform/404', { title: '리포트 없음' });

    const fs = report.finalScores;
    const rows = Object.keys(AXES).map((key) => ({
      key,
      label: AXES[key].label,
      short: AXES[key].short,
      score: fs.axisScores[key],
      score100: fs.axisScores100[key],
      band: scoreBand(fs.axisScores[key]),
    }));

    // 대화 분석 패턴 요약 (인용문 없이 유형/빈도만)
    const patterns = (report.ChatAnalysis?.llmTaggedPatterns?.patterns ?? []).map((p) => ({
      label: PATTERN_TYPES[p.type] || p.type,
      count: p.count,
      confidence: Math.round((p.confidence || 0) * 100),
    }));
    const chatStats = report.ChatAnalysis?.statPatterns ?? null;

    res.render(view('report'), {
      title: '최종 리포트',
      base: BASE,
      activeTab: 'chat',
      report,
      rows,
      patterns,
      chatStats,
      disclaimer: REPORT_DISCLAIMER,
      helpResources: HELP_RESOURCES,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
export { SLUG, BASE };
