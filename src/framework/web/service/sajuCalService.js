// src/framework/web/service/SajuCalcService.js
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";
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

  // 소한(1/6) 이전(전년 대설~소한)은 자월(子, 11)
  if (date.isBefore(dayjs(`${year}-01-06`))) return 11;

  for (let i=0;i<terms.length;i++){
    if(date.isBefore(dayjs(terms[i]))){
      return i === 0 ? 12 : i; // 소한~입춘은 축월(12)
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
  for (const g of allGan) total[STEM_TO_ELEMENT[g]]++;
  for (const j of allJi) total[BRANCH_TO_ELEMENT[j]]++;
  return total;
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
function getDaewoonStartAge(date, gender, yearGan) {
  const Y = date.year();
  const birth = date;
  const ipchun = dayjs.tz(`${Y}-02-04 05:00`, "Asia/Seoul"); // 입춘기준
  
  // 🔹 다음 절기까지 며칠 차이
  const diffDays = dayjs(ipchun).diff(birth, "day");

  // 🔹 대운 시작나이 (일수 ÷ 3 규칙)
  const startAge = Math.max(1, Math.round(diffDays / 3));

  // 🔹 성별 + 연간 음양 → 순행/역행 결정
  const yangStem = ["갑","병","무","경","신"];
  const isYangYear = yangStem.includes(yearGan);
  const isForward = 
        (gender === "남" && isYangYear) ||
        (gender === "여" && !isYangYear); // 남양여음 순행 / 남음여양 역행

  return { startAge, isForward };
}
function generateDaewoonList(monthPillar, startAge, isForward, count = 8) {
  const list = [];
  let ganIndex = GAN.indexOf(monthPillar.gan);
  let jiIndex = JI.indexOf(monthPillar.ji);

  for (let i = 0; i < count; i++) {
    if (i > 0) {
      if (isForward) { ganIndex++; jiIndex++; }
      else { ganIndex--; jiIndex--; }
    }
    ganIndex = (ganIndex + 10) % 10;
    jiIndex = (jiIndex + 12) % 12;

    list.push({
      startAge: startAge + i*10,
      endAge:   startAge + (i+1)*10 - 1,
      gan: GAN[ganIndex],
      ji: JI[jiIndex]
    });
  }
  return list;
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
    monthRelation: getTenGod(dayGan, monthJi), // 월주가 배우자와 어떤 관계?
    hourRelation: getTenGod(dayGan, hourJi),   // 시주 = 실제 연애성/가정운
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

  let raw = String(userInfo.birthDate || userInfo.birthdate || "").trim();
  if (/^\d{8}$/.test(raw)) raw = `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;

  const [y,m,d] = raw.split("-").map(Number);

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
  const fiveElements = countFiveElements({ year, month, day, hour });

  const tenGodPillars = {
    year:  getTenGod(day.gan, year.gan),
    month: getTenGod(day.gan, month.gan),
    day:   getTenGod(day.gan, day.gan),
    hour:  isUnknownTime ? null : getTenGod(day.gan, hour.gan),
  };

  const { startAge, isForward } = getDaewoonStartAge(date, userInfo.gender, year.gan);
  const daewoonRaw = generateDaewoonList(month, startAge, isForward);
  const sewunRaw = generateSeWoon(y, 30);

  const daewoon = daewoonRaw.map(dw => ({
    ...dw,
    tenGod: getTenGod(day.gan, dw.gan),
  }));

  const sewun = sewunRaw.map(sw => ({
    ...sw,
    tenGod: getTenGod(day.gan, sw.gan),
  }));

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
    hour,           // 🔥 시주 null 가능
    zodiac, 
    fiveElements,
    tenGod: tenGodPillars,
    daewoon,
    sewun,
    noble,
    spouse,         // 🔥 hourRelation null 가능
    relationYM,
    flow,
    gods12,
    isUnknownTime ,
      // 🔥 추가 (프론트/이미지용)
     dayGan: `${day.gan}${STEM_TO_ELEMENT[day.gan]}` // 무토, 기토, 을목

 // 🔥 GPT가 활용 가능하도록 추가 (옵션)
  };
}
