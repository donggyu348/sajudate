// src/framework/web/service/SajuCalcService.js
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";
import { Solar } from "lunar-javascript";
import { JIJANGGAN_MAP, CHEONGAN_REVERSE } from "./toHanja.js";
dayjs.extend(utc);
dayjs.extend(tz);

const GAN = ["갑","을","병","정","무","기","경","신","임","계"];
const JI  = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
const ZODIAC = ["쥐띠","소띠","호랑이띠","토끼띠","용띠","뱀띠","말띠","양띠","원숭이띠","닭띠","개띠","돼지띠"];

const STEM_TO_ELEMENT = { "갑":"목","을":"목","병":"화","정":"화","무":"토","기":"토","경":"금","신":"금","임":"수","계":"수" };
const BRANCH_TO_ELEMENT = { "자":"수","축":"토","인":"목","묘":"목","진":"토","사":"화","오":"화","미":"토","신":"금","유":"금","술":"토","해":"수" };


const FIVE = { 목: 0, 화: 1, 토: 2, 금: 3, 수: 4 }; // 오행 순서
const YINYANG = { 갑: 1, 을: 0, 병: 1, 정: 0, 무: 1, 기: 0, 경: 1, 신: 0, 임: 1, 계: 0 }; // 양=1, 음=0

// diff별 십성 매핑 (0~4 단계)
const TEN_GOD = {
  0: ["비견","겁재"],   // 같은 오행
  1: ["식신","상관"],   // 내가 생하는 오행
  2: ["편재","정재"],   // 내가 극하는 오행 (재성)
  3: ["편관","정관"],   // 나를 극하는 오행 (관성)
  4: ["편인","정인"],   // 나를 생하는 오행 (인성)
};
// 🔹 시지 계산
// 🔹 시지 계산
function getHourBranchIndex(hour) {
  // hour = 0 ~ 23 (24시간제 시각)
  
  // 1. 시각을 23시(자시 시작)를 기준으로 0이 되도록 조정합니다.
  //    23시 -> 0, 0시 -> 1, 1시 -> 2, ..., 22시 -> 23
  let adjustedHour = (hour + 1) % 24; 

  // 2. 조정된 시각을 2시간 단위로 나누어 지지 인덱스 (0:자~11:해)를 계산합니다.
  return Math.floor(adjustedHour / 2);
}
// 🔹 연주
function getYearPillar(date) {
  const y = date.year();
  const ipchun = dayjs.tz(`${y}-02-04 05:00`, "Asia/Seoul");
  const baseYear = date.isBefore(ipchun) ? y - 1 : y;
  const offset = ((baseYear - 1984) % 60 + 60) % 60;
  return { gan: GAN[offset % 10], ji: JI[offset % 12] };
}
// 절기 기준 월 구하기
function getSolarTermMonth(date) {
  const year = date.year();
  const terms = [
    `${year}-02-04`, `${year}-03-06`, `${year}-04-05`, `${year}-05-06`,
    `${year}-06-06`, `${year}-07-07`, `${year}-08-08`, `${year}-09-08`,
    `${year}-10-08`, `${year}-11-07`, `${year}-12-07`, `${year+1}-01-06`
  ];

  for (let i=0;i<terms.length;i++){
    if(date.isBefore(dayjs(terms[i]))){
      return i === 0 ? 12 : i; // 입춘 이전은 전년도 12월(축월)
    }
  }
  return 12;
}
function getMonthPillar(date, yearGan) {
  const monthJis = ["인","묘","진","사","오","미","신","유","술","해","자","축"];
  const month = getSolarTermMonth(date) - 1;  // 0 index 맞춤
  const ji = monthJis[month];

  const firstMonthGanMap = {
    "갑":"병","기":"병",
    "을":"무","경":"무",
    "병":"경","신":"경",
    "정":"임","임":"임",
    "무":"갑","계":"갑",
  };
  const startGan = firstMonthGanMap[yearGan];
  const start = GAN.indexOf(startGan);
  const gan = GAN[(start + month) % 10];

  return { gan, ji };
}

