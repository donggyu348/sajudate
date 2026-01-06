import axios from "axios";

// 시크릿 키 (상점 관리자에서 발급받은 실제 키 사용)
const SECRET_KEY = "test_sk_AQ92ymxN3495e5JRDnG4VajRKXvd"; 
const ENCODED_KEY = Buffer.from(SECRET_KEY + ":").toString("base64");

class TossPaymentsClient {
  async confirmPayment(payload) {
    const { paymentKey, orderId, amount } = payload;
    const url = "https://api.tosspayments.com/v1/payments/confirm";

    try {
      const response = await axios.post(
        url,
        { paymentKey, orderId, amount },
        {
          headers: {
            Authorization: `Basic ${ENCODED_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data; // 승인 성공 시 결제 객체 반환
    } catch (error) {
      console.error("[TossPayments] Confirm Error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "토스 결제 승인 실패");
    }
  }
}

export default new TossPaymentsClient();