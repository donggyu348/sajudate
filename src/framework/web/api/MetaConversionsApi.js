import axios from "axios";

/** 동일 프로세스 내 동일 주문 CAPI 중복 전송 방지 (성공한 경우만 기록) */
const sentPurchaseForShopOrder = new Set();

function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return "";
  return ip.replace(/^::ffff:/, "").trim();
}

function pickCookieValue(cookieHeader, name) {
  if (!cookieHeader || !name) return "";
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`);
  const m = cookieHeader.match(re);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return m[1].trim();
  }
}

/**
 * Meta Conversions API — Purchase (META_PIXEL_ID + META_ACCESS_TOKEN 필요)
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
 */
export async function sendPurchaseEventOnce({
  shopOrderNo,
  eventId,
  value,
  currency = "KRW",
  req,
}) {
  const pixelId = process.env.META_PIXEL_ID?.trim();
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  if (!pixelId || !accessToken) return;

  if (!shopOrderNo || !eventId) return;
  if (sentPurchaseForShopOrder.has(shopOrderNo)) return;

  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
  const url = `https://graph.facebook.com/${version}/${pixelId}/events`;

  const userData = {};
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress || "");
  if (ip) userData.client_ip_address = ip;
  const ua = req.get("user-agent");
  if (ua) userData.client_user_agent = ua;

  const cookieHeader = req.headers.cookie || "";
  const fbp = pickCookieValue(cookieHeader, "_fbp");
  const fbc = pickCookieValue(cookieHeader, "_fbc");
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const numValue = Number(value);
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: `${req.protocol}://${req.get("host")}${req.originalUrl || ""}`,
        user_data: userData,
        custom_data: {
          currency,
          value: Number.isFinite(numValue) ? numValue : 0,
          content_type: "product",
          contents: [{ id: shopOrderNo, quantity: 1 }],
        },
      },
    ],
  };

  const testCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testCode) payload.test_event_code = testCode;

  try {
    await axios.post(url, payload, {
      params: { access_token: accessToken },
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
    sentPurchaseForShopOrder.add(shopOrderNo);
  } catch (err) {
    console.error(
      "[Meta CAPI] Purchase 전송 실패:",
      err.response?.data || err.message
    );
    throw err;
  }
}
