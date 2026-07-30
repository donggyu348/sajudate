import { AXES, scoreBand } from './checklist.js';
import { PATTERN_TYPES } from './llmPrompt.js';

/**
 * 관계 조종 패턴 → 다크 테트라드 축 가중치.
 * 대화 분석 결과가 있으면 체크리스트 점수를 소폭 보정하는 데 사용.
 */
const PATTERN_AXIS_WEIGHT = {
  gaslighting: { machiavellianism: 0.6, psychopathy: 0.4 },
  lovebomb_devalue: { narcissism: 0.6, sadism: 0.4 },
  triangulation: { machiavellianism: 0.5, narcissism: 0.5 },
  darvo: { machiavellianism: 0.5, psychopathy: 0.5 },
};

const CHAT_MAX_ADJUST = 0.6; // 대화 분석이 축 평균에 더할 수 있는 최대치(점)

/**
 * 최종 점수 산출: 체크리스트(주) + 대화분석(보정).
 * @param {{ axisScores: Record<string,number> }} checklist
 * @param {{ llmTaggedPatterns: object|null, statPatterns: object }|null} chat
 */
export function buildFinalScores(checklist, chat) {
  const base = { ...checklist.axisScores };
  const adjust = { narcissism: 0, machiavellianism: 0, psychopathy: 0, sadism: 0 };

  const patterns = chat?.llmTaggedPatterns?.patterns ?? [];
  for (const p of patterns) {
    const weights = PATTERN_AXIS_WEIGHT[p.type];
    if (!weights) continue;
    // count·confidence 를 0~1 로 눌러 축별 가산
    const intensity = Math.min(1, (p.count || 0) * 0.2) * (p.confidence || 0);
    for (const [axis, w] of Object.entries(weights)) {
      adjust[axis] += intensity * w;
    }
  }

  const finalScores = {};
  for (const axis of Object.keys(AXES)) {
    const add = Math.min(CHAT_MAX_ADJUST, adjust[axis] || 0);
    const v = Math.min(5, (base[axis] || 0) + add);
    finalScores[axis] = Number(v.toFixed(2));
  }

  return {
    axisScores: finalScores,
    axisScores100: Object.fromEntries(
      Object.entries(finalScores).map(([k, v]) => [k, Number((((v - 1) / 4) * 100).toFixed(0))])
    ),
    chatAdjustApplied: patterns.length > 0,
  };
}

/** 종합 소견 텍스트 (임상적·보수적 어조, 인용문 없음) */
export function buildSummaryText(finalScores, chat) {
  const entries = Object.entries(finalScores.axisScores).sort((a, b) => b[1] - a[1]);
  const [topAxis, topVal] = entries[0];
  const band = scoreBand(topVal);

  const lines = [];
  lines.push(
    `응답을 종합하면, ${AXES[topAxis].label} 축에서 ${band.label}. (${topVal.toFixed(1)}/5.0)`
  );

  const elevated = entries.filter(([, v]) => v >= 3.2).map(([k]) => AXES[k].label);
  if (elevated.length > 1) {
    lines.push(`이와 함께 ${elevated.slice(1).join(', ')} 영역에서도 유의할 만한 경향이 함께 관찰됩니다.`);
  } else if (elevated.length === 0) {
    lines.push('전반적으로 두드러진 위험 신호는 관찰되지 않았습니다.');
  }

  const patterns = chat?.llmTaggedPatterns?.patterns ?? [];
  if (patterns.length > 0) {
    const names = patterns
      .filter((p) => p.confidence >= 0.4)
      .map((p) => PATTERN_TYPES[p.type])
      .filter(Boolean);
    if (names.length) {
      lines.push(
        `대화 분석에서는 ${names.join(', ')} 패턴과 유사한 신호가 통계적으로 감지되었습니다(실제 문장은 저장·표시되지 않습니다).`
      );
    }
  }

  lines.push(
    '본 결과는 관찰자 응답과 대화 통계에 기반한 참고용 인사이트이며, 임상적 진단을 대체하지 않습니다.'
  );
  return lines.join(' ');
}
