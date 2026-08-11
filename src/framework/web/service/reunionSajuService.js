// src/framework/web/service/reunionSajuService.js
//
// 재회사주 랜딩(#1 확률 · #4 연락운 캘린더 · #5 사주팔자 표 · #7 재회운 곡선 · #8 레이더차트)이
// 공유하는 실제 사주 계산 서비스.
//
// - 원국(사주팔자·오행·십성·십이운성·용신·공망·신살)은 sajuCalService.getFourPillars() 재사용
// - 오늘 이후의 일진(日辰)·월주는 절기 정확도가 필요하므로 lunar-javascript로 계산한다
//   (GptService가 sample 생성에 쓰는 방식과 동일)
// - 차트는 reaperChartService와 같은 규약: SVG 좌표·path까지 서버에서 만들어 EJS는 찍기만 한다

import { Solar } from "lunar-javascript";
import { getFourPillars } from "./sajuCalService.js";
import { CHEONGAN_REVERSE, JIJI_REVERSE, CHEONGAN_MAP, JIJI_MAP } from "./toHanja.js";

/* ────────────────────────────── 기초 테이블 ────────────────────────────── */

const STEM_TO_ELEMENT = { 갑:"목", 을:"목", 병:"화", 정:"화", 무:"토", 기:"토", 경:"금", 신:"금", 임:"수", 계:"수" };
const BRANCH_TO_ELEMENT = { 자:"수", 축:"토", 인:"목", 묘:"목", 진:"토", 사:"화", 오:"화", 미:"토", 신:"금", 유:"금", 술:"토", 해:"수" };

const FIVE = { 목:0, 화:1, 토:2, 금:3, 수:4 };
const GAN_YINYANG = { 갑:1, 을:0, 병:1, 정:0, 무:1, 기:0, 경:1, 신:0, 임:1, 계:0 };
const JI_YINYANG  = { 자:1, 축:0, 인:1, 묘:0, 진:1, 사:0, 오:1, 미:0, 신:1, 유:0, 술:1, 해:0 };

const TEN_GOD = {
  0: ["비견", "겁재"],
  1: ["식신", "상관"],
  2: ["편재", "정재"],
  3: ["편관", "정관"],
  4: ["편인", "정인"],
};

const GENERATE = { 목:"화", 화:"토", 토:"금", 금:"수", 수:"목" };
const CONTROL  = { 목:"토", 화:"금", 토:"수", 금:"목", 수:"화" };

/** 지지 관계 — 두 사람 사이(원국 내부가 아닌 교차) 판정용 */
const SIX_HARMONY   = { 자:"축", 축:"자", 인:"해", 해:"인", 묘:"술", 술:"묘", 진:"유", 유:"진", 사:"신", 신:"사", 오:"미", 미:"오" };
const CHUNG_PAIRS   = { 자:"오", 오:"자", 축:"미", 미:"축", 인:"신", 신:"인", 묘:"유", 유:"묘", 진:"술", 술:"진", 사:"해", 해:"사" };
const WONJIN_PAIRS  = { 자:"미", 미:"자", 축:"오", 오:"축", 인:"유", 유:"인", 묘:"신", 신:"묘", 진:"해", 해:"진", 사:"술", 술:"사" };
const HAE_PAIRS     = { 자:"미", 미:"자", 축:"오", 오:"축", 인:"사", 사:"인", 묘:"진", 진:"묘", 신:"해", 해:"신", 유:"술", 술:"유" };
const PA_PAIRS      = { 자:"유", 유:"자", 묘:"오", 오:"묘", 진:"축", 축:"진", 사:"신", 신:"사", 술:"미", 미:"술", 해:"인", 인:"해" };
const HYEONG_PAIRS  = { 인:"사", 사:"신", 신:"인", 축:"술", 술:"미", 미:"축", 자:"묘", 묘:"자" };
const STEM_COMBINE  = { 갑:"기", 기:"갑", 을:"경", 경:"을", 병:"신", 신:"병", 정:"임", 임:"정", 무:"계", 계:"무" };

