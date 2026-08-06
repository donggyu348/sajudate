/**
 * Meta Conversions API — 픽셀(fbq)과 동일 event_id로 중복 제거되도록 서버 이벤트 전송.
 * 토큰: 이벤트 관리자 → 해당 데이터 세트 → 설정 → 전환 API → 액세스 토큰 생성
 * 환경 변수 META_CAPI_ACCESS_TOKEN 이 없으면 요청하지 않음.
 *
 * 픽셀 ID는 브라우저 픽셀(views/tight/common/header.ejs)과 반드시 같아야 한다.
 * 다르면 서버/브라우저 이벤트가 서로 다른 데이터 세트로 들어가 중복 제거가 실패한다.
 */

import axios from "axios";
import { createHash } from "crypto";

const API_VERSION = "v21.0";

/** tight 브라우저 픽셀과 동일한 데이터 세트. .env 로 덮어쓸 수 있다. */
const DEFAULT_TIGHT_PIXEL_ID = "4732994036924225";

/** 데이터 세트마다 토큰이 다르므로 tight 전용 토큰을 우선 사용한다. */
function accessToken() {
  return process.env.META_CAPI_ACCESS_TOKEN_TIGHT || process.env.META_CAPI_ACCESS_TOKEN || null;
}

export function tightPixelId() {
  return process.env.META_PIXEL_ID_TIGHT || DEFAULT_TIGHT_PIXEL_ID;
}

/** Parameter Builder 미들웨어가 채운 req.metaCapi 우선, 없으면 세션 백업. */
function resolveMetaClickIds(req) {
  const fromBuilder = req.metaCapi || {};
  const session = req.session || {};
  return {
    fbc: fromBuilder.fbc || session.metaFbc || null,
    fbp: fromBuilder.fbp || session.metaFbp || null,
    clientIpAddress: fromBuilder.clientIpAddress || null,
  };
}

/** CAPI의 개인정보 필드는 정규화된 평문을 SHA-256 해시로 보내야 한다. */
function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

/**
 * buildMetaAdvancedMatching 이 만든 평문(em/ph/fn/ge/db)을 해시해 user_data 에 넣는다.
 * country 는 해시 대상이 아니므로 그대로 둔다.
 */
function applyAdvancedMatching(user_data, advancedMatching) {
  if (!advancedMatching) return;
  for (const key of ["em", "ph", "fn", "ge", "db"]) {
    const value = advancedMatching[key];
    if (value) user_data[key] = sha256(value);
  }
  if (advancedMatching.ph) user_data.external_id = sha256(advancedMatching.ph);
  if (advancedMatching.country) user_data.country = sha256(advancedMatching.country);
}

function buildUserData(req, advancedMatching) {
  const { fbc, fbp, clientIpAddress } = resolveMetaClickIds(req);
  const user_data = {};

  const ip = clientIpAddress || req.ip || req.socket?.remoteAddress;
  if (ip) user_data.client_ip_address = ip;
  const ua = req.get("user-agent");
  if (ua) user_data.client_user_agent = ua;
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;

  applyAdvancedMatching(user_data, advancedMatching);
  return user_data;
}

function buildEventSourceUrl(req) {
  const proto = req.protocol || "https";
  const host = req.get("host") || "";
  return host ? `${proto}://${host}${req.originalUrl || ""}` : "";
}

/**
 * 브라우저 fbq('track', name, {...}, { eventID }) 와 같은 eventId 를 넘겨야 중복 제거된다.
 */
async function sendEvent({ req, eventName, eventId, customData, advancedMatching }) {
  const token = accessToken();
  if (!token || !eventId) return;

  const user_data = buildUserData(req, advancedMatching);
  const event_source_url = buildEventSourceUrl(req);

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(eventId),
        action_source: "website",
        ...(event_source_url ? { event_source_url } : {}),
        ...(Object.keys(user_data).length ? { user_data } : {}),
        ...(customData ? { custom_data: customData } : {}),
      },
    ],
    access_token: token,
  };

  const url = `https://graph.facebook.com/${API_VERSION}/${tightPixelId()}/events`;

  try {
    await axios.post(url, payload, { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const detail = err.response?.data
      ? JSON.stringify(err.response.data)
      : err?.message || err;
    console.error(`[Meta CAPI ${eventName}]`, detail);
  }
}

/** 픽셀 쪽 eventID 는 shopOrderNo (payment_success.ejs). */
export async function sendPurchaseEvent({
  req,
  shopOrderNo,
  value,
  currency = "KRW",
  advancedMatching,
}) {
  await sendEvent({
    req,
    eventName: "Purchase",
    eventId: shopOrderNo,
    advancedMatching,
    customData: {
      currency,
      value: Number(value) || 0,
      content_type: "product",
      contents: [{ id: String(shopOrderNo), quantity: 1 }],
    },
  });
}

/** 픽셀 쪽 eventID 는 `ic_${reportHistoryId}` (payment.ejs). */
export async function sendInitiateCheckoutEvent({
  req,
  reportHistoryId,
  value,
  contentId,
  currency = "KRW",
  advancedMatching,
}) {
  if (!reportHistoryId) return;
  await sendEvent({
    req,
    eventName: "InitiateCheckout",
    eventId: `ic_${reportHistoryId}`,
    advancedMatching,
    customData: {
      currency,
      value: Number(value) || 0,
      content_type: "product",
      contents: [{ id: String(contentId || reportHistoryId), quantity: 1 }],
    },
  });
}