function getDayPillar(date){

  function toJD(y,m,d){
    if(m<=2){y-=1;m+=12;}
    const A=Math.floor(y/100);
    const B=2-A+Math.floor(A/4);
    return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+B-1524.5;
  }

  const JD   = toJD(date.year(), date.month()+1, date.date());
  const base = toJD(1984,2,4);          // 기본 갑자 기준
  const OFF  = 4;                       // ← 🔥 네 사주 기준 확정 보정값

  const diff = (JD - base + OFF + 600000) % 60;

  return {
    gan: GAN[ diff % 10 ],
    ji : JI[ diff % 12 ]
  };
}




// 🔹 시주
function getHourPillar(date, dayGan) {
  const hour = date.hour();
  const branchIdx = getHourBranchIndex(hour);
  const ji = JI[branchIdx];

  const firstGanMap = {
    "갑":"갑","기":"갑",
    "을":"병","경":"병",
    "병":"무","신":"무",
    "정":"경","임":"경",
    "무":"임","계":"임"
  };
  const startGan = firstGanMap[dayGan];
  const startIdx = GAN.indexOf(startGan);

  const ganIndex = (startIdx + branchIdx) % 10;
return { gan: GAN[ganIndex], ji };}

function getZodiac(ji) { return ZODIAC[JI.indexOf(ji)]; }

function countFiveElements(p) {
  const total = { 목:0, 화:0, 토:0, 금:0, 수:0 };
  const allGan = [p.year.gan, p.month.gan, p.day.gan, p.hour.gan];
  const allJi  = [p.year.ji,  p.month.ji,  p.day.ji,  p.hour.ji];
  for (const g of allGan) if (g && STEM_TO_ELEMENT[g]) total[STEM_TO_ELEMENT[g]]++;
  for (const j of allJi) if (j && BRANCH_TO_ELEMENT[j]) total[BRANCH_TO_ELEMENT[j]]++;
  return total;
}

function countFiveElementsWeighted(pillars) {
  const total = { 목:0, 화:0, 토:0, 금:0, 수:0 };
  const weights = [1.0, 0.5, 0.3];

  for (const g of [pillars.year.gan, pillars.month.gan, pillars.day.gan, pillars.hour.gan]) {
    if (g && STEM_TO_ELEMENT[g]) total[STEM_TO_ELEMENT[g]] += 1.0;
  }

  for (const ji of [pillars.year.ji, pillars.month.ji, pillars.day.ji, pillars.hour.ji]) {
    if (!ji) continue;
    const hidden = JIJANGGAN_MAP[ji] || [];
    hidden.forEach((hanjaGan, idx) => {
      const ganHangul = CHEONGAN_REVERSE[hanjaGan];
      const elem = STEM_TO_ELEMENT[ganHangul];
      if (elem) total[elem] += weights[idx] ?? 0.3;
    });
  }

  Object.keys(total).forEach((k) => { total[k] = Math.round(total[k] * 10) / 10; });
  return total;
}

const TWELVE_STAGE_TABLE = {
  갑: ["목욕","관대","건록","제왕","쇠","병","사","묘","절","태","양","장생"],
  병: ["태","양","장생","목욕","관대","건록","제왕","쇠","병","사","묘","절"],
  무: ["태","양","장생","목욕","관대","건록","제왕","쇠","병","사","묘","절"],
  경: ["사","묘","절","태","양","장생","목욕","관대","건록","제왕","쇠","병"],
  임: ["병","사","묘","절","태","양","장생","목욕","관대","건록","제왕","쇠"],
};
const TWELVE_STAGE_YIN = { 을:"갑", 정:"병", 기:"무", 신:"경", 계:"임" };

function getTwelveStage(dayGan, targetJi) {
  if (!dayGan || !targetJi) return null;
  const jiOrder = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
  const jiIdx = jiOrder.indexOf(targetJi);
  if (jiIdx === -1) return null;

  let baseGan = dayGan;
  let isYin = false;
  if (TWELVE_STAGE_YIN[dayGan]) {
    baseGan = TWELVE_STAGE_YIN[dayGan];
    isYin = true;
  }

  const stages = TWELVE_STAGE_TABLE[baseGan];
  if (!stages) return null;
  return isYin ? stages[(12 - jiIdx) % 12] : stages[jiIdx];
}