const THREE_HARMONY_GROUPS = [
  ["신", "자", "진"],
  ["해", "묘", "미"],
  ["인", "오", "술"],
  ["사", "유", "축"],
];

/* ────────────────────────────── 공통 헬퍼 ────────────────────────────── */

/**
 * 입력 폼은 "남성/여성"으로 보내는데 sajuCalService.getDaewoonStartAge()는 "남"/"여"로 비교한다.
 * 대운 순행/역행이 뒤집히지 않도록 여기서 한 글자로 맞춰 넘긴다.
 */
function normalizeGender(gender) {
  const g = String(gender || "").trim();
  if (g.startsWith("남") || /^(m|male)$/i.test(g)) return "남";
  if (g.startsWith("여") || /^(f|female|w|woman)$/i.test(g)) return "여";
  return "여";
}

function normalizePerson(raw, fallbackName) {
  return {
    name: (raw?.name || "").trim() || fallbackName,
    gender: normalizeGender(raw?.gender),
    birthDate: String(raw?.birthDate || raw?.birthdate || "").replace(/\D/g, ""),
    birthTime: raw?.birthTime ?? "unknown",
  };
}

function isSameElement(a, b) { return Boolean(a) && a === b; }

function inThreeHarmony(a, b) {
  if (!a || !b || a === b) return false;
  return THREE_HARMONY_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

function pairRelation(myJi, otherJi) {
  return {
    sixHarmony: SIX_HARMONY[myJi] === otherJi,
    threeHarmony: inThreeHarmony(myJi, otherJi),
    chung: CHUNG_PAIRS[myJi] === otherJi,
    wonjin: WONJIN_PAIRS[myJi] === otherJi,
    hyeong: HYEONG_PAIRS[myJi] === otherJi,
    hae: HAE_PAIRS[myJi] === otherJi,
    pa: PA_PAIRS[myJi] === otherJi,
  };
}

/** 일간 기준 천간 십성 */
function tenGodOfStem(dayGan, targetGan) {
  const me = STEM_TO_ELEMENT[dayGan];
  const it = STEM_TO_ELEMENT[targetGan];
  if (!me || !it) return null;
  const diff = (FIVE[it] - FIVE[me] + 5) % 5;
  const same = GAN_YINYANG[dayGan] === GAN_YINYANG[targetGan];
  return TEN_GOD[diff][same ? 0 : 1];
}

/** 일간 기준 지지 십성 */
function tenGodOfBranch(dayGan, ji) {
  const me = STEM_TO_ELEMENT[dayGan];
  const it = BRANCH_TO_ELEMENT[ji];
  if (!me || !it) return null;
  const diff = (FIVE[it] - FIVE[me] + 5) % 5;
  const same = GAN_YINYANG[dayGan] === JI_YINYANG[ji];
  return TEN_GOD[diff][same ? 0 : 1];
}

/** 성별에 따른 '배우자 십성' — 여자는 관성, 남자는 재성 */
function spouseGods(gender) {
  return gender === "여" ? ["정관", "편관"] : ["정재", "편재"];
}

function elementEntries(el) {
  return ["목", "화", "토", "금", "수"].map((k) => [k, Number(el?.[k]) || 0]);
}
function dominantElement(el) { return elementEntries(el).sort((a, b) => b[1] - a[1])[0][0]; }
function weakestElement(el)  { return elementEntries(el).sort((a, b) => a[1] - b[1])[0][0]; }

function countTenGods(tenGod, types) {
  return [tenGod?.year, tenGod?.month, tenGod?.day, tenGod?.hour]
    .filter(Boolean)
    .filter((g) => types.includes(g)).length;
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, Math.round(v))); }

/* ────────────── 절기 정확도가 필요한 일진·월주 (lunar-javascript) ────────────── */

const _pillarCache = new Map();

