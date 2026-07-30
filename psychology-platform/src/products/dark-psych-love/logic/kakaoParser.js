/**
 * 카카오톡 대화 내보내기(.txt) 파서.
 *
 * 지원 포맷
 *  - Windows(PC):  줄  "[이름] [오후 3:24] 메시지"
 *                  날짜 "--------------- 2021년 5월 3일 월요일 ---------------"
 *  - Android:      "2021년 5월 3일 오후 3:24, 이름 : 메시지"
 *  - iOS:          "2021. 5. 3. 오후 3:24, 이름 : 메시지"
 *
 * 중요: 이 모듈이 반환하는 messages(원문 포함)는 통계/태깅 계산에만 쓰고
 *       절대 DB나 로그에 저장하지 않는다. 호출부에서 분석 직후 파기한다.
 */

/** @typedef {{ at: Date|null, sender: string, text: string }} KakaoMessage */

const RE_WINDOWS_DATE = /^-{5,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*-{5,}$/;
const RE_WINDOWS_MSG = /^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s*(.*)$/;

const RE_ANDROID_MSG =
  /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*(.*)$/;
const RE_IOS_MSG =
  /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*(.*)$/;

function to24Hour(ampm, hour) {
  let h = Number(hour);
  if (ampm === '오후' && h < 12) h += 12;
  if (ampm === '오전' && h === 12) h = 0;
  return h;
}

function makeDate(y, mo, d, ampm, hh, mm) {
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    to24Hour(ampm, hh),
    Number(mm),
    0
  );
}

/** 내보내기 포맷 자동 감지 */
export function detectPlatform(rawText) {
  const lines = rawText.split(/\r?\n/).slice(0, 400);
  let win = 0;
  let android = 0;
  let ios = 0;
  for (const line of lines) {
    if (RE_WINDOWS_MSG.test(line) || RE_WINDOWS_DATE.test(line)) win++;
    else if (RE_ANDROID_MSG.test(line)) android++;
    else if (RE_IOS_MSG.test(line)) ios++;
  }
  if (win >= android && win >= ios && win > 0) return 'windows';
  if (ios >= android && ios > 0) return 'ios';
  if (android > 0) return 'android';
  return 'unknown';
}

/**
 * 원문 텍스트 → 구조화된 메시지 배열.
 * @param {string} rawText
 * @returns {{ platform: string, messages: KakaoMessage[] }}
 */
export function parseKakaoExport(rawText) {
  const platform = detectPlatform(rawText);
  const lines = rawText.split(/\r?\n/);
  /** @type {KakaoMessage[]} */
  const messages = [];
  let currentDate = null; // windows 포맷용 날짜 컨텍스트
  let last = null;

  for (const line of lines) {
    if (platform === 'windows') {
      const dm = line.match(RE_WINDOWS_DATE);
      if (dm) {
        currentDate = { y: dm[1], mo: dm[2], d: dm[3] };
        continue;
      }
      const m = line.match(RE_WINDOWS_MSG);
      if (m) {
        const [, sender, ampm, hh, mm, text] = m;
        const at = currentDate
          ? makeDate(currentDate.y, currentDate.mo, currentDate.d, ampm, hh, mm)
          : null;
        last = { at, sender: sender.trim(), text: text ?? '' };
        messages.push(last);
        continue;
      }
    } else if (platform === 'android' || platform === 'ios') {
      const re = platform === 'android' ? RE_ANDROID_MSG : RE_IOS_MSG;
      const m = line.match(re);
      if (m) {
        const [, y, mo, d, ampm, hh, mm, sender, text] = m;
        last = { at: makeDate(y, mo, d, ampm, hh, mm), sender: sender.trim(), text: text ?? '' };
        messages.push(last);
        continue;
      }
    }
    // 어느 포맷에도 안 맞으면 직전 메시지의 여러 줄 이어붙임
    if (last && line.trim() !== '') {
      last.text += '\n' + line;
    }
  }

  return { platform, messages };
}