const STEM_COMBINE = { 갑:"기", 기:"갑", 을:"경", 경:"을", 병:"신", 신:"병", 정:"임", 임:"정", 무:"계", 계:"무" };
const STEM_COMBINE_ELEMENT = { 갑:"토", 을:"금", 병:"수", 정:"목", 무:"화", 기:"토", 경:"금", 신:"수", 임:"목", 계:"화" };
const SIX_HARMONY = { 자:"축", 축:"자", 인:"해", 해:"인", 묘:"술", 술:"묘", 진:"유", 유:"진", 사:"신", 신:"사", 오:"미", 미:"오" };
const SIX_HARMONY_ELEMENT = { 자:"토", 축:"토", 인:"목", 해:"목", 묘:"화", 술:"화", 진:"금", 유:"금", 사:"수", 신:"수" };
const THREE_HARMONY_GROUPS = [
  { members:["신","자","진"], element:"수" },
  { members:["해","묘","미"], element:"목" },
  { members:["인","오","술"], element:"화" },
  { members:["사","유","축"], element:"금" },
];
const DIRECTIONAL_GROUPS = [
  { members:["인","묘","진"], element:"목" },
  { members:["사","오","미"], element:"화" },
  { members:["신","유","술"], element:"금" },
  { members:["해","자","축"], element:"수" },
];
const CHUNG_PAIRS = { 자:"오", 오:"자", 축:"미", 미:"축", 인:"신", 신:"인", 묘:"유", 유:"묘", 진:"술", 술:"진", 사:"해", 해:"사" };
const PAE_PAIRS = { 자:"유", 유:"자", 묘:"오", 오:"묘", 진:"축", 축:"진", 사:"신", 신:"사", 술:"미", 미:"술", 해:"인", 인:"해" };
const HAE_PAIRS = { 자:"미", 미:"자", 축:"오", 오:"축", 인:"사", 사:"인", 묘:"진", 진:"묘", 신:"해", 해:"신", 유:"술", 술:"유" };
const WONJIN_PAIRS = { 자:"미", 미:"자", 축:"오", 오:"축", 인:"유", 유:"인", 묘:"신", 신:"묘", 진:"해", 해:"진", 사:"술", 술:"사" };

function getStemCombine(ganList) {
  const results = [];
  for (let i = 0; i < ganList.length; i++) {
    for (let j = i + 1; j < ganList.length; j++) {
      if (STEM_COMBINE[ganList[i]] === ganList[j]) {
        results.push({ a: ganList[i], b: ganList[j], resultElement: STEM_COMBINE_ELEMENT[ganList[i]] });
      }
    }
  }
  return results;
}

function getSixHarmony(jiList) {
  const results = [];
  const seen = new Set();
  for (let i = 0; i < jiList.length; i++) {
    for (let j = i + 1; j < jiList.length; j++) {
      if (SIX_HARMONY[jiList[i]] === jiList[j]) {
        const key = [jiList[i], jiList[j]].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ a: jiList[i], b: jiList[j], element: SIX_HARMONY_ELEMENT[jiList[i]] });
        }
      }
    }
  }
  return results;
}

function getThreeHarmony(jiList) {
  return THREE_HARMONY_GROUPS.filter((g) => {
    const count = g.members.filter((m) => jiList.includes(m)).length;
    return count >= 2;
  }).map((g) => ({ members: g.members.filter((m) => jiList.includes(m)), element: g.element, full: g.members }));
}

function getDirectional(jiList) {
  return DIRECTIONAL_GROUPS.filter((g) => {
    const count = g.members.filter((m) => jiList.includes(m)).length;
    return count >= 2;
  }).map((g) => ({ members: g.members.filter((m) => jiList.includes(m)), element: g.element, full: g.members }));
}

function getChung(jiList) {
  const results = [];
  const seen = new Set();
  for (let i = 0; i < jiList.length; i++) {
    for (let j = i + 1; j < jiList.length; j++) {
      if (CHUNG_PAIRS[jiList[i]] === jiList[j]) {
        const key = [jiList[i], jiList[j]].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ a: jiList[i], b: jiList[j] });
        }
      }
    }
  }
  return results;
}

function getHyeong(jiList) {
  const results = [];
  const has = (arr) => arr.every((j) => jiList.includes(j));
  if (has(["인","사","신"])) results.push({ type: "삼형", members: ["인","사","신"] });
  if (has(["축","술","미"])) results.push({ type: "삼형", members: ["축","술","미"] });
  if (jiList.includes("자") && jiList.includes("묘")) results.push({ type: "상형", members: ["자","묘"] });
  for (const j of ["진","오","유","해"]) {
    if (jiList.filter((x) => x === j).length >= 2) results.push({ type: "자형", members: [j, j] });
  }
  return results;
}