/** 특정 날짜(정오 기준)의 연·월·일주를 한글 간지로 반환 */
function pillarsOfDate(date) {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (_pillarCache.has(key)) return _pillarCache.get(key);

  const ec = Solar.fromYmdHms(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12, 0, 0)
    .getLunar()
    .getEightChar();

  const value = {
    year:  { gan: CHEONGAN_REVERSE[ec.getYearGan()],  ji: JIJI_REVERSE[ec.getYearZhi()] },
    month: { gan: CHEONGAN_REVERSE[ec.getMonthGan()], ji: JIJI_REVERSE[ec.getMonthZhi()] },
    day:   { gan: CHEONGAN_REVERSE[ec.getDayGan()],   ji: JIJI_REVERSE[ec.getDayZhi()] },
  };
  _pillarCache.set(key, value);
  return value;
}

function addDays(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ────────────────────────── #8 레이더차트 6축 산출 ────────────────────────── */

/**
 * 궁합 — 오행 상보성 + 일간 천간합 + 일지 합/충
 */
function scoreCompatibility(me, partner) {
  let s = 50;

  const myWeak = weakestElement(me.saju.fiveElementsWeighted);
  const myTop = dominantElement(me.saju.fiveElementsWeighted);
  const ptWeak = weakestElement(partner.saju.fiveElementsWeighted);
  const ptTop = dominantElement(partner.saju.fiveElementsWeighted);

  if (isSameElement(myWeak, ptTop)) s += 18;   // 상대가 내 결핍을 채움
  if (isSameElement(ptWeak, myTop)) s += 12;   // 내가 상대의 결핍을 채움

  if (STEM_COMBINE[me.saju.day.gan] === partner.saju.day.gan) s += 15; // 일간 천간합

  const rel = pairRelation(me.saju.day.ji, partner.saju.day.ji);
  if (rel.sixHarmony) s += 15;
  else if (rel.threeHarmony) s += 12;
  if (rel.chung) s -= 12;
  if (rel.wonjin) s -= 10;
  if (rel.hyeong) s -= 8;
  if (rel.hae) s -= 5;
  if (rel.pa) s -= 4;

  // 상대 일간이 내 용신 오행이면 관계 자체가 나를 살린다
  if (STEM_TO_ELEMENT[partner.saju.day.gan] === me.saju.yongshin?.yongshin) s += 8;

  return clamp(s, 5, 98);
}

/**
 * 미련 — 상대 입장에서 내가 배우자성(재성/관성)인가 + 도화·홍염 + 일지 합 + 십이운성
 */
function scoreAttachment(me, partner) {
  let s = 45;

  // 상대 일간에서 본 내 일간의 십성
  const godTowardMe = tenGodOfStem(partner.saju.day.gan, me.saju.day.gan);
  if (spouseGods(partner.gender).includes(godTowardMe)) s += 20;
  else if (["정인", "편인"].includes(godTowardMe)) s += 10;
  else if (["비견", "겁재"].includes(godTowardMe)) s += 4;

  const gods = Array.isArray(partner.saju.gods12) ? partner.saju.gods12 : [];
  if (gods.includes("도화")) s += 10;
  if (gods.includes("홍염")) s += 10;

  const rel = pairRelation(partner.saju.day.ji, me.saju.day.ji);
  if (rel.sixHarmony) s += 12;
  else if (rel.threeHarmony) s += 8;
  if (rel.wonjin) s += 6;   // 원진은 미련 자체는 오히려 질기게 남는다

  // 상대 일간이 내 일지에서 얻는 십이운성
  const stage = twelveStage(partner.saju.day.gan, me.saju.day.ji);
  if (["장생", "건록", "제왕", "관대"].includes(stage)) s += 10;
  if (["묘", "절", "사", "병"].includes(stage)) s -= 10;

  return clamp(s, 5, 98);
}

/**
 * 관계불안 — 충·형·파·해·원진 밀도 + 공망 (높을수록 불리)
 */
function scoreInstability(me, partner) {
  let s = 30;
  const rel = pairRelation(me.saju.day.ji, partner.saju.day.ji);
  if (rel.chung) s += 20;
  if (rel.hyeong) s += 14;
  if (rel.wonjin) s += 14;
  if (rel.pa) s += 7;
  if (rel.hae) s += 7;

  // 상대 일지가 내 공망이면 마음이 비어 보이는 구간
  if ((me.saju.gongMang || []).includes(partner.saju.day.ji)) s += 12;
  if ((partner.saju.gongMang || []).includes(me.saju.day.ji)) s += 8;

  // 내 원국이 신약하면 관계 스트레스에 더 흔들린다
  if (me.saju.strength?.label === "신약") s += 6;

  if (rel.sixHarmony || rel.threeHarmony) s -= 12;

  return clamp(s, 5, 95);
}

/**
 * 결혼운 — 배우자궁(일지) + 정관/정재 유무 + 일지 안정
 */
function scoreMarriage(me, partner) {
  let s = 45;

  if (me.saju.spouse?.compatibility) s += 15;
  s += countTenGods(me.saju.tenGod, ["정관", "정재"]) * 10;
  s += countTenGods(me.saju.tenGod, ["편관", "편재"]) * 4;

  const rel = pairRelation(me.saju.day.ji, partner.saju.day.ji);
  if (rel.sixHarmony) s += 10;
  else if (rel.threeHarmony) s += 7;
  if (rel.chung) s -= 12;
  if (rel.hyeong) s -= 6;

  // 상대 일지가 내 배우자 오행이면 자리값이 맞는다
  if (BRANCH_TO_ELEMENT[partner.saju.day.ji] === me.saju.spouse?.spouseElement) s += 10;

  return clamp(s, 5, 97);
}

/**
 * 후회주기 — 상대 세운에 배우자성/인성이 다시 들어오는 해까지의 거리.
 * 가까울수록 "상대가 돌아볼 시점"이 임박한 것으로 본다.
 */
function scoreRegretCycle(partner) {
  const thisYear = new Date().getFullYear();
  const targets = [...spouseGods(partner.gender), "정인", "편인"];

  // getFourPillars의 sewun은 '출생년 기준 30년'이라 현재 이후 구간이 비어 있다.
  // 앞으로 10년치 연주를 직접 뽑아 상대 일간 기준 십성을 본다.
  const upcoming = [];
  for (let i = 0; i < 10; i++) {
    const y = thisYear + i;
    const yp = pillarsOfDate(new Date(y, 6, 1)).year; // 입춘 지난 7월 기준
    upcoming.push({ year: y, gan: yp.gan, ji: yp.ji, tenGod: tenGodOfStem(partner.saju.day.gan, yp.gan) });
  }

  const hit = upcoming.find((s) => targets.includes(s.tenGod));
  const gap = hit ? hit.year - thisYear : 8;
  return {
    score: clamp(100 - Math.min(48, gap * 8), 20, 96),
    year: hit ? hit.year : null,
    tenGod: hit ? hit.tenGod : null,
  };
}

/** 십이운성 (sajuCalService의 표와 동일 규칙, 교차 판정용으로 로컬 구현) */
const TWELVE_STAGE_TABLE = {
  갑: ["목욕","관대","건록","제왕","쇠","병","사","묘","절","태","양","장생"],
  병: ["태","양","장생","목욕","관대","건록","제왕","쇠","병","사","묘","절"],
  무: ["태","양","장생","목욕","관대","건록","제왕","쇠","병","사","묘","절"],
  경: ["사","묘","절","태","양","장생","목욕","관대","건록","제왕","쇠","병"],
  임: ["병","사","묘","절","태","양","장생","목욕","관대","건록","제왕","쇠"],
};
const TWELVE_STAGE_YIN = { 을:"갑", 정:"병", 기:"무", 신:"경", 계:"임" };
const JI_ORDER = ["자","축","인","묘","진","사","오","미","신","유","술","해"];

function twelveStage(gan, ji) {
  if (!gan || !ji) return null;
  const idx = JI_ORDER.indexOf(ji);
  if (idx === -1) return null;
  const isYin = Boolean(TWELVE_STAGE_YIN[gan]);
  const stages = TWELVE_STAGE_TABLE[isYin ? TWELVE_STAGE_YIN[gan] : gan];
  if (!stages) return null;
  return isYin ? stages[(12 - idx) % 12] : stages[idx];
}

/* ────────────────────────── #7 시기별 재회운 곡선 ────────────────────────── */

const MONTH_GOD_SCORE = {
  정관: 18, 정재: 18, 편관: 10, 편재: 12,
  정인: 10, 편인: 6, 식신: 6, 상관: -8,
  비견: -3, 겁재: -10,
};

/** 이번 달부터 12개월간의 월별 재회운 점수 */
function buildMonthlyLuck(me, partner) {
  const today = new Date();
  const months = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 15);
    const mp = pillarsOfDate(d).month;

    let s = 50;
    s += MONTH_GOD_SCORE[tenGodOfStem(me.saju.day.gan, mp.gan)] ?? 0;

    // 월지와 상대 일지의 관계 = 그달의 '접점'
    const relPartner = pairRelation(mp.ji, partner.saju.day.ji);
    if (relPartner.sixHarmony) s += 15;
    else if (relPartner.threeHarmony) s += 11;
    if (relPartner.chung) s -= 18;
    if (relPartner.wonjin) s -= 12;
    if (relPartner.hyeong) s -= 8;

    // 월지와 내 일지의 관계 = 내 컨디션
    const relMe = pairRelation(mp.ji, me.saju.day.ji);
    if (relMe.sixHarmony || relMe.threeHarmony) s += 6;
    if (relMe.chung) s -= 8;

    // 용신/기신
    const mEl = BRANCH_TO_ELEMENT[mp.ji];
    if (mEl === me.saju.yongshin?.yongshin) s += 10;
    if (mEl === me.saju.yongshin?.gishin) s -= 10;

    months.push({
      index: i,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
      shortLabel: `${d.getMonth() + 1}월`,
      gan: mp.gan,
      ji: mp.ji,
      ganji: `${mp.gan}${mp.ji}`,
      tenGod: tenGodOfStem(me.saju.day.gan, mp.gan),
      score: clamp(s, 8, 96),
    });
  }
  return months;
}

