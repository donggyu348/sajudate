import axios from "axios";
import { DeviceType, PayMethodTypeCode } from "../enums/Payment.js";

const MALL_ID = "05591625";

class EasyPayClient {
  /**
   * [1] 거래등록 API 호출
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async requestTransaction(payload) {
    const url = "https://pgapi.easypay.co.kr/api/ep9/trades/webpay"; // 테스트 URL

    // Clone payload and inject mallId
    const requestPayload = {
      ...payload,
      mallId: MALL_ID,
      deviceTypeCode: payload.deviceType,
      payMethodTypeCode: PayMethodTypeCode[payload.payMethod] || PayMethodTypeCode.CARD,
    };

    console.log("[EasyPay][requestTransaction] Request Payload:", requestPayload);

    try {
      const response = await axios.post(url, requestPayload, {
        headers: {
          "Content-Type": "application/json"
        }
      });

      console.log("[EasyPay][requestTransaction] Response:", response.data);
      return response.data;
    } catch (error) {
      console.error("[EasyPay][requestTransaction] Error:", error.message);
      throw new Error(`거래등록 실패: ${error.message}`);
    }
  }

  /**
   * [2] 승인 API 호출
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async requestApproval(payload) {
    const url = "https://pgapi.easypay.co.kr/api/ep9/trades/approval"; // 테스트 URL

    // Clone payload and inject mallId
    const requestPayload = {
      ...payload,
      mallId: MALL_ID,
    };

    console.log("[EasyPay][requestApproval] Request Payload:", requestPayload);

    try {
      const response = await axios.post(url, requestPayload, {
        headers: {
          "Content-Type": "application/json"
        }
      });

      console.log("[EasyPay][requestApproval] Response:", response.data);
      return response.data;
    } catch (error) {
      console.error("[EasyPay][requestApproval] Error:", error.message);
      throw new Error(`승인 요청 실패: ${error.message}`);
    }
  }
}

export default new EasyPayClient();