function getPa(jiList) {
  const results = [];
  const seen = new Set();
  for (let i = 0; i < jiList.length; i++) {
    for (let j = i + 1; j < jiList.length; j++) {
      if (PAE_PAIRS[jiList[i]] === jiList[j]) {
        const key = [jiList[i], jiList[j]].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ a: jiList[i], b: jiList[j] });
        }
      }
    }
  }
  return results;
}

function getHae(jiList) {
  const results = [];
  const seen = new Set();
  for (let i = 0; i < jiList.length; i++) {
    for (let j = i + 1; j < jiList.length; j++) {
      if (HAE_PAIRS[jiList[i]] === jiList[j]) {
        const key = [jiList[i], jiList[j]].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ a: jiList[i], b: jiList[j] });
        }
      }
    }
  }
  return results;
}

function getWonjin(jiList) {
  const results = [];
  const seen = new Set();
  for (let i = 0; i < jiList.length; i++) {
    for (let j = i + 1; j < jiList.length; j++) {
      if (WONJIN_PAIRS[jiList[i]] === jiList[j]) {
        const key = [jiList[i], jiList[j]].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ a: jiList[i], b: jiList[j] });
        }
      }
    }
  }
  return results;
}

export function getJijiRelations(pillars) {
  const jiList = [pillars.year.ji, pillars.month.ji, pillars.day.ji, pillars.hour.ji].filter(Boolean);
  const ganList = [pillars.year.gan, pillars.month.gan, pillars.day.gan, pillars.hour.gan].filter(Boolean);
  return {
    stemCombine: getStemCombine(ganList),
    sixHarmony: getSixHarmony(jiList),
    threeHarmony: getThreeHarmony(jiList),
    directional: getDirectional(jiList),
    chung: getChung(jiList),
    hyeong: getHyeong(jiList),
    pa: getPa(jiList),
    hae: getHae(jiList),
    wonjin: getWonjin(jiList),
  };
}

function getGanZhiIndex(gan, ji) {
  for (let i = 0; i < 60; i++) {
    if (GAN[i % 10] === gan && JI[i % 12] === ji) return i;
  }
  return -1;
}

const GONGMANG_BY_XUN = [
  ["술","해"], ["신","유"], ["오","미"], ["진","사"], ["인","묘"], ["자","축"],
];

function getGongMangBranches(dayGan, dayJi) {
  const idx = getGanZhiIndex(dayGan, dayJi);
  if (idx < 0) return [];
  return GONGMANG_BY_XUN[Math.floor(idx / 10)] ?? [];
}

function generateWolWoon(startYear, count = 3) {
  const result = [];
  const monthJis = ["인","묘","진","사","오","미","신","유","술","해","자","축"];
  const firstMonthGanMap = {
    갑:"병", 기:"병", 을:"무", 경:"무", 병:"경", 신:"경",
    정:"임", 임:"임", 무:"갑", 계:"갑",
  };

  for (let y = startYear; y < startYear + count; y++) {
    const yearOffset = ((y - 1984) % 60 + 60) % 60;
    const yearGan = GAN[yearOffset % 10];
    const startGan = firstMonthGanMap[yearGan];
    const startIdx = GAN.indexOf(startGan);

    for (let m = 0; m < 12; m++) {
      result.push({
        year: y,
        month: m + 1,
        gan: GAN[(startIdx + m) % 10],
        ji: monthJis[m],
      });
    }
  }
  return result;
}

const GENERATE = { 목:"화", 화:"토", 토:"금", 금:"수", 수:"목" };
const CONTROL  = { 목:"토", 화:"금", 토:"수", 금:"목", 수:"화" };

