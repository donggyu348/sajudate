import { AXES, PATTERN_TYPES } from './axes.js';

const AXIS_KEYS = Object.keys(AXES);

/**
 * assessCounsel()의 LLM 응답(파싱 시도된 JSON)을 검증·정규화해 리포트 저장용 형태로 변환.
 * @param {any} raw
 */
export function normalizeAssessment(raw) {
  const axisScores = {};
  for (const key of AXIS_KEYS) {
    const v = Number(raw?.axisScores?.[key]);
    // 정보 부족 시 중립값(3)으로 폴백
    axisScores[key] = Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 3;
  }

  const axisScores100 = Object.fromEntries(
    AXIS_KEYS.map((k) => [k, Math.round(((axisScores[k] - 1) / 4) * 100)])
  );

  const patterns = Array.isArray(raw?.patterns)
    ? raw.patterns
        .filter((p) => p && Object.prototype.hasOwnProperty.call(PATTERN_TYPES, p.type))
        .map((p) => ({
          type: p.type,
          label: PATTERN_TYPES[p.type],
          count: Math.max(0, Math.floor(Number(p.count) || 0)),
          confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0)),
        }))
    : [];

  const summary =
    typeof raw?.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim()
      : '대화 내용을 바탕으로 한 요약을 생성하지 못했습니다. 상담을 조금 더 진행한 뒤 다시 시도해 주세요.';

  // 이번 대화에서만 관찰된 구체적 상호작용 구조 — 고정 패턴 유형과 달리 자유 형식, 최대 4개
  const keyFindings = Array.isArray(raw?.keyFindings)
    ? raw.keyFindings
        .filter((f) => f && typeof f.title === 'string' && f.title.trim() && typeof f.description === 'string' && f.description.trim())
        .slice(0, 4)
        .map((f) => ({ title: f.title.trim(), description: f.description.trim() }))
    : [];

  const selfPatternScoreRaw = Number(raw?.selfPatternScore);
  const selfPatternScore = Number.isFinite(selfPatternScoreRaw)
    ? Math.min(5, Math.max(1, selfPatternScoreRaw))
    : 3;
  const selfPatternScore100 = Math.round(((selfPatternScore - 1) / 4) * 100);
  const selfPatternNote =
    typeof raw?.selfPatternNote === 'string' && raw.selfPatternNote.trim()
      ? raw.selfPatternNote.trim()
      : '자기 반응 패턴에 대한 소견을 생성하지 못했습니다.';

  return {
    axisScores,
    axisScores100,
    patterns,
    keyFindings,
    summary,
    selfPatternScore,
    selfPatternScore100,
    selfPatternNote,
  };
}
