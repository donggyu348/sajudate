/**
 * 재회 모듈 규칙 (MVP 10개).
 *
 * 파는 것은 재회 확률을 높이는 경로이고, 파지 않는 것은 재회 보장이다.
 * 재회 확률을 높이는 행동과 재회 후 관계가 유지되는 행동은 같다 — 둘 다
 * "무엇이 달라졌는가"를 요구한다. 그래서 "어떻게 다시 붙잡을까"가 아니라
 * "무엇을 바꿔야 상대가 돌아올 이유가 생기는가"를 다룬다.
 *
 * 확률 %는 쓰지 않는다. 등급(A/B/C/D)으로만 말한다.
 */

// X군(지금 멈춰야 할 행동)은 전술(T군)보다 위다 — 1턴에서 바로 나가야 하는 내용이다.
export const REUNION_PRIORITY = { Z: 1, R: 2, X: 3, T: 4 };

export const REUNION_RULES = [
  // ── R군: 재회 가능성 판정 ────────────────────────────────────
  {
    id: 'R7',
    group: 'R',
    name: '사이클 3회 이상',
    order: 1,
    match: (i) => i.cycles === '3+',
    deduction: '이번에는 다를 거라고 생각하고 계실 겁니다. 지난번에도 그렇게 생각하셨을 거고요.',
    diagnosis:
      '헤어짐과 재회 자체가 패턴이 됐습니다. 다시 만나도 같은 주기가 돌아옵니다. 순환이 반복될수록 갈등 패턴과 스트레스가 누적된다는 연구가 있습니다.',
    misdiagnosis: '이번엔 정말 다를 것 같아요',
    prescription:
      '재회 방법을 찾기 전에 무엇이 달라질 수 있는지부터 정하세요. 답이 안 나오면 이번에도 같은 자리로 돌아옵니다.',
    prediction: '바뀐 것 없이 다시 만나면, 지난번과 비슷한 시점에 같은 이유로 멀어집니다.',
    forbid: ['재회 방법 즉시 제공', '확률 언급', '문자 대필'],
    probeQuestion: '이전에 다시 만났을 때, 무엇이 달라져서 다시 만났나요?',
  },
  {
    id: 'R4',
    group: 'R',
    name: '신뢰 파괴형 이별',
    order: 2,
    match: (i) => i.reason === 'trust',
    deduction: '상대가 다시 받아준다고 해도, 그 뒤가 더 힘들 거라는 예감이 이미 드실 겁니다.',
    diagnosis:
      '신뢰가 깨져서 헤어진 경우입니다. 재회하더라도 상대의 불안이 관계를 지배합니다. 회복에는 수개월 단위의 시간과 검증을 견디는 각오가 필요합니다.',
    misdiagnosis: '한 번만 용서받으면 예전으로 돌아갈 수 있어요',
    prescription:
      '용서를 구하는 대신 검증을 감당할 준비를 하세요. 상대가 확인하려 들 때 방어하지 않는 것이 첫 조건입니다.',
    prediction: '',
    forbid: ['반복 사과 권유', '확률 언급', '문자 대필'],
    probeQuestion: '그 일이 알려진 뒤, 상대가 가장 많이 물었던 게 무엇이었나요?',
  },
  {
    id: 'R2',
    group: 'R',
    name: '반복 갈등형 이별',
    order: 3,
    match: (i) => i.reason === 'fights',
    deduction: '마지막 싸움이 유난히 컸던 건 아닐 겁니다. 늘 하던 싸움이었는데 그날 끝났을 거예요.',
    diagnosis:
      '재회는 가능하지만 조건부입니다. 상대가 두려워하는 건 당신이 아니라 그 패턴입니다. 패턴이 그대로면 똑같이 다시 헤어집니다.',
    misdiagnosis: '그때 제가 좀 더 참았으면 됐을 텐데요',
    prescription:
      '다툼이 시작되는 지점을 하나만 특정하세요. 대개 추궁과 회피가 맞물리는 구간입니다. 거기서 무엇을 다르게 할지 한 가지만 정합니다.',
    prediction: '',
    forbid: ['확률 언급', '문자 대필', '즉시 재접촉 권유'],
    probeQuestion: '싸움은 주로 누가 먼저 문제를 꺼내면서 시작됐나요?',
  },
  {
    id: 'R5',
    group: 'R',
    name: '상대 통보 — 감정 시차',
    order: 4,
    match: (i) => i.whoEnded === 'them',
    deduction: '상대는 담담해 보이는데 나만 무너져 있는 것 같아 더 힘드실 겁니다.',
    diagnosis:
      '상대는 헤어지자고 말하기 전에 이미 마음의 준비 기간을 거쳤습니다. 당신보다 몇 주 앞서 있습니다. 지금 온도차는 마음의 크기 차이가 아니라 시차입니다.',
    misdiagnosis: '저만 미련이 남은 것 같아요',
    prescription: '그 시차만큼 무접촉 기간을 더 길게 잡으세요. 지금은 따라잡으려 할수록 멀어집니다.',
    prediction: '',
    forbid: ['즉시 연락 권유', '확률 언급', '문자 대필'],
    probeQuestion: '상대가 헤어지자고 말했을 때, 갑작스러웠나요 아니면 예상하고 계셨나요?',
  },
  {
    id: 'R1',
    group: 'R',
    name: '상황형 이별 (A등급)',
    order: 5,
    match: (i) => i.reason === 'circumstance',
    deduction: '헤어질 이유가 없었는데 헤어졌다는 생각이 계속 드실 겁니다.',
    diagnosis:
      '감정이 식어서 헤어진 게 아니라 조건 때문에 헤어진 경우입니다. 재회 가능성이 가장 높은 유형입니다.',
    misdiagnosis: '이미 늦은 것 같아요',
    prescription:
      '그 상황 변수가 지금 해소됐는지부터 확인하세요. 해소됐다면 그것 자체가 다시 연락할 명분입니다.',
    prediction: '상황이 그대로라면 다시 만나도 같은 이유로 또 헤어집니다.',
    forbid: ['확률 언급', '문자 대필', '감정 호소 권유'],
    probeQuestion: '헤어지게 만든 그 상황은 지금 달라졌나요?',
  },
  {
    id: 'R8',
    group: 'R',
    name: '양가감정 신호',
    order: 6,
    match: (i) => i.theyReachedOut === 'yes' || i.theirState === 'replies',
    deduction: '상대에게서 연락이 온 날은 하루 종일 그 생각만 하셨을 겁니다.',
    diagnosis:
      '상대가 아직 완전히 정리하지 못한 상태입니다. 전 연인에 대한 양가감정이 클수록 재결합 가능성이 높다는 연구가 있습니다. 지금 신호는 유리한 쪽입니다.',
    misdiagnosis: '그냥 예의로 답하는 거겠죠',
    prescription:
      '이 상태를 압박으로 닫지 마세요. 연락 빈도를 늘리지 말고, 온 연락에만 짧게 답합니다.',
    prediction: '압박이 없으면 연락 간격이 조금씩 짧아집니다. 늘리면 그 순간 끊깁니다.',
    forbid: ['연락 빈도 늘리기', '관계 얘기 먼저 꺼내기', '확률 언급', '문자 대필'],
    probeQuestion: '상대가 먼저 연락했을 때, 어떤 내용이었나요?',
  },
  {
    id: 'R10',
    group: 'R',
    name: '이별 직후 구간',
    order: 7,
    match: (i) => i.sinceBreakup === '1w' || i.sinceBreakup === '2-4w',
    deduction: '지금 뭐라도 해야 할 것 같아서 견디기 어려우실 겁니다.',
    diagnosis:
      '이별 직후는 양쪽 다 감정이 격앙된 구간이고, 2~4주는 상대가 해방감을 느끼는 시기입니다. 이 구간의 행동은 대부분 확률을 깎습니다.',
    misdiagnosis: '지금 잡지 않으면 늦을 것 같아요',
    prescription: '지금은 아무것도 하지 않습니다. 재접촉은 1~3개월 구간에서 시작합니다.',
    prediction: '이 구간에 보낸 연락은 대개 답이 없거나, 답이 와도 정리하자는 내용입니다.',
    forbid: ['지금 연락', '만남 요구', '확률 언급', '문자 대필'],
    probeQuestion: '헤어진 뒤 지금까지, 연락하고 싶은 충동이 가장 셌던 순간은 언제였나요?',
  },

  // ── X군: 지금 멈춰야 할 행동 (전술보다 위) ──────────────────────
  {
    id: 'X1',
    group: 'X',
    name: '연락 폭탄',
    order: 1,
    match: (i) => (i.contactSince === 'several' || i.contactSince === 'daily')
      && (i.theirState === 'read_no_reply' || i.theirState === 'blocked'),
    deduction:
      '보내기 전에 문장을 몇 번씩 고쳐 쓰셨을 겁니다. 이번엔 다르게 말하면 답이 올까 싶어서요.',
    diagnosis:
      '연락할수록 상대는 자기 결정이 옳았다고 확인하게 됩니다. 헤어진 이유를 매일 갱신해 주고 있는 셈입니다.',
    misdiagnosis: '진심을 알면 마음이 바뀔 거예요',
    prescription: '지금 당장 멈추세요. 가장 급한 건 보내는 게 아니라 멈추는 겁니다.',
    prediction: '멈추면 상대 쪽에서 반응이 올 여지가 생깁니다. 계속 보내면 그 여지가 없어집니다.',
    forbid: ['추가 연락', '사과 반복', '지인 동원', '문자 대필'],
    probeQuestion: '마지막으로 보낸 연락에 상대가 답을 했나요?',
  },
  {
    id: 'X3',
    group: 'X',
    name: '애원·매달림',
    order: 2,
    match: (i, s) => s.has('BEGGING'),
    deduction: '매달리고 나면 그날 밤에 더 비참해지셨을 겁니다.',
    diagnosis:
      '이별 사유의 상당수는 관계에서 존중받지 못했다는 감각입니다. 매달림은 그 판단을 강화합니다.',
    misdiagnosis: '진심을 보여주면 통할 거예요',
    prescription: '감정 호소를 전면 중단하세요. 지금 필요한 건 마음의 크기가 아니라 달라진 증거입니다.',
    prediction: '',
    forbid: ['감정 호소', '선물 공세', '확률 언급', '문자 대필'],
    probeQuestion: '마지막으로 마음을 전했을 때 상대는 뭐라고 했나요?',
  },
  {
    id: 'X2',
    group: 'X',
    name: '반복 사과',
    order: 3,
    match: (i, s) => s.has('REPEATED_APOLOGY'),
    deduction: '사과가 받아들여지지 않으면 다시 사과하게 되셨을 겁니다.',
    diagnosis:
      '사과는 한 번이 사과고, 반복되면 압박입니다. 상대는 용서를 요구받는다고 느낍니다. 사과는 재회 도구가 아닙니다.',
    misdiagnosis: '아직 제 사과가 부족한 것 같아요',
    prescription: '사과를 멈추세요. 같은 말을 반복하는 대신 그 기간 동안 아무 연락도 하지 않습니다.',
    prediction: '',
    forbid: ['추가 사과', '장문 편지', '문자 대필'],
    probeQuestion: '사과를 몇 번쯤 하셨나요?',
  },
];