/** 월별 점수 → SVG 좌표·path (reaperChartService와 동일 규약) */
function buildTimelineChart(months) {
  const chartW = 320;
  const chartH = 200;
  const baseY = 168;
  const leftX = 24;
  const rightX = 296;
  const stepX = (rightX - leftX) / (months.length - 1);

  const points = months.map((m, i) => ({
    ...m,
    x: Math.round(leftX + stepX * i),
    y: Math.round(baseY - (m.score / 100) * 128),
  }));

  const linePath = `M${points.map((p) => `${p.x},${p.y}`).join(" L")}`;
  const areaPath = `${linePath} L${rightX},${baseY} L${leftX},${baseY} Z`;

  let peak = points[0];
  points.forEach((p) => { if (p.score > peak.score) peak = p; });
  let bottom = points[0];
  points.forEach((p) => { if (p.score < bottom.score) bottom = p; });

  return { chartW, chartH, baseY, points, linePath, areaPath, peak, bottom };
}

/* ─────────────────────────── #4 연락운 캘린더 ─────────────────────────── */

const DAY_LABELS = {
  golden:  { key: "golden",  text: "골든타임",            tone: "golden" },
  silence: { key: "silence", text: "침묵이 필요한 시기",  tone: "silence" },
  step:    { key: "step",    text: "한 발 물러서야 할 때", tone: "step" },
  charge:  { key: "charge",  text: "기운을 끌어올리는 기간", tone: "charge" },
};

