import { getCounselorClient, DEFAULT_MODEL } from './counselor.js';
import { AXES } from './axes.js';
import { REPORT_TOC } from './safety.js';
import { safeJsonParse } from './jsonUtil.js';

/**
 * 결제 완료 후 보여줄 전체 리포트 콘텐츠 생성.
 * 원본 상담 대화는 저장하지 않으므로(프라이버시 설계), 이미 만들어진 무료 리포트 결과
 * (summary/axisScores/patterns/selfPattern — 전부 원문 인용 없는 요약 데이터)만 입력으로 쓴다.
 * REPORT_TOC를 그대로 순회해서 프롬프트/스키마를 만들기 때문에, 목차가 바뀌면 이 파일도 자동으로 맞춰진다.
 */

function buildFieldDescriptions() {
  const lines = [];
  for (const chapter of REPORT_TOC) {
    lines.push(`[${chapter.title}]`);
    for (const section of chapter.sections) {
      for (const item of section.items) {
        if (item.fromFree) continue; // 이미 있는 값(가스라이팅 확률) 재사용 — 생성 대상 아님
        const hint = item.type === 'percent' ? '0~100 사이 정수' : '한국어 1문장, 짧고 담백하게';
        lines.push(`- ${chapter.key}.${item.key} (${item.label}): ${hint}`);
      }
    }
  }
  return lines.join('\n');
}

function buildExampleSkeleton() {
  const obj = {};
  for (const chapter of REPORT_TOC) {
    obj[chapter.key] = {};
    for (const section of chapter.sections) {
      for (const item of section.items) {
        if (item.fromFree) continue;
        obj[chapter.key][item.key] = item.type === 'percent' ? 50 : '...';
      }
    }
  }
  return obj;
}

const PREMIUM_SYSTEM_PROMPT = `당신은 관계 심리 분석 보조입니다. 아래는 사용자에 대해 이미 만들어진 무료 요약 리포트입니다(원본 상담 대화가 아니라, 그 대화를 근거로 이미 한 번 채점·요약된 결과입니다).
이 요약만을 근거로, 유료 전체 리포트에 들어갈 세부 항목을 작성하세요.

[입력으로 주어지는 무료 리포트 요약]
- axisScores: 상대방의 다크테트라드 4축(${Object.values(AXES).map((a) => a.label).join('·')}) 점수(1~5)
- patterns: 감지된 조종 패턴 유형(가스라이팅/러브바밍/삼각관계/DARVO)과 확신도
- selfPattern: 사용자 자신의 반응 취약성 점수와 코멘트
- summary: 종합 소견 요약문

[작성할 항목]
${buildFieldDescriptions()}

규칙:
1. 반드시 JSON 형태로만 응답하세요. 다른 텍스트나 마크다운은 절대 포함하지 마세요.
2. 각 텍스트 항목은 1문장, 담백하고 구체적으로. 과장하거나 확정적 진단명("나르시시스트다" 등)을 쓰지 마세요.
3. "헤어져라/참아라" 같은 결정을 대신 내리지 말고, 사용자가 스스로 판단할 수 있는 정보를 제공하세요.
4. 퍼센트 항목은 정수로만 응답하세요.
5. 이것은 임상 진단이 아니라 참고용 인사이트임을 전제로 보수적으로 판단하세요. 근거가 약한 항목은 중립적으로 서술하세요.

JSON 형식 예시: ${JSON.stringify(buildExampleSkeleton())}`;

/**
 * @param {{ summary: string, axisScores: object, patterns: any[], selfPattern: object }} opts
 * @returns {Promise<any|null>} 파싱 시도된 raw JSON. 상담 봇 미설정 시 null.
 */
export async function generatePremiumReport({ summary, axisScores, patterns, selfPattern }) {
  const client = getCounselorClient();
  if (!client) return null;

  const inputBlock = [
    `[종합 소견] ${summary || '없음'}`,
    `[상대방 성향 점수] ${JSON.stringify(axisScores || {})}`,
    `[감지된 패턴] ${JSON.stringify(patterns || [])}`,
    `[자기 반응 패턴] ${JSON.stringify(selfPattern || {})}`,
  ].join('\n');

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4000,
    system: PREMIUM_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: inputBlock }],
  });

  const text = message?.content?.find((b) => b.type === 'text')?.text || '';
  return safeJsonParse(text);
}

/**
 * generatePremiumReport()의 응답(파싱 시도된 JSON)을 REPORT_TOC 기준으로 검증·정규화.
 * 누락되거나 형식이 안 맞는 필드는 안전한 기본값으로 채워, 템플릿에서 항상 예측 가능한 구조를 갖게 한다.
 * @param {any} raw
 */
export function normalizePremiumReport(raw) {
  const result = {};
  for (const chapter of REPORT_TOC) {
    result[chapter.key] = {};
    for (const section of chapter.sections) {
      for (const item of section.items) {
        if (item.fromFree) continue;
        const val = raw?.[chapter.key]?.[item.key];
        if (item.type === 'percent') {
          const n = Number(val);
          result[chapter.key][item.key] = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
        } else {
          result[chapter.key][item.key] =
            typeof val === 'string' && val.trim() ? val.trim() : '아직 준비되지 않은 항목이에요.';
        }
      }
    }
  }
  return result;
}
