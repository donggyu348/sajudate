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

/** 모듈과 무관하게 항상 필요한 것 */
const COMMON = [
  { key: 'stage', ask: '지금 어떤 상황인지 — 아직 사귀지 않는 썸(some) / 사귀는 중(dating) / 헤어졌고 다시 만나고 싶음(reunion)', required: true },
  { key: 'question', ask: '지금 가장 알고 싶은 것이 무엇인지', required: true },
];

/**
 * 모듈별로 더 받아야 하는 것. 지시서의 체크리스트 문항을 그대로 옮긴 것이며,
 * 판정 엔진이 이 값을 그대로 쓰므로 키 이름과 값 집합을 바꾸면 안 된다.
 * 외모·스펙·이상형은 어느 모듈에서도 묻지 않는다 — 특정 상대를 향한 끌림을 예측하지 못한다.
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
    { key: 'duration', ask: '사귄 지 얼마나 됐는지 (3m / 6m / 1y / 2y / 3y+)', required: true },
    { key: 'mainIssue', ask: '지금 가장 힘든 것 (fight 자주 싸움 / distance 마음이 멀어짐 / changed 상대가 변함 / trust 신뢰 흔들림 / future 미래가 안 보임 / exhausted 내가 지침)', required: true },
    { key: 'conflictPattern', ask: '싸울 때 어떻게 되는지 (i_push_they_avoid 내가 따지고 상대가 피함 / they_push_i_avoid 반대 / both_explode 둘 다 폭발 / no_fight 아예 안 싸움)', required: true },
    { key: 'repeating', ask: '같은 문제로 반복해서 싸우는지 (yes / no)', required: true },
    { key: 'meetFreqChange', ask: '최근 3개월 만나는 빈도 변화 (up / same / down)' },
    { key: 'affectionBalance', ask: '애정 표현은 누가 더 많이 하는지 (me / even / them)' },
    { key: 'thoughtOfBreakup', ask: '헤어질 생각을 해본 적 있는지 (no / sometimes / often / now)' },
    { key: 'cantLeaveReason', ask: '헤어지지 못하는 이유 (still_love 아직 좋아함 / attachment 정 / sunk_time 시간이 아까움 / fear_alone 혼자가 두려움 / na 해당 없음)' },
    { key: 'partnerAware', ask: '상대도 이 문제를 인식하는지 (yes / no / told_no_change 말했는데 안 바뀜)' },
  ],
  reunion: [
    { key: 'sinceBreakup', ask: '헤어진 지 얼마나 됐는지 (1w / 2-4w / 1-3m / 3-6m / 6m+)', required: true },
    { key: 'whoEnded', ask: '헤어지자고 한 사람 (them / me / mutual / faded)', required: true },
    { key: 'reason', ask: '헤어진 가장 큰 이유 (fights 반복된 다툼 / cooled 마음이 식음 / trust 신뢰 문제 / circumstance 상황 / i_burned_out 내가 지침 / unknown 모르겠다)', required: true },
    { key: 'theirState', ask: '상대의 현재 상태 (replies 답장은 옴 / read_no_reply 읽고 답 없음 / blocked 차단됨 / unknown 모름)', required: true },
    { key: 'cycles', ask: '전에도 헤어졌다 다시 만난 횟수 (0 / 1 / 2 / 3+)', required: true },
    { key: 'contactSince', ask: '헤어진 뒤 연락한 횟수 (none / 1-2 / several / daily)', required: true },
    { key: 'theyReachedOut', ask: '헤어진 뒤 상대가 먼저 연락한 적 있는지 (yes / no)', required: true },
    { key: 'relDuration', ask: '사귄 기간 (3m / 6m / 1y / 2y / 3y+)' },
    { key: 'theyDating', ask: '상대에게 새로 만나는 사람이 있는지 (yes / no / unknown)' },
  ],
};

export const STAGE_LABEL = {
  some: '썸',
  dating: '연애 중',
  reunion: '재회',
};

/** 지금 모듈에서 채워야 할 슬롯 목록 */
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

stage는 다음 중 하나다: some(아직 사귀지 않는 썸) / dating(사귀는 중) / reunion(헤어졌고 다시 만나고 싶음)
헤어진 이야기를 하면 reunion으로 잡되, 재회 의사가 없고 정리하려는 것이면 reunion으로 두고 대화에서 다룬다.`;

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
