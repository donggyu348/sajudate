/**
 * 신호 추출 — 수집된 응답과 자유 진술을 신호 태그로 바꾼다. 규칙은 이 조합으로 발동한다.
 *
 * 답장 속도·길이·이모티콘은 관심 신호로 쓰지 않는다(P2). 신호로 남기더라도
 * 규칙이 "관심 있음"의 근거로 쓰지 않게 이름부터 그렇게 붙여둔다.
 */

// 선택형 응답만으로는 알 수 없어 자유 진술에서 잡아내는 신호들.
const TEXT_SIGNALS = {
  some: [
    // F4(오진 방지)를 켜는 신호. 상대의 선제 제안 이력이 있을 때만 규칙이 발동한다.
    { code: 'BUSY_REASON', re: /시험|이직|취준|졸업|프로젝트|출장|집안일|장례|병간호|이사|바쁘/ },
    { code: 'REPEATED_DECLINE', re: /다음에|미뤄|거절|약속이 안|계속 안 만나|번번이/ },
    { code: 'CONDITION_BLAME', re: /못생겨|외모|키가 작|돈이 없|스펙|능력이 안/ },
    { code: 'OVER_ANALYSIS', re: /이모티콘|말투|이 문장|답장 길이|읽씹|1이 사라/ },
  ],
  dating: [
    { code: 'CONTEMPT', re: /비꼬|비아냥|무시하는|한심|어이없다는|비웃|조롱|욕/ },
    { code: 'CRITICISM', re: /항상|맨날|원래 그런|매번 그래|넌 왜 늘/ },
    { code: 'ADDICTED_CHECK', re: /확인|검사|폰을 보|위치|추적/ },
  ],
  reunion: [
    { code: 'BEGGING', re: /매달|빌었|사정|애원|무릎|제발|간절/ },
    { code: 'REPEATED_APOLOGY', re: /사과|미안하다고|잘못했다고/ },
    { code: 'DRUNK_CONTACT', re: /술|취해서|새벽에 보/ },
  ],
};

/**
 * @param {string} module
 * @param {object} intake
 * @returns {Set<string>}
 */
export function extractSignals(module, intake) {
  const s = new Set();
  if (!intake) return s;

  if (module === 'some') {
    if (intake.theyProposed === 'yes') s.add('THEY_PROPOSED');
    if (intake.theyProposed === 'no') s.add('THEY_NO_PROPOSE');
    if (intake.meetCount === '0' || intake.meetCount === '1-2') s.add('LOW_MEET_COUNT');
    if (intake.meetCount === '3-5' || intake.meetCount === '6+') s.add('ENOUGH_MEETS');
    if (intake.meetTime === 'day') s.add('DAY_ONLY_MEET');
    if (intake.theyOpened === 'no') s.add('NO_SELF_DISCLOSURE');
    if (intake.initiative === 'me') s.add('USER_LEADS');
    if (intake.replySpeed === 'instant') s.add('INSTANT_REPLY');
    if (intake.weeksKnown >= 8) s.add('LONG_DURATION');
    if (intake.channel === 'app') s.add('CHANNEL_APP');
    if (intake.channel === 'school_work') s.add('CHANNEL_RECURRING');
  }

  if (module === 'dating') {
    if (intake.repeating === 'yes') s.add('REPEATING_CONFLICT');
    if (intake.meetFreqChange === 'down') s.add('MEET_FREQ_DOWN');
    if (intake.affectionBalance === 'me') s.add('AFFECTION_IMBALANCE');
    if (intake.partnerAware === 'told_no_change') s.add('AWARE_NO_CHANGE');
    if (intake.thoughtOfBreakup === 'often' || intake.thoughtOfBreakup === 'now') s.add('EXIT_CONSIDERED');
  }

  if (module === 'reunion') {
    if (intake.theyReachedOut === 'yes') s.add('AMBIVALENCE');
    if (intake.theirState === 'read_no_reply') s.add('READ_NO_REPLY');
    if (intake.theirState === 'blocked') s.add('BLOCKED');
    if (intake.contactSince === 'several' || intake.contactSince === 'daily') s.add('HEAVY_CONTACT');
    if (intake.cycles === '3+') s.add('CYCLE_HEAVY');
    if (intake.theyDating === 'yes') s.add('THEY_DATING');
  }

  const text = String(intake.question || '') + ' ' + String(intake.freeNotes || '');
  for (const { code, re } of TEXT_SIGNALS[module] || []) {
    if (re.test(text)) s.add(code);
  }

  return s;
}
