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
 * 토스 결제 승인(confirm) API 호출.
 * amount는 클라이언트가 보낸 값(URL 쿼리)을 신뢰하지 않고 항상 서버가 정한 고정가(REPORT_UNLOCK_PRICE)로 요청한다 —
 * 리다이렉트 URL의 쿼리스트링은 사용자가 임의로 바꿀 수 있어, 위변조된 금액으로 승인되는 걸 막기 위함.
 * @param {{ paymentKey: string, orderId: string }} opts
 */
export async function confirmTossPayment({ paymentKey, orderId }) {
  const secretKey = getTossSecretKey();
  if (!secretKey) throw new Error('토스페이먼츠 시크릿 키가 설정되지 않았습니다.');

  const res = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
    },
    body: JSON.stringify({ paymentKey, orderId, amount: REPORT_UNLOCK_PRICE }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.message || '결제 승인에 실패했습니다.');
    err.tossError = data;
    throw err;
  }
  return data;
}
