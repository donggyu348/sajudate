// 재회사주 미리보기 키워드 — 입력값 기반 rule-based 매핑
// 추후 사주 원국 분석값(sajuHint)과 연결할 수 있도록 선택 로직을 분리해 둠.
//
// 카테고리: blocker(가로막는 매듭) / heart(상대 속마음) / contact(연락 가능성)
//           reunion(재회 가능성) / future(재회 후 미래)

// ── 키워드 카탈로그 ──────────────────────────────────────────
const CATALOG = {
  // blocker
  gyeongyang: { key: "gyeongyang", label: "경양", hanja: "庚羊", category: "blocker", shortDescription: "날카로운 방어심과 자존심, 거리를 두려는 기운" },
  eumbyeok:   { key: "eumbyeok",   label: "음벽", hanja: "陰壁", category: "blocker", shortDescription: "마음은 남았지만 스스로 벽을 세우는 흐름" },
  hwajan:     { key: "hwajan",     label: "화잔", hanja: "火殘", category: "blocker", shortDescription: "감정의 잔불, 분노와 미련이 함께 남은 상태" },
  musin:      { key: "musin",      label: "무신", hanja: "無信", category: "blocker", shortDescription: "신뢰가 흔들려 다시 믿기 어려운 흐름" },
  naengwol:   { key: "naengwol",   label: "냉월", hanja: "冷月", category: "blocker", shortDescription: "겉으로는 차갑게 정리한 듯 보이는 기운" },
  jeongmae:   { key: "jeongmae",   label: "정매", hanja: "情埋", category: "blocker", shortDescription: "감정을 묻어두고 표현하지 않는 흐름" },
  danmun:     { key: "danmun",     label: "단문", hanja: "斷門", category: "blocker", shortDescription: "연락과 대화, 접근이 막혀 있는 상태" },
  eotgyeol:   { key: "eotgyeol",   label: "엇결", hanja: "錯結", category: "blocker", shortDescription: "타이밍이 어긋나 꼬인 인연의 매듭" },
  jamsim:     { key: "jamsim",     label: "잠심", hanja: "潛心", category: "blocker", shortDescription: "마음이 사라진 게 아니라 깊이 가라앉은 상태" },
  sanghun:    { key: "sanghun",    label: "상흔", hanja: "傷痕", category: "blocker", shortDescription: "상처가 남아 다시 다가서기 어려운 흐름" },

  // heart
  mijan:      { key: "mijan",      label: "미잔", hanja: "未殘", category: "heart", shortDescription: "아직 감정의 잔상이 남아 있는 흐름" },
  hoesim:     { key: "hoesim",     label: "회심", hanja: "回心", category: "heart", shortDescription: "뒤늦게 마음을 돌아보는 흐름" },
  mangjeong:  { key: "mangjeong",  label: "망정", hanja: "忘情", category: "heart", shortDescription: "잊으려 하지만 완전히 지우지 못하는 상태" },
  eunjeong:   { key: "eunjeong",   label: "은정", hanja: "隱情", category: "heart", shortDescription: "감정을 숨기고 드러내지 않는 흐름" },
  naengjeong: { key: "naengjeong", label: "냉정", hanja: "冷情", category: "heart", shortDescription: "감정보다 이성적으로 정리하려는 상태" },
  huui:       { key: "huui",       label: "후의", hanja: "後意", category: "heart", shortDescription: "시간이 지나고 나서야 후회가 올라오는 흐름" },
  jeongchim:  { key: "jeongchim",  label: "정침", hanja: "情沈", category: "heart", shortDescription: "마음이 깊이 가라앉아 잘 움직이지 않는 상태" },
  yeoun:      { key: "yeoun",      label: "여운", hanja: "餘韻", category: "heart", shortDescription: "관계의 마지막 장면이 아직 남아 있는 흐름" },

  // contact
  mungae:     { key: "mungae",     label: "문개", hanja: "門開", category: "contact", shortDescription: "닫혔던 대화의 문이 열릴 수 있는 흐름" },
  sindong:    { key: "sindong",    label: "신동", hanja: "信動", category: "contact", shortDescription: "연락운이 다시 움직이기 시작하는 기운" },
  muksin:     { key: "muksin",     label: "묵신", hanja: "默信", category: "contact", shortDescription: "말은 없지만 마음속 반응이 남아 있는 상태" },
  jiyeon:     { key: "jiyeon",     label: "지연", hanja: "遲緣", category: "contact", shortDescription: "연락이 늦게 닿는 흐름" },
  baneung:    { key: "baneung",    label: "반응", hanja: "反應", category: "contact", shortDescription: "먼저 움직이진 않아도 반응 가능성이 있는 흐름" },
  hoedap:     { key: "hoedap",     label: "회답", hanja: "回答", category: "contact", shortDescription: "답이 돌아올 가능성이 남아 있는 흐름" },
  mueung:     { key: "mueung",     label: "무응", hanja: "無應", category: "contact", shortDescription: "당장은 반응이 약하게 가라앉은 상태" },
  gwanmang:   { key: "gwanmang",   label: "관망", hanja: "觀望", category: "contact", shortDescription: "먼저 움직이기보다 지켜보려는 흐름" },

  // reunion
  sogyeon:    { key: "sogyeon",    label: "속연", hanja: "續緣", category: "reunion", shortDescription: "끊어진 인연이 다시 이어질 여지가 있는 흐름" },
  bogyeon:    { key: "bogyeon",    label: "복연", hanja: "復緣", category: "reunion", shortDescription: "다시 만남으로 향하는 흐름" },
  jaedong:    { key: "jaedong",    label: "재동", hanja: "再動", category: "reunion", shortDescription: "멈췄던 관계가 다시 움직이려는 상태" },
  janyeon:    { key: "janyeon",    label: "잔연", hanja: "殘緣", category: "reunion", shortDescription: "아직 남아 있는 인연의 기운" },
  hongseon:   { key: "hongseon",   label: "홍선", hanja: "紅線", category: "reunion", shortDescription: "붉은 실이 완전히 끊어지지 않은 흐름" },
  wolhap:     { key: "wolhap",     label: "월합", hanja: "月合", category: "reunion", shortDescription: "시간이 지나 다시 맞물리는 흐름" },
  jeonghoe:   { key: "jeonghoe",   label: "정회", hanja: "情回", category: "reunion", shortDescription: "감정이 다시 돌아오려는 흐름" },
  migyeol:    { key: "migyeol",    label: "미결", hanja: "未結", category: "reunion", shortDescription: "완전히 끝나지 않은 관계의 매듭" },

  // future
  banbok:     { key: "banbok",     label: "반복", hanja: "反復", category: "future", shortDescription: "같은 문제가 다시 반복될 수 있는 흐름" },
  anjeong:    { key: "anjeong",    label: "안정", hanja: "安定", category: "future", shortDescription: "다시 만나면 이전보다 차분해질 수 있는 흐름" },
  jaeyeol:    { key: "jaeyeol",    label: "재열", hanja: "再熱", category: "future", shortDescription: "다시 뜨겁게 이어질 여지가 있는 흐름" },
  sojin:      { key: "sojin",      label: "소진", hanja: "消盡", category: "future", shortDescription: "재회해도 감정이 쉽게 지칠 수 있는 흐름" },
  jangyeon:   { key: "jangyeon",   label: "장연", hanja: "長緣", category: "future", shortDescription: "길게 이어질 여지가 있는 인연" },
  ihuyeon:    { key: "ihuyeon",    label: "이후연", hanja: "離後緣", category: "future", shortDescription: "헤어진 뒤에야 의미가 커지는 관계" },
  sinyeon:    { key: "sinyeon",    label: "신연", hanja: "新緣", category: "future", shortDescription: "새로운 인연이 들어올 여지가 있는 흐름" },
  bungi:      { key: "bungi",      label: "분기", hanja: "分岐", category: "future", shortDescription: "재회와 새 인연 사이의 갈림길에 놓인 흐름" },
};