function getStrength(dayGan, pillars, fiveElementsWeighted) {
  const dayElem = STEM_TO_ELEMENT[dayGan];
  const inseongElem = Object.keys(GENERATE).find((k) => GENERATE[k] === dayElem);

  const supporting = (fiveElementsWeighted[dayElem] || 0)
    + (fiveElementsWeighted[inseongElem] || 0);

  const weakening = (fiveElementsWeighted[GENERATE[dayElem]] || 0)
    + (fiveElementsWeighted[CONTROL[dayElem]] || 0)
    + (fiveElementsWeighted[Object.keys(CONTROL).find((k) => CONTROL[k] === dayElem)] || 0);

  const monthElem = BRANCH_TO_ELEMENT[pillars.month.ji];
  const seasonBonus = monthElem === dayElem ? 2 : (GENERATE[monthElem] === dayElem ? 1 : 0);

  const score = (supporting + seasonBonus) - weakening;
  return {
    score,
    isStrong: score > 0,
    label: score > 2 ? "신강" : score < -2 ? "신약" : "중화",
  };
}

function getYongshin(dayGan, strength, fiveElementsWeighted) {
  const dayElem = STEM_TO_ELEMENT[dayGan];
  const inseong = Object.keys(GENERATE).find((k) => GENERATE[k] === dayElem);

  let candidates;
  if (strength.isStrong) {
    candidates = [GENERATE[dayElem], CONTROL[dayElem],
      Object.keys(CONTROL).find((k) => CONTROL[k] === dayElem)];
  } else {
    candidates = [dayElem, inseong];
  }

  candidates = candidates.filter(Boolean);
  const yongshin = candidates.sort((a, b) => (fiveElementsWeighted[a] || 0) - (fiveElementsWeighted[b] || 0))[0];
  const gishin = CONTROL[yongshin];
  const heeshin = GENERATE[Object.keys(GENERATE).find((k) => GENERATE[k] === yongshin)];

  return { yongshin, gishin, heeshin };
}

// 🔹 십성 계산 (일간 기준, 대상 천간 → 십성)
function getTenGod(dayGan, targetGan) {
  const mainElem = STEM_TO_ELEMENT[dayGan];     // 일간 오행
  const subElem  = STEM_TO_ELEMENT[targetGan];  // 대상 오행
  if (!mainElem || !subElem) return null;

  const mainIdx = FIVE[mainElem];
  const subIdx  = FIVE[subElem];

  // 오행 위치 차이 (0~4)
  const diff = (subIdx - mainIdx + 5) % 5;

  // 음양 동일 여부 (정/편 구분)
  const sameYinYang = YINYANG[dayGan] === YINYANG[targetGan];

  const pair = TEN_GOD[diff];
  if (!pair) return null;
  return pair[sameYinYang ? 0 : 1];  // 0: 정(비견/식신/편재/편관/편인), 1: 편(겁재/상관/정재/정관/정인) 구조
}

function getTenGodFromBranch(dayGan, ji) {
  const elem = BRANCH_TO_ELEMENT[ji];
  if (!elem) return null;

  const mainElem = STEM_TO_ELEMENT[dayGan];
  const mainIdx = FIVE[mainElem];
  const subIdx = FIVE[elem];
  const diff = (subIdx - mainIdx + 5) % 5;

  const JI_YINYANG = { 자:1, 인:1, 진:1, 오:1, 신:1, 술:1, 축:0, 묘:0, 사:0, 미:0, 유:0, 해:0 };
  const sameYY = YINYANG[dayGan] === JI_YINYANG[ji];
  return TEN_GOD[diff]?.[sameYY ? 0 : 1] ?? null;
}

/** 성별 표기 정규화 — 폼은 "남성"/"여성"을 보내고, 코드 곳곳은 "남"/"여"를 쓴다. */
function normalizeGenderKo(gender) {
  const g = String(gender ?? "").trim();
  if (g.startsWith("남") || /^(m|male)$/i.test(g)) return "남";
  if (g.startsWith("여") || /^(f|female|w|woman)$/i.test(g)) return "여";
  return "여";
}

/** 양간(陽干) — 갑·병·무·경·임. 신(辛)은 음간이므로 넣으면 안 된다. */
const YANG_STEMS = ["갑", "병", "무", "경", "임"];

/**
 * 대운 방향과 시작 나이.
 *
 * 방향: 남자+양년간 / 여자+음년간 → 순행, 그 반대는 역행.
 * 시작 나이: 순행이면 다음 절기까지, 역행이면 직전 절기까지의 일수를 3으로 나눈다
 *            (3일 = 1년). 절기는 입춘 하나가 아니라 12절기 전부가 기준이므로
 *            lunar-javascript의 절기표로 계산한다.
 *
 * @returns {{ startAge:number, startAgeExact:number, isForward:boolean }}
 *          startAgeExact는 소수점을 살린 값으로, 대운 구간 경계 판정에 쓴다.
 */
