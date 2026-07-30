/**
 * 다크심리학 연애 진단 — 체크리스트 문항 (20문항)
 *
 * 설계 원칙
 * - 관찰자 시점: "상대방이 관계 안에서 ~한다"를 5점 척도로 응답
 * - 4축 매핑: 다크 테트라드 (나르시시즘 / 마키아벨리즘 / 사이코패시 / 사디즘)
 *   SD3(Short Dark Triad), Dirty Dozen, SD4(Sadism 추가) 척도 문항을
 *   연애/관계 맥락으로 각색
 * - 5점 척도: 1(전혀 아니다) ~ 5(매우 그렇다)
 * - reverse=true 문항은 역채점 (6 - 응답값)
 *
 * 재미 요소 배제, 진지한 관찰 문장 유지.
 */

export const AXES = {
  narcissism: { key: 'narcissism', label: '나르시시즘', short: '자기중심·과대' },
  machiavellianism: { key: 'machiavellianism', label: '마키아벨리즘', short: '전략적 조종' },
  psychopathy: { key: 'psychopathy', label: '사이코패시', short: '공감 결여·충동' },
  sadism: { key: 'sadism', label: '사디즘', short: '고통 유발 선호' },
};

export const SCALE = [
  { value: 1, label: '전혀 아니다' },
  { value: 2, label: '아니다' },
  { value: 3, label: '보통이다' },
  { value: 4, label: '그렇다' },
  { value: 5, label: '매우 그렇다' },
];

/**
 * @typedef {Object} ChecklistItem
 * @property {number} id
 * @property {string} axis   - AXES 키
 * @property {string} text   - 관찰자 시점 문항
 * @property {boolean} [reverse]
 */

/** @type {ChecklistItem[]} */
export const CHECKLIST_ITEMS = [
  // ── 나르시시즘 (5) ─────────────────────────────
  { id: 1, axis: 'narcissism', text: '상대는 대화의 초점이 늘 자신에게 있어야 한다고 여긴다.' },
  { id: 2, axis: 'narcissism', text: '상대는 특별한 대우나 인정을 당연하게 요구한다.' },
  { id: 3, axis: 'narcissism', text: '상대는 나의 성취나 관심사를 대수롭지 않게 깎아내린다.' },
  { id: 4, axis: 'narcissism', text: '상대는 자신의 잘못을 인정하기보다 남 탓으로 돌린다.' },
  {
    id: 5,
    axis: 'narcissism',
    reverse: true,
    text: '상대는 내 감정이 자신보다 중요할 수 있다고 진심으로 받아들인다.',
  },

  // ── 마키아벨리즘 (5) ───────────────────────────
  { id: 6, axis: 'machiavellianism', text: '상대는 원하는 것을 얻기 위해 상황이나 사람을 계획적으로 이용한다.' },
  { id: 7, axis: 'machiavellianism', text: '상대는 진짜 의도를 숨기고 다른 이유를 내세우는 편이다.' },
  { id: 8, axis: 'machiavellianism', text: '상대는 관계에서 유리한 고지를 점하려 정보를 선택적으로 흘린다.' },
  { id: 9, axis: 'machiavellianism', text: '상대는 나를 다른 사람과 비교하며 경쟁 구도를 만든다.' },
  {
    id: 10,
    axis: 'machiavellianism',
    reverse: true,
    text: '상대는 손해를 보더라도 나에게 솔직하고 투명하게 대한다.',
  },

  // ── 사이코패시 (5) ─────────────────────────────
  { id: 11, axis: 'psychopathy', text: '상대는 내가 상처받아도 별다른 죄책감을 보이지 않는다.' },
  { id: 12, axis: 'psychopathy', text: '상대는 결과를 고려하지 않고 충동적으로 행동한다.' },
  { id: 13, axis: 'psychopathy', text: '상대는 약속이나 책임을 쉽게 저버린다.' },
  { id: 14, axis: 'psychopathy', text: '상대는 위험하거나 무모한 행동에서 스릴을 느낀다.' },
  {
    id: 15,
    axis: 'psychopathy',
    reverse: true,
    text: '상대는 내가 힘들어할 때 진심으로 함께 걱정하고 공감한다.',
  },

  // ── 사디즘 (5) ─────────────────────────────────
  { id: 16, axis: 'sadism', text: '상대는 나를 깎아내리거나 놀리며 즐거워하는 듯 보인다.' },
  { id: 17, axis: 'sadism', text: '상대는 다툰 뒤 내가 괴로워하는 모습을 은근히 즐긴다.' },
  { id: 18, axis: 'sadism', text: '상대는 일부러 상처가 되는 말을 골라서 한다.' },
  { id: 19, axis: 'sadism', text: '상대는 내가 불안해하거나 매달리게 만드는 상황을 조성한다.' },
  {
    id: 20,
    axis: 'sadism',
    reverse: true,
    text: '상대는 나의 안정과 편안함을 지켜주려 애쓴다.',
  },
];

export const ITEMS_PER_AXIS = 5;
export const TOTAL_ITEMS = CHECKLIST_ITEMS.length;

/**
 * 응답 채점 → 축별 평균 점수(0~5) 및 정규화(0~100).
 * @param {Record<number, number>} answers - { itemId: value(1..5) }
 * @returns {{ axisScores: Record<string,number>, axisScores100: Record<string,number>, answered: number }}
 */
export function scoreChecklist(answers) {
  const sums = {};
  const counts = {};
  for (const axis of Object.keys(AXES)) {
    sums[axis] = 0;
    counts[axis] = 0;
  }

  let answered = 0;
  for (const item of CHECKLIST_ITEMS) {
    const raw = answers[item.id];
    if (raw == null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 1 || v > 5) continue;
    const scored = item.reverse ? 6 - v : v;
    sums[item.axis] += scored;
    counts[item.axis] += 1;
    answered += 1;
  }

  const axisScores = {};
  const axisScores100 = {};
  for (const axis of Object.keys(AXES)) {
    const avg = counts[axis] > 0 ? sums[axis] / counts[axis] : 0;
    axisScores[axis] = Number(avg.toFixed(2));
    // 1~5 척도를 0~100 으로 정규화
    axisScores100[axis] = Number((((avg - 1) / 4) * 100).toFixed(0));
  }

  return { axisScores, axisScores100, answered };
}

/** 점수(0~5)를 임상적 언어의 경향 밴드로 변환 */
export function scoreBand(avg) {
  if (avg >= 4.2) return { level: 'high', label: '뚜렷한 경향이 관찰됩니다' };
  if (avg >= 3.2) return { level: 'elevated', label: '상당한 경향이 관찰됩니다' };
  if (avg >= 2.2) return { level: 'moderate', label: '다소의 경향이 관찰됩니다' };
  return { level: 'low', label: '두드러진 경향은 관찰되지 않습니다' };
}
