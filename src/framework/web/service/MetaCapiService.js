/**
 * Meta Conversions API — 픽셀(fbq)과 동일 event_id로 중복 제거되도록 서버 이벤트 전송.
 * 토큰: 이벤트 관리자 → 해당 데이터 세트 → 설정 → 전환 API → 액세스 토큰 생성
 * 환경 변수 META_CAPI_ACCESS_TOKEN 이 없으면 요청하지 않음.
 */

import axios from "axios";

const API_VERSION = "v21.0";

const PIXEL_BY_FILE_DIR = {
  jujangso: "1392936281822728",
  tight: "1865484017449049",
};

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

export function pixelIdForFileDir(fileDir) {
  const key = String(fileDir || "tight").toLowerCase();
  return PIXEL_BY_FILE_DIR[key] || PIXEL_BY_FILE_DIR.tight;
}

/**
 * 픽셀: fbq('track','Purchase',{...},{ eventID: shopOrderNo }) 과 동일 event_id 사용.
 */
export async function sendPurchaseEvent({ req, fileDir, shopOrderNo, value, currency = "KRW" }) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token || !shopOrderNo) return;

  const pixelId = pixelIdForFileDir(fileDir);
  const { fbc, fbp, clientIpAddress } = resolveMetaClickIds(req);
  const user_data = {};
  const ip = clientIpAddress || req.ip || req.socket?.remoteAddress;
  if (ip) user_data.client_ip_address = ip;
  const ua = req.get("user-agent");
  if (ua) user_data.client_user_agent = ua;
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;

  const proto = req.protocol || "https";
  const host = req.get("host") || "";
  const event_source_url = host ? `${proto}://${host}${req.originalUrl || ""}` : "";

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(shopOrderNo),
        action_source: "website",
        ...(event_source_url ? { event_source_url } : {}),
        ...(Object.keys(user_data).length ? { user_data } : {}),
        custom_data: {
          currency,
          value: Number(value) || 0,
          content_type: "product",
          contents: [{ id: String(shopOrderNo), quantity: 1 }],
        },
      },
    ],
    access_token: token,
  };

  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`;

  try {
    await axios.post(url, payload, { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const detail = err.response?.data
      ? JSON.stringify(err.response.data)
      : err?.message || err;
    console.error("[Meta CAPI Purchase]", detail);
  }
}
