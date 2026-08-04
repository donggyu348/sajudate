/**
 * 1차 규칙 기반 통계 분석.
 * 입력: parseKakaoScreenshots 로 얻은 messages (원문 포함, 메모리에서만 사용)
 * 출력: 저장 가능한 통계 지표 + LLM 태깅 후보 구간(인덱스)
 *
 * 규칙 기반 단계에서 "가능성 있는 구간"만 좁혀서, 2차 LLM 태깅 비용/노출을 최소화한다.
 */

/** @typedef {{ at: Date|null, sender: string, text: string }} KakaoMessage */

// 관계 조종 신호와 느슨하게 연관된 키워드 (통계 카운트용, 판정 아님)
const KEYWORDS = {
  blame: ['너 때문', '네 탓', '너가 잘못', '니가', '원래 네가', '네가 그랬'],
  gaslight: ['그런 적 없', '기억 안', '예민', '오해', '왜곡', '착각', '피해망상', '별거 아닌'],
  contempt: ['한심', '멍청', '쓸모없', '어차피', '실망', '수준', '무시'],
  threatLeave: ['헤어져', '끝내', '떠날', '연락하지마', '차단'],
  apology: ['미안', '잘못했', '사과', '죄송'],
  control: ['어디야', '누구랑', '왜 안 읽', '왜 답 안', '보고해', '허락'],
};

/** 후보 구간 카테고리 → 사용자에게 보여줄 한국어 라벨 (apology는 후보 신호로 쓰지 않으므로 제외) */
export const CATEGORY_LABELS = {
  blame: '책임 전가',
  gaslight: '가스라이팅 의심',
  contempt: '경멸적 표현',
  threatLeave: '관계 위협',
  control: '과도한 통제',
};

function countKeywords(text, list) {
  let n = 0;
  for (const kw of list) {
    if (text.includes(kw)) n += 1;
  }
  return n;
}

function isNight(date) {
  if (!date) return false;
  const h = date.getHours();
  return h >= 0 && h < 6;
}

/**
 * @param {KakaoMessage[]} messages
 */
export function computeStatPatterns(messages) {
  const senders = new Map();
  let nightCount = 0;
  const keywordTotals = { blame: 0, gaslight: 0, contempt: 0, threatLeave: 0, apology: 0, control: 0 };
  const candidateIndexes = new Set();

  const responseGaps = new Map(); // sender -> [seconds]
  let prev = null;

  messages.forEach((msg, idx) => {
    const s = msg.sender || 'unknown';
    if (!senders.has(s)) senders.set(s, { count: 0, chars: 0, keyword: { ...keywordTotals } });
    const rec = senders.get(s);
    rec.count += 1;
    rec.chars += (msg.text || '').length;

    if (isNight(msg.at)) nightCount += 1;

    for (const key of Object.keys(KEYWORDS)) {
      const c = countKeywords(msg.text || '', KEYWORDS[key]);
      if (c > 0) {
        keywordTotals[key] += c;
        rec.keyword[key] += c;
        // 사과 외의 신호가 있으면 LLM 태깅 후보로 (앞뒤 맥락 포함)
        if (key !== 'apology') {
          candidateIndexes.add(idx);
        }
      }
    }

    // 상대 → 나 방향 응답시간 (연속 발화 사이 간격)
    if (prev && prev.at && msg.at && prev.sender !== msg.sender) {
      const gap = (msg.at - prev.at) / 1000;
      if (gap >= 0 && gap < 60 * 60 * 24) {
        if (!responseGaps.has(msg.sender)) responseGaps.set(msg.sender, []);
        responseGaps.get(msg.sender).push(gap);
      }
    }
    prev = msg;
  });

  const participantCounts = {};
  for (const [name, rec] of senders) {
    participantCounts[name] = {
      messages: rec.count,
      chars: rec.chars,
      keywords: rec.keyword,
    };
  }

  const avgResponseSec = {};
  for (const [name, gaps] of responseGaps) {
    if (gaps.length) avgResponseSec[name] = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const total = messages.length || 1;
  // 발신자는 항상 오른쪽 말풍선="나"로 정규화돼 들어오므로, 나머지 한 명이 상대방
  const partnerName =
    senders.size === 2 ? [...senders.keys()].find((n) => n !== '나') || null : null;

  return {
    stats: {
      messageCount: messages.length,
      participants: [...senders.keys()],
      participantCounts,
      nightRatio: Number((nightCount / total).toFixed(3)),
      avgResponseSec,
      keywordTotals,
      partnerName,
      periodStart: messages.find((m) => m.at)?.at ?? null,
      periodEnd: [...messages].reverse().find((m) => m.at)?.at ?? null,
    },
    candidateIndexes: [...candidateIndexes].sort((a, b) => a - b),
  };
}

/**
 * LLM 태깅용 후보 구간 추출: 후보 메시지 ± window 를 묶어 세그먼트로 반환.
 * 각 메시지에 원본 인덱스(idx)를 함께 담아, LLM이 지목한 위치를 원문에 다시 매핑할 수 있게 한다.
 * 반환 세그먼트는 LLM 입력으로만 쓰고 저장하지 않는다.
 */
export function buildCandidateSegments(messages, candidateIndexes, window = 2, maxSegments = 15) {
  const segments = [];
  const used = new Set();
  for (const idx of candidateIndexes) {
    if (used.has(idx)) continue;
    const start = Math.max(0, idx - window);
    const end = Math.min(messages.length - 1, idx + window);
    const seg = [];
    for (let i = start; i <= end; i++) {
      used.add(i);
      seg.push({
        idx: i,
        sender: messages[i].sender,
        text: messages[i].text,
      });
    }
    segments.push(seg);
    if (segments.length >= maxSegments) break;
  }
  return segments;
}

/**
 * analyzeChatFlow가 확정한 flowFlags만 근거로 상담봇 컨텍스트를 직렬화.
 * 키워드 후보가 아니라 LLM이 실제 조종적 발화로 확정한 지점만 카테고리 라벨과 함께 담아,
 * 상담봇이 이 지점을 우선순위로 질문하게 한다. maxChars로 토큰 비용/노출 범위를 통제한다.
 * @param {KakaoMessage[]} messages
 * @param {{ idx: number, category: string }[]} flowFlags
 */
export function formatConfirmedContext(messages, flowFlags, window = 2, maxChars = 2500) {
  if (!flowFlags || flowFlags.length === 0) return '';
  const used = new Set();
  let out = '';
  for (const flag of flowFlags) {
    if (used.has(flag.idx)) continue;
    const start = Math.max(0, flag.idx - window);
    const end = Math.min(messages.length - 1, flag.idx + window);
    const lines = [];
    for (let i = start; i <= end; i++) {
      used.add(i);
      lines.push(`${messages[i].sender}: ${messages[i].text}${i === flag.idx ? ' ← 의심 발화' : ''}`);
    }
    const label = CATEGORY_LABELS[flag.category] || flag.category;
    const block = `--- [${label} 확정] ---\n${lines.join('\n')}\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out.trim();
}