// ── 카테고리 메타(카드 라벨/제목/마무리/잠금 문구) ───────────
const CATEGORY_META = {
  blocker: {
    label: "BLOCKER THREAD",
    title: "재회를 가로막는 붉은 인연줄",
    lead: (k) => `두 사람의 인연에는 ${k.label}(${k.hanja})의 매듭이 얽혀 있습니다. ${k.shortDescription}. 지금은 그 기운이 서로 먼저 다가서는 길을 조용히 가로막고 있는 것으로 읽힙니다.`,
    close: "이 매듭이 언제쯤 느슨해지는지, 어떤 계기에서 풀리기 시작하는지가 흐름 속에 담겨 있습니다.",
    locked: "이 매듭이 풀리는 시기와 다시 연락이 닿기 쉬워지는 흐름은 전체 리포트에서 확인할 수 있습니다.",
  },
  heart: {
    label: "HEART TRACE",
    title: "상대의 현재 속마음",
    lead: (k) => `상대의 마음에는 ${k.label}(${k.hanja})의 결이 흐르고 있습니다. ${k.shortDescription}. 겉으로 보이는 태도와 속마음이 서로 다르게 움직이는 기운이 함께 감지됩니다.`,
    close: "지금 상대의 마음이 미련과 후회, 자존심 중 어느 쪽으로 더 기울고 있는지가 흐름에 나타나 있습니다.",
    locked: "상대의 마음이 어느 쪽으로 기울고 있는지, 그 진짜 이유는 전체 리포트에서 확인할 수 있습니다.",
  },
  contact: {
    label: "CONTACT FLOW",
    title: "다시 연락이 닿을 흐름",
    lead: (k) => `연락의 흐름에는 ${k.label}(${k.hanja})의 기운이 감돌고 있습니다. ${k.shortDescription}. 지금은 억지로 당기기보다 흐름이 열리는 순간을 살피는 편이 유리해 보입니다.`,
    close: "먼저 움직여도 되는 때와 조용히 기다려야 하는 때가 흐름 속에서 나뉘어 나타납니다.",
    locked: "다시 연락이 닿기 쉬운 시기와 먼저 움직여도 되는 타이밍은 전체 리포트에서 확인할 수 있습니다.",
  },
  reunion: {
    label: "REUNION LINE",
    title: "재회 가능성의 흐름",
    lead: (k) => `두 사람 사이에는 ${k.label}(${k.hanja})의 흐름이 이어지고 있습니다. ${k.shortDescription}. 끊어진 듯 보여도 인연의 실이 완전히 풀리지는 않은 것으로 읽힙니다.`,
    close: "이 인연이 다시 맞물리기 쉬워지는 결정적 시기가 흐름 위에 조용히 표시되어 있습니다.",
    locked: "재회 가능성이 높아지는 흐름과 결정적인 시기는 전체 리포트에서 확인할 수 있습니다.",
  },
  future: {
    label: "AFTER STORY",
    title: "재회 후 관계의 미래",
    lead: (k) => `재회 이후에는 ${k.label}(${k.hanja})의 기운이 따라옵니다. ${k.shortDescription}. 다시 이어질 경우 관계가 어느 방향으로 흐를지 그 결이 조금씩 드러납니다.`,
    close: "같은 이별이 반복될지, 이번에는 다른 결말로 이어질지가 흐름 안에 담겨 있습니다.",
    locked: "재회 후 관계가 어떻게 이어질지, 그리고 무엇이 더 나은 선택인지는 전체 리포트에서 확인할 수 있습니다.",
  },
};

