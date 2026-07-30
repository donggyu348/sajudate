import { LLM_OUTPUT_SCHEMA, PATTERN_TYPES } from './llmPrompt.js';

/**
 * LLM 태깅 클라이언트.
 * - LLM_API_KEY 가 없으면 호출을 건너뛰고 null 을 반환한다(규칙 기반만으로 리포트 생성).
 * - 실제 연결은 사용 모델/제공사에 맞춰 fetch 부분만 교체하면 된다.
 */
export async function tagPatternsWithLlm(request) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null; // 미설정 시 그레이스풀 스킵

  const model = process.env.LLM_MODEL || 'claude-sonnet-5';

  // 제공사별 엔드포인트/포맷은 배포 환경에서 채워 넣는다.
  // 아래는 Anthropic Messages API 형태 예시(주석). 실제 키 연결 시 활성화.
  //
  // const res = await fetch('https://api.anthropic.com/v1/messages', {
  //   method: 'POST',
  //   headers: {
  //     'x-api-key': apiKey,
  //     'anthropic-version': '2023-06-01',
  //     'content-type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     model,
  //     max_tokens: 1024,
  //     temperature: request.temperature ?? 0,
  //     system: request.system,
  //     messages: request.messages,
  //   }),
  // });
  // const data = await res.json();
  // const text = data?.content?.[0]?.text ?? '';
  // return validateLlmOutput(safeJsonParse(text));

  // 키는 있으나 아직 엔드포인트 미연결 상태: 명시적으로 null 반환.
  void model;
  return null;
}

export function safeJsonParse(text) {
  if (!text) return null;
  try {
    // 코드펜스 등 제거 후 첫 JSON 오브젝트만 추출
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** LLM 출력의 최소 유효성 검증 (스키마 기반, 방어적) */
export function validateLlmOutput(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const patterns = Array.isArray(obj.patterns) ? obj.patterns : [];
  const valid = patterns
    .filter((p) => p && Object.prototype.hasOwnProperty.call(PATTERN_TYPES, p.type))
    .map((p) => ({
      type: p.type,
      count: Math.max(0, Math.floor(Number(p.count) || 0)),
      confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0)),
      bySpeaker: p.bySpeaker && typeof p.bySpeaker === 'object' ? p.bySpeaker : {},
    }));
  return {
    segmentsReviewed: Math.max(0, Math.floor(Number(obj.segmentsReviewed) || 0)),
    patterns: valid,
  };
}

export { LLM_OUTPUT_SCHEMA };
