import { SAFETY_RULES } from '../data/rules.js';

/**
 * 안전 검사(A군). 다른 모든 규칙보다 우선한다.
 *
 * 프롬프트에만 맡기지 않고 코드에서 먼저 잡는다 — LLM은 확률적으로 답하지만
 * 여기서는 같은 입력에 항상 같은 결과가 나와야 한다. 걸리면 LLM을 호출하지 않고
 * 확정된 문구로 끝낸다.
 */

const PATTERNS = [
  {
    id: 'A1',
    // 자해·극단 표현
    re: /죽고\s*싶|죽어버리|자살|자해|사라지고\s*싶|없어지고\s*싶|살기\s*싫|살고\s*싶지\s*않/,
  },
  {
    id: 'A2',
    // 추적·감시성 요청
    re: /위치\s*(추적|확인)|폰\s*(몰래|훔쳐)|계정\s*(해킹|접근|비밀번호)|부계정|뒷계정|몰래\s*(보|확인|따라)|집\s*앞에서\s*기다|직장\s*(앞|으로)\s*찾아|미행/,
  },
  {
    id: 'A3',
    // 명시적 거절·차단 이후 접근 방법 요청
    re: /(차단|거절|헤어지자|만나기\s*싫|그만\s*하자|연락하지\s*마).{0,40}(어떻게|방법|다시|돌이|붙잡|매달)/,
  },
];

/**
 * @param {string} text 사용자 입력
 * @returns {{ id: string, name: string, message: string }|null}
 */
export function checkSafety(text) {
  const t = String(text || '');
  for (const p of PATTERNS) {
    if (p.re.test(t)) return SAFETY_RULES[p.id];
  }
  return null;
}
