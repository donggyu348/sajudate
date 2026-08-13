// src/framework/web/service/charmSajuService.js
//
// 매혹사주 랜딩(#1 매혹지수 · #4 함락 캘린더 · #5 사주팔자 표 · #7 매혹운 곡선 · #8 레이더차트)이
// 공유하는 실제 사주 계산 서비스.
//
// reunionSajuService와 같은 규약이지만 **본인 한 사람의 원국만** 본다.
// (재회사주는 두 사람 대조, 매혹사주는 "내가 가진 무기"를 뜯어보는 상품이다)
//
// - 원국(사주팔자·오행·십성·십이운성·용신·공망·신살)은 sajuCalService.getFourPillars() 재사용
// - 오늘 이후의 일진(日辰)·월주는 절기 정확도가 필요하므로 lunar-javascript로 계산한다
// - 차트는 reaperChartService·reunionSajuService와 동일 규약: SVG 좌표·path까지 서버에서 만든다

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

/** 지지 관계 — 내 일지와 그날/그달 지지의 교차 판정용 */
const SIX_HARMONY   = { 자:"축", 축:"자", 인:"해", 해:"인", 묘:"술", 술:"묘", 진:"유", 유:"진", 사:"신", 신:"사", 오:"미", 미:"오" };
const CHUNG_PAIRS   = { 자:"오", 오:"자", 축:"미", 미:"축", 인:"신", 신:"인", 묘:"유", 유:"묘", 진:"술", 술:"진", 사:"해", 해:"사" };
const WONJIN_PAIRS  = { 자:"미", 미:"자", 축:"오", 오:"축", 인:"유", 유:"인", 묘:"신", 신:"묘", 진:"해", 해:"진", 사:"술", 술:"사" };
const HAE_PAIRS     = { 자:"미", 미:"자", 축:"오", 오:"축", 인:"사", 사:"인", 묘:"진", 진:"묘", 신:"해", 해:"신", 유:"술", 술:"유" };
const PA_PAIRS      = { 자:"유", 유:"자", 묘:"오", 오:"묘", 진:"축", 축:"진", 사:"신", 신:"사", 술:"미", 미:"술", 해:"인", 인:"해" };
const HYEONG_PAIRS  = { 인:"사", 사:"신", 신:"인", 축:"술", 술:"미", 미:"축", 자:"묘", 묘:"자" };

const THREE_HARMONY_GROUPS = [
  ["신", "자", "진"],
  ["해", "묘", "미"],
  ["인", "오", "술"],
  ["사", "유", "축"],
];

/** 도화(桃花) — 일지/년지 기준 삼합국의 왕지 */
const DOHWA_BY_GROUP = { 신:"유", 자:"유", 진:"유", 해:"자", 묘:"자", 미:"자", 인:"묘", 오:"묘", 술:"묘", 사:"오", 유:"오", 축:"오" };
/** 홍염(紅艶) — 일간 기준 */
const HONGYEOM_BY_GAN = { 갑:"오", 을:"오", 병:"인", 정:"미", 무:"진", 기:"진", 경:"술", 신:"유", 임:"자", 계:"신" };

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

/**
 * '상대 십성' — 내가 끌어당기고 다뤄야 할 이성.
 * 여자는 관성(정관·편관), 남자는 재성(정재·편재)이 상대 자리다.
 */
function targetGods(gender) {
  return gender === "여" ? ["정관", "편관"] : ["정재", "편재"];
}

function elementEntries(el) {
  return ["목", "화", "토", "금", "수"].map((k) => [k, Number(el?.[k]) || 0]);
}
function dominantElement(el) { return elementEntries(el).sort((a, b) => b[1] - a[1])[0][0]; }

/** 원국 전체(년·월·일·시 천간+지지)에서 특정 십성이 몇 개인지 */
function countTenGods(person, types) {
  const s = person.saju;
  const gans = [s.year?.gan, s.month?.gan, s.day?.gan, s.hour?.gan].filter(Boolean);
  const jis  = [s.year?.ji, s.month?.ji, s.day?.ji, s.hour?.ji].filter(Boolean);
  let n = 0;
  gans.forEach((g) => { if (types.includes(tenGodOfStem(s.day.gan, g))) n++; });
  jis.forEach((j) => { if (types.includes(tenGodOfBranch(s.day.gan, j))) n++; });
  return n;
}

