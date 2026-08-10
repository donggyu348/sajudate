/**
 * 신호 추출 — 체크리스트 응답과 자유 입력(Q10)을 신호 태그로 바꾼다.
 * 규칙은 이 신호 조합으로 발동한다.
 *
 * 답장 속도·길이·이모티콘은 관심 신호로 쓰지 않는다(P2). 신호로 남기더라도
 * 규칙이 "관심 있음"의 근거로 쓰지 않게 이름부터 그렇게 붙여둔다.
 */

// 자유 입력에서 잡아내는 맥락 신호. 체크리스트만으로는 알 수 없는 것들이다.
const TEXT_SIGNALS = [
  // F4(오진 방지)를 켜는 신호. 상대의 선제 제안 이력이 있을 때만 규칙이 발동한다.
  { code: 'BUSY_REASON', re: /시험|이직|취준|졸업|프로젝트|출장|집안일|장례|병간호|이사|바쁘/ },
  { code: 'CONDITION_BLAME', re: /못생겨|외모|키가 작|돈이 없|스펙|능력이 안/ },
  { code: 'OVER_ANALYSIS', re: /이모티콘|말투|이 문장|답장 길이|읽씹|1이 사라/ },
  { code: 'NO_ALTERNATIVE', re: /이 사람뿐|다른 사람은 없|얘밖에/ },
];

/**
 * @param {object} intake
 * @returns {Set<string>}
 */
export function extractSignals(intake) {
  const s = new Set();

  if (intake.theyProposed === 'yes') s.add('THEY_PROPOSED');
  if (intake.theyProposed === 'no') s.add('THEY_NO_PROPOSE');
  if (intake.theyProposed === 'unsure') s.add('THEY_PROPOSE_UNSURE');

  if (intake.meetCount === '0' || intake.meetCount === '1-2') s.add('LOW_MEET_COUNT');
  if (intake.meetCount === '3-5' || intake.meetCount === '6+') s.add('ENOUGH_MEETS');
  if (intake.meetCount === '0') s.add('NEVER_MET');

  if (intake.meetTime === 'day') s.add('DAY_ONLY_MEET');
  if (intake.meetTime === 'night') s.add('NIGHT_MEET');

  if (intake.theyOpened === 'no') s.add('NO_SELF_DISCLOSURE');
  if (intake.theyOpened === 'yes') s.add('SELF_DISCLOSURE');

  if (intake.initiative === 'me') s.add('USER_LEADS');
  if (intake.initiative === 'them') s.add('THEY_LEAD');
  if (intake.replySpeed === 'instant') s.add('INSTANT_REPLY');

  if (intake.weeksKnown >= 8) s.add('LONG_DURATION');
  if (intake.weeksKnown >= 12) s.add('OVERDUE');

  if (intake.channel === 'app') s.add('CHANNEL_APP');
  if (intake.channel === 'blinddate') s.add('CHANNEL_BLINDDATE');
  if (intake.channel === 'school_work') s.add('CHANNEL_RECURRING');

  const text = String(intake.question || '');
  for (const { code, re } of TEXT_SIGNALS) {
    if (re.test(text)) s.add(code);
  }

  return s;
}
