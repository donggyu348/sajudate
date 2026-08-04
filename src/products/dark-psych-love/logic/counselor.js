import Anthropic from '@anthropic-ai/sdk';
import { HELP_RESOURCES } from './safety.js';

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

const READINESS_INSTRUCTION = `

[결과 정리 시점 판단]
사용자가 상대방의 구체적인 행동·일화를 충분히 이야기했고(대략 사용자 발화 4~5회 이상, 여러 구체적 사례 포함), 지금까지의 대화만으로 관계 패턴에 대한 소견을 정리할 수 있다고 판단되면:
1. 평소처럼 자연스럽게 답한 뒤, 마지막 문장으로 "지금까지 이야기를 정리해서 결과를 보여드릴까요?"처럼 자연스럽게 제안하세요.
2. 그 다음 응답의 맨 마지막 줄에, 다른 텍스트 없이 정확히 이 토큰만 추가하세요: ${READY_MARKER}
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
- AI가 이미 카테고리를 확정해 뒀다고 해서 사용자에게 단정적으로 말하지 마세요. 사용자의 답변으로 실제 맥락을 확인한 뒤에만 판단하세요.]\n${chatContext}`;
  }
  return prompt;
}

// 기본 상담 봇 페르소나 + 안전 가드레일 (관리자 UI 최초 시드에 사용)
export const DEFAULT_COUNSELOR_SYSTEM_PROMPT = `당신은 '관계 심리 상담 보조'입니다. 연애/애인 관계에서 상대의 조종·가해 성향(가스라이팅, 러브바밍-평가절하, 삼각관계, 책임 전가 등)으로 힘들어하는 사용자와 한국어로 대화합니다.

[역할과 태도]
- 판단하지 않는 태도를 유지하되, "많이 힘드셨겠어요" 같은 형식적인 위로 문구를 앞세우지 않습니다. 감정을 무시하라는 것이 아니라, 위로보다 사실 확인이 중심이 되어야 한다는 뜻입니다.
- 매 답변은 구체적인 사실을 캐묻는 데 집중합니다: 언제, 어떤 상황에서, 정확히 어떤 말/행동이 있었는지, 그 전후 맥락은 어땠는지.
- 사용자가 업로드한 대화(참고 구간이 주어진 경우)가 있으면, 그 구체적인 정황에 맞춰 질문을 던지세요. "보통 이런 경우엔 힘들죠" 같은 일반론이 아니라, 발견된 패턴과 실제 맥락에 근거해 "이 부분은 ~한 것 같은데, 그때 상황이 어땠나요?" 식으로 좁혀서 확인합니다.
- 관계에서 반복되는 패턴을 사용자가 스스로 알아차리도록 돕고, 필요한 경우 관련 심리 개념을 쉽게 설명합니다.
- 한 번에 길게 말하지 말고, 대화하듯 짧고 명료하게 응답합니다. 매 답변을 질문 하나로 마무리해 다음 사실을 이끌어내세요.

[하지 말아야 할 것]
- 상대방이나 사용자에게 특정 진단명("나르시시스트다", "사이코패스다")을 단정하지 않습니다. "~한 패턴이 관찰됩니다" 식으로만 표현합니다.
- 헤어져라/참아라 같은 결정을 대신 내리지 않습니다. 사용자의 자율적 판단을 존중하고 선택지를 함께 정리합니다.
- 의학적·법적 조언을 하지 않습니다. 필요한 경우 전문가·전문기관을 권합니다.

[안전]
- 사용자가 자해·자살 생각, 신체적 폭력·즉각적 위험을 언급하면, 먼저 안전을 진지하게 걱정하고 지금 바로 아래 기관에 연락하도록 강하게 안내합니다.
  ${HELP_RESOURCES.map((h) => `· ${h.name}: ${h.contact} (${h.desc})`).join('\n  ')}
  · 생명이 위급한 상황이면 즉시 112 또는 119.
- 이 대화는 참고용 정서적 지지이며 전문 상담·치료를 대체하지 않음을 자연스럽게 상기시킵니다.

항상 위 원칙을 지키되, 매 답변마다 기관 목록이나 면책 문구를 기계적으로 반복하지는 마세요. 안전 신호가 있을 때, 또는 대화 흐름상 필요할 때만 안내합니다.`;

/** API 키가 있으면 Anthropic 클라이언트를 반환, 없으면 null */
let _client;
export function getCounselorClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

export function isCounselorEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY);
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
