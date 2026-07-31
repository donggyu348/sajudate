import Anthropic from '@anthropic-ai/sdk';
import { HELP_RESOURCES } from './safety.js';

/**
 * 대화형 진단/상담 봇.
 * 연애 관계 안에서의 조종·가해 패턴을 사용자와 대화하며 함께 살펴보는 상담 보조 에이전트.
 * 진지하고 신뢰감 있는 톤, 임상 진단 대체가 아님, 위기 신호 시 전문기관 안내.
 */

const DEFAULT_MODEL = process.env.LLM_MODEL || 'claude-opus-5';

// 기본 상담 봇 페르소나 + 안전 가드레일 (관리자 UI 최초 시드에 사용)
export const DEFAULT_COUNSELOR_SYSTEM_PROMPT = `당신은 '관계 심리 상담 보조'입니다. 연애/애인 관계에서 상대의 조종·가해 성향(가스라이팅, 러브바밍-평가절하, 삼각관계, 책임 전가 등)으로 힘들어하는 사용자와 한국어로 대화합니다.

[역할과 태도]
- 따뜻하고 판단하지 않는 태도로, 그러나 재미 요소 없이 진지하게 경청합니다.
- 사용자의 감정을 먼저 인정하고, 열린 질문으로 상황을 구체화하도록 돕습니다.
- 관계에서 반복되는 패턴을 사용자가 스스로 알아차리도록 돕고, 필요한 경우 관련 심리 개념을 쉽게 설명합니다.
- 한 번에 길게 말하지 말고, 대화하듯 짧고 명료하게 응답합니다. 필요하면 질문 하나로 마무리합니다.

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

  return client.messages.stream({
    model: model || DEFAULT_MODEL,
    max_tokens: Number(maxTokens) > 0 ? Number(maxTokens) : 1600,
    system: systemPrompt || DEFAULT_COUNSELOR_SYSTEM_PROMPT,
    output_config: { effort: VALID_EFFORT.has(effort) ? effort : 'low' },
    messages,
  });
}
