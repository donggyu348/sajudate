/**
 * 알리고(Aligo) 문자 발송 — 결제 완료 후 리포트 링크를 문자로 전달.
 * 클래식 API(https://apis.aligo.in/send/) 사용. 발신번호는 알리고에 사전 등록된 번호여야 한다.
 */

const ALIGO_BASE = 'https://apis.aligo.in';

export function isSmsEnabled() {
  return Boolean(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER);
}

/**
 * @param {{ phone: string, reportUrl: string }} opts
 * @returns {Promise<any|null>} 알리고 응답 JSON. 설정이 없으면 발송을 건너뛰고 null 반환.
 */
export async function sendReportLinkSms({ phone, reportUrl }) {
  if (!isSmsEnabled()) {
    console.warn('[sms] 알리고 키/발신번호가 설정되지 않아 문자 발송을 건너뜁니다.');
    return null;
  }

  const body = new URLSearchParams({
    key: process.env.ALIGO_API_KEY,
    user_id: process.env.ALIGO_USER_ID,
    sender: process.env.ALIGO_SENDER,
    receiver: phone,
    msg: `[해답] 결제하신 전체 리포트를 확인해보세요.\n${reportUrl}`,
    testmode_yn: process.env.ALIGO_TEST_MODE === 'true' ? 'Y' : 'N',
  });

  const res = await fetch(`${ALIGO_BASE}/send/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (data.result_code !== '1') {
    console.error('[sms] 발송 실패:', data);
  }
  return data;
}

/** 한국 휴대폰 번호(하이픈 유무 무관)만 허용 — 결제 완료 후 잘못된 번호로 발송 API를 호출하지 않기 위함. */
export function isValidKoreanPhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return /^01[016789]\d{7,8}$/.test(digits);
}
