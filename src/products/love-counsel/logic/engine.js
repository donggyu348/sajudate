import { RULES, GROUP_PRIORITY } from '../data/rules.js';
import { extractSignals } from './signals.js';

/**
 * 판정 엔진.
 *
 * 규칙은 여러 개가 동시에 걸리지만 처방은 반드시 하나만 나간다 —
 * 두 개 이상 주면 사용자가 실행하지 않고, 실행하지 않으면 결과가 없다.
 *
 * LLM은 이 결과를 바꾸지 못한다. 판정은 코드가 하고 LLM은 말하기만 한다.
 */

/**
 * @param {object} intake
 * @returns {{ matched: string[], activeRule: object, signals: string[] }}
 */
export function judge(intake) {
  const signals = extractSignals(intake);

  const matched = RULES.filter((rule) => {
    try {
      return rule.match(intake, signals);
    } catch {
      // 규칙 하나가 잘못 쓰여도 판정 전체가 멈추면 안 된다
      return false;
    }
  });

  const ranked = matched.slice().sort((a, b) => {
    const byGroup = GROUP_PRIORITY[a.group] - GROUP_PRIORITY[b.group];
    // 같은 군 안에서는 조건이 더 좁은 규칙(order가 작은 쪽)을 먼저 채택한다
    return byGroup !== 0 ? byGroup : a.order - b.order;
  });

  return {
    matched: matched.map((r) => r.id),
    activeRule: ranked[0] || FALLBACK_RULE,
    signals: [...signals],
  };
}

/**
 * 어떤 규칙에도 걸리지 않는 조합을 위한 기본 카드.
 * 규칙집이 42개로 차면 거의 나오지 않겠지만, 그때까지 빈손으로 상담을 시작할 수는 없다.
 */
export const FALLBACK_RULE = {
  id: 'B6',
  group: 'B',
  name: '관계 정상 — 속도만 문제',
  order: 99,
  match: () => false,
  deduction: '지금 뭘 더 해야 할지보다, 뭘 하지 말아야 할지가 더 헷갈리실 겁니다.',
  diagnosis: '관계는 살아 있습니다. 조정 대상은 속도와 무게 배분뿐입니다.',
  misdiagnosis: '뭔가 잘못하고 있는 것 같아요',
  prescription: '지금 하던 것을 바꾸지 말고, 다음 만남 하나만 먼저 잡으세요.',
  prediction: '',
  forbid: ['위기감 조성', '불필요한 밀당'],
  probeQuestion: '마지막으로 만난 게 언제인가요?',
};

/** 규칙 id로 카드를 찾는다. 세션 복원 시 활성 규칙을 다시 세울 때 쓴다. */
export function findRule(id) {
  return RULES.find((r) => r.id === id) || FALLBACK_RULE;
}

/**
 * 페이월 트리거 — "그래서 어떻게 해야 되나요" 류.
 * 턴 수로 걸지 않는다. 사용자가 처방을 요구하는 순간이 트리거다.
 */
const HOW_TO_PATTERNS = [
  /어떻게\s*(해야|하면|하죠|해요|할까)/,
  /뭐라고\s*(말|해야|하면|보내)/,
  /어떤\s*말/,
  /뭘\s*(해야|하면)/,
  /방법\s*(이|을|좀)?\s*(뭐|알려|있)/,
  /그럼\s*(이제)?\s*뭐/,
];

export function isHowToQuestion(text) {
  const t = String(text || '');
  return HOW_TO_PATTERNS.some((re) => re.test(t));
}