/** 원국 지지 전체 */
function allBranches(person) {
  const s = person.saju;
  return [s.year?.ji, s.month?.ji, s.day?.ji, s.hour?.ji].filter(Boolean);
}

/** 도화·홍염 보유 여부 (신살 배열이 비어 있어도 직접 판정한다) */
function charmStars(person) {
  const s = person.saju;
  const gods = Array.isArray(s.gods12) ? s.gods12 : [];
  const branches = allBranches(person);

  const dohwaTarget = DOHWA_BY_GROUP[s.day.ji] || DOHWA_BY_GROUP[s.year?.ji];
  const hongyeomTarget = HONGYEOM_BY_GAN[s.day.gan];

  const dohwa = gods.includes("도화") || (dohwaTarget ? branches.includes(dohwaTarget) : false);
  const hongyeom = gods.includes("홍염") || (hongyeomTarget ? branches.includes(hongyeomTarget) : false);

  return {
    dohwa,
    hongyeom,
    dohwaBranch: dohwa ? dohwaTarget : null,
    hongyeomBranch: hongyeom ? hongyeomTarget : null,
    count: (dohwa ? 1 : 0) + (hongyeom ? 1 : 0),
  };
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, Math.round(v))); }

/* ────────── 절기 정확도가 필요한 일진·월주 (lunar-javascript) ────────── */

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

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/* ────────────────────────── #8 레이더차트 6축 산출 ────────────────────────── */

/**
 * 매혹력 — 도화·홍염, 일지의 왕지 여부, 식상(끼)
 * "가만히 있어도 눈이 가는 힘"
 */
function scoreAllure(me) {
  let s = 42;
  const stars = me.stars;
  if (stars.dohwa) s += 16;
  if (stars.hongyeom) s += 14;

  // 자오묘유(왕지)가 일지에 앉으면 존재감 자체가 세다
  if (["자", "오", "묘", "유"].includes(me.saju.day.ji)) s += 10;

  s += Math.min(14, countTenGods(me, ["식신", "상관"]) * 5);

  // 화(火)·수(水)는 드러나는 매력, 토(土)는 은근한 매력
  const top = dominantElement(me.saju.fiveElementsWeighted);
  if (top === "화" || top === "수") s += 6;

  const stage = twelveStage(me.saju.day.gan, me.saju.day.ji);
  if (["제왕", "건록", "관대", "목욕"].includes(stage)) s += 8;
  if (["묘", "절", "사"].includes(stage)) s -= 8;

  return clamp(s, 5, 98);
}

/**
 * 장악력 — 상대(관성/재성)를 내 쪽으로 끌어와 쥐는 힘.
 * 신강할수록, 상대 십성을 감당할 그릇이 클수록 높다.
 */
function scoreGrip(me) {
  let s = 40;
  const strong = me.saju.strength?.label === "신강";

  if (strong) s += 16;
  else s -= 6;

  s += Math.min(18, countTenGods(me, targetGods(me.gender)) * 7);
  s += Math.min(10, countTenGods(me, ["비견", "겁재"]) * 3);

  // 편관(칠살)을 제어하는 식신 — 강한 남자를 다루는 무기
  if (countTenGods(me, ["편관"]) > 0 && countTenGods(me, ["식신"]) > 0) s += 12;

  // 일지가 내 용신이면 자리부터 유리하다
  if (BRANCH_TO_ELEMENT[me.saju.day.ji] === me.saju.yongshin?.yongshin) s += 8;

  return clamp(s, 5, 97);
}

/**
 * 화술 — 식신·상관. 말과 표정으로 상대를 움직이는 힘.
 */
function scoreTongue(me) {
  let s = 44;
  s += Math.min(22, countTenGods(me, ["상관"]) * 9);
  s += Math.min(14, countTenGods(me, ["식신"]) * 6);
  if (["목", "화"].includes(dominantElement(me.saju.fiveElementsWeighted))) s += 6;
  if (countTenGods(me, ["정인", "편인"]) >= 3) s -= 8;   // 인성 과다 = 말을 삼킨다
  return clamp(s, 5, 97);
}

/**
 * 애정운 — 상대 십성(관성/재성)의 양과 질.
 */