/**
 * 하루치 판정.
 * 우선순위: 침묵 > 골든타임 > 물러서기 > 기운충전 > 무라벨
 * (충·원진이 걸린 날은 아무리 다른 게 좋아도 연락하면 안 되는 날로 본다)
 */
function judgeDay(date, me, partner) {
  const dp = pillarsOfDate(date).day;
  const relPartner = pairRelation(dp.ji, partner.saju.day.ji);
  const relMe = pairRelation(dp.ji, me.saju.day.ji);
  const god = tenGodOfStem(me.saju.day.gan, dp.gan);
  const dayElement = BRANCH_TO_ELEMENT[dp.ji];

  let label = null;

  // 1) 침묵 — 상대 일지와 충·원진·형
  if (relPartner.chung || relPartner.wonjin || relPartner.hyeong) {
    label = DAY_LABELS.silence;
  }
  // 2) 골든타임 — 상대 일지와 합 + 그날 천간이 나에게 관/재/인성
  else if (
    (relPartner.sixHarmony || relPartner.threeHarmony) &&
    ["정관", "정재", "정인", "편재", "편관"].includes(god)
  ) {
    label = DAY_LABELS.golden;
  }
  // 3) 한 발 물러서기 — 내 일지가 흔들리거나 공망 걸린 날
  else if (relMe.chung || relMe.hyeong || (me.saju.gongMang || []).includes(dp.ji) || god === "겁재") {
    label = DAY_LABELS.step;
  }
  // 4) 기운 끌어올리기 — 용신 오행 날
  else if (dayElement === me.saju.yongshin?.yongshin || relMe.sixHarmony || relMe.threeHarmony) {
    label = DAY_LABELS.charge;
  }

  return {
    date: ymd(date),
    day: date.getDate(),
    weekday: date.getDay(),
    gan: dp.gan,
    ji: dp.ji,
    ganji: `${dp.gan}${dp.ji}`,
    ganjiHanja: `${CHEONGAN_MAP[dp.gan] || ""}${JIJI_MAP[dp.ji] || ""}`,
    tenGod: god,
    label: label ? label.key : null,
    labelText: label ? label.text : null,
    tone: label ? label.tone : null,
  };
}

