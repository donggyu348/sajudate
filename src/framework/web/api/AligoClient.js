import axios from "axios";

const ALIGO_API_URL = "https://apis.aligo.in/send/";
const API_KEY = 'h6r60s71qevby01c0gt8nz82byjqoofl';
const USER_ID = 'immsp349';
const SENDER_PHONE = '01083787452'; // e.g., '025114560'

class AligoClient {
  /**
   * 문자 보내기 API 호출
   * @param {Object} options
   * @param {string[]} options.receivers 수신자 전화번호 배열
   * @param {string} options.message 메시지 내용
   * @param {string} [options.title] 제목 (LMS/MMS용)
   * @param {string} [options.msgType] SMS | LMS | MMS
   * @param {string} [options.destination] %고객명% 치환용
   * @param {string} [options.rdate] 예약일 YYYYMMDD
   * @param {string} [options.rtime] 예약시간 HHMM
   * @param {boolean} [options.testMode] 테스트 여부
   * @returns {Promise<Object>}
   */
  async sendMessage({
    receivers,
    message,
    title,
    msgType,
    destination,
    rdate,
    rtime,
    testMode = false
  }) {
    const formData = new URLSearchParams();
    formData.append("key", API_KEY);
    formData.append("user_id", USER_ID);
    formData.append("sender", SENDER_PHONE);
    formData.append("receiver", receivers.join(","));
    formData.append("msg", message);

    if (msgType) formData.append("msg_type", msgType);
    if (title) formData.append("title", title);
    if (destination) formData.append("destination", destination);
    if (rdate) formData.append("rdate", rdate);
    if (rtime) formData.append("rtime", rtime);
    if (testMode) formData.append("testmode_yn", "N");

    try {
      console.log('[Aligo][sendMessage] Sending message with options:', {formData});
      const response = await axios.post(ALIGO_API_URL, formData.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      console.log("[Aligo][sendMessage] Response:", response.data);
      return response.data;
    } catch (error) {
      console.error("[Aligo][sendMessage] Error:", error.message);
      throw new Error(`문자 발송 실패: ${error.message}`);
    }
  }
}

export default new AligoClient();