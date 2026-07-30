import { parseKakaoExport } from './kakaoParser.js';
import { computeStatPatterns, buildCandidateSegments } from './chatStats.js';
import { buildLlmRequest } from './llmPrompt.js';
import { tagPatternsWithLlm } from './llmClient.js';

/**
 * 카카오톡 원문 → 분석 결과.
 *
 * 파이프라인:
 *  1) 원문 파싱 (메모리)
 *  2) 규칙 기반 통계
 *  3) 후보 구간만 LLM 태깅 (키 없으면 스킵)
 *  4) 원문/세그먼트 파기 후, 저장 가능한 결과만 반환
 *
 * @param {string} rawText  업로드된 .txt 원문
 * @param {{ selfName?: string }} opts
 * @returns {Promise<{ platform:string, statPatterns:object, llmTaggedPatterns:object|null }>}
 */
export async function analyzeChat(rawText, opts = {}) {
  // 1) 파싱
  const { platform, messages } = parseKakaoExport(rawText);

  // 2) 통계
  const { stats, candidateIndexes } = computeStatPatterns(messages, opts);

  // 3) LLM 태깅 (후보 구간만)
  let llmTaggedPatterns = null;
  const segments = buildCandidateSegments(messages, candidateIndexes);
  if (segments.length > 0) {
    const request = buildLlmRequest(segments, {
      selfName: stats.selfName,
      partnerName: stats.partnerName,
    });
    llmTaggedPatterns = await tagPatternsWithLlm(request);
  }

  // 4) 원문 파기 (참조 해제) — 저장 대상은 통계/태깅 결과뿐
  messages.length = 0;
  segments.length = 0;

  return { platform, statPatterns: stats, llmTaggedPatterns };
}
