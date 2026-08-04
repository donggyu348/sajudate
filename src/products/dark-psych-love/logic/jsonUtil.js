/** LLM 응답 텍스트에서 코드펜스 등을 제거하고 첫 JSON 오브젝트만 파싱. 실패 시 null. */
export function safeJsonParse(text) {
  if (!text) return null;
  try {
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
