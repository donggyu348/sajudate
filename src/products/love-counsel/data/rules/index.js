import { SOME_RULES, SOME_PRIORITY, SOME_SAFETY } from './some.js';
import { DATING_RULES, DATING_PRIORITY, DATING_SAFETY } from './dating.js';
import { REUNION_RULES, REUNION_PRIORITY, REUNION_SAFETY } from './reunion.js';

/**
 * 모듈별 규칙집. 판정은 항상 해당 모듈의 규칙만 평가한다 —
 * 모듈이 섞이면 썸 처방이 재회 상담에 나가는 사고가 난다.
 */
export const MODULES = {
  some: { rules: SOME_RULES, priority: SOME_PRIORITY, safety: SOME_SAFETY },
  dating: { rules: DATING_RULES, priority: DATING_PRIORITY, safety: DATING_SAFETY },
  reunion: { rules: REUNION_RULES, priority: REUNION_PRIORITY, safety: REUNION_SAFETY },
};

export { reunionGrade } from './reunion.js';
