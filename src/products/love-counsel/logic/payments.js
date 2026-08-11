import { createHmac } from 'crypto';

export {
  getTossClientKey,
  isTossEnabled,
  confirmTossPayment,
} from '../../dark-psych-love/logic/payments.js';

/**
 * 리포트 잠금 해제 가격.
 * 실결제 흐름을 최소 금액으로 검증할 때는 .env의 LOVE_COUNSEL_PRICE를 낮춰 쓴다.
 */
export const REPORT_PRICE = Number(process.env.LOVE_COUNSEL_PRICE) > 0
  ? Math.floor(Number(process.env.LOVE_COUNSEL_PRICE))
  : 19900;

/**
 * orderId에 금액을 서명해 싣는다 — 토스가 그대로 돌려주므로 세션이 끊겨도 승인 금액을
 * 안전하게 복원할 수 있다. 서명이 없으면 사용자가 orderId를 조작해 임의 금액으로 승인시킬 수 있다.
 * dark-psych-love와 접두사(lc_)로 구분한다.
 */
function sign(payload) {
  return createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret')
    .update(payload)
    .digest('hex')
    .slice(0, 12);
}

/** 결제 시도마다 새로 발급 — 토스는 orderId 재사용을 허용하지 않는다. */
export function buildOrderId(sessionId, amount = REPORT_PRICE) {
  const payload = `${sessionId}_${amount}_${Date.now()}`;
  return `lc_${payload}_${sign(payload)}`;
}

/**
 * orderId에서 금액을 복원한다. 서명이 맞지 않으면 null — 조작된 값은 신뢰하지 않는다.
 * @returns {{ sessionId: string, amount: number }|null}
 */
export function parseOrderId(orderId) {
  const m = /^lc_(\d+)_(\d+)_(\d+)_([0-9a-f]{12})$/.exec(String(orderId || ''));
  if (!m) return null;
  const [, sessionId, amount, ts, sig] = m;
  if (sign(`${sessionId}_${amount}_${ts}`) !== sig) return null;
  return { sessionId, amount: Number(amount) };
}