/**
 * 접속한 달(= 사용자가 정보를 입력한 달) 하나만 달력으로 만든다.
 * 오늘부터 revealDays일까지만 라벨을 공개하고, 그 이후는 잠근다(리포트 유도).
 */
function buildContactCalendar(me, partner, revealDays = 7) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = ymd(start);

  const year = start.getFullYear();
  const month = start.getMonth() + 1;
  const lastDate = new Date(year, month, 0).getDate();

  // 오늘 ~ 이달 말일
  const days = [];
  for (let d = start.getDate(); d <= lastDate; d++) {
    const judged = judgeDay(new Date(year, month - 1, d), me, partner);
    judged.locked = days.length >= revealDays;
    days.push(judged);
  }

  // 달력 그리드
  const cells = [];
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) cells.push(null);

  for (let d = 1; d <= lastDate; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hit = days.find((x) => x.date === key);
    if (hit) {
      cells.push({ ...hit, isToday: key === todayKey });
    } else {
      // 오늘 이전 = 지나간 날
      cells.push({ date: key, day: d, weekday: new Date(year, month - 1, d).getDay(), past: true });
    }
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const golden = days.filter((d) => d.label === "golden");
  const nextGolden = golden[0] || null;
  const dday = nextGolden ? Math.round((new Date(nextGolden.date) - start) / 86400000) : null;

  return {
    month: { year, month, label: `${year}년 ${month}월`, weeks },
    days,
    legend: Object.values(DAY_LABELS),
    revealDays,
    lockedCount: days.filter((d) => d.locked && d.label).length,
    goldenCount: golden.length,
    silenceCount: days.filter((d) => d.label === "silence").length,
    nextGolden,
    dday,
    ddayText: dday === null ? null : dday === 0 ? "D-DAY" : `D-${dday}`,
  };
}

/* ────────────────────────── #5 두 사람의 사주팔자 표 ────────────────────────── */

function pillarRows(person) {
  const s = person.saju;
  return [
    { label: "시주", gan: s.hour?.gan, ji: s.hour?.ji },
    { label: "일주", gan: s.day.gan,   ji: s.day.ji, isDay: true },
    { label: "월주", gan: s.month.gan, ji: s.month.ji },
    { label: "년주", gan: s.year.gan,  ji: s.year.ji },
  ].map((row) => ({
    ...row,
    ganHanja: row.gan ? CHEONGAN_MAP[row.gan] : null,
    jiHanja: row.ji ? JIJI_MAP[row.ji] : null,
    ganElement: row.gan ? STEM_TO_ELEMENT[row.gan] : null,
    jiElement: row.ji ? BRANCH_TO_ELEMENT[row.ji] : null,
    ganGod: row.gan ? tenGodOfStem(s.day.gan, row.gan) : null,
    jiGod: row.ji ? tenGodOfBranch(s.day.gan, row.ji) : null,
    stage: row.ji ? twelveStage(s.day.gan, row.ji) : null,
  }));
}

