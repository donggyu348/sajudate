import axios from "axios";

function getEncodedSecretKey() {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    throw new Error("TOSS_SECRET_KEY is not set");
  }
  return Buffer.from(secretKey + ":").toString("base64");
}

class TossPaymentsClient {
  async confirmPayment(payload) {
    const { paymentKey, orderId, amount } = payload;
    const url = "https://api.tosspayments.com/v1/payments/confirm";

    try {
      const ENCODED_KEY = getEncodedSecretKey();
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