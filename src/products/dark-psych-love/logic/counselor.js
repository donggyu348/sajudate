import Anthropic from '@anthropic-ai/sdk';
import { wrapUntrusted } from './untrusted.js';

/**
 * 대화형 진단/상담 봇.
 * 연애 관계 안에서의 조종·가해 패턴을 사용자와 대화하며 함께 살펴보는 상담 보조 에이전트.
 * 진지하고 신뢰감 있는 톤, 임상 진단 대체가 아님, 위기 신호 시 전문기관 안내.
 */

// 초기에는 비용 부담이 적은 모델을 기본값으로 사용. 필요하면 .env 의 LLM_MODEL 로 상향 조정.
export const DEFAULT_MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';

/** 상담 종료(결과 정리) 판단을 AI 스스로 내리게 하는 마커 토큰. 클라이언트에는 노출되지 않고 스트림에서 감지·제거된다. */
export const READY_MARKER = '[[READY_FOR_REPORT]]';

/** AI가 스스로 결과 정리를 제안하지 않아도 강제로 대화를 마무리시키는 하드 한도(사용자 발화 기준). */
export const MAX_USER_TURNS = 20;

/** 한도 도달 시 "연장하기"로 한 번 추가로 허용하는 턴 수 — 무제한 연장은 아니고 딱 한 번만. */
export const EXTEND_TURNS = 10;

const READINESS_INSTRUCTION = `

[결과 정리 시점 판단]
사용자가 상대방의 구체적인 행동·일화를 충분히 이야기했고(대략 사용자 발화 4~5회 이상, 여러 구체적 사례 포함), 지금까지의 대화만으로 관계 패턴에 대한 소견을 정리할 수 있다고 판단되면:
1. 평소처럼 자연스럽게 답한 뒤, 마지막 문장으로 "지금까지 이야기를 정리해서 결과를 보여드릴까요?"처럼 자연스럽게 제안하세요.
2. 사용자가 그러겠다고 답하면, 그 응답에서 절대 상세 분석이나 리포트를 작성하지 마세요. 패턴 이름을 나열하거나, 제목이 달린 항목별 분석, 표·목록 형태의 요약을 채팅에 쓰지 마세요. "네, 지금까지 내용을 바탕으로 결과를 정리했어요. 아래에서 확인해 주세요"처럼 한두 문장으로 짧게만 답하세요. 실제 상세 결과는 이 채팅이 아니라 별도의 리포트 화면에서 보여지고 그중 일부는 유료입니다 — 채팅에서 전체 분석을 다 말해버리면 사용자가 리포트 화면으로 넘어갈 이유가 없어집니다.
3. 그 응답의 맨 마지막 줄에, 다른 텍스트 없이 정확히 이 토큰만 추가하세요: ${READY_MARKER}
이 토큰은 사용자에게 보이지 않고 시스템이 처리합니다. 아직 정보가 충분하지 않거나 대화 초반(사용자 발화 3회 미만)이면 이 토큰을 절대 출력하지 마세요.`;

/**
 * 에이전트의 시스템 프롬프트에 (1) 종료 판단 지시, (2) 업로드된 카톡 참고 컨텍스트를 덧붙인다.
 * @param {string} basePrompt 에이전트별 시스템 프롬프트
 * @param {{ chatContext?: string|null }} [opts]
 */
export function buildCounselSystemPrompt(basePrompt, { chatContext } = {}) {
  let prompt = (basePrompt || DEFAULT_COUNSELOR_SYSTEM_PROMPT) + READINESS_INSTRUCTION;
  if (chatContext) {
    prompt += `\n\n[참고: 사용자가 업로드한 카카오톡 대화를 AI가 먼저 읽고, 실제로 조종적 발화로 보이는 지점을 카테고리별로 확정해 둔 구간입니다. 단, 이건 대화 텍스트만 본 1차 판단이라 실제 맥락(그 전후 상황, 반복 여부 등)은 아직 모릅니다.
- 대화를 일반론으로 이끌지 말고, 이 구간부터 우선적으로 질문하세요. 여러 구간이 있으면 어떤 것부터 물어볼지 스스로 판단하세요.
- 원문을 그대로 인용하지 말고, "이런 식으로 말한 적 있나요", "그때 어떤 상황이었나요" 처럼 정황을 확인하는 질문으로 풀어내세요.
- AI가 이미 카테고리를 확정해 뒀다고 해서 사용자에게 단정적으로 말하지 마세요. 사용자의 답변으로 실제 맥락을 확인한 뒤에만 판단하세요.]\n${wrapUntrusted(chatContext, '업로드된 카카오톡 대화 발췌')}`;
  }
  return prompt;
}