function getDaewoonStartAge(date, gender, yearGan) {
  const g = normalizeGenderKo(gender);
  const isYangYear = YANG_STEMS.includes(yearGan);
  // 남양여음 순행 / 남음여양 역행
  const isForward = (g === "남" && isYangYear) || (g === "여" && !isYangYear);

  const startAgeExact = getDaewoonStartAgeExact(date, isForward);

  return {
    startAge: Math.max(1, Math.round(startAgeExact)),
    startAgeExact,
    isForward,
  };
}

/**
 * 출생 시각에서 인접 절기까지의 거리를 나이로 환산한다(3일 = 1년).
 * lunar-javascript의 절기표를 쓰므로 달마다 다른 절기 날짜가 정확히 반영된다.
 */
function getDaewoonStartAgeExact(date, isForward) {
  const birthMs = date.valueOf();

  try {
    const solar = Solar.fromYmdHms(
      date.year(), date.month() + 1, date.date(),
      date.hour(), date.minute(), 0
    );
    // 절기표는 해를 걸쳐 있으므로 전년·당해·다음해를 모두 모은다
    const marks = [];
    for (const yy of [date.year() - 1, date.year(), date.year() + 1]) {
      const table = Solar.fromYmd(yy, 6, 1).getLunar().getJieQiTable();
      for (const name of Object.keys(table)) {
        // 節(월을 바꾸는 12절)만 대운 기준이다. 氣(중기)는 제외.
        if (!DAEWOON_JIE.has(name)) continue;
        const s = table[name];
        marks.push(new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), 0).getTime());
      }
    }
    marks.sort((a, b) => a - b);

    let targetMs = null;
    if (isForward) {
      targetMs = marks.find((t) => t > birthMs) ?? null;          // 다음 절기
    } else {
      const past = marks.filter((t) => t <= birthMs);
      targetMs = past.length ? past[past.length - 1] : null;      // 직전 절기
    }
    if (targetMs === null) throw new Error("절기를 찾지 못함");

    const diffDays = Math.abs(targetMs - birthMs) / 86400000;
    return diffDays / 3;   // 3일 = 1년
  } catch (e) {
    // 절기표를 못 읽으면 입춘 기준의 근사값으로 물러선다 (기존 동작)
    console.warn("대운수 절기 계산 실패, 입춘 근사로 대체:", e.message);
    const ipchun = dayjs.tz(`${date.year()}-02-04 05:00`, "Asia/Seoul");
    return Math.abs(dayjs(ipchun).diff(date, "day")) / 3;
  }
}

/** 대운 기준이 되는 12절(節). 중기(中氣)는 대운 계산에 쓰지 않는다. */
const DAEWOON_JIE = new Set([
  "立春", "驚蟄", "清明", "立夏", "芒種", "小暑",
  "立秋", "白露", "寒露", "立冬", "大雪", "小寒",
]);

/**
 * 대운 목록.
 *
 * 첫 대운은 월주 **다음**(순행) 또는 **이전**(역행) 간지다.
 * 월주 자체는 대운이 아니므로 목록에 넣으면 전체가 한 칸씩 밀린다.
 *
 * 나이 구간은 startAgeExact를 반올림해 서로 겹치지 않게 이어붙인다.
 */
function generateDaewoonList(monthPillar, startAgeExact, isForward, count = 8) {
  const list = [];
  const baseGan = GAN.indexOf(monthPillar.gan);
  const baseJi = JI.indexOf(monthPillar.ji);
  const step = isForward ? 1 : -1;

  for (let i = 0; i < count; i++) {
    const n = i + 1;   // 1번째 대운부터 시작 (월주 자신은 건너뛴다)
    const ganIndex = ((baseGan + step * n) % 10 + 10) % 10;
    const jiIndex = ((baseJi + step * n) % 12 + 12) % 12;

    const from = startAgeExact + i * 10;
    const to = startAgeExact + (i + 1) * 10;

    list.push({
      startAge: Math.max(0, Math.round(from)),
      endAge: Math.max(0, Math.round(to)) - 1,
      startAgeExact: from,
      endAgeExact: to,
      gan: GAN[ganIndex],
      ji: JI[jiIndex],
    });
  }
  return list;
}

