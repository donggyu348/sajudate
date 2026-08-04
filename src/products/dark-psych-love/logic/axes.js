/**
 * 다크 테트라드 4축 정의 + 관계 조종 패턴 라벨.
 * (체크리스트 문항/채점 로직은 제거됨 — AI 상담 대화 기반 진단으로 전환)
 */

export const AXES = {
  narcissism: {
    key: 'narcissism',
    label: '나르시시즘',
    short: '자기중심·과대',
    description: '자기 자신을 특별하게 여기고 과도한 인정과 관심을 원하며, 상대의 감정보다 자기 이미지를 우선시하는 성향이에요.',
    example: '예: "내가 이 정도 해줬는데 고마운 줄 알아야지"처럼 자기 기여는 부풀리고, 상대의 사소한 실수는 크게 지적하는 말이 반복될 수 있어요.',
    advice: '이런 모습이 반복된다면, 상대의 반응이 아니라 "내가 실제로 존중받고 있는가"를 스스로 기준 삼아 판단해보세요.',
  },
  machiavellianism: {
    key: 'machiavellianism',
    label: '마키아벨리즘',
    short: '전략적 조종',
    description: '원하는 것을 얻기 위해 상대를 수단으로 이용하거나, 상황을 자기에게 유리하게 조종하려는 전략적인 성향이에요.',
    example: '예: 필요할 때만 다정해지거나, 대화의 화제를 은근슬쩍 자기에게 유리한 쪽으로 돌리는 패턴이 반복될 수 있어요.',
    advice: '중요한 결정을 내릴 때는 상대의 설득보다, 사실관계와 내 판단을 먼저 정리해보는 게 도움이 돼요.',
  },
  psychopathy: {
    key: 'psychopathy',
    label: '사이코패시',
    short: '공감 결여·충동',
    description: '상대의 고통에 잘 공감하지 못하고, 충동적이고 무책임하게 행동하는 성향이에요.',
    example: '예: 내가 힘들어하는 걸 보고도 무덤덤하거나, 약속과 책임을 자주 가볍게 여기는 모습으로 나타날 수 있어요.',
    advice: '내 감정에 대한 반응이 반복적으로 없다면, 그건 내가 예민해서가 아니라 실제 신호일 수 있어요.',
  },
  sadism: {
    key: 'sadism',
    label: '사디즘',
    short: '고통 유발 선호',
    description: '상대가 고통받거나 괴로워하는 모습에서 즐거움이나 만족을 느끼는 성향이에요.',
    example: '예: 내가 상처받은 모습을 보고 웃거나, 일부러 아픈 곳을 찌르는 말을 반복하는 패턴으로 나타날 수 있어요.',
    advice: '이 성향은 관계에서 특히 해로울 수 있어요. 반복된다면 혼자 판단하지 말고 주변이나 전문가와 상황을 함께 짚어보세요.',
  },
};

/** 상대방이 아니라 '사용자 자신'의 반응 패턴을 보는 별도 축. AXES(레이더 4축)에는 포함하지 않고 리포트에서 별도 섹션으로 다룬다. */
export const SELF_AXIS = {
  key: 'selfPattern',
  label: '자기 반응 취약성',
  short: '자기책임화·경계 설정 취약',
};

export const PATTERN_TYPES = {
  gaslighting: '가스라이팅',
  lovebomb_devalue: '러브바밍–평가절하 사이클',
  triangulation: '삼각관계 조성',
  darvo: 'DARVO(책임 전가)',
};

/** 점수(1~5)를 임상적 언어의 경향 밴드로 변환 */
export function scoreBand(avg) {
  if (avg >= 4.2) return { level: 'high', label: '뚜렷한 경향이 관찰됩니다' };
  if (avg >= 3.2) return { level: 'elevated', label: '상당한 경향이 관찰됩니다' };
  if (avg >= 2.2) return { level: 'moderate', label: '다소의 경향이 관찰됩니다' };
  return { level: 'low', label: '두드러진 경향은 관찰되지 않습니다' };
}

/** 가스라이팅 확률(0~100)을 직관적인 문구로 변환 */
export function gaslightingBand(pct) {
  if (pct >= 70) return { level: 'high', label: '가스라이팅 신호가 뚜렷해요' };
  if (pct >= 40) return { level: 'elevated', label: '가스라이팅 신호가 상당히 감지돼요' };
  if (pct >= 15) return { level: 'moderate', label: '가스라이팅 신호가 일부 감지돼요' };
  return { level: 'low', label: '뚜렷한 가스라이팅 신호는 감지되지 않았어요' };
}