function scoreAffection(me) {
  let s = 42;
  const gods = targetGods(me.gender);
  const n = countTenGods(me, gods);

  if (n === 0) s -= 10;
  else s += Math.min(24, n * 8);

  // 정(正)이 있으면 안정적인 관계, 편(偏)만 있으면 굴곡이 크다
  const jeong = countTenGods(me, [gods[0]]);
  const pyeon = countTenGods(me, [gods[1]]);
  if (jeong > 0) s += 10;
  if (pyeon > 0 && jeong === 0) s -= 5;

  if (me.saju.spouse?.compatibility) s += 10;
  if ((me.saju.gongMang || []).includes(me.saju.day.ji)) s -= 10;   // 배우자궁 공망

  return clamp(s, 5, 97);
}

/**
 * 밀당 감각 — 당길 때와 놓을 때를 아는 감각.
 * 식상(밀기)과 인성(당기기)의 균형이 잡혀 있을수록 높다.
 */
function scorePush(me) {
  let s = 46;
  const push = countTenGods(me, ["식신", "상관"]);
  const pull = countTenGods(me, ["정인", "편인"]);
  const gap = Math.abs(push - pull);

  s += Math.max(0, 20 - gap * 7);
  if (push > 0 && pull > 0) s += 12;
  if (push === 0 && pull === 0) s -= 12;
  if (me.stars.dohwa) s += 6;
  if (countTenGods(me, ["겁재"]) >= 2) s -= 8;   // 겁재 과다 = 조급해진다

  return clamp(s, 5, 96);
}

/**
 * 집착도 — 낮을수록 좋다. 레이더에는 '여유'로 뒤집어 표시한다.
 */
function scoreObsession(me) {
  let s = 34;
  if (me.saju.strength?.label === "신약") s += 12;
  s += Math.min(16, countTenGods(me, ["편인"]) * 6);
  s += Math.min(14, countTenGods(me, ["편관"]) * 5);
  if (countTenGods(me, targetGods(me.gender)) === 0) s += 10;   // 없을수록 갈증이 커진다
  if (countTenGods(me, ["식신"]) > 0) s -= 10;
  if (me.saju.strength?.label === "신강") s -= 8;
  return clamp(s, 5, 94);
}

/* ────────────────────────── #7 시기별 매혹운 곡선 ────────────────────────── */

const MONTH_GOD_SCORE = {
  정관: 16, 편관: 14, 정재: 12, 편재: 12,
  식신: 12, 상관: 8,
  정인: 6, 편인: -2,
  비견: -3, 겁재: -12,
};

/** 이번 달부터 12개월간의 월별 매혹운 점수 */
function buildMonthlyLuck(me) {
  const today = new Date();
  const months = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 15);
    const mp = pillarsOfDate(d).month;

    let s = 50;
    s += MONTH_GOD_SCORE[tenGodOfStem(me.saju.day.gan, mp.gan)] ?? 0;

    // 월지와 내 일지의 관계 = 그달 내가 서 있는 자리
    const rel = pairRelation(mp.ji, me.saju.day.ji);
    if (rel.sixHarmony) s += 15;
    else if (rel.threeHarmony) s += 11;
    if (rel.chung) s -= 16;
    if (rel.wonjin) s -= 11;
    if (rel.hyeong) s -= 7;

    // 도화·홍염이 그달 지지로 들어오면 눈에 띄는 달
    if (me.stars.dohwaBranch && mp.ji === me.stars.dohwaBranch) s += 14;
    if (me.stars.hongyeomBranch && mp.ji === me.stars.hongyeomBranch) s += 12;

    // 그달 지지가 상대 십성이면 남자가 붙는 달
    if (targetGods(me.gender).includes(tenGodOfBranch(me.saju.day.gan, mp.ji))) s += 10;

    // 용신/기신
    const mEl = BRANCH_TO_ELEMENT[mp.ji];
    if (mEl === me.saju.yongshin?.yongshin) s += 9;
    if (mEl === me.saju.yongshin?.gishin) s -= 9;

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

/* ─────────────────────────── #4 함락 캘린더 ─────────────────────────── */

const DAY_LABELS = {
  golden:  { key: "golden",  text: "함락일 · 그가 무너지는 날",  tone: "golden" },
  silence: { key: "silence", text: "연락하면 안 되는 날",        tone: "silence" },
  step:    { key: "step",    text: "한 발 물러서야 할 때",       tone: "step" },
  charge:  { key: "charge",  text: "매력을 끌어올리는 기간",      tone: "charge" },
};

