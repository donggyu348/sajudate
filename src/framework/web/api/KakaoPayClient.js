// src/framework/web/api/KakaoPayClient.js
import axios from "axios";

const SECRET_KEY = "PRDDA2902B8EAA0D514136BB8CDAA4DC95FAB385";
const BASE_URL = "https://open-api.kakaopay.com/online/v1/payment";

class KakaoPayClient {
  // 카카오페이 결제 준비 요청
  async requestReady(payload) {
    const url = `${BASE_URL}/ready`;
    console.log("[KakaoPay][Ready] Request:", payload);

    try {
      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `SECRET_KEY ${SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      });

      console.log("[KakaoPay][Ready] Response:", res.data);
      return res.data;
    } catch (err) {
  console.error("========== [KakaoPay READY ERROR] ==========");
  console.error("HTTP Status:", err.response?.status);
  console.error("Response Headers:", err.response?.headers);
  console.error("Response Data:", err.response?.data);
  console.error("Request Payload:", payload);
  console.error("===========================================");

  // ❗ 카카오페이가 준 메시지를 그대로 프론트로 던짐
  throw new Error(
    err.response?.data?.msg ||
    err.response?.data?.message ||
    JSON.stringify(err.response?.data) ||
    err.message
  );
}

  }

  // 카카오페이 결제 승인 요청
  async requestApprove(payload) {
    const url = `${BASE_URL}/approve`;
    console.log("[KakaoPay][Approve] Request:", payload);

    try {
      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `SECRET_KEY ${SECRET_KEY}`,
          "Content-Type": "application/json",
        }
      });

      console.log("[KakaoPay][Approve] Response:", res.data);
      return res.data;
    } catch (err) {
  console.error("========== [KakaoPay APPROVE ERROR] ==========");
  console.error("HTTP Status:", err.response?.status);
  console.error("Response Data:", err.response?.data);
  console.error("Approve Payload:", payload);
  console.error("============================================");

  throw new Error(
    err.response?.data?.msg ||
    err.response?.data?.message ||
    JSON.stringify(err.response?.data) ||
    err.message
  );
}

  }
}

export default new KakaoPayClient();
