import { getCounselorClient } from '../../dark-psych-love/logic/counselor.js';
import { safeJsonParse } from '../../dark-psych-love/logic/jsonUtil.js';

/**
 * 대화로 채우는 정보 슬롯.
 *
 * 별도 체크리스트 화면을 두지 않고 AI가 상담하면서 물어본다. 다만 무엇을 물어봤고
 * 무엇이 비었는지는 LLM 기억에 맡기지 않는다 — 매 턴 대화에서 값을 뽑아 서버가 들고 있어야
 * 같은 질문을 두 번 하지 않고, 리포트를 쓸 만큼 모였는지도 판단할 수 있다.
 */

// 추출은 판정이 아니라 받아적기다. 싸고 빠른 모델을 쓴다.
const EXTRACT_MODEL = process.env.LOVE_COUNSEL_EXTRACT_MODEL || 'claude-haiku-4-5-20251001';

/** 단계와 무관하게 항상 필요한 것 */
const COMMON = [
  { key: 'stage', ask: '지금 두 사람이 어떤 사이인지 (썸 / 연애 중 / 헤어진 사이 / 재회를 원하는 사이)', required: true },
  { key: 'question', ask: '지금 가장 알고 싶은 것이 무엇인지', required: true },
];

/**
 * 단계별로 더 받아야 하는 것.
 * 썸 항목은 판정 엔진(rules.js)이 그대로 쓰는 값이라 이름과 값 집합을 바꾸면 안 된다.
 */
const BY_STAGE = {
  some: [
    { key: 'weeksKnown', ask: '알게 된 지 몇 주쯤 됐는지 (숫자)', required: true },
    { key: 'meetCount', ask: '단둘이 만난 횟수 (0 / 1-2 / 3-5 / 6+)', required: true },
    { key: 'theyProposed', ask: '상대가 먼저 "만나자"고 한 적이 있는지 (yes / no / unsure). 답장 여부가 아니라 만남 제안이다', required: true },
    { key: 'initiative', ask: '연락은 주로 누가 먼저 하는지 (me / even / them)', required: true },
    { key: 'replySpeed', ask: '상대 카톡에 얼마나 빨리 답하는지 (instant / within1h / varies)' },
    { key: 'meetTime', ask: '주로 만나는 시간대 (day / evening / night / none)' },
    { key: 'theyOpened', ask: '상대가 자기 얘기(가족·힘든 일·과거)를 먼저 꺼낸 적 있는지 (yes / no)' },
    { key: 'channel', ask: '어떻게 알게 됐는지 (blinddate / school_work / app / club / acquaintance)' },
  ],
  dating: [
    { key: 'monthsDating', ask: '사귄 지 몇 개월 됐는지 (숫자)', required: true },
    { key: 'conflict', ask: '지금 반복되는 갈등이 무엇인지', required: true },
    { key: 'conflictSince', ask: '언제부터 그랬는지' },
    { key: 'talkedAboutIt', ask: '그 문제로 직접 이야기해본 적이 있는지, 그때 상대 반응은 어땠는지' },
  ],
  breakup: [
    { key: 'brokeUpWhen', ask: '헤어진 지 얼마나 됐는지', required: true },
    { key: 'whoEnded', ask: '누가 먼저 헤어지자고 했는지 (me / them / mutual)', required: true },
    { key: 'breakupReason', ask: '상대가 말한 이별 사유', required: true },
    { key: 'contactSince', ask: '헤어진 뒤 연락이 오간 적이 있는지, 누가 먼저였는지' },
    { key: 'blocked', ask: '차단이나 명확한 거절 의사가 있었는지 (yes / no)', required: true },
  ],
  reunion: [
    { key: 'brokeUpWhen', ask: '헤어진 지 얼마나 됐는지', required: true },
    { key: 'whoEnded', ask: '누가 먼저 헤어지자고 했는지 (me / them / mutual)', required: true },
    { key: 'breakupReason', ask: '상대가 말한 이별 사유', required: true },
    { key: 'contactSince', ask: '헤어진 뒤 상대가 먼저 연락한 적이 있는지', required: true },
    { key: 'blocked', ask: '차단이나 명확한 거절 의사가 있었는지 (yes / no)', required: true },
    { key: 'theirSituation', ask: '상대에게 새로운 사람이 생겼는지 아는지' },
  ],
};

