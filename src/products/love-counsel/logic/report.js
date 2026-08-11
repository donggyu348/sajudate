import { getCounselorClient } from '../../dark-psych-love/logic/counselor.js';
import { safeJsonParse } from '../../dark-psych-love/logic/jsonUtil.js';
import { wrapUntrusted } from '../../dark-psych-love/logic/untrusted.js';
import { STAGE_LABEL } from './slots.js';

const MODEL = process.env.LOVE_COUNSEL_MODEL || 'claude-sonnet-5';

/**
 * 상담 대화를 바탕으로 리포트를 만든다.
 *
 * 판정은 여기서도 코드가 확정한 규칙을 그대로 쓴다 — LLM은 그 판정을 풀어 쓰기만 한다.
 * 섹션 구성은 고정이다. 구성까지 LLM에 맡기면 세션마다 리포트가 달라져 상품이 되지 않는다.
 */
export const SECTIONS = [
  { key: 'situation', title: '지금 상황 판정', free: true },
  { key: 'reading', title: '상대 행동 해석' },
  { key: 'plan', title: '앞으로 7일 행동 계획' },
  { key: 'script', title: '다음 연락에서 할 말' },
  { key: 'prediction', title: '검증 가능한 예측' },
];

const SYSTEM = `당신은 '해답'의 연애 상담 전문가다. 상담을 마친 뒤 리포트를 쓴다.

# 원칙
- 판정은 이미 확정됐다. 당신은 그것을 바꾸지 않는다.
- 관심은 확실하게, 접근성은 희소하게. "관심 없는 척하라", 잠수, 읽씹은 절대 권하지 않는다.
- 말이 아니라 행동으로 판정한다. 답장 속도·길이·이모티콘은 근거로 쓰지 않는다.
- 처방의 기본값은 카톡이 아니라 만남이다.
- 조건(외모·돈·키)은 원인이 아니다. 자책이 나오면 위로하지 말고 근거로 반박한다.

# 문체
존댓말, 담백하고 단호하게. 이모지 금지. "~하시는 게 좋을 것 같아요" 금지, "~하세요"로 단정한다.
"100% 성공", "무조건 이어집니다" 류 보장 표현 금지. 선택지 나열 금지 — 하나로 판정한다.

# 출력 형식
아래 JSON만 출력한다. 다른 텍스트나 마크다운은 절대 포함하지 않는다.
{
  "situation": "확정된 진단을 사용자 상황의 구체 사실로 풀어 쓴다. 4~6문장.",
  "reading": "상대의 행동이 무엇을 뜻하는지. 체크리스트 응답을 직접 인용한다. 4~6문장.",
  "plan": "7일 동안 할 일. 날짜별로 구체적으로. 행동은 하나의 축으로만 준다. 5~8문장.",
  "script": "다음 연락에서 실제로 보낼 문장 2~3개. 각 문장은 따옴표로 감싸고 언제 쓰는지 덧붙인다.",
  "prediction": "무엇이 언제 일어나면 관계가 살아 있고, 무엇이 없으면 아닌지. 3~4문장."
}`;

/**
 * @param {object} params
 * @param {object} params.filled          대화로 파악된 정보
 * @param {object|null} params.rule       확정된 판정 카드 (썸 구간에서만 있다)
 * @param {{role:string,content:string}[]} params.history
 * @returns {Promise<object|null>} 섹션 키를 가진 객체. 실패하면 null
 */
export async function generateReport({ filled, rule, history }) {
  const client = getCounselorClient();
  if (!client) return null;

  // 상담 대화는 사용자 자유 입력이 섞여 있다 — 프롬프트 지시로 읽히지 않게 감싼다.
  const transcript = (history || [])
    .map((m) => `${m.role === 'user' ? '사용자' : '상담사'}: ${String(m.content || '').slice(0, 1500)}`)
    .join('\n');

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${rule ? `# 확정된 판정 (바꾸지 않는다)
규칙: ${rule.id} — ${rule.name}
진단: ${rule.diagnosis}
흔한 오해: ${rule.misdiagnosis}
처방: ${rule.prescription}
예측: ${rule.prediction || '(없음. 지어내지 마라.)'}
이 규칙에서 금지: ${rule.forbid.join(', ')}`
  // 썸 외 단계는 아직 규칙집이 없다. 없는 근거를 지어내지 않도록 명시한다.
  : `# 확정된 판정 없음
이 단계(${STAGE_LABEL[filled?.stage] || '연애 상담'})는 판정 규칙집이 아직 없다.
위 원칙과 사용자가 말한 행동 사실만으로 쓴다. 연구나 통계를 지어내지 마라.`}

# 대화로 파악된 정보
${Object.entries(filled || {}).filter(([k]) => k !== 'question').map(([k, v]) => `- ${k}: ${v}`).join('\n')}

# 사용자가 가장 알고 싶은 것
${wrapUntrusted(filled?.question || '', '사용자 질문')}

# 상담 대화
${wrapUntrusted(transcript, '상담 대화 기록')}

위 판정을 바탕으로 리포트 JSON을 작성하라.`,
      },
    ],
  });

  const text = message?.content?.find((b) => b.type === 'text')?.text || '';
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== 'object') return null;

  // 섹션이 하나라도 비면 리포트로 쓰지 않는다 — 빈 칸이 있는 유료 리포트는 환불 사유가 된다.
  const report = {};
  for (const s of SECTIONS) {
    const v = String(parsed[s.key] || '').trim();
    if (!v) return null;
    report[s.key] = v;
  }
  return report;
}