// ── 입력값 → 키워드 선택(rule-based) ─────────────────────────
// sajuHint: 추후 사주 분석값. { blocker:'gyeongyang', heart:'mijan', ... } 형태로 주면 우선 적용.
function pick(cat, ruleKey, sajuHint) {
  if (sajuHint && sajuHint[cat] && CATALOG[sajuHint[cat]]) return sajuHint[cat];
  return CATALOG[ruleKey] ? ruleKey : null;
}

function pickBlocker(reason, initiator) {
  const byReason = {
    "썸붕 및 고백 실패": "eotgyeol",
    "성격 차이와 잦은 다툼": "hwajan",
    "집착 및 이성 문제": "musin",
    "상대방의 잠수이별 및 통보": "danmun",
    "상대방의 바람 및 외도": "sanghun",
  };
  if (byReason[reason]) return byReason[reason];
  const byInit = { "내가 먼저": "jeongmae", "상대방이 먼저": "naengwol", "서로 자연스럽게": "jamsim" };
  return byInit[initiator] || "eumbyeok";
}
function pickHeart(initiator, card) {
  const byCard = { "닫힌 문": "eunjeong", "깨진 거울": "naengjeong", "꺼진 등불": "jeongchim", "돌아오지 않은 편지": "mangjeong" };
  if (byCard[card]) return byCard[card];
  const byInit = { "내가 먼저": "mijan", "상대방이 먼저": "huui", "서로 자연스럽게": "yeoun" };
  return byInit[initiator] || "mijan";
}
function pickContact(card) {
  const m = { "붉은 실": "mungae", "닫힌 문": "mueung", "꺼진 등불": "jiyeon", "깨진 거울": "muksin", "돌아오지 않은 편지": "hoedap", "흐르는 강": "gwanmang" };
  return m[card] || "baneung";
}
function pickReunion(card) {
  const m = { "붉은 실": "hongseon", "닫힌 문": "migyeol", "꺼진 등불": "janyeon", "깨진 거울": "jeonghoe", "돌아오지 않은 편지": "sogyeon", "흐르는 강": "wolhap" };
  return m[card] || "jaedong";
}
function pickFuture(reason, initiator) {
  const byReason = {
    "성격 차이와 잦은 다툼": "banbok",
    "집착 및 이성 문제": "sojin",
    "상대방의 잠수이별 및 통보": "bungi",
    "상대방의 바람 및 외도": "sinyeon",
    "썸붕 및 고백 실패": "jaeyeol",
  };
  if (byReason[reason]) return byReason[reason];
  const byInit = { "서로 자연스럽게": "anjeong", "내가 먼저": "jangyeon", "상대방이 먼저": "ihuyeon" };
  return byInit[initiator] || "bungi";
}

