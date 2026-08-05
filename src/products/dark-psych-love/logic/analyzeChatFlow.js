import { getCounselorClient, DEFAULT_MODEL } from './counselor.js';
import { CATEGORY_LABELS } from './chatStats.js';
import { safeJsonParse } from './jsonUtil.js';
import { wrapUntrusted } from './untrusted.js';

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

const SYSTEM_PROMPT = `당신은 관계 심리 분석 보조입니다. 아래는 실제 카카오톡 대화에서 통계적으로 의심스러워 보였던 구간들입니다(앞뒤 맥락을 포함해 잘라둔 것).

당신의 역할은 특정 단어가 있는지 기계적으로 보는 게 아니라, 대화의 흐름과 맥락을 보고 실제로 조종적인 발화인지 판단하는 것입니다.

판단 기준:
- "그런 적 없어", "네가 예민한 거야" 같은 말이라도, 상대가 실제로 있었던 일을 부정하거나 상대의 정당한 감정·기억을 깎아내리는 맥락이 아니면 가스라이팅이 아닙니다.
- 화자 스스로 자기 잘못이나 감정을 인정·사과하는 말은 절대 조종 패턴으로 분류하지 마세요.
- 특정 키워드가 없어도, 지적받자 화제를 돌리거나 책임을 전가하는 흐름이면 조종적 발화로 볼 수 있습니다.
- 애매하면 포함하지 마세요. 확실한 것만 지목하세요.

패턴 유형 (해당하는 것만 사용):
- gaslight: 상대의 기억·현실 인식을 부정하거나 과민한 사람으로 몰아가는 발화
- blame: 자신의 잘못을 상대 탓으로 돌리는 발화
- contempt: 상대를 깎아내리거나 무시하는 발화
- threatLeave: 이별·연락 차단을 무기 삼아 압박하는 발화
- control: 상대의 행동을 과도하게 감시·통제하려는 발화

각 구간은 "[구간번호-메시지번호] 화자: 내용" 형식입니다. 실제로 조종적 패턴이 확인되는 메시지만 정확한 구간번호와 메시지번호로 지목하세요.

반드시 이 JSON 형식으로만 응답하고 다른 텍스트는 쓰지 마세요:
{"flags": [{"segmentIndex": 0, "messageIndex": 2, "category": "gaslight"}]}
근거 있는 항목이 없으면 {"flags": []} 로 응답하세요.`;

function buildPrompt(segments) {
  const lines = [];
  segments.forEach((seg, si) => {
    lines.push(`--- 구간 ${si} ---`);
    seg.forEach((m, mi) => {
      lines.push(`[${si}-${mi}] ${m.sender}: ${m.text}`);
    });
  });
  return lines.join('\n');
}

/**
 * 통계로 좁혀진 후보 구간만 LLM에 보내 대화 흐름 기준으로 실제 조종적 발화 위치를 확정한다.
 * (텍스트/키워드 매칭이 아니라 맥락 판단 — 상담 봇 미설정 시 빈 배열 반환)
 * @param {Array<Array<{idx:number, sender:string, text:string}>>} segments buildCandidateSegments 결과
 * @returns {Promise<{idx:number, category:string}[]>}
 */
export async function analyzeChatFlow(segments) {
  const client = getCounselorClient();
  if (!client || !segments || segments.length === 0) return [];

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    // 캡처 이미지를 OCR한 원문이 그대로 들어오는 지점 — 사용자가 이미지 안에 지시문을 심어두면
    // 판정을 조작할 수 있으므로 데이터 구획으로 감싼다.
    messages: [{ role: 'user', content: wrapUntrusted(buildPrompt(segments), '업로드된 카카오톡 대화 후보 구간') }],
  });

  const text = message?.content?.find((b) => b.type === 'text')?.text || '';
  const parsed = safeJsonParse(text);
  const flags = Array.isArray(parsed?.flags) ? parsed.flags : [];

  const result = [];
  for (const f of flags) {
    if (!VALID_CATEGORIES.has(f?.category)) continue;
    const si = Number(f.segmentIndex);
    const mi = Number(f.messageIndex);
    if (!Number.isInteger(si) || !Number.isInteger(mi)) continue;
    const entry = segments[si]?.[mi];
    if (!entry) continue;
    result.push({ idx: entry.idx, category: f.category });
  }
  return result;
}
