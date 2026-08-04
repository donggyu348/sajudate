/**
 * 다크 테트라드 4축 정의 + 관계 조종 패턴 라벨.
 * (체크리스트 문항/채점 로직은 제거됨 — AI 상담 대화 기반 진단으로 전환)
 */

export const AXES = {
  narcissism: { key: 'narcissism', label: '나르시시즘', short: '자기중심·과대' },
  machiavellianism: { key: 'machiavellianism', label: '마키아벨리즘', short: '전략적 조종' },
  psychopathy: { key: 'psychopathy', label: '사이코패시', short: '공감 결여·충동' },
  sadism: { key: 'sadism', label: '사디즘', short: '고통 유발 선호' },
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
