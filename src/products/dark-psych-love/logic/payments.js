/**
 * 토스페이먼츠 연동 — 전체 리포트 잠금 해제 결제.
 * 결제창(SDK) 방식: 클라이언트에서 requestPayment() 호출 → 토스 호스팅 결제 페이지로 이동 →
 * 성공 시 우리 successUrl로 paymentKey/orderId/amount와 함께 리다이렉트 → 서버가 confirm API로 최종 승인.
 */

export const REPORT_UNLOCK_PRICE = 34900;

const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

export function getTossClientKey() {
  return process.env.TOSS_CLIENT_KEY || null;
}

function getTossSecretKey() {
  return process.env.TOSS_SECRET_KEY || null;
}

export function isTossEnabled() {
  return Boolean(process.env.TOSS_CLIENT_KEY && process.env.TOSS_SECRET_KEY);
}

/** 결제 시도마다 새로 발급 — 토스는 orderId 재사용을 허용하지 않는다. */
export function buildOrderId(reportId) {
  return `dpl_${reportId}_${Date.now()}`;
}

/**
 * 실결제 흐름(승인→잠금해제→문자)을 최소 금액으로 검증하기 위한 테스트 번호.
 *
 * 번호를 코드에 박지 않고 .env(TEST_PAYMENT_PHONE)로 둔다 —
 * 유출되면 번호만 바꾸면 되고, 운영 중에는 값을 비워 완전히 끌 수 있다.
 * 미설정이면 테스트 결제는 아예 동작하지 않는다.
 */
export const TEST_PAYMENT_AMOUNT = 1;

function normalizePhone(v) {
  return String(v || '').replace(/[^0-9]/g, '');
}

export function isTestPaymentPhone(phone) {
  const configured = normalizePhone(process.env.TEST_PAYMENT_PHONE);
  if (!configured) return false; // 미설정 = 테스트 결제 비활성
  return normalizePhone(phone) === configured;
}

/**
 * 결제 금액 결정 — 반드시 서버에서만 호출한다.
 * 클라이언트가 보낸 금액을 신뢰하면 누구나 1원 결제를 만들 수 있다.
 */
export function resolvePrice(phone) {
  return isTestPaymentPhone(phone) ? TEST_PAYMENT_AMOUNT : REPORT_UNLOCK_PRICE;
}

/**
 * 토스 결제 승인(confirm) API 호출.
 *
 * amount는 절대 클라이언트(URL 쿼리)에서 받지 않는다 — 리다이렉트 URL의 쿼리스트링은
 * 사용자가 임의로 바꿀 수 있어 위변조된 금액으로 승인될 수 있다.
 * 호출부는 결제 시작 시 서버 세션에 저장해 둔 금액을 넘겨야 한다.
 * @param {{ paymentKey: string, orderId: string, amount?: number }} opts
 */
export async function confirmTossPayment({ paymentKey, orderId, amount }) {
  const secretKey = getTossSecretKey();
  if (!secretKey) throw new Error('토스페이먼츠 시크릿 키가 설정되지 않았습니다.');

  const res = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount: Number.isInteger(amount) && amount > 0 ? amount : REPORT_UNLOCK_PRICE,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.message || '결제 승인에 실패했습니다.');
    err.tossError = data;
    throw err;
  }
  return data;
}
