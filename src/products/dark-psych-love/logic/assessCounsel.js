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

[3. 핵심 관찰(keyFindings)] 이번 대화에서 실제로 반복된 구체적인 상호작용 구조에 이름을 붙이세요.
- 위 4개 고정 패턴 유형과 달리, 이 대화에만 해당하는 구체적인 구조를 자유롭게 이름 붙일 수 있습니다(예: "체계적인 현실 부인", "일방적 사과 구조", "자기 기억의 신뢰도 약화" 등 — 예시일 뿐 그대로 쓰지 말고 실제 대화 내용에 맞게 지으세요).
- 2~4개만, 실제로 대화에서 반복 확인된 것만 포함하세요. 근거가 약하면 억지로 채우지 마세요.
- 각 항목은 title(4~10자 내외 짧은 이름)과 description(1문장, 왜 그렇게 판단했는지 담백하게) 형태.

규칙:
1. 반드시 아래 JSON 형태로만 응답하세요. 다른 텍스트나 마크다운은 절대 포함하지 마세요.
2. 근거가 부족한 축/점수는 3점(중립)으로 두고, 과장하지 마세요.
3. summary는 2~4문장, 진지하고 보수적인 어조로 작성하세요. "헤어져라/참아라" 같은 지시는 하지 마세요.
4. 원문 문장을 그대로 인용하지 마세요.
5. 이것은 임상 진단이 아니라 참고용 인사이트임을 전제로 보수적으로 판단하세요.

JSON 형식: {"axisScores": {"narcissism": 1, "machiavellianism": 1, "psychopathy": 1, "sadism": 1}, "selfPatternScore": 1, "selfPatternNote": "...", "patterns": [{"type": "gaslighting", "count": 0, "confidence": 0}], "keyFindings": [{"title": "...", "description": "..."}], "summary": "..."}`;

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
    ? `\n\n[참고: 업로드된 대화 캡처에서 AI가 대화 흐름을 보고 이미 조종적 발화로 확정한 구간입니다. 통계적 추측이 아니라 확정된 근거이니, 아래 패턴 태깅에 적극 반영하세요.]\n${chatContext}`
    : '';

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1500,
    system: ASSESS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `=== 상담 대화 ===\n${transcript}${contextBlock}` }],
  });

  const text = message?.content?.find((b) => b.type === 'text')?.text || '';
  return normalizeAssessment(safeJsonParse(text));
}
