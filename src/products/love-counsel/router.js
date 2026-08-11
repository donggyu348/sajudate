import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { CounselSession } from '../../models/index.js';
import { QUESTIONS, parseIntake } from './logic/checklist.js';
import { judge, findRule, isHowToQuestion } from './logic/engine.js';
import { buildSystemPrompt } from './logic/prompt.js';
import { checkSafety } from './logic/safety.js';
import { generateReport, SECTIONS } from './logic/report.js';
import {
  REPORT_PRICE,
  buildOrderId,
  parseOrderId,
  confirmTossPayment,
  getTossClientKey,
  isTossEnabled,
} from './logic/payments.js';
import {
  streamCounsel,
  isCounselorEnabled,
  isTransientLlmError,
  retryDelayMs,
} from '../dark-psych-love/logic/counselor.js';

export const SLUG = 'love-counsel';
const BASE = `/products/${SLUG}`;

// 이 제품은 판정 품질이 전부라 상담 모델을 따로 둔다 (dark-psych-love는 비용 위주로 Haiku)
const MODEL = process.env.LOVE_COUNSEL_MODEL || 'claude-sonnet-5';

// 무료 구간 상한 — 페이월은 원래 "어떻게 해야 하나요" 질문이 트리거지만,
// 그 질문이 끝내 안 나오는 경우를 위한 안전장치로 턴 상한을 둔다.
const MAX_FREE_TURNS = 5;

const router = Router();

const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function view(name) {
  return `products/${SLUG}/${name}`;
}

/** 세션에서 진행 중인 상담 상태를 꺼낸다. */
function state(req) {
  return req.session.lc || null;
}

// ── 1. INPUT — 상대 나이·성별만 ────────────────────────────────
router.get('/', (req, res) => res.redirect(`${BASE}/input`));

router.get('/input', (req, res) => {
  res.render(view('input'), {
    title: '연애 상담',
    base: BASE,
    activeTab: 'home',
    hideFooter: true,
    error: null,
  });
});

router.post('/input', (req, res) => {
  const targetAge = Number(req.body?.targetAge);
  const targetGender = req.body?.targetGender;
  const valid = Number.isInteger(targetAge) && targetAge >= 19 && targetAge <= 99
    && (targetGender === 'male' || targetGender === 'female');

  if (!valid) {
    return res.status(400).render(view('input'), {
      title: '연애 상담',
      base: BASE,
      activeTab: 'home',
      hideFooter: true,
      error: '나이와 성별을 확인해 주세요. (만 19세 이상)',
    });
  }

  req.session.lc = { target: { targetAge, targetGender } };
  res.redirect(`${BASE}/check`);
});

// ── 2. 체크리스트 10문항 ───────────────────────────────────────
router.get('/check', (req, res) => {
  if (!state(req)?.target) return res.redirect(`${BASE}/input`);
  res.render(view('check'), {
    title: '연애 상담',
    base: BASE,
    activeTab: 'home',
    hideFooter: true,
    questions: QUESTIONS,
  });
});

router.post('/check', async (req, res, next) => {
  try {
    const target = state(req)?.target;
    if (!target) return res.redirect(`${BASE}/input`);

    const { intake, error } = parseIntake(req.body, target);
    if (error) return res.redirect(`${BASE}/check`);

    // MVP는 썸 구간만 연다. 규칙집이 썸만 완성돼 있어서, 다른 단계를 어설프게 열면
    // 상담 품질이 무너진다. 대신 출시 알림을 받아둔다.
    if (intake.stage !== 'some') {
      const row = await CounselSession.create({ stage: intake.stage, intake, lastStage: 'waitlist' });
      req.session.lc = { ...state(req), sessionId: row.id, stage: intake.stage };
      return res.render(view('waitlist'), {
        title: '준비 중',
        base: BASE,
        activeTab: 'home',
        hideFooter: true,
        stage: intake.stage,
        saved: false,
      });
    }

    // 판정은 여기서 끝난다 — 이후 LLM은 이 결과를 바꾸지 못한다.
    const { matched, activeRule, signals } = judge(intake);

    const row = await CounselSession.create({
      stage: intake.stage,
      intake,
      signals,
      matchedRules: matched,
      activeRule: activeRule.id,
      lastStage: 'counsel',
    });

    req.session.lc = {
      ...state(req),
      sessionId: row.id,
      publicId: row.publicId,
      intake,
      activeRule: activeRule.id,
      matched,
      turns: 0,
      paywalled: false,
    };

    res.redirect(`${BASE}/counsel`);
  } catch (err) {
    next(err);
  }
});