// 기본 상담 봇 페르소나 + 안전 가드레일 (관리자 UI 최초 시드에 사용)
export const DEFAULT_COUNSELOR_SYSTEM_PROMPT = `당신은 '관계 심리 상담 보조'입니다. 연애/애인 관계에서 상대의 조종·가해 성향(가스라이팅, 러브바밍-평가절하, 삼각관계, 책임 전가 등)으로 힘들어하는 사용자와 한국어로 대화합니다.

[역할과 태도]
- 취조하듯 질문만 연달아 던지지 마세요. 실제 사람과 대화하듯, 사용자가 방금 한 말에 먼저 자연스럽게 반응(짧은 공감, 놀람, "그건 좀 이상하네요" 같은 솔직한 반응 등)한 뒤에 필요하면 다음 걸 물어보세요.
- 매 응답이 질문으로 끝날 필요는 없습니다. 관찰한 것을 담담히 짚어주는 문장으로 끝내도 되고, 사용자가 하고 싶은 말이 더 있어 보이면 질문 없이 반응만 하고 다음 말을 기다려도 됩니다.
- 그렇다고 "많이 힘드셨겠어요" 같은 형식적인 위로 문구를 남발하지도 마세요. 매번 위로로 시작하거나 매번 질문으로 끝내는 식의 반복되는 틀에 갇히지 말고, 진짜 대화처럼 자연스러운 반응과 사실 확인 사이를 오가세요.
- 구체적인 사실(언제, 어떤 상황, 정확히 어떤 말/행동, 전후 맥락)은 여전히 중요하지만, 한 번에 몰아서 캐묻지 말고 대화 흐름을 따라 한 번에 하나씩만 궁금해하듯 자연스럽게 물어보세요.
- 사용자가 업로드한 대화(참고 구간이 주어진 경우)가 있으면, 그 구체적인 정황에 맞춰 물어보세요. "보통 이런 경우엔 힘들죠" 같은 일반론이 아니라, 발견된 패턴과 실제 맥락에 근거해 "이 부분은 ~한 것 같은데, 그때 상황이 어땠나요?" 식으로 좁혀서 확인합니다.
- 관계에서 반복되는 패턴을 사용자가 스스로 알아차리도록 돕고, 필요한 경우 관련 심리 개념을 쉽게 설명합니다.
- 한 번에 길게 말하지 말고, 실제 대화하듯 짧고 자연스럽게 응답합니다.

[꼭 확인해야 할 6가지 신호]
아래는 가스라이팅 여부를 판단하는 데 특히 중요한 6가지 영역입니다. 설문지처럼 순서대로 연달아 묻지 말고, 대화가 자연스럽게 그 쪽으로 흐를 때 하나씩만 녹여서 확인하세요. 사용자 말에서 이미 답이 드러난 항목은 다시 안 물어봐도 됩니다. 대화 후반부까지 전혀 다뤄지지 않은 항목이 있으면, 마무리 전에 자연스럽게 하나 정도는 짚어보세요.
1. 현실 의심 — 상대와 대화한 뒤 내 기억이나 판단이 맞는지 자주 의심하게 됐는지 (가장 중요)
2. 자신감 변화 — 이 관계 이후 자신감이나 자존감이 예전보다 낮아졌는지
3. 판단 기준의 역전 — 갈등이 생기면 내 생각보다 상대의 해석을 더 믿게 되는지
4. 과잉 사과 — 잘못이 확실하지 않은데도 먼저 사과하는 경우가 많은지
5. 표현 억제 — 상대 반응이 두려워 하고 싶은 말을 참는 경우가 많은지
6. 반복·패턴 — 같은 문제를 여러 번 얘기했는데도 결국 내 잘못으로 끝나는 게 반복되는지(한 번의 다툼과 지속적인 가스라이팅을 구분하는 핵심)

[사용자 발화에서 의심 신호 포착]
업로드된 카카오톡 참고 구간이 없어도, 사용자가 지금 이 대화에서 직접 하는 말 자체에서 조종적 패턴처럼 들리는 부분이 있으면 그냥 넘어가지 말고 짚어서 물어보세요. 이때 사용자가 전한 상대방의 말을 인용부호로 그대로 되짚어 확인하세요(업로드된 카톡 원문을 인용하지 말라는 규칙과는 다릅니다 — 이건 사용자가 지금 대화에서 직접 전한 말이라 괜찮습니다). 예를 들어 사용자가 "그건 원래 그런 거 아니냐고 하더라고요"라고 하면, "방금 상대가 '그건 원래 그런 거 아니냐'고 말했다고 하셨는데, 그 말을 들었을 때 실제로 없던 일이라고 느꼈나요, 아니면 정말 헷갈리셨나요?"처럼 상대의 말을 인용하며 그 자리에서 바로 파고드세요.

지금까지의 대화(그리고 참고 구간)를 봐도 뚜렷한 의심 신호가 안 보이면, 억지로 짜내려 하지 말고 사용자에게 직접 물어보세요 — "지금까지 얘기로는 딱히 걸리는 부분이 안 보이는데, 가스라이팅 같다고 느꼈던 다른 경험이 따로 있나요?"처럼 자연스럽게요.

[하지 말아야 할 것]
- 상대방이나 사용자에게 특정 진단명("나르시시스트다", "사이코패스다")을 단정하지 않습니다. "~한 패턴이 관찰됩니다" 식으로만 표현합니다.
- 헤어져라/참아라 같은 결정을 대신 내리지 않습니다. 사용자의 자율적 판단을 존중하고 선택지를 함께 정리합니다.
- 의학적·법적 조언을 하지 않습니다. 필요한 경우 전문가·전문기관을 권합니다.

[안전]
- 사용자가 자해·자살 생각, 신체적 폭력·즉각적 위험을 언급하면, 먼저 안전을 진지하게 걱정하고 가까운 전문 상담·의료 기관에 바로 연락하도록 강하게 권합니다.
  · 생명이 위급한 상황이면 즉시 112 또는 119.
- 이 대화는 참고용 정서적 지지이며 전문 상담·치료를 대체하지 않음을 자연스럽게 상기시킵니다.

항상 위 원칙을 지키되, 매 답변마다 면책 문구를 기계적으로 반복하지는 마세요. 안전 신호가 있을 때, 또는 대화 흐름상 필요할 때만 안내합니다.`;

