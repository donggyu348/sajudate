// src/framework/web/api/KakaoPayClient.js
import axios from "axios";

const SECRET_KEY_SAJUMAEUL = "PRD7E7E52429D66A1132C68813BD32A292341539";
const SECRET_KEY_UNSEJEOJANGSO = "PRDCFFE3CBA4A409E3608E3441811AB889636790";
const BASE_URL = "https://open-api.kakaopay.com/online/v1/payment";

class KakaoPayClient {
  // 카카오페이 결제 준비 요청
  async requestReady(payload, domain) {
    const url = `${BASE_URL}/ready`;
    console.log("[KakaoPay][Ready] Request:", payload);

    // SECRET_KEY가 saju-maeul인지 unse-jeojangso인지에 따라 다르게 설정
    let SECRET_KEY = SECRET_KEY_SAJUMAEUL;
    if (domain === "https://unse-jeojangso.kr") {
      SECRET_KEY = SECRET_KEY_UNSEJEOJANGSO;
    }

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
      console.error("[KakaoPay][Ready] Error:", err.response?.data || err.message);
      throw new Error("카카오페이 Ready 요청 실패");
    }
  }

  // 카카오페이 결제 승인 요청
  async requestApprove(payload, domain) {
    const url = `${BASE_URL}/approve`;
    console.log("[KakaoPay][Approve] Request:", payload);

    // SECRET_KEY가 saju-maeul인지 unse-jeojangso인지에 따라 다르게 설정
    let SECRET_KEY = SECRET_KEY_SAJUMAEUL;
    if (domain === "https://unse-jeojangso.kr") {
      SECRET_KEY = SECRET_KEY_UNSEJEOJANGSO;
    }

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
      console.error("[KakaoPay][Approve] Error:", err.response?.data || err.message);
      throw new Error("카카오페이 승인 실패");
    }
  }
}

export default new KakaoPayClient();