/**
 * 하루치 판정.
 * 우선순위: 금기 > 함락일 > 물러서기 > 매력충전 > 무라벨
 */
function judgeDay(date, me) {
  const dp = pillarsOfDate(date).day;
  const rel = pairRelation(dp.ji, me.saju.day.ji);
  const god = tenGodOfStem(me.saju.day.gan, dp.gan);
  const jiGod = tenGodOfBranch(me.saju.day.gan, dp.ji);
  const dayElement = BRANCH_TO_ELEMENT[dp.ji];
  const isTargetDay = targetGods(me.gender).includes(god) || targetGods(me.gender).includes(jiGod);

  let label = null;

  // 1) 금기 — 내 일지가 충·원진·형으로 흔들리는 날
  if (rel.chung || rel.wonjin || rel.hyeong) {
    label = DAY_LABELS.silence;
  }
  // 2) 함락일 — 일지가 합으로 붙고 그날 기운이 상대 십성이거나 도화가 들어온 날
  else if (
    (rel.sixHarmony || rel.threeHarmony) &&
    (isTargetDay || dp.ji === me.stars.dohwaBranch || dp.ji === me.stars.hongyeomBranch || ["식신", "상관"].includes(god))
  ) {
    label = DAY_LABELS.golden;
  }
  // 3) 한 발 물러서기 — 공망이거나 겁재가 드는 날
  else if ((me.saju.gongMang || []).includes(dp.ji) || god === "겁재" || rel.pa || rel.hae) {
    label = DAY_LABELS.step;
  }
  // 4) 매력 충전 — 용신 오행 날, 또는 합이 드는 날
  else if (dayElement === me.saju.yongshin?.yongshin || rel.sixHarmony || rel.threeHarmony) {
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
function buildCharmCalendar(me, revealDays = 7) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = ymd(start);

  const year = start.getFullYear();
  const month = start.getMonth() + 1;
  const lastDate = new Date(year, month, 0).getDate();

  const days = [];
  for (let d = start.getDate(); d <= lastDate; d++) {
    const judged = judgeDay(new Date(year, month - 1, d), me);
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

/* ────────────────────────── #5 사주팔자 표 ────────────────────────── */

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

/* ────────────────────── 내가 끌어당기는 남자 유형 ────────────────────── */

/**
 * 원국에서 가장 강하게 잡히는 상대 십성으로 "내 앞에 반복해서 나타나는 사람" 유형을 뽑는다.
 * 카피에 그대로 쓰이므로 문구는 짧고 단정적으로 둔다.
 */
const TARGET_TYPES = {
  정관: { key: "정관", title: "반듯하고 책임감 있는 사람", weak: "지루함", grip: "믿음을 주되 예측되지 않게" },
  편관: { key: "편관", title: "강하고 밀어붙이는 사람",   weak: "질투와 소유욕", grip: "한 발 물러서서 기다리게" },
  정재: { key: "정재", title: "성실하고 계산이 정확한 사람", weak: "안정에 대한 집착", grip: "손해 보는 척 내주며" },
  편재: { key: "편재", title: "화려하고 사람을 몰고 다니는 사람", weak: "새로움에 대한 갈증", grip: "붙잡지 않는 태도로" },
};

function judgeTargetType(me) {
  const gods = targetGods(me.gender);
  const counts = gods.map((g) => ({ god: g, n: countTenGods(me, [g]) }));
  counts.sort((a, b) => b.n - a.n);

  // 상대 십성이 아예 없으면 도화·홍염 유무로 갈라 준다
  if (counts[0].n === 0) {
    const fallback = me.stars.dohwa ? gods[1] : gods[0];
    return { ...TARGET_TYPES[fallback], absent: true };
  }
  return { ...TARGET_TYPES[counts[0].god], absent: false, count: counts[0].n };
}

/* ────────────────────────────── 최종 조립 ────────────────────────────── */

/**
 * 매혹사주 랜딩에 필요한 모든 실계산 값을 한 번에 만든다.
 * @param {object} userInfo - input 폼(req.body) 그대로. name/gender/birthdate/birthTime
 */
export function buildCharmAnalysis(userInfo = {}) {
  const meRaw = normalizePerson(userInfo, "나");
  const me = { ...meRaw, saju: getFourPillars(meRaw) };
  me.stars = charmStars(me);

  // ── 레이더 6축
  const allure = scoreAllure(me);
  const grip = scoreGrip(me);
  const tongue = scoreTongue(me);
  const affection = scoreAffection(me);
  const push = scorePush(me);
  const obsession = scoreObsession(me);

  const months = buildMonthlyLuck(me);
  const timeline = buildTimelineChart(months);

  const axes = [
    { key: "allure",    label: "매혹력",   value: allure },
    { key: "grip",      label: "장악력",   value: grip },
    { key: "tongue",    label: "화술",     value: tongue },
    { key: "affection", label: "애정운",   value: affection },
    { key: "push",      label: "밀당감각", value: push },
    // 집착은 낮을수록 좋으므로 차트에서는 '여유'로 뒤집어 표시한다
    { key: "ease",      label: "여유",     value: clamp(100 - obsession, 5, 95) },
  ];

  // ── #1 매혹지수
  const rawScore =
    allure * 0.32 +
    grip * 0.26 +
    tongue * 0.18 +
    affection * 0.14 +
    push * 0.10 -
    obsession * 0.12;
  const charmScore = clamp(rawScore, 34, 92);

  const calendar = buildCharmCalendar(me);
  const targetType = judgeTargetType(me);

  /** "○○하면 N% 올라갑니다" — 가려서 보여줄 행동 제안 */
  const boostPercent = clamp(Math.max(12, timeline.peak.score - charmScore), 12, 38);
  const goldenDate = calendar.nextGolden
    ? `${Number(calendar.nextGolden.date.slice(5, 7))}월 ${Number(calendar.nextGolden.date.slice(8, 10))}일`
    : timeline.peak.label;
  const boostAction = calendar.nextGolden
    ? `${goldenDate} ${calendar.nextGolden.ganji}일에 먼저 움직이면`
    : `${timeline.peak.label}의 ${timeline.peak.tenGod} 흐름을 타면`;

  /** "이 ○○만 지키면 넘어옵니다" — 가려서 보여줄 금기 구간 */
  const firstSilence = calendar.days.find((d) => d.label === "silence");
  const silenceRule = firstSilence
    ? `${Number(firstSilence.date.slice(5, 7))}월 ${Number(firstSilence.date.slice(8, 10))}일 전후 ${calendar.silenceCount}일만`
    : `연락을 멈춰야 하는 날만`;

  /** 카피 치환용 핵심 키워드 — 내 무기 한 단어 */
  const keyword = me.stars.hongyeom ? "홍염살(紅艶殺)"
    : me.stars.dohwa ? "도화살(桃花殺)"
    : countTenGods(me, ["상관"]) > 0 ? "상관(傷官)"
    : countTenGods(me, ["편관"]) > 0 ? "편관(偏官)"
    : `${me.saju.yongshin?.yongshin || ""}(用神)`;

  return {
    me: {
      name: me.name,
      gender: me.gender,
      table: buildPillarTable(me),
      dayPillar: `${me.saju.day.gan}${me.saju.day.ji}`,
      strength: me.saju.strength?.label,
      yongshin: me.saju.yongshin?.yongshin,
      stars: me.stars,
    },
    charmScore,
    scores: { allure, grip, tongue, affection, push, obsession, peakLuck: timeline.peak.score },
    radar: buildRadarChart(axes),
    axes,
    months,
    timeline,
    calendar,
    targetType,
    keyword,
    boost: { action: boostAction, percent: boostPercent },
    silenceRule,
    /** GPT 리포트·디버깅용 스냅샷 */
    snapshot: {
      charmScore,
      dayPillar: `${me.saju.day.gan}${me.saju.day.ji}`,
      strength: me.saju.strength?.label,
      yongshin: me.saju.yongshin?.yongshin,
      keyword,
      targetType: targetType.key,
      peakMonth: timeline.peak.label,
      peakScore: timeline.peak.score,
      worstMonth: timeline.bottom.label,
      nextGolden: calendar.nextGolden?.date || null,
      axes: axes.map((a) => `${a.label}:${a.value}`).join(", "),
    },
  };
}

export default { buildCharmAnalysis };