/**
 * 만 나이로 현재 대운을 찾는다.
 * 첫 대운 전(유년기)이면 첫 대운을 돌려준다 — 호출부가 빈 값을 다루지 않아도 되게.
 */
export function findCurrentDaewoon(daewoonList, age) {
  if (!Array.isArray(daewoonList) || !daewoonList.length) return null;
  return (
    daewoonList.find((dw) => age >= dw.startAge && age <= dw.endAge) ||
    daewoonList[0]
  );
}
function generateSeWoon(startYear = new Date().getFullYear(), count = 20) {
  const list = [];
  let baseOffset = ((startYear - 1984) % 60 + 60) % 60;

  for (let i=0; i<count; i++){
    const idx = (baseOffset + i) % 60;
    list.push({
      year: startYear + i,
      gan: GAN[idx % 10],
      ji: JI[idx % 12]
    });
  }
  return list;
}
/**************************************************************
* 🚀 [추가 기능 1] 귀인(貴人)
**************************************************************/
function getNoblePeople(dayGan) {
  const nobleTable = {
    갑:['축','미'], 을:['자','신'], 병:['해','유'], 정:['술','신'],
    무:['미','축'], 기:['오','자'], 경:['사','해'], 신:['진','오'],
    임:['묘','사'], 계:['인','오']
  };
  return nobleTable[dayGan] ?? [];
}

/**************************************************************
* 🚀 [추가 기능 2] 배우자(配偶宮) 분석
**************************************************************/
function getSpouseInfo(dayGan, dayJi, monthJi, hourJi) {
  const elem = STEM_TO_ELEMENT[dayGan];

  // 배우자 오행(남=재성, 여=관성 기본)
  const spouseElementMapping = {
    목:'금', 화:'수', 토:'목', 금:'화', 수:'토'
  };
  const spouseElement = spouseElementMapping[elem];

  return {
    dayBranch: dayJi,             
    spouseElement,                
    compatibility: BRANCH_TO_ELEMENT[dayJi] === spouseElement,
    monthRelation: getTenGodFromBranch(dayGan, monthJi),
    hourRelation: getTenGodFromBranch(dayGan, hourJi),
  };
}

/**************************************************************
* 🚀 [추가 기능 3] 일간 - 월지 관계
**************************************************************/
function getRelationBetweenDayAndMonth(dayGan, monthJi) {
  const main = STEM_TO_ELEMENT[dayGan];
  const month = BRANCH_TO_ELEMENT[monthJi];
  return {
    dayElement: main,
    monthElement: month,
    relation: getRelationText(main, month)
  };
}

function getRelationText(a, b){
  const cycle = {목:'화', 화:'토', 토:'금', 금:'수', 수:'목'};
  if (cycle[a] === b) return "내가 생한다 (식상)";
  if (cycle[b] === a) return "나를 생한다 (인성)";

  const kill = {목:'토', 토:'수', 수:'화', 화:'금', 금:'목'};
  if (kill[a] === b) return "내가 극한다 (재성)";
  if (kill[b] === a) return "나를 극한다 (관성)";
  return "상극/상생 아님 (중립)";
}

/**************************************************************
* 🚀 [추가 기능 4] 비겁/재성/관성 흐름 분석 (대운/세운)
**************************************************************/
function getFlowOfGods(daewoon, sewun) {
  const count = (list, typeArr) =>
    list.filter(v => typeArr.includes(v.tenGod)).length;

  return {
    bigLuck: {
      bigun: count(daewoon,["비견","겁재"]),
      jaesung: count(daewoon,["편재","정재"]),
      gwansung: count(daewoon,["편관","정관"]),
    },
    yearlyLuck:{
      bigun: count(sewun,["비견","겁재"]),
      jaesung: count(sewun,["편재","정재"]),
      gwansung: count(sewun,["편관","정관"]),
    }
  };
}

/**************************************************************
* 🚀 [추가 기능 5] 십이신살 / 살성
**************************************************************/
function getTwelveGodKill(dayJi) {
  const table = {
    자:["역마","장성"], 축:["천살","겁살"], 인:["역마","홍염"], 묘:["도화","월살"],
    진:["겁살","재살"], 사:["역마","홍염"], 오:["도화","천살"], 미:["월살","재살"],
    신:["홍염","장성"], 유:["도화","격각"], 술:["역마","겁살"], 해:["천살","월살"]
  };
  return table[dayJi] ?? [];
}

