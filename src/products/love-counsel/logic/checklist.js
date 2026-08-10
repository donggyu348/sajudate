/**
 * 체크리스트 10문항. 문구는 지시서에 확정된 것을 그대로 쓴다.
 * Q10만 자유 입력이고 나머지는 전부 탭 선택이다.
 *
 * 외모·스펙·이상형은 묻지 않는다 — 특정 상대를 향한 끌림을 예측하지 못하고
 * (Joel/Eastwick/Finkel 2017), 물어보면 사용자가 오답 방향으로 자기진단한다.
 */
export const QUESTIONS = [
  {
    key: 'stage',
    label: '지금 두 사람은 어떤 사이인가요?',
    options: [
      { value: 'some', label: '썸' },
      { value: 'dating', label: '연애 중' },
      { value: 'breakup', label: '헤어진 사이' },
    ],
  },
  {
    key: 'weeksKnown',
    label: '알게 된 지 얼마나 됐나요?',
    options: [
      { value: '2', label: '2주 이내' },
      { value: '4', label: '3~4주' },
      { value: '8', label: '1~2개월' },
      { value: '12', label: '2~3개월' },
      { value: '16', label: '3개월 이상' },
    ],
  },
  {
    key: 'meetCount',
    label: '단둘이 만난 건 몇 번인가요?',
    options: [
      { value: '0', label: '없음' },
      { value: '1-2', label: '1~2번' },
      { value: '3-5', label: '3~5번' },
      { value: '6+', label: '6번 이상' },
    ],
  },
  {
    key: 'theyProposed',
    label: '상대가 먼저 "만나자"고 한 적 있나요?',
    // 이 제품에서 가장 중요한 문항 — 관심의 유일한 신뢰 지표다. 화면에서도 강조한다.
    emphasis: true,
    hint: '답장 여부 말고, 만나자는 제안을 상대가 먼저 한 적이 있는지입니다.',
    options: [
      { value: 'yes', label: '있다' },
      { value: 'no', label: '없다' },
      { value: 'unsure', label: '기억이 안 난다' },
    ],
  },
  {
    key: 'initiative',
    label: '연락은 주로 누가 먼저 하나요?',
    options: [
      { value: 'me', label: '거의 나' },
      { value: 'even', label: '반반' },
      { value: 'them', label: '주로 상대' },
    ],
  },
  {
    key: 'replySpeed',
    label: '상대 카톡에 보통 얼마나 빨리 답하나요?',
    options: [
      { value: 'instant', label: '바로' },
      { value: 'within1h', label: '1시간 안에' },
      { value: 'varies', label: '그때그때' },
    ],
  },
  {
    key: 'meetTime',
    label: '주로 언제 만나나요?',
    options: [
      { value: 'day', label: '낮에만' },
      { value: 'evening', label: '저녁까지' },
      { value: 'night', label: '밤늦게까지' },
      { value: 'none', label: '만난 적 없음' },
    ],
  },
  {
    key: 'theyOpened',
    label: '상대가 자기 얘기(가족·힘든 일·과거)를 먼저 꺼낸 적 있나요?',
    options: [
      { value: 'yes', label: '있다' },
      { value: 'no', label: '없다' },
    ],
  },
  {
    key: 'channel',
    label: '어떻게 알게 된 사이인가요?',
    options: [
      { value: 'blinddate', label: '소개팅' },
      { value: 'school_work', label: '학교·직장' },
      { value: 'app', label: '데이팅앱' },
      { value: 'club', label: '모임·취미' },
      { value: 'acquaintance', label: '지인' },
    ],
  },
  {
    key: 'question',
    label: '지금 가장 알고 싶은 게 뭔가요?',
    free: true,
    placeholder: '예) 이 사람이 저한테 관심이 있는 건지 아닌지 모르겠어요',
  },
];

/**
 * 폼 응답을 Intake로 검증·변환한다. 하나라도 비면 에러를 돌려준다 —
 * 판정 엔진은 값이 전부 있다고 가정하고 동작한다.
 * @returns {{ intake: object|null, error: string|null }}
 */
export function parseIntake(body, target) {
  const intake = {
    targetAge: Number(target?.targetAge) || 0,
    targetGender: target?.targetGender === 'male' ? 'male' : 'female',
  };

  for (const q of QUESTIONS) {
    const raw = String(body?.[q.key] ?? '').trim();
    if (!raw) return { intake: null, error: '답하지 않은 문항이 있습니다.' };

    if (q.free) {
      intake[q.key] = raw.slice(0, 500);
      continue;
    }
    if (!q.options.some((o) => o.value === raw)) {
      return { intake: null, error: '선택지에 없는 값이 들어왔습니다.' };
    }
    intake[q.key] = q.key === 'weeksKnown' ? Number(raw) : raw;
  }

  return { intake, error: null };
}

/** 판정 카드와 함께 프롬프트에 넣을 사용자 정보 요약. */
export function formatIntake(intake) {
  const label = (key) => {
    const q = QUESTIONS.find((x) => x.key === key);
    const value = key === 'weeksKnown' ? String(intake[key]) : intake[key];
    return q?.options?.find((o) => o.value === value)?.label ?? value;
  };

  return [
    `상대 나이: ${intake.targetAge}세 / 성별: ${intake.targetGender === 'male' ? '남성' : '여성'}`,
    `알게 된 지: ${label('weeksKnown')}`,
    `단둘이 만난 횟수: ${label('meetCount')}`,
    `상대가 먼저 만나자고 한 적: ${label('theyProposed')}`,
    `연락 주도권: ${label('initiative')}`,
    `내 답장 속도: ${label('replySpeed')}`,
    `만남 시간대: ${label('meetTime')}`,
    `상대가 사적인 얘기를 먼저 꺼낸 적: ${label('theyOpened')}`,
    `알게 된 경로: ${label('channel')}`,
  ].join('\n');
}
