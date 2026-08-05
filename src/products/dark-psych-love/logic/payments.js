/**
 * 토스페이먼츠 연동 — 전체 리포트 잠금 해제 결제.
 * 결제창(SDK) 방식: 클라이언트에서 requestPayment() 호출 → 토스 호스팅 결제 페이지로 이동 →
 * 성공 시 우리 successUrl로 paymentKey/orderId/amount와 함께 리다이렉트 → 서버가 confirm API로 최종 승인.
 */

import { createHmac } from 'node:crypto';

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

/**
 * orderId에 금액을 서명해서 실어 보낸다.
 *
 * 금액을 서버 세션에만 두면, 간편결제로 앱을 다녀오는 사이 세션이 끊겼을 때
 * 승인 금액이 정가로 되돌아가 결제 금액과 어긋난다(토스는 이걸 FORBIDDEN_REQUEST로 거부한다).
 * orderId는 토스가 그대로 돌려주므로, 서명을 붙여두면 세션 없이도 금액을 안전하게 복원할 수 있다.
 * 서명이 없으면 사용자가 orderId를 조작해 임의 금액으로 승인시킬 수 있다.
 */
function orderIdSecret() {
  return process.env.SESSION_SECRET || 'dev-secret';
}

function signOrder(payload) {
  return createHmac('sha256', orderIdSecret()).update(payload).digest('hex').slice(0, 12);
}

/** 결제 시도마다 새로 발급 — 토스는 orderId 재사용을 허용하지 않는다. */
export function buildOrderId(reportId, amount = REPORT_UNLOCK_PRICE) {
  const payload = `${reportId}_${amount}_${Date.now()}`;
  return `dpl_${payload}_${signOrder(payload)}`;
}

/**
 * orderId에서 금액을 복원한다. 서명이 맞지 않으면 null — 조작된 값은 절대 신뢰하지 않는다.
 * @returns {{ reportId: string, amount: number }|null}
 */
export function parseOrderId(orderId) {
  const m = /^dpl_(\d+)_(\d+)_(\d+)_([0-9a-f]{12})$/.exec(String(orderId || ''));
  if (!m) return null;
  const [, reportId, amount, ts, sig] = m;
  if (signOrder(`${reportId}_${amount}_${ts}`) !== sig) return null;
  return { reportId, amount: Number(amount) };
}

/**
 * 실결제 흐름(승인→잠금해제→문자)을 최소 금액으로 검증하기 위한 테스트 번호.
 *
 * 번호를 코드에 박지 않고 .env(TEST_PAYMENT_PHONE)로 둔다 —
 * 유출되면 번호만 바꾸면 되고, 운영 중에는 값을 비워 완전히 끌 수 있다.
 * 미설정이면 테스트 결제는 아예 동작하지 않는다.
 */
// 라이브 환경에는 결제수단별 최소 결제금액이 있어 1원은 거부될 수 있다.
// 기본을 100원으로 두고, 필요하면 TEST_PAYMENT_AMOUNT로 조정한다.
export const TEST_PAYMENT_AMOUNT = Number(process.env.TEST_PAYMENT_AMOUNT) > 0
  ? Math.floor(Number(process.env.TEST_PAYMENT_AMOUNT))
  : 100;

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
    // 승인 거부는 요청 내용보다 "어떤 키로 보냈는지"가 원인인 경우가 많다.
    // .env에 따옴표·공백·개행이 섞이면 값이 조용히 달라지므로 길이와 앞뒤 일부만 남겨 대조한다.
    // (키 전체는 절대 로그에 남기지 않는다)
    console.error('[toss] confirm 거부:', {
      status: res.status,
      code: data?.code,
      message: data?.message,
      보낸값: { orderId, amount },
      시크릿키: `${secretKey.slice(0, 9)}…${secretKey.slice(-4)} (길이 ${secretKey.length})`,
      클라이언트키: (() => {
        const ck = getTossClientKey() || '';
        return ck ? `${ck.slice(0, 9)}…${ck.slice(-4)} (길이 ${ck.length})` : '(없음)';
      })(),
    });
    const err = new Error(data?.message || '결제 승인에 실패했습니다.');
    err.tossError = data;
    throw err;
  }
  return data;
}

/**
 * 결제 건 조회.
 *
 * 상점이 자동 승인으로 설정돼 있으면 토스가 이미 승인을 끝낸 뒤라, 우리가 confirm을 호출하면
 * FORBIDDEN_REQUEST로 거부된다. 그때 이 조회로 실제 상태를 확인해 이미 완료된 결제인지 가린다.
 * @returns {Promise<object|null>} 조회 실패 시 null
 */
export async function fetchTossPayment(paymentKey) {
  const secretKey = getTossSecretKey();
  if (!secretKey) return null;

  try {
    const res = await fetch(`${TOSS_API_BASE}/payments/${encodeURIComponent(paymentKey)}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64') },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[toss] 결제 조회 실패:', { status: res.status, code: data?.code, message: data?.message });
      return null;
    }
    return data;
  } catch (err) {
    console.error('[toss] 결제 조회 중 오류:', err.message);
    return null;
  }
}
