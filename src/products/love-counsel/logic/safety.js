import { MODULES } from '../data/rules/index.js';
import { SOME_SAFETY } from '../data/rules/some.js';

/**
 * 안전 검사(A군 / Z군). 다른 모든 규칙보다 우선한다.
 *
 * 프롬프트에만 맡기지 않고 코드에서 먼저 잡는다 — LLM은 확률적으로 답하지만
 * 여기서는 같은 입력에 항상 같은 결과가 나와야 한다. 걸리면 LLM을 호출하지 않고
 * 확정된 문구로 끝낸다.
 */

// 모듈과 무관하게 항상 검사하는 것
const UNIVERSAL = [
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

// 모듈별로 더 검사하는 것
const BY_MODULE = {
  dating: [
    // 폭력·통제 — 이 상황에서 "대화로 풀어보세요"는 최악의 조언이다
    { id: 'Z1', re: /때렸|때린|폭행|맞았|목을\s*조|밀쳐|물건을\s*던|협박|가둬|못\s*나가게|생활비를\s*끊|친구를?\s*못\s*만나게/ },
    { id: 'Z3', re: /폰\s*(검사|확인)|카톡\s*(검사|훔쳐)|위치\s*공유\s*강제|감시/ },
  ],
  reunion: [
    { id: 'Z3', re: /때렸|때린|폭행|맞았|협박|스토킹/ },
  ],
};

/**
 * @param {string} text    사용자 입력
 * @param {string} [module] some | dating | reunion
 * @returns {{ id: string, name: string, message: string }|null}
 */
export function checkSafety(text, module) {
  const t = String(text || '');

  // 모듈별 규칙을 먼저 본다 — 같은 상황이라도 모듈에 맞는 안내가 나가야 한다
  for (const p of BY_MODULE[module] || []) {
    if (p.re.test(t)) return MODULES[module]?.safety?.[p.id] || null;
  }
  for (const p of UNIVERSAL) {
    if (p.re.test(t)) return SOME_SAFETY[p.id];
  }
  return null;
}

/**
 * 재회 모듈에서 차단·명시적 거절은 입력값만으로도 확정된다.
 * 이 경우 접근 방법을 일절 제공하지 않는다.
 */
export function checkBlockedState(module, filled) {
  if (module !== 'reunion') return null;
  if (filled?.theirState === 'blocked') return MODULES.reunion.safety.Z1;
  return null;
}
