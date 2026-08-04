import { getCounselorClient, DEFAULT_MODEL } from './counselor.js';
import { AXES, PATTERN_TYPES } from './axes.js';
import { normalizeAssessment } from './reportBuilder.js';
import { safeJsonParse } from './jsonUtil.js';

const ASSESS_SYSTEM_PROMPT = `당신은 관계 심리 분석 보조입니다. 아래는 사용자가 AI 상담사와 나눈 상담 대화 전체입니다(사용자가 자신의 연애 상대에 대해 이야기한 내용).
이 대화만을 근거로 아래 두 가지를 평가하세요.

[1. 상대방 성향 — 다음 4개 축에서 1~5점(1=전혀 아니다, 5=매우 그렇다)]
${Object.values(AXES)
  .map((a) => `- ${a.key} (${a.label}): ${a.short}`)
  .join('\n')}

[2. 나의 반응 패턴 — 상대방이 아니라 '사용자 자신'이 이 관계에서 보이는 반응을 1~5점으로 평가]
- selfPatternScore: 자기 탓을 하는 경향, 스스로 경계를 설정하지 못하는 경향, 관계에 과도하게 의존하는 경향이 클수록 높은 점수. 근거가 부족하면 3점(중립).
- selfPatternNote: 위 판단의 근거를 1~2문장으로, 사용자를 탓하는 어조 없이 담담하게 서술.

[패턴] 대화·참고 자료에서 관찰된 것이 있다면 함께 태깅
${Object.entries(PATTERN_TYPES)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

규칙:
1. 반드시 아래 JSON 형태로만 응답하세요. 다른 텍스트나 마크다운은 절대 포함하지 마세요.
2. 근거가 부족한 축/점수는 3점(중립)으로 두고, 과장하지 마세요.
3. summary는 2~4문장, 진지하고 보수적인 어조로 작성하세요. "헤어져라/참아라" 같은 지시는 하지 마세요.
4. 원문 문장을 그대로 인용하지 마세요.
5. 이것은 임상 진단이 아니라 참고용 인사이트임을 전제로 보수적으로 판단하세요.

JSON 형식: {"axisScores": {"narcissism": 1, "machiavellianism": 1, "psychopathy": 1, "sadism": 1}, "selfPatternScore": 1, "selfPatternNote": "...", "patterns": [{"type": "gaslighting", "count": 0, "confidence": 0}], "summary": "..."}`;

/**
 * 상담 대화 전체(+ 선택적 카톡 참고 구간)를 근거로 최종 진단을 생성.
 * @param {{ history: {role:string, content:string}[], chatContext?: string|null }} opts
 * @returns {Promise<ReturnType<typeof normalizeAssessment>|null>} 상담 봇 미설정 시 null
 */
export async function assessCounsel({ history, chatContext } = {}) {
  const client = getCounselorClient();
  if (!client) return null;

  const transcript = (history || [])
    .slice(-40)
    .map((m) => `${m.role === 'assistant' ? '상담사' : '사용자'}: ${String(m.content || '').slice(0, 2000)}`)
    .join('\n');

  const contextBlock = chatContext
    ? `\n\n[참고: 업로드된 카카오톡 대화에서 통계적으로 의심스러운 것으로 추려진 구간(참고용, 확정 아님)]\n${chatContext}`
    : '';

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 800,
    system: ASSESS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `=== 상담 대화 ===\n${transcript}${contextBlock}` }],
  });

  const text = message?.content?.find((b) => b.type === 'text')?.text || '';
  return normalizeAssessment(safeJsonParse(text));
}