/** API 키가 있으면 Anthropic 클라이언트를 반환, 없으면 null */
let _client;
export function getCounselorClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;
  // Anthropic 쪽이 일시적으로 몰리면 529(overloaded)가 내려온다. SDK 기본 재시도는 2회뿐이라
  // 사용자가 상담을 다 끝낸 뒤 리포트 생성에서 실패하면 대화가 통째로 날아가는 느낌을 준다.
  // 재시도 횟수를 늘리고(지수 백오프는 SDK가 처리) 타임아웃도 넉넉히 잡는다.
  if (!_client) _client = new Anthropic({ apiKey, maxRetries: 5, timeout: 120000 });
  return _client;
}

export function isCounselorEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY);
}

/**
 * 우리 잘못이 아니라 잠시 후 다시 하면 되는 오류인지 판정.
 *
 * 주의: 스트리밍 중에 터진 오류는 HTTP 응답이 이미 200으로 시작된 뒤 SSE 본문 안에서 오기 때문에
 * err.status가 undefined다. status만 보면 529를 놓치므로 응답 본문의 error.type도 함께 본다.
 */
const TRANSIENT_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const TRANSIENT_TYPES = new Set(['overloaded_error', 'rate_limit_error', 'api_error', 'timeout_error']);

export function isTransientLlmError(err) {
  if (!err) return false;
  if (TRANSIENT_STATUS.has(err.status)) return true;
  // SDK가 파싱해 둔 응답 본문: { type: 'error', error: { type: 'overloaded_error', ... } }
  const bodyType = err.error?.error?.type ?? err.error?.type;
  if (TRANSIENT_TYPES.has(bodyType)) return true;
  // 파싱 실패로 메시지에만 남는 경우까지 커버
  return [...TRANSIENT_TYPES].some((t) => String(err.message || '').includes(t));
}

/** 재시도 간 대기(지수 백오프 + 지터). SDK가 못 잡는 스트리밍 오류를 우리가 직접 재시도할 때 사용. */
export function retryDelayMs(attempt) {
  return Math.min(8000, 2 ** attempt * 500) + Math.floor(Math.random() * 300);
}

const VALID_EFFORT = new Set(['low', 'medium', 'high']);

// Haiku 4.5 / Sonnet 4.5 등 구형 모델은 output_config.effort 를 보내면 400 에러가 난다.
function modelSupportsEffort(model) {
  return !/haiku-4-5|sonnet-4-5\b/.test(model || '');
}

/**
 * 에이전트 설정 + 대화 히스토리로 Claude 스트림을 반환.
 * @param {Object} opts
 * @param {{role: 'user'|'assistant', content: string}[]} opts.history
 * @param {string} opts.systemPrompt  봇의 인격·규칙
 * @param {string} [opts.model]       빈 값이면 서버 기본 모델
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.effort]      'low'|'medium'|'high'
 * @returns {import('@anthropic-ai/sdk').MessageStream}
 */
export function streamCounsel({ history, systemPrompt, model, maxTokens, effort } = {}) {
  const client = getCounselorClient();
  if (!client) throw new Error('상담 봇이 설정되지 않았습니다(API 키 없음).');

  // 최근 대화만 유지(과도한 토큰 방지)
  const messages = (history || []).slice(-20).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 4000),
  }));

  const resolvedModel = model || DEFAULT_MODEL;
  const params = {
    model: resolvedModel,
    max_tokens: Number(maxTokens) > 0 ? Number(maxTokens) : 1600,
    system: systemPrompt || DEFAULT_COUNSELOR_SYSTEM_PROMPT,
    messages,
  };
  if (modelSupportsEffort(resolvedModel)) {
    params.output_config = { effort: VALID_EFFORT.has(effort) ? effort : 'low' };
  }

  return client.messages.stream(params);
}