/**
 * 재회 가능성 등급. 확률 %가 아니라 등급으로 낸다.
 * D등급에서는 재회 방법을 제공하지 않고 종료를 돕는 상담으로 전환한다.
 */
export function reunionGrade(i) {
  if (!i) return null;
  if (i.theirState === 'blocked' || i.cycles === '4+') {
    return { grade: 'D', label: '재회를 목표로 하지 않음', reason: '명확한 거절 또는 반복된 순환' };
  }
  if (i.theyDating === 'yes' || i.reason === 'trust') {
    return { grade: 'C', label: '낮음', reason: i.theyDating === 'yes' ? '상대에게 새로운 관계가 있음' : '신뢰가 깨진 이별' };
  }
  if (i.reason === 'fights' || i.cycles === '2' || i.cycles === '3+') {
    return { grade: 'B', label: '조건부', reason: '변화가 증명되어야 가능' };
  }
  if (i.reason === 'circumstance' && (i.theirState === 'replies' || i.theyReachedOut === 'yes')) {
    return { grade: 'A', label: '높음', reason: '상황형 이별이고 연락 채널이 살아 있음' };
  }
  return { grade: 'B', label: '조건부', reason: '변화가 증명되어야 가능' };
}

/** 재회 모듈의 안전 규칙. 차단·거절 이후에는 접근 방법을 일절 제공하지 않는다. */
export const REUNION_SAFETY = {
  Z1: {
    id: 'Z1',
    group: 'Z',
    name: '차단·명시적 거절',
    message:
      '상대가 차단했거나 연락하지 말라고 명확히 밝힌 상태라면, 다시 다가가는 방법은 알려드리지 않습니다. 우회 연락, 새 번호, 지인 경유, 다른 계정 전부 마찬가지입니다.\n\n지금 필요한 건 방법이 아니라 시간입니다. 이 관계에 쓰던 시간을 본인 쪽으로 돌리는 것부터 하세요.',
  },
  Z3: {
    id: 'Z3',
    group: 'Z',
    name: '폭력·학대 이력',
    message:
      '폭력이나 학대가 있었던 관계의 재회는 상담하지 않습니다. 그 방향은 도와드릴 수 없습니다.\n\n· 여성긴급전화 1366 (24시간)\n· 경찰 112\n\n지금 필요한 건 재회가 아니라 안전한 거리입니다.',
  },
};