// ── 표시용 객체 생성 ────────────────────────────────────────
function buildCard(cat, key) {
  const k = CATALOG[key] || CATALOG.eumbyeok;
  const meta = CATEGORY_META[cat];
  return {
    key: k.key,
    label: k.label,
    hanja: k.hanja,
    category: cat,
    cardLabel: meta.label,
    cardTitle: meta.title,
    shortDescription: k.shortDescription,
    // 3문단 previewText (단정 표현 없이 흐름/기운 표현)
    previewText: [
      meta.lead(k),
      meta.close,
    ],
    lockedText: meta.locked,
  };
}

/**
 * 입력값(관계 카드·이별 이유·이별 통보자 등) 기반으로 5개 카테고리 키워드를 매칭.
 * @param {object} input  req.body (relationStatus, breakupReason, breakupInitiator ...)
 * @param {object|null} sajuHint  추후 사주 분석값(카테고리별 key 지정) — 있으면 우선 적용
 * @returns {Array} [blocker, heart, contact, reunion, future] 카드 데이터
 */
export function pickReunionKeywords(input = {}, sajuHint = null) {
  const reason = input.breakupReason || "";
  const initiator = input.breakupInitiator || "";
  const card = input.relationStatus || "";

  const keys = {
    blocker: pick("blocker", pickBlocker(reason, initiator), sajuHint),
    heart:   pick("heart",   pickHeart(initiator, card), sajuHint),
    contact: pick("contact", pickContact(card), sajuHint),
    reunion: pick("reunion", pickReunion(card), sajuHint),
    future:  pick("future",  pickFuture(reason, initiator), sajuHint),
  };

  return ["blocker", "heart", "contact", "reunion", "future"].map(cat => buildCard(cat, keys[cat]));
}

export { CATALOG, CATEGORY_META };