// 썸이 아닌 단계에서 받는 출시 알림 이메일
router.post('/waitlist', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().slice(0, 255);
    const s = state(req);
    if (s?.sessionId && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await CounselSession.update({ waitlistEmail: email }, { where: { id: s.sessionId } });
    }
    res.render(view('waitlist'), {
      title: '준비 중',
      base: BASE,
      activeTab: 'home',
      hideFooter: true,
      stage: s?.stage || 'dating',
      saved: true,
    });
  } catch (err) {
    next(err);
  }
});

// ── 3. AI 상담 ────────────────────────────────────────────────
router.get('/counsel', (req, res) => {
  const s = state(req);
  if (!s?.intake) return res.redirect(`${BASE}/input`);

  res.render(view('counsel'), {
    title: '연애 상담',
    base: BASE,
    activeTab: 'home',
    hideFooter: true,
    enabled: isCounselorEnabled(),
    question: s.intake.question,
  });
});

router.post('/counsel/stream', streamLimiter, async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  const s = state(req);
  if (!s?.intake) return res.end('상담 정보가 없습니다. 처음부터 다시 시작해 주세요.');
  if (!isCounselorEnabled()) return res.end('상담이 아직 설정되지 않았습니다(API 키 미설정).');

  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const lastUser = [...history].reverse().find((m) => m?.role === 'user')?.content || '';
  const turn = history.filter((m) => m?.role === 'user').length + 1;

  try {
    // (1) 안전 검사가 가장 먼저다. 걸리면 LLM을 호출하지 않고 확정 문구로 끝낸다.
    const safety = checkSafety(lastUser);
    if (safety) {
      s.stopped = safety.id;
      await logTurn(s, { lastUser, turn, safetyStop: safety.id, lastStage: 'safety' });
      res.setHeader('X-LC-Stop', safety.id);
      return res.end(safety.message);
    }

    // (2) 페이월 — 처방을 요구하는 순간이 트리거. 턴 상한은 안전장치일 뿐이다.
    const howTo = isHowToQuestion(lastUser);
    if (howTo && !s.howToTurn) s.howToTurn = turn;
    if (howTo || turn > MAX_FREE_TURNS) {
      s.paywalled = true;
      await logTurn(s, { lastUser, turn, paywalled: true, lastStage: 'paywall' });
      res.setHeader('X-LC-Paywall', '1');
      return res.end(
        '지금부터가 실제 처방입니다. 앞으로 7일 동안 뭘 하고, 다음 연락을 정확히 뭐라고 할지 — 여기부터 이어갑니다.'
      );
    }

    const systemPrompt = buildSystemPrompt({
      rule: findRule(s.activeRule),
      intake: s.intake,
      turn,
    });

    // 스트리밍은 HTTP 200으로 열린 뒤 본문 안에서 오류가 오기 때문에 SDK 재시도 범위 밖이다.
    // 아직 한 글자도 내보내지 않았을 때만 직접 다시 시도한다 — 이미 나가기 시작한 뒤 재시도하면
    // 같은 말이 두 번 이어붙는다.
    const MAX_RETRIES = 2;
    let wroteAny = false;
    let aborted = false;
    let current = null;
    req.on('close', () => { aborted = true; current?.abort?.(); });

    for (let attempt = 0; ; attempt++) {
      const stream = streamCounsel({ history, systemPrompt, model: MODEL, maxTokens: 900 });
      current = stream;
      stream.on('text', (delta) => { wroteAny = true; res.write(delta); });

      try {
        await stream.finalMessage();
        break;
      } catch (err) {
        if (aborted) return;
        if (!wroteAny && attempt < MAX_RETRIES && isTransientLlmError(err)) {
          await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
          continue;
        }
        if (!wroteAny) res.write('응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
        break;
      }
    }

    await logTurn(s, { lastUser, turn, lastStage: 'counsel' });
    res.end();
  } catch (err) {
    console.error('[love-counsel/stream]', err);
    if (!res.writableEnded) res.end('상담 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
});

// ── 4. 리포트 ─────────────────────────────────────────────────
/**
 * 상담 대화를 받아 리포트를 만든다. 대화 이력은 클라이언트에만 있으므로 여기서 받는다.
 * 결제 전에 미리 만들어 두고 화면에서 뒷부분을 가린다 — 결제 직후 기다림 없이 바로 열린다.
 */
router.post('/report/prepare', async (req, res) => {
  const s = state(req);
  if (!s?.sessionId) return res.status(400).json({ error: '상담 정보가 없습니다.' });

  try {
    const row = await CounselSession.findByPk(s.sessionId);
    if (!row) return res.status(404).json({ error: '상담을 찾을 수 없습니다.' });

    if (!row.report) {
      const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-24) : [];
      const report = await generateReport({
        intake: s.intake,
        rule: findRule(s.activeRule),
        history,
      });
      if (!report) return res.status(502).json({ error: '리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.' });
      row.report = report;
    }
    row.lastStage = 'report';
    await row.save();

    res.json({ ok: true, url: `${BASE}/report/${row.publicId}` });
  } catch (err) {
    console.error('[love-counsel/report/prepare]', err);
    res.status(500).json({ error: '리포트 생성 중 오류가 발생했습니다.' });
  }
});

router.get('/report/:publicId', async (req, res, next) => {
  try {
    // 조회는 항상 publicId로만 한다 — 순차 id를 URL에 쓰면 남의 리포트를 추측으로 열 수 있다.
    const row = await CounselSession.findOne({ where: { publicId: req.params.publicId } });
    if (!row || !row.report) return res.status(404).render('platform/404', { title: '리포트 없음', activeTab: null });

    res.render(view('report'), {
      title: row.paid ? '전체 리포트' : '미리보는 리포트',
      base: BASE,
      activeTab: 'home',
      hideFooter: true,
      publicId: row.publicId,
      report: row.report,
      sections: SECTIONS,
      paid: row.paid,
      rule: findRule(row.activeRule),
      price: REPORT_PRICE,
      tossEnabled: isTossEnabled(),
      clientKey: isTossEnabled() ? getTossClientKey() : null,
      purchased: Boolean(req.query.purchased),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 결제 시작. orderId와 금액은 반드시 서버에서 만든다 —
 * 클라이언트가 보낸 금액을 쓰면 누구나 1원 결제를 만들 수 있다.
 */
router.post('/report/:publicId/checkout/prepare', async (req, res) => {
  const row = await CounselSession.findOne({ where: { publicId: req.params.publicId } });
  if (!row) return res.status(404).json({ error: '리포트를 찾을 수 없습니다.' });
  if (row.paid) return res.status(400).json({ error: '이미 결제된 리포트입니다.' });

  // 결제를 시도할 때마다 새로 발급한다 — 실패 후 다시 누를 때 같은 orderId를 재사용하면 토스가 거부한다.
  const orderId = buildOrderId(row.id, REPORT_PRICE);
  res.json({ ok: true, orderId, amount: REPORT_PRICE });
});

router.get('/report/:publicId/checkout/success', async (req, res, next) => {
  try {
    const { paymentKey, orderId } = req.query;
    const parsed = parseOrderId(orderId);
    const row = await CounselSession.findOne({ where: { publicId: req.params.publicId } });
    if (!row) return res.status(404).render('platform/404', { title: '리포트 없음', activeTab: null });

    // 금액은 URL 쿼리가 아니라 서명된 orderId에서 복원한 값으로만 승인한다.
    if (!parsed || String(parsed.sessionId) !== String(row.id)) {
      return res.redirect(`${BASE}/report/${row.publicId}?failed=1`);
    }

    if (!row.paid) {
      await confirmTossPayment({ paymentKey, orderId, amount: parsed.amount });
      row.paid = true;
      row.orderId = orderId;
      row.paymentKey = String(paymentKey || '').slice(0, 128);
      row.amount = parsed.amount;
      row.lastStage = 'paid';
      await row.save();
    }

    res.redirect(`${BASE}/report/${row.publicId}?purchased=1`);
  } catch (err) {
    console.error('[love-counsel/checkout/success]', err);
    next(err);
  }
});

router.get('/report/:publicId/checkout/fail', (req, res) => {
  res.redirect(`${BASE}/report/${req.params.publicId}?failed=1`);
});

/**
 * 턴 로그 기록. 대화 원문은 남기지 않고 길이만 남긴다.
 * 로깅 실패가 상담을 끊으면 안 되므로 예외는 삼킨다.
 */
async function logTurn(s, { lastUser, turn, paywalled, safetyStop, lastStage }) {
  if (!s?.sessionId) return;
  s.turns = turn;
  s.userMsgLengths = [...(s.userMsgLengths || []), String(lastUser || '').length];

  try {
    await CounselSession.update(
      {
        userMsgLengths: s.userMsgLengths,
        turnCount: turn,
        howToTurn: s.howToTurn ?? null,
        ...(paywalled ? { paywalled: true } : {}),
        ...(safetyStop ? { safetyStop } : {}),
        lastStage,
      },
      { where: { id: s.sessionId } }
    );
  } catch (err) {
    console.error('[love-counsel] 세션 로그 실패:', err.message);
  }
}

export default router;
