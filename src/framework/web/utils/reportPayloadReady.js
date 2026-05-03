/**
 * 리포트 DB 컬럼(reportInfo)이 “보여줄 본문이 있다” 수준으로 채워졌는지 판별합니다.
 * (null / 빈 배열 / 빈 객체는 GPT 미완료·폴링 필요로 본다)
 */
export function isReportPayloadReady(info) {
  if (info == null) return false;
  if (Array.isArray(info)) return info.length > 0;
  if (typeof info === "object") return Object.keys(info).length > 0;
  if (typeof info === "string") {
    const t = info.trim();
    if (!t) return false;
    try {
      return isReportPayloadReady(JSON.parse(t));
    } catch {
      return true;
    }
  }
  return true;
}
