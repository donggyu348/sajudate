/**
 * 퍼널 첫 관문용 30초 체크리스트.
 *
 * 카톡 캡처 업로드는 광고를 막 클릭한 사람에게 요구하기엔 공수가 너무 커서,
 * 클릭 몇 번으로 끝나는 체크리스트를 앞에 두고 업로드는 그 다음 선택지로 내린다.
 *
 * 점수는 전부 결정론적으로 계산한다 — 여기서 임의로 높은 수치를 띄웠다가
 * 뒤의 정밀 리포트에서 낮은 값이 나오면 신뢰가 통째로 무너지기 때문이다.
 */

// weight: 가스라이팅(현실 부정·기억 왜곡)에 직결되는 문항에 더 큰 비중을 준다.
export const CHECKLIST = [
  {
    key: 'apologize',
    topic: '다투고 나면 늘 먼저 사과하게 되는 것',
    text: '다투고 나면, 결국 내가 먼저 사과하고 있다',
    weight: 1,
    signal: '갈등의 책임이 한쪽으로만 쏠리고 있어요',
  },
  {
    key: 'denial',
    topic: '내가 겪은 일을 상대가 부정한다는 것',
    text: '"그런 말 한 적 없다", "네가 예민한 거다"라는 말을 자주 듣는다',
    weight: 1.5,
    signal: '내가 겪은 일 자체를 부정당하는, 가스라이팅의 가장 전형적인 신호예요',
  },
  {
    key: 'doubt',
    topic: '내 기억을 스스로 의심하게 된다는 것',
    text: '내 기억이 맞는지 스스로 의심하게 된 적이 있다',
    weight: 1.5,
    signal: '판단의 기준이 나에게서 상대에게로 넘어가고 있다는 뜻이에요',
  },
  {
    key: 'walk-on-eggshells',
    topic: '하고 싶은 말을 삼키게 된다는 것',
    text: '상대의 기분을 살피느라 하고 싶은 말을 삼킨다',
    weight: 1,
    signal: '관계 안에서 내 표현이 계속 줄어들고 있어요',
  },
  {
    key: 'isolation',
    topic: '친구·가족과 만나는 일이 줄었다는 것',
    text: '상대 때문에 친구·가족과 만나는 일이 줄었다',
    weight: 1,
    signal: '고립은 도움을 청할 통로를 좁히기 때문에 특히 위험한 신호예요',
  },
  {
    key: 'hot-cold',
    topic: '상대의 태도 차이가 크다는 것',
    text: '잘해줄 때와 차갑게 대할 때의 차이가 크다',
    weight: 1,
    signal: '간헐적인 보상은 관계에서 빠져나오기 어렵게 만드는 구조예요',
  },
  {
    key: 'hide',
    topic: '이 관계를 남에게 설명하기 꺼려진다는 것',
    text: '이 관계를 남에게 설명하기가 꺼려진다',
    weight: 1,
    signal: '스스로도 이상하다고 느끼는 부분이 있다는 신호예요',
  },
];

const TOTAL_WEIGHT = CHECKLIST.reduce((sum, q) => sum + q.weight, 0);

const BANDS = [
  { min: 71, label: '매우 높음', tone: '지금 관계에서 벌어지는 일이 우연이나 성격 차이로 보기 어려운 수준이에요.' },
  { min: 46, label: '높음', tone: '한두 번의 사건이 아니라 반복되는 패턴에 가까워 보여요.' },
  { min: 21, label: '주의', tone: '아직 단정할 단계는 아니지만, 그냥 넘기기엔 걸리는 신호가 있어요.' },
  { min: 0, label: '낮음', tone: '체크리스트에서는 뚜렷한 위험 신호가 많이 잡히지 않았어요.' },
];

/**
 * @param {string[]} checkedKeys 사용자가 '예'로 체크한 문항 key 목록
 */
export function scoreChecklist(checkedKeys) {
  const keys = new Set(Array.isArray(checkedKeys) ? checkedKeys : []);
  const checkedItems = CHECKLIST.filter((q) => keys.has(q.key));
  const weight = checkedItems.reduce((sum, q) => sum + q.weight, 0);
  const percent = Math.round((weight / TOTAL_WEIGHT) * 100);
  const band = BANDS.find((b) => percent >= b.min);

  return {
    percent,
    band,
    checkedCount: checkedItems.length,
    total: CHECKLIST.length,
    // 결과 화면에서 "왜 이 수치인지"를 짚어주는 근거 — 비중이 큰 문항부터 최대 2개
    reasons: [...checkedItems].sort((a, b) => b.weight - a.weight).slice(0, 2).map((q) => q.signal),
    checkedKeys: checkedItems.map((q) => q.key),
  };
}

/**
 * 상담 봇·최종 진단에 넘길 요약문.
 * 체크리스트는 우리가 만든 고정 문항이라 사용자 입력이 섞이지 않는다.
 */
export function formatChecklistContext(checkedKeys) {
  const keys = new Set(Array.isArray(checkedKeys) ? checkedKeys : []);
  if (keys.size === 0) return null;
  const lines = CHECKLIST.filter((q) => keys.has(q.key)).map((q) => `- ${q.text}`);
  return `상담 전 자가 체크리스트에서 본인이 '그렇다'고 답한 항목:\n${lines.join('\n')}`;
}