function buildPillarTable(person) {
  const s = person.saju;
  return {
    name: person.name,
    gender: person.gender,
    rows: pillarRows(person),
    dayPillar: `${s.day.gan}${s.day.ji}`,
    dayPillarHanja: `${CHEONGAN_MAP[s.day.gan]}${JIJI_MAP[s.day.ji]}`,
    zodiac: s.zodiac,
    strength: s.strength?.label,
    yongshin: s.yongshin?.yongshin,
    elements: elementEntries(s.fiveElementsWeighted).map(([key, value]) => ({ key, value })),
    isUnknownTime: s.isUnknownTime,
  };
}

/* ────────────────────────── #8 레이더차트 좌표 ────────────────────────── */

function buildRadarChart(axes) {
  const cx = 120;
  const cy = 118;
  const radius = 84;
  const n = axes.length;

  const point = (i, ratio) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x: +(cx + Math.cos(angle) * radius * ratio).toFixed(1),
      y: +(cy + Math.sin(angle) * radius * ratio).toFixed(1),
    };
  };

  const points = axes.map((a, i) => ({ ...a, ...point(i, a.value / 100) }));
  const axisLines = axes.map((a, i) => ({ ...point(i, 1), label: a.label }));
  const labelPoints = axes.map((a, i) => {
    const p = point(i, 1.2);
    return {
      label: a.label,
      value: a.value,
      x: p.x,
      y: p.y,
      anchor: p.x > cx + 6 ? "start" : p.x < cx - 6 ? "end" : "middle",
    };
  });

  const rings = [0.25, 0.5, 0.75, 1].map((r) => ({
    ratio: r,
    path: `M${axes.map((_, i) => { const p = point(i, r); return `${p.x},${p.y}`; }).join(" L")} Z`,
  }));

  return {
    viewBox: "0 0 240 250",
    cx, cy, radius,
    polygonPath: `M${points.map((p) => `${p.x},${p.y}`).join(" L")} Z`,
    points,
    axisLines,
    labelPoints,
    rings,
  };
}

/* ────────────────────────────── 최종 조립 ────────────────────────────── */

/**
 * 재회사주 랜딩에 필요한 모든 실계산 값을 한 번에 만든다.
 * @param {object} userInfo - input 폼(req.body) 그대로. name/gender/birthdate/birthTime +
 *                            partnerName/partnerGender/partnerBirthdate/partnerBirthTime
 */
