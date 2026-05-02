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

function parseCookies(req) {
  const raw = req.headers?.cookie;
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(";").map((part) => {
      const idx = part.indexOf("=");
      if (idx === -1) return [part.trim(), ""];
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      return [k, v];
    })
  );
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
  const cookies = parseCookies(req);
  const user_data = {};
  const ip = req.ip || req.socket?.remoteAddress;
  if (ip) user_data.client_ip_address = ip;
  const ua = req.get("user-agent");
  if (ua) user_data.client_user_agent = ua;
  if (cookies._fbp) user_data.fbp = cookies._fbp;
  if (cookies._fbc) user_data.fbc = cookies._fbc;

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