export const STAGE_LABEL = {
  some: '썸',
  dating: '연애 중',
  breakup: '이별',
  reunion: '재회',
};

/** 지금 단계에서 채워야 할 슬롯 목록 */
export function slotsFor(stage) {
  return [...COMMON, ...(BY_STAGE[stage] || [])];
}

/** 아직 안 채워진 슬롯. 상담사는 이 중 맨 앞의 것을 다음 턴에 묻는다. */
export function missingSlots(filled) {
  return slotsFor(filled?.stage).filter((s) => {
    const v = filled?.[s.key];
    return v === undefined || v === null || v === '';
  });
}

/**
 * 리포트를 쓸 만큼 모였는가.
 * 필수 슬롯이 다 찼고 대화가 최소 3턴은 오갔을 때만 연다 — 두 마디 만에 나온 리포트는
 * 근거가 없어서 내용이 뭉뚱그려진다.
 */
export function isReadyForReport(filled, userTurns) {
  if (!filled?.stage) return false;
  const missingRequired = missingSlots(filled).filter((s) => s.required);
  return missingRequired.length === 0 && userTurns >= 3;
}

/**
 * 대화 전체에서 슬롯 값을 다시 뽑는다. 매 턴 전체를 다시 읽으므로,
 * 사용자가 나중에 번복해도 최신 값으로 덮인다.
 * @returns {Promise<object>} 이전 값과 합쳐진 슬롯
 */
export async function extractSlots(history, previous = {}) {
  const client = getCounselorClient();
  if (!client) return previous;

  const transcript = (history || [])
    .map((m) => `${m.role === 'user' ? '사용자' : '상담사'}: ${String(m.content || '').slice(0, 1200)}`)
    .join('\n');

  const stage = previous.stage;
  const wanted = slotsFor(stage).map((s) => `- ${s.key}: ${s.ask}`).join('\n');

  const system = `당신은 상담 대화에서 사실만 뽑아 JSON으로 정리하는 보조다.
추측하지 마라. 대화에서 사용자가 실제로 말한 것만 채운다. 알 수 없으면 그 키를 아예 넣지 않는다.
사용자가 "모르겠다", "기억 안 난다"고 답한 항목은 "unsure"로 채운다 — 그래야 같은 질문을 다시 하지 않는다.
괄호 안에 값 목록이 있으면 반드시 그중 하나로 적는다. 숫자를 요구하면 숫자만 적는다.
JSON 외에 다른 텍스트나 마크다운은 절대 출력하지 마라.

뽑을 항목:
${wanted}

stage는 다음 중 하나다: some(썸) / dating(연애 중) / breakup(이별, 정리 쪽) / reunion(재회를 원함)`;

  try {
    const message = await client.messages.create({
      model: EXTRACT_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: `대화:\n${transcript}\n\nJSON만 출력하라.` }],
    });
    const text = message?.content?.find((b) => b.type === 'text')?.text || '';
    const parsed = safeJsonParse(text);
    if (!parsed || typeof parsed !== 'object') return previous;

    const merged = { ...previous };
    for (const [k, v] of Object.entries(parsed)) {
      if (v === null || v === undefined || v === '') continue;
      merged[k] = typeof v === 'string' ? v.slice(0, 500) : v;
    }
    // 썸 판정 엔진은 weeksKnown을 숫자로 기대한다
    if (merged.weeksKnown !== undefined) merged.weeksKnown = Number(merged.weeksKnown) || 0;
    return merged;
  } catch (err) {
    // 추출이 실패해도 상담은 계속돼야 한다 — 다음 턴에 다시 시도한다
    console.error('[love-counsel] 슬롯 추출 실패:', err.message);
    return previous;
  }
}
