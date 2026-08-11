import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { CounselSession } from '../../models/index.js';
import { judge, findRule, isHowToQuestion } from './logic/engine.js';
import { buildSystemPrompt } from './logic/prompt.js';
import { checkSafety } from './logic/safety.js';
import { extractSlots, isReadyForReport, missingSlots, STAGE_LABEL } from './logic/slots.js';
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

// 이 제품은 판정 품질이 전부라 상담 모델을 따로 둔다
const MODEL = process.env.LOVE_COUNSEL_MODEL || 'claude-sonnet-5';

// 정보가 끝내 안 모여도 여기까지만 대화한다 — 무한정 물으면 사용자가 나간다
const MAX_FREE_TURNS = 8;

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

function state(req) {
  return req.session.lc || null;
}

// ── 1. 광고 유입 → 곧바로 상담 ──────────────────────────────────
// 설문 화면을 앞에 두지 않는다. 필요한 정보는 상담사가 대화하면서 묻는다.
router.get('/', (req, res) => res.redirect(`${BASE}/counsel`));

router.get('/counsel', async (req, res, next) => {
  try {
    if (!state(req)?.sessionId) {
      const row = await CounselSession.create({ stage: 'unknown', lastStage: 'counsel' });
      req.session.lc = { sessionId: row.id, publicId: row.publicId, filled: {} };
    }
    res.render(view('counsel'), {
      title: '연애 상담',
      base: BASE,
      activeTab: 'home',
      hideFooter: true,
      enabled: isCounselorEnabled(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/counsel/stream', streamLimiter, async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  const s = state(req);
  if (!s?.sessionId) return res.end('상담 정보가 없습니다. 새로고침해 주세요.');
  if (!isCounselorEnabled()) return res.end('상담이 아직 설정되지 않았습니다(API 키 미설정).');

  const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-24) : [];
  const lastUser = [...history].reverse().find((m) => m?.role === 'user')?.content || '';
  const turn = history.filter((m) => m?.role === 'user').length + 1;

  try {
    // (1) 안전 검사가 가장 먼저다. 걸리면 LLM을 호출하지 않고 확정 문구로 끝낸다.
    const safety = checkSafety(lastUser);
    if (safety) {
      await save(s, { safetyStop: safety.id, lastStage: 'safety', lastUser, turn });
      res.setHeader('X-LC-Stop', safety.id);
      return res.end(safety.message);
    }

    // (2) 대화에서 정보를 다시 뽑는다. 물어본 걸 또 묻지 않도록 서버가 상태를 들고 있는다.
    if (history.length) s.filled = await extractSlots(history, s.filled || {});
    const filled = s.filled || {};

    // (3) 썸 구간은 필요한 값이 모이면 코드가 판정을 확정한다. 그때부터 LLM은 말하기만 한다.
    //     다른 단계는 규칙집이 없어 원칙 기반으로 상담한다.
    let rule = null;
    if (filled.stage === 'some' && !missingSlots(filled).some((x) => x.required)) {
      const verdict = judge(filled);
      rule = verdict.activeRule;
      s.activeRule = rule.id;
      s.matched = verdict.matched;
      s.signals = verdict.signals;
    }

    // (4) 리포트로 넘길 시점 — 정보가 다 모였거나, 사용자가 처방을 요구했거나, 상한에 닿았을 때
    const ready = isReadyForReport(filled, turn - 1);
    const howTo = isHowToQuestion(lastUser);
    if (howTo && !s.howToTurn) s.howToTurn = turn;
    if (ready || (howTo && turn >= 3) || turn > MAX_FREE_TURNS) {
      await save(s, { paywalled: true, lastStage: 'paywall', lastUser, turn });
      res.setHeader('X-LC-Report', '1');
      return res.end(
        '여기까지 이야기로 판정에 필요한 건 모였습니다. 지금부터가 실제 처방입니다 — 앞으로 7일 동안 뭘 하고, 다음 연락을 정확히 뭐라고 할지 정리해 드리겠습니다.'
      );
    }

    const systemPrompt = buildSystemPrompt({ rule, filled, turn });

    // 첫 턴은 사용자 입력이 없다. API는 메시지가 최소 하나 있어야 하므로 시작 발화를 넣는다.
    const messages = history.length
      ? history
      : [{ role: 'user', content: '상담 시작합니다.' }];

    // 스트리밍 오류는 SDK 재시도 범위 밖이다(200으로 열린 뒤 본문에서 실패).
    // 아직 한 글자도 안 나갔을 때만 다시 시도한다 — 이미 나간 뒤 재시도하면 같은 말이 두 번 붙는다.
    const MAX_RETRIES = 2;
    let wroteAny = false;
    let aborted = false;
    let current = null;
    req.on('close', () => { aborted = true; current?.abort?.(); });

    for (let attempt = 0; ; attempt++) {
      const stream = streamCounsel({ history: messages, systemPrompt, model: MODEL, maxTokens: 900 });
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

    await save(s, { lastStage: 'counsel', lastUser, turn });
    res.end();
  } catch (err) {
    console.error('[love-counsel/stream]', err);
    if (!res.writableEnded) res.end('상담 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
});

// ── 2. 리포트 ─────────────────────────────────────────────────
/**
 * 상담 대화로 리포트를 만든다. 대화 이력은 클라이언트에만 있으므로 여기서 받는다.
 * 결제 전에 미리 만들어 두고 화면에서 뒷부분을 가린다 — 결제 직후 기다림 없이 열린다.
 */
router.post('/report/prepare', async (req, res) => {
  const s = state(req);
  if (!s?.sessionId) return res.status(400).json({ error: '상담 정보가 없습니다.' });

  try {
    const row = await CounselSession.findByPk(s.sessionId);
    if (!row) return res.status(404).json({ error: '상담을 찾을 수 없습니다.' });

    if (!row.report) {
      const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-24) : [];
      const filled = s.filled || {};
      const report = await generateReport({
        filled,
        rule: s.activeRule ? findRule(s.activeRule) : null,
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
      rule: row.activeRule ? findRule(row.activeRule) : null,
      stageLabel: STAGE_LABEL[row.stage] || '연애 상담',
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

  // 시도할 때마다 새로 발급한다 — 실패 후 다시 누를 때 같은 orderId를 재사용하면 토스가 거부한다.
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
 * 세션 로그. 대화 원문은 남기지 않고 길이만 남긴다.
 * 로깅 실패가 상담을 끊으면 안 되므로 예외는 삼킨다.
 */
async function save(s, { lastUser, turn, paywalled, safetyStop, lastStage }) {
  if (!s?.sessionId) return;
  s.turns = turn;
  s.userMsgLengths = [...(s.userMsgLengths || []), String(lastUser || '').length];

  try {
    await CounselSession.update(
      {
        stage: s.filled?.stage || 'unknown',
        intake: s.filled || null,
        signals: s.signals || null,
        matchedRules: s.matched || null,
        activeRule: s.activeRule || null,
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