export function buildReunionAnalysis(userInfo = {}) {
  const meRaw = normalizePerson(userInfo, "나");
  const partnerRaw = normalizePerson(
    {
      name: userInfo.partnerName,
      gender: userInfo.partnerGender,
      birthDate: userInfo.partnerBirthdate || userInfo.partnerBirthDate,
      birthTime: userInfo.partnerBirthTime,
    },
    "그 사람"
  );

  const me = { ...meRaw, saju: getFourPillars(meRaw) };
  const partner = { ...partnerRaw, saju: getFourPillars(partnerRaw) };

  // ── 레이더 6축
  const compatibility = scoreCompatibility(me, partner);
  const attachment = scoreAttachment(me, partner);
  const instability = scoreInstability(me, partner);
  const marriage = scoreMarriage(me, partner);
  const regret = scoreRegretCycle(partner);

  const months = buildMonthlyLuck(me, partner);
  const timeline = buildTimelineChart(months);
  const reunionLuck = timeline.peak.score;

  const axes = [
    { key: "compatibility", label: "궁합",     value: compatibility },
    { key: "attachment",    label: "미련",     value: attachment },
    { key: "reunion",       label: "재회운",   value: reunionLuck },
    { key: "marriage",      label: "결혼운",   value: marriage },
    { key: "regret",        label: "후회주기", value: regret.score },
    // 관계불안은 낮을수록 좋으므로 차트에서는 '관계안정'으로 뒤집어 표시한다
    { key: "stability",     label: "관계안정", value: clamp(100 - instability, 5, 95) },
  ];

  // ── #1 재회 확률
  const rawProbability =
    compatibility * 0.30 +
    attachment * 0.30 +
    reunionLuck * 0.25 +
    marriage * 0.15 -
    instability * 0.15;
  const probability = clamp(rawProbability, 31, 89);

  const calendar = buildContactCalendar(me, partner);

  /**
   * "○○하면 확률이 N% 올라갑니다" — 가려서 보여줄 행동 제안.
   * N은 지금 확률과 12개월 중 정점 사이의 실제 격차에서 뽑는다.
   */
  const boostPercent = clamp(Math.max(12, timeline.peak.score - probability), 12, 38);
  const goldenDate = calendar.nextGolden
    ? `${Number(calendar.nextGolden.date.slice(5, 7))}월 ${Number(calendar.nextGolden.date.slice(8, 10))}일`
    : timeline.peak.label;
  const boostAction = calendar.nextGolden
    ? `${goldenDate} ${calendar.nextGolden.ganji}일에 먼저 연락하면`
    : `${timeline.peak.label}의 ${timeline.peak.tenGod} 흐름을 타면`;

  /** "이 ○○ 지키면 재회할 수 있습니다" — 가려서 보여줄 금기 구간 */
  const firstSilence = calendar.days.find((d) => d.label === "silence");
  const silenceRule = firstSilence
    ? `${Number(firstSilence.date.slice(5, 7))}월 ${Number(firstSilence.date.slice(8, 10))}일 전후 ${calendar.silenceCount}일만`
    : `연락을 멈춰야 하는 날만`;

  // ── 카피 치환용 동적 값
  const dayRel = pairRelation(me.saju.day.ji, partner.saju.day.ji);
  const keyword = dayRel.chung ? "충(沖)"
    : dayRel.wonjin ? "원진(怨嗔)"
    : dayRel.sixHarmony ? "육합(六合)"
    : dayRel.threeHarmony ? "삼합(三合)"
    : dayRel.hyeong ? "형(刑)"
    : `${me.saju.yongshin?.yongshin || ""}(用神)`;

  return {
    me: {
      name: me.name,
      gender: me.gender,
      table: buildPillarTable(me),
      dayPillar: `${me.saju.day.gan}${me.saju.day.ji}`,
      strength: me.saju.strength?.label,
      yongshin: me.saju.yongshin?.yongshin,
    },
    partner: {
      name: partner.name,
      gender: partner.gender,
      table: buildPillarTable(partner),
      dayPillar: `${partner.saju.day.gan}${partner.saju.day.ji}`,
      strength: partner.saju.strength?.label,
    },
    probability,
    scores: { compatibility, attachment, instability, marriage, regret: regret.score, reunionLuck },
    regretYear: regret.year,
    regretTenGod: regret.tenGod,
    radar: buildRadarChart(axes),
    axes,
    months,
    timeline,
    calendar,
    keyword,
    boost: { action: boostAction, percent: boostPercent },
    silenceRule,
    relation: dayRel,
    /** GPT 리포트·디버깅용 스냅샷 */
    snapshot: {
      probability,
      myDayPillar: `${me.saju.day.gan}${me.saju.day.ji}`,
      partnerDayPillar: `${partner.saju.day.gan}${partner.saju.day.ji}`,
      peakMonth: timeline.peak.label,
      peakScore: timeline.peak.score,
      worstMonth: timeline.bottom.label,
      nextGolden: calendar.nextGolden?.date || null,
      keyword,
      axes: axes.map((a) => `${a.label}:${a.value}`).join(", "),
    },
  };
}

export default { buildReunionAnalysis };