// ✅ 최종 함수
export function getFourPillars(userInfo) {
  if (Array.isArray(userInfo)) userInfo = userInfo[0];

  const digits = String(userInfo.birthDate || userInfo.birthdate || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`유효하지 않은 birthDate/birthdate 값입니다: ${userInfo.birthDate || userInfo.birthdate}`);
  }

  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));

  // 🟦 시간이 숫자가 아니면 = 시간 모름 처리
  let birthTime = userInfo.birthTime;
const isUnknownTime =
  birthTime === null ||
  birthTime === undefined ||
  birthTime === "" ||
  birthTime === "unknown" ||   // 🔥 너가 사용한 값
  birthTime === "99" ||        // 혹시 모를 99도 함께 처리
  isNaN(Number(birthTime));
  // 🟧 시간 모르면 12시(중립값)으로 파싱하되, 시주는 null 처리할 것
  const t = isUnknownTime ? 12 : Number(birthTime);

  // 날짜 생성
  const date = dayjs.tz(
    `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(t).padStart(2,"0")}:00:00`,
    "Asia/Seoul"
  );

  // 연주~일주 계산
  const year = getYearPillar(date);
  const month = getMonthPillar(date, year.gan);
  const day = getDayPillar(date);

  // 🔥 시간 모를 때 시주 null
  let hour;
  if (isUnknownTime) {
    hour = { gan: null, ji: null };
  } else {
    hour = getHourPillar(date, day.gan);
  }

  const zodiac = getZodiac(year.ji);
  const pillarSet = { year, month, day, hour };
  const fiveElements = countFiveElements(pillarSet);
  const fiveElementsWeighted = countFiveElementsWeighted(pillarSet);

  const tenGodPillars = {
    year:  getTenGod(day.gan, year.gan),
    month: getTenGod(day.gan, month.gan),
    day:   getTenGod(day.gan, day.gan),
    hour:  isUnknownTime ? null : getTenGod(day.gan, hour.gan),
  };

  const { startAgeExact, isForward } = getDaewoonStartAge(date, userInfo.gender, year.gan);
  const daewoonRaw = generateDaewoonList(month, startAgeExact, isForward);
  const sewunRaw = generateSeWoon(y, 30);

  const daewoon = daewoonRaw.map(dw => ({
    ...dw,
    tenGod: getTenGod(day.gan, dw.gan),
    twelveStage: getTwelveStage(day.gan, dw.ji),
  }));

  const sewun = sewunRaw.map(sw => ({
    ...sw,
    tenGod: getTenGod(day.gan, sw.gan),
    twelveStage: getTwelveStage(day.gan, sw.ji),
  }));

  const wolwoon = generateWolWoon(y, 3).map(ww => ({
    ...ww,
    tenGod: getTenGod(day.gan, ww.gan),
    twelveStage: getTwelveStage(day.gan, ww.ji),
  }));

  const relations = getJijiRelations(pillarSet);
  const strength = getStrength(day.gan, pillarSet, fiveElementsWeighted);
  const yongshin = getYongshin(day.gan, strength, fiveElementsWeighted);
  const gongMang = getGongMangBranches(day.gan, day.ji);

  // 추가 데이터
  const noble = getNoblePeople(day.gan);

  const spouse = getSpouseInfo(
    day.gan,
    day.ji,
    month.ji,
    hour.ji || null   // 🔥 시간 모르면 hour.ji = null
  );

  const relationYM = getRelationBetweenDayAndMonth(day.gan, month.ji);
  const flow = getFlowOfGods(daewoon, sewun);
  const gods12 = getTwelveGodKill(day.ji);

  return { 
    year, 
    month, 
    day, 
    hour,
    zodiac, 
    fiveElements,
    fiveElementsWeighted,
    tenGod: tenGodPillars,
    daewoon,
    sewun,
    wolwoon,
    relations,
    strength,
    yongshin,
    gongMang,
    noble,
    spouse,
    relationYM,
    flow,
    gods12,
    isUnknownTime,
    dayGan: `${day.gan}${STEM_TO_ELEMENT[day.gan]}`,
  };
}
