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
      console.error("[KakaoPay][Ready] Error:", err.response?.data || err.message);
      throw new Error("카카오페이 Ready 요청 실패");
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
      console.error("[KakaoPay][Approve] Error:", err.response?.data || err.message);
      throw new Error("카카오페이 승인 실패");
    }
  }
}

export default new KakaoPayClient();
