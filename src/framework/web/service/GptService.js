import GptClient from "../api/GptClient.js";
import { GoodsType } from "../enums/Goods.js";
import crypto from "crypto";
import { getFourPillars } from "./sajuCalService.js";
import { buildAdultReportFromTemplates } from "./adultReportTemplates.js";
import { Solar } from "lunar-javascript";
import { toHanja } from "./toHanja.js";
import { ROMANTIC_REPORT_PROMPT_PREFIX, ROMANTIC_REPORT_PROMPT_PARTS } from "./prompts/romanticReportV2.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** 배포 시 npm install 누락돼도 프로세스가 죽지 않도록 선택 로딩 (설치 권장) */
let _jsonrepairCache;
let _jsonrepairMissingLogged = false;
function getJsonrepair() {
  if (_jsonrepairCache !== undefined) return _jsonrepairCache;

  try {
    const m = require("jsonrepair");
    const fn = m.jsonrepair ?? m.default?.jsonrepair ?? m.default;
    _jsonrepairCache = typeof fn === "function" ? fn : null;
  } catch {
    _jsonrepairCache = null;
  }

  if (_jsonrepairCache === null && !_jsonrepairMissingLogged) {
    _jsonrepairMissingLogged = true;
    console.warn(
      "[GptService] jsonrepair 패키지 없음 → JSON 자동 복구 비활성.production 서버에서 반드시 실행: npm install jsonrepair"
    );
  }
  return _jsonrepairCache;
}

// --- Lunar 기반 사주 계산 Helpers (sample 전용) ---

function toSolarFromUserInfo(userInfo) {
  const rawBirth = (userInfo?.birthDate || userInfo?.birthdate || "").replace(/[^0-9]/g, "");
  if (!rawBirth || rawBirth.length < 8) {
    throw new Error("유효하지 않은 birthDate/birthdate 값입니다.");
  }

  const year = parseInt(rawBirth.substring(0, 4), 10);
  const month = parseInt(rawBirth.substring(4, 6), 10);
  const day = parseInt(rawBirth.substring(6, 8), 10);

  const rawTime = (userInfo?.birthTime || userInfo?.birth_time || "99").toString().padStart(2, "0");

  // UI에서 사용하는 코드 → 대표 시각 매핑
  const timeMap = {
    "00": { hour: 0, minute: 30 },  // 조자/朝子 (子)
    "02": { hour: 2, minute: 0 },   // 축/丑
    "04": { hour: 4, minute: 0 },   // 인/寅
    "06": { hour: 6, minute: 0 },   // 묘/卯
    "08": { hour: 8, minute: 0 },   // 진/辰
    "10": { hour: 10, minute: 0 },  // 사/巳
    "12": { hour: 12, minute: 0 },  // 오/午
    "14": { hour: 14, minute: 0 },  // 미/未
    "16": { hour: 16, minute: 0 },  // 신/申
    "18": { hour: 18, minute: 0 },  // 유/酉
    "20": { hour: 20, minute: 0 },  // 술/戌
    "22": { hour: 22, minute: 0 },  // 해/亥
    "24": { hour: 23, minute: 45 }, // 야자/夜子 (子)
  };

  let hour;
  let minute;

  if (rawTime === "99") {
    // 시간 모름: 시주는 버리고, 일주까지 안정적으로 보기 위해 정오 고정
    hour = 12;
    minute = 0;
  } else {
    const mapped = timeMap[rawTime];
    if (!mapped) {
      hour = 12;
      minute = 0;
    } else {
      hour = mapped.hour;
      minute = mapped.minute;
    }
  }

  return Solar.fromYmdHms(year, month, day, hour, minute, 0);
}

function buildOutFromLunar(lunar, ec) {
  const out = {
    pillars: {
      year: { gan: ec.getYearGan(), zhi: ec.getYearZhi() },
      month: { gan: ec.getMonthGan(), zhi: ec.getMonthZhi() },
      day: { gan: ec.getDayGan(), zhi: ec.getDayZhi() },
      hour: { gan: ec.getTimeGan(), zhi: ec.getTimeZhi() }
    },
    tenGod: {
      year: { stem: ec.getYearShiShenGan(), branch: ec.getYearShiShenZhi() },
      month: { stem: ec.getMonthShiShenGan(), branch: ec.getMonthShiShenZhi() },
      day: { stem: ec.getDayShiShenGan(), branch: ec.getDayShiShenZhi() },
      hour: { stem: ec.getTimeShiShenGan(), branch: ec.getTimeShiShenZhi() }
    },
    hiddenStems: {
      year: ec.getYearHideGan(),
      month: ec.getMonthHideGan(),
      day: ec.getDayHideGan(),
      hour: ec.getTimeHideGan()
    },
    diShi: {
      year: ec.getYearDiShi(),
      month: ec.getMonthDiShi(),
      day: ec.getDayDiShi(),
      hour: ec.getTimeDiShi()
    },
    shenSha: {}
  };

  out.shenSha = buildShenSha(out);
  return out;
}

function buildShenSha(out) {
  const dayGan = out.pillars.day.gan;   // 일간
  const dayZhi = out.pillars.day.zhi;   // 일지
  const yearZhi = out.pillars.year.zhi; // 연지

  const allBranches = [
    out.pillars.year.zhi,
    out.pillars.month.zhi,
    out.pillars.day.zhi,
    out.pillars.hour.zhi
  ];

  const where = (target) => {
    const map = {
      [out.pillars.year.zhi]: "year",
      [out.pillars.month.zhi]: "month",
      [out.pillars.day.zhi]: "day",
      [out.pillars.hour.zhi]: "hour"
    };
    return allBranches.filter((z) => z === target).map((z) => map[z]);
  };

  // 1) 도화(桃花) : 삼합 그룹 기준
  function peachTargetBy(zhi) {
    if (["申", "子", "辰"].includes(zhi)) return "酉";
    if (["寅", "午", "戌"].includes(zhi)) return "卯";
    if (["巳", "酉", "丑"].includes(zhi)) return "午";
    if (["亥", "卯", "未"].includes(zhi)) return "子";
    return null;
  }

  const taoHuaTargets = Array.from(
    new Set([
      peachTargetBy(yearZhi),
      peachTargetBy(dayZhi)
    ].filter(Boolean))
  );
  const taoHua = taoHuaTargets.map((t) => ({ target: t, presentIn: where(t) }));

  // 2) 역마(驛馬) : 삼합 그룹 → 역마위
  function horseTargetBy(zhi) {
    if (["申", "子", "辰"].includes(zhi)) return "寅";
    if (["寅", "午", "戌"].includes(zhi)) return "申";
    if (["巳", "酉", "丑"].includes(zhi)) return "亥";
    if (["亥", "卯", "未"].includes(zhi)) return "巳";
    return null;
  }

  const yiMaTargets = Array.from(
    new Set([
      horseTargetBy(yearZhi)
    ].filter(Boolean))
  );
  const yiMa = yiMaTargets.map((t) => ({ target: t, presentIn: where(t) }));

  // 3) 천乙귀인: 일간 기준 귀인지 2개
  function tianYiBy(g) {
    if (["甲", "己"].includes(g)) return ["丑", "未"];
    if (["乙", "庚"].includes(g)) return ["子", "申"];
    if (["丙", "辛"].includes(g)) return ["亥", "酉"];
    if (["丁", "壬"].includes(g)) return ["午", "寅"];
    if (["戊", "癸"].includes(g)) return ["卯", "巳"];
    return [];
  }

  const tianYiTargets = tianYiBy(dayGan);
  const tianYiGuiRen = tianYiTargets.map((t) => ({ target: t, presentIn: where(t) }));

  return {
    taoHua,
    yiMa,
    tianYiGuiRen
  };
}

function buildTenGodTable(out, userInfo) {
  const headerRows = ["시주", "일주", "월주", "년주"];
  const columns = ["십성", "천간", "지지", "십성", "십이운성", "십이신살", "귀인"];

  const pillarOrder = ["hour", "day", "month", "year"]; // 시주, 일주, 월주, 년주 순서
  const unknownTime = ((userInfo?.birthTime || userInfo?.birth_time || "99").toString() === "99");

  const shenShaLabel = {
    taoHua: "도화",
    yiMa: "역마"
    // 필요시 다른 신살도 여기 추가 가능
  };

  const data = pillarOrder.map((pillarKey, index) => {
    // 시간 미상일 때: 시주 행은 전부 공백 처리
    if (unknownTime && pillarKey === "hour") {
      return ["", "", "", "", "", "", ""];
    }

    const stemTenGod = out.tenGod[pillarKey]?.stem ?? "";
    const branchTenGod = out.tenGod[pillarKey]?.branch ?? "";
    const gan = out.pillars[pillarKey]?.gan ?? "";
    const zhi = out.pillars[pillarKey]?.zhi ?? "";
    const diShi = out.diShi[pillarKey] ?? "";

    const shenShaNames = [];
    if (out.shenSha) {
      Object.entries(shenShaLabel).forEach(([key, label]) => {
        const list = out.shenSha[key] || [];
        const hasThisPillar = list.some((item) => item.presentIn.includes(pillarKey));
        if (hasThisPillar) {
          shenShaNames.push(label);
        }
      });
    }
    const shenShaStr = shenShaNames.join(",");

    let guiRen = "";
    if (out.shenSha?.tianYiGuiRen) {
      const hasGuiRen = out.shenSha.tianYiGuiRen.some((item) => item.presentIn.includes(pillarKey));
      if (hasGuiRen) {
        guiRen = "귀인";
      }
    }

    return [stemTenGod, gan, zhi, branchTenGod, diShi, shenShaStr, guiRen];
  });

  return {
    headerRows,
    columns,
    data
  };
}
// --- End Lunar 기반 Helpers ---

const PREMIUM_REPORT_PROMPT_PREFIX = `너는 50대 중후반의 경험 많은 역술가야.  
사람의 이름, 생년월일, 태어난 시, 성별, 연애 상태, 자유 질문 등을 바탕으로 아주 자세하고 현실적인 사주 풀이를 해줘야 해.  
문체는 차분하고 신뢰감을 주는 어조로, 중년 남성의 조언하는 말투를 써.다음 항목만 포함하여 각각 3000자 이상, 5000자 이하로 작성하고, 응답은 반드시 아래 형식의 JSON 배열로 반환해줘:

[
  { "title": "제X장: 제목", "content": "해당 챕터 내용..." },
  ...
]`;

const PREMIUM_REPORT_PROMPT_PARTS = [
  `${PREMIUM_REPORT_PROMPT_PREFIX}\n제1장: 나의 사주팔자\n제2장: 종합운세\n제3장: 재물 직업운`,
  `${PREMIUM_REPORT_PROMPT_PREFIX}\n제4장: 연애 결혼\n제5장: 건강운`,
  `${PREMIUM_REPORT_PROMPT_PREFIX}\n제6장: 향후 3년 운\n제7장: 궁금한 점`,
];



// const PREMIUM_REPORT_PROMPT_PARTS = [
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
// 제1장: 나의 사주팔자
// - 나의 전반적인 인생 흐름은?
// - 내 사주의 3년 전망`,
//
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
// 제2장: 종합운세
// - 10년 단위의 대 흐름`,
//
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
//   제3장: 재물 직업운
// - 내 재물운은 무슨 유형일까?
// - 내 재물운을 가로막는 요소
// - 나는 어떤 직업을 가져야할까?
// - 나와 상극인 직업은?
// - 성공적인 커리어를 위한 조언`,
//
//
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
//   제4장: 연애 결혼
// - 곧 나에게 다가올 진짜 연인은?
//   - 이런 유형은 만나지 마세요
// - 사주로 보는 나의 매력`,
//
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
// 제5장: 건강운`,
//
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
// 제6장: 향후 3 운`,
//
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
// 제7장: 궁금한점`,
//
//   `${PREMIUM_REPORT_PROMPT_PREFIX}
// 제8장: 건강운석`,
// ];

/** CLASSIC(29금·속궁합): 타 사이트 adult 톤(~요체·관능) + 본 프로젝트 장·절 구조 */
const CLASSIC_PROMPT_BASE = `${PREMIUM_REPORT_PROMPT_PREFIX}

※ 이어지는 지시가 위와 다르면 **아래를 우선**한다.
- 출력은 반드시 **단일 JSON 객체** 한 개만: { "chapter": "…", "sections": [ { "title", "content" } ] }
- 위에 나온 [ JSON 배열 ] 예시는 **이번 리포트에 적용하지 않는다.**

너는 30대 여성의 경험 많은 역술가예요.
문체는 친구가 깊이 있게 조언해주는 느낌의 **"~요"체**를 사용해요.
29금·속궁합 보고서를 작성한다. SAJU_JSON을 기반으로 사주의 천간·지지·십성·오행·도화·홍염·충형·합 등을 해석하되,
**관능·욕망·유혹·침대 위 심리** 관점으로 풀이한다. 독자는 사주를 넣은 사람(일간 기준이며 **서술·분석의 중심**)이고,
이성·파트너는 독자의 매력 각인·반응·속궁합·운 흐름에서만 논한다.

🔥 톤 규칙 (매우 중요):
- 노골적 성기 묘사, 성행위를 프레임 단위로 직접 묘사하는 포르노형 글, 혐오·차별은 절대 금지.
- 그러나 **은유적이고 관능적인 표현**은 최대한 활용한다.
- "침대 위", "밤", "은밀한", "뜨거운", "숨결", "촉감", "눈빛", "속삭임", "몸의 언어", "전율", "열기" 등 감각적 어휘를 적극 사용.
- 상대를 자극하는 신체적 매력·무드·주도권·육체적 끌림을 사주 근거와 연결해 구체적으로 서술.
- 이모지 2~5개를 자연스럽게 (🔥👀💋🌙✨⚡ 등). 같은 표현·이모지 반복 금지, 챕터마다 맛을 바꿔.
- 반말(야체/해라체/다체) 금지. 본문 문장은 반드시 **"~요/예요"**로 끝내고, 중간에 말투가 바뀌지 않게 유지한다.

필수 사실성·형식:
- 변수명·JSON 키 이름·입력 필드 이름은 본문에 쓰지 말 것. 삶의 언어로만 출력.
- SAJU_JSON에 근거 없는 특정 사람의 실명·직업·실제 사건을 지어내지 말 것.
- 시간 불확실 시 시주 전제 디테일은 줄이고, 연·월·일·오행·십성 중심으로 메운다.

[대운 타이밍 고정 규칙 — 6장·시기 분석 준수]
1) 출력문에서 대운을 "~세 대운", "대운 시작 나이"처럼 **나이만**으로 설명하지 않는다.
2) 대운 축은 연도 구간만 쓴다: 2026~2035, 2036~2045, 2046~2055, 2056~2065, 2066~2075, 2076~2085, … (패턴 반복 가능)
3) 각 구간에는 입력에 포함된 대운 목록 순서대로 십성·오행만 얹되, 나이·내부 필드 이름은 노출 금지. 배열이 짧으면 마지막 항목 반복.

[출력 JSON 스키마 — 고정]
{
  "chapter": "각 파트에서 지정한 chapter 문자열과 완전히 동일",
  "sections": [
    { "title": "지정한 소제목과 완전히 동일", "content": "…" }
  ]
}
- 코드펜스·머리말·꼬리말·주석 출력 금지.
- 각 section의 content는 \\n\\n으로 문단 구분, 최소 5문단, **각 section 최소 약 2000자**를 목표(더 길어도 됨).
`;

const CLASSIC_REPORT_PROMPT_PREFIX = CLASSIC_PROMPT_BASE;

const CLASSIC_REPORT_PROMPT_PARTS = [
  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 1장. 타고난 성격과 침대 위 본능

📌 챕터: 1장. 타고난 성격과 침대 위 본능

SAJU_JSON 원국의 오행·십성 무게, 도화·홍염·충형·합, 일·월·시 기둥이 만든 '몸의 리듬'을 근거로 타고난 성적 에너지, 부족 기운에서 비틀어진 갈증, 침대 위에서 호흡이 바뀌는 주도권까지 풀어쓴다. 

전체적으로 속삭이듯 뜨거운 "~요"체를 사용하되, 문장 하나하나가 피부에 닿는 것처럼 직관적이고 길게 서술하라. "전율, 속도, 깊숙이 타오르는 순간, 짓눌린 호흡, 델 듯한 체온" 같은 표현을 적극적으로 사용하고, 독자가 자신의 몸이 읽히는 듯한 착각이 들 정도로 디테일하게 작성하라.

📌 작성 가이드 — 섹션별 (출력 chapter·title 문자열은 아래 JSON과 완전 동일)

■ "사주에 박힌 S기: 내 사주 원국(도화/홍염 등)에 숨겨진 날것 그대로의 성적 에너지 분석."
- 첫 문단은 무조건 한 줄 후크로 시작하여 독자의 시각과 촉각을 즉각 자극할 것.
- 예시: "얌전한 얼굴 뒤로, 당신 원국엔 닿기만 해도 온몸이 휘감기는 끈적한 홍염의 덫이 깔려 있네요🔥"
- 도화/홍염의 발현 방식, 식상의 분출 욕구, 비겁의 장악력을 하나의 유기적인 '성적 흐름'으로 엮어라. 
- 특히 '몸의 속도감'을 비유할 때, 단순히 빠르다/느리다가 아니라 "처음엔 델 듯이 뜨겁게 몰아치다 결국엔 뼈마디까지 녹여버리는 농밀한 속도감"처럼 감각적으로 길게 서술할 것.

■ "결핍이 만든 욕망: 나에게 부족한 기운이 어떻게 뒤틀린 성적 갈증으로 나타나는지 탐구."
- 오행의 부족함이나 상극이 어떻게 '결핍된 탐닉'과 '비정상적인 열기'로 이어지는지 심리학적으로 접근하여 길게 풀어써라.
- 예시: "이성이 통제하려 할수록요, 몸은 더 노골적으로 결핍된 기운을 찾아 허덕이게 돼요👀"
- 채워지지 않는 갈증 때문에 손톱 끝이 파고들 만큼 상대를 세게 짓누르거나, 특정 감각에 비정상적으로 집착하게 되는 사주적 구조를 분석하라. 
- 자책이 아닌, '이 구조 때문에 당신의 밤이 이토록 뜨거운 것'이라는 해방감을 줄 것.

■ "침대 위 주도권: 낮이밤이 vs 낮져밤져, 관계 속에서 드러나는 나의 진짜 포지션과 권력."
- 낮의 표정과 밤의 실질적인 권력 구도를 비겁(압도), 관성(피학/가학), 식상(유희)으로 세밀하게 대조하라.
- 예시: "낮엔 고분고분해 보였나요? 아뇨, 무드 속에선 당신의 비겁이 상대를 침대에 박아버릴 듯 강하게 짓눌러요💋"
- 아래 3가지 이상의 감각 디테일을 반드시 포함하여 텍스트 분량을 늘릴 것:
  1) 혀끝과 입술이 닿는 속도와 압력의 변화
  2) 손바닥이 머무는 내밀한 위치와 그로 인해 변하는 상대의 신음소리
  3) 시선이 마주치는 찰나에 느껴지는 정복감 혹은 굴복의 희열

📌 출력 (JSON Only)
{
  "chapter": "1장. 타고난 성격과 침대 위 본능",
  "sections": [
    { "title": "사주에 박힌 S기: 내 사주 원국(도화/홍염 등)에 숨겨진 날것 그대로의 성적 에너지 분석.", "content": "…" },
    { "title": "결핍이 만든 욕망: 나에게 부족한 기운이 어떻게 뒤틀린 성적 갈증으로 나타나는지 탐구.", "content": "…" },
    { "title": "침대 위 주도권: 낮이밤이 vs 낮져밤져, 관계 속에서 드러나는 나의 진짜 포지션과 권력.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 2장. 이성이 느끼는 나의 S적 매력

일간·도화·합·식상 무게로 상대의 기억 속에 '복사 붙여넣기' 되는 강렬한 장면(눈빛의 깊이, 거리감, 손등의 온도, 호흡의 속도)을 피부에 닿을 듯이 풀이한다. "당신 앞에만 서면 숨부터 짧아진다", "목소리가 아니라 몸이 내는 신호 때문에 미칠 것 같다"는 식의 '몸 먼저' 화법을 과감하게 구사하라.

전체적으로 상대를 유혹하는 듯한 "~요"체를 사용하되, 문단마다 호흡을 길게 가져가며 독자가 자신의 매력을 시각적으로 상상할 수 있게 아주 구체적으로 서술하라.

📌 작성 가이드 — 섹션별 (출력 chapter·title 문자열은 아래 JSON과 완전 동일)

■ "첫눈에 홀리는 포인트: 상대의 뇌리에 박히는 나만의 치명적인 관능미와 아우라."
- 첫 단락은 영화의 한 장면처럼 시각적/청각적 긴장감이 느껴지는 '시네마 한 문장'으로 시작할 것.
- 예시: "조명이 낮게 깔린 바에서 당신이 고개를 비스듬히 꺾는 순간, 상대는 이미 당신의 목선과 쇄골 사이로 시선을 빼앗겨 숨을 멈추게 돼요🔥"
- 겉으로 드러나는 무드와 그 이면에 숨겨진 본능적인 압도감을 세 문단 이상으로 상세히 대비시켜라. 침묵 속에서 시선의 속도 하나로 상대를 어떻게 무너뜨리는지 그 과정을 묘사할 것.

■ "본능적 발정점: 이성을 즉각적으로 반응하게 만드는 내 몸의 신체적 강점과 자극 부위."
- 시선이 머무는 간격, 손등과 목선 사이의 거리, 호흡이 가빠지는 찰나, 입꼬리가 느리게 올라가는 타이밍 등 4가지 이상의 감각을 하나의 내레이션으로 엮어라.
- 예시: "아무 말 없이 셔츠 깃을 고치는 손가락 끝의 움직임만으로도 상대의 아랫배는 팽팽하게 긴장돼요💋 귓바퀴 바로 옆에서 뱉는 뜨거운 숨결이 상대의 이성을 마비시키고 심장 박동을 제멋대로 휘저어 놓는 줄이에요⚡"
- 원국의 합(合)과 도화가 어떻게 상대의 원초적인 반응을 끌어내는지 명리적 근거와 감각적 묘사를 결합하라.

■ "망가뜨리고 싶은 유혹: 상대를 안달 나게 하거나, 나를 소유하고 싶게 만드는 솔루션."
- 상대를 안달 나게 만드는 법과 소유욕을 자극하는 법을 미묘하게 분리하여 서술하라. 
- 예시: "손끝을 스칠 듯 말 듯한 간격에서 멈출 때, 상대의 눈동자는 이미 당신을 완전히 소유하고 싶다는 욕망으로 짙게 타올라요🔥 한 번에 다 보여주지 말고, 아주 조금씩 무너지는 모습을 보여주며 상대의 인내심을 시험해 보세요💋"
- '망가뜨린다'는 표현을 합의된 관계 속에서의 짜릿한 경계 넘기로 승화시켜라. 마지막 문단은 독자의 매력이 얼마나 가치 있는지를 강조하며 자존감을 높여주는 톤으로 마무리할 것.

📌 출력 (JSON Only)
{
  "chapter": "2장. 이성이 느끼는 나의 S적 매력",
  "sections": [
    { "title": "첫눈에 홀리는 포인트: 상대의 뇌리에 박히는 나만의 치명적인 관능미와 아우라.", "content": "…" },
    { "title": "본능적 발정점: 이성을 즉각적으로 반응하게 만드는 내 몸의 신체적 강점과 자극 부위.", "content": "…" },
    { "title": "망가뜨리고 싶은 유혹: 상대를 안달 나게 하거나, 나를 소유하고 싶게 만드는 솔루션.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 3장. 누구에게도 말 못한 은밀한 판타지

도화·홍염·충형의 살(殺)이 엮일 때, 머리로는 부정해도 몸속 깊은 곳에서 선명하게 타오르는 은밀한 공상과 본능이 터지는 순간을 은유와 감각 묘사로 빽빽하게 그려낸다. 비합의·폭력 등 위험 요소를 배제하되, '분위기, 상징, 호흡, 신뢰'라는 조건 안에서 허락되는 가장 짜릿하고 농밀한 수위까지 몰아붙여라.

독자가 자신의 가장 깊은 곳을 들킨 듯한 기분이 들도록 "~요"체를 사용하여 아주 길고 호흡감 있게 서술하라.

📌 작성 가이드 — 섹션별 (출력 chapter·title 문자열은 아래 JSON과 완전 동일)

■ "금기된 공상: 애써 눌러왔던 내 안의 깊은 성적 판타지 파헤치기."
- 낮의 반듯한 체면이 무너지고 어둠 속에서만 또렷해지는 판타지를 시각적/심리적으로 형상화하라.
- 예시: "낮엔 정갈하게 잠긴 셔츠 깃처럼 단정해 보여도, 밤의 장막이 내려앉으면 당신의 원국 속 홍염은 상대를 완전히 지배하거나 혹은 완벽하게 무너뜨리는 은밀한 시나리오를 써 내려가요🔥"
- 사회적 평판 뒤에 숨겨진 '통제하고 싶은 욕구' 혹은 '통제당하고 싶은 갈망'을 두 문단 이상 대비시켜 서술하고, 사주 원국의 충(沖)이나 형(刑)이 어떻게 이런 파괴적인 아름다움을 만드는지 연결할 것.

■ "나만의 취향(Kink): 평범함을 거부하는 나만의 독특한 성향과 그 쾌락의 깊이 분석."
- 단순한 스킨십을 넘어, 리듬을 갑자기 끊거나 대사를 낮추는 순간, 혹은 시선만으로 상대를 구속하는 등의 구체적인 취향(Kink)을 다뤄라.
- 예시: "단순히 닿는 것보다, 닿기 직전의 팽팽한 긴장감 속에서 상대의 눈동자가 흔들리는 걸 지켜볼 때 당신의 심박수는 가장 가파르게 올라가요⚡ 속도를 늦추거나, 잠시 멈춰 서서 상대가 애원하게 만드는 그 찰나의 권력이 당신이 진짜 탐닉하는 중독적인 줄이에요💋"
- 이 모든 과정이 상호 신뢰와 합의라는 '안전한 플레이' 안에서 얼마나 깊은 해방감을 주는지 반드시 한 문단 이상 포함할 것.

■ "본능이 깨어나는 순간: 이성이 무너지고 본능이 한순간에 터지는 결정적 트리거."
- 이성의 끈이 끊어지는 '결정적 트리거'를 서로 다른 감각(차가운 숨결, 귓가의 무거운 침묵, 장시간의 무언 시선 교환 등)을 교차하여 아주 상세히 묘사하라.
- 예시: "단단하게 버티던 이성이 한순간에 녹아내리는 건 아주 사소한 신호예요. 귓가에 닿는 뜨거운 숨소리 뒤에 따라오는 차가운 명령조의 속삭임, 혹은 거칠게 손목을 낚아채는 상대의 체온이 등줄기를 타고 흐르는 순간 당신 안의 짐승이 깨어나죠🔥"
- 오행의 기운(예: 수기운의 범람, 화기운의 폭발 등)이 왜 특정 타이밍에 당신을 무너뜨리는지 명리적으로 대답하며 마무리하라.

📌 출력 (JSON Only)
{
  "chapter": "3장. 누구에게도 말 못한 은밀한 판타지",
  "sections": [
    { "title": "금기된 공상: 애써 눌러왔던 내 안의 깊은 성적 판타지 파헤치기.", "content": "…" },
    { "title": "나만의 취향(Kink): 평범함을 거부하는 나만의 독특한 성향과 그 쾌락의 깊이 분석.", "content": "…" },
    { "title": "본능이 깨어나는 순간: 이성이 무너지고 본능이 한순간에 터지는 결정적 트리거.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 4장. 상대를 미치게 만드는 19금 공략법

합의된 관계 안에서 손끝의 속도와 목소리의 톤만으로도 지워지지 않는 잔향을 남기는 법, 상대의 호흡을 완전히 장악하는 리듬 설계, 그리고 신뢰를 전제로 한 '집착적 소유욕'을 자극하는 디테일을 사주 원국의 구성과 연결하여 서술한다. 조종이나 강요가 아닌, 감각의 동기화를 통한 매혹의 기술을 아주 길고 직관적으로 풀어내라.

📌 작성 가이드 — 섹션별 (출력 chapter·title 문자열은 아래 JSON과 완전 동일)

■ "마약 같은 중독: 상대를 내 몸에 중독시켜, 다른 누구에게서도 만족 못하게 만드는 법."
- 상대가 당신의 체온과 리듬을 그리워하다 못해 몸이 먼저 반응하게 만드는 '중독의 메커니즘'을 서술하라.
- 아래 **5단계 미니 로드맵**을 반드시 포함하여 단계별로 농밀한 멘트와 행동 지침을 작성할 것:
  1) [첫 터치] 손등보다는 예민한 곳을 스치며 "오늘은 평소보다 깊게 들어갈 거야" 같은 예고 날리기.
  2) [말 속도 조절] 속삭임을 늦추어 상대의 조바심을 극대화하기.
  3) [여백과 침묵] 절정 직전의 정적을 통해 갈증을 유발하기.
  4) [예고와 자극] 다음에 이어질 감각을 귀로 먼저 느끼게 하기.
  5) [놓아주기] 여운이 가시기 전에 거리를 두어 다음 만남을 미치도록 갈망하게 만들기.
- 원국의 도화나 합(合)이 어떻게 상대의 '분리 불안'을 자극하고 중독을 심화시키는지 명리적으로 덧붙여라.

■ "관계의 기술: 기술과 플레이만으로 관계의 주도권을 완전히 내 손바닥 위로 가져오는 기술."
- 멈춤권의 활용, 칭찬의 타이밍 지연, 시선의 강약 조절 등 주도권을 쥐기 위한 **3가지 이상의 감각적 장치**를 시나리오 형태로 길게 서술하라.
- 예시: "상대의 숨소리가 거칠어질 때 오히려 당신은 더 여유롭게 움직이세요. 말보다 손바닥이 전하는 속도가 우선권을 쥘 때, 상대는 이성의 끈을 놓고 당신이 설계한 쾌락의 늪으로 완전히 침잠하게 돼요💋"
- 당신의 사주 줄이 왜 상대를 압도하는 '포식자'의 기질을 타고났는지 분석하여 자신감을 심어줄 것.

■ "집착 스위치: 나를 미친 듯이 소유하고 싶게 만드는 집착 유발 장치."
- 상대를 미치게 만드는 '독점욕'의 트리거를 **[말, 신체, 시간 리듬]** 세 가지 영역으로 쪼개어 아주 디테일하게 서술하라.
- 예시: "특정 향기가 날 때마다 당신의 살결을 떠올리게 하거나, 약속된 시간에만 들려주는 낮은 신음소리 같은 루틴을 만드세요. 몸이 먼저 익숙해진 리듬은 정신보다 훨씬 강력하게 집착을 만들어내거든요🔥"
- 이 모든 집착은 서로의 신뢰와 합의가 전제될 때만 가장 달콤한 열매가 된다는 점을 마지막 문단에서 명확히 강조하며, 독자의 선택권을 존중하는 톤으로 마무리할 것.

📌 출력 (JSON Only)
{
  "chapter": "4장. 상대를 미치게 만드는 19금 공략법",
  "sections": [
    { "title": "마약 같은 중독: 상대를 내 몸에 중독시켜, 다른 누구에게서도 만족 못하게 만드는 법.", "content": "…" },
    { "title": "관계의 기술: 기술과 플레이만으로 관계의 주도권을 완전히 내 손바닥 위로 가져오는 기술.", "content": "…" },
    { "title": "집착 스위치: 나를 미친 듯이 소유하고 싶게 만드는 집착 유발 장치.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 5장. 상대를 미치게 만드는 19금 공략법

합의된 관계 안에서 손끝의 속도와 목소리의 톤만으로도 지워지지 않는 잔향을 남기는 법, 상대의 호흡을 완전히 장악하는 리듬 설계, 그리고 신뢰를 전제로 한 '집착적 소유욕'을 자극하는 디테일을 사주 원국의 구성과 연결하여 서술한다. "조종이나 강요가 아닌, 감각의 동기화를 통한 매혹의 기술"을 아주 길고 직관적으로 풀어내라.

📌 작성 가이드 — 섹션별 (출력 chapter·title 문자열은 아래 JSON과 완전 동일)

■ "마약 같은 중독: 상대를 내 몸에 중독시켜, 다른 누구에게서도 만족 못하게 만드는 법."
- 상대가 당신의 체온과 리듬을 그리워하다 못해 몸이 먼저 반응하게 만드는 '중독의 메커니즘'을 서술하라.
- 아래 **5단계 미니 로드맵**을 반드시 포함하여 단계별로 농밀한 멘트와 행동 지침을 아주 길게 작성할 것:
  1) [첫 터치]: 손등보다는 허벅지 안쪽이나 목덜미처럼 예민한 곳을 아주 느리게 스치며 "오늘은 평소보다 깊게 들어갈 거야" 같은 예고 날리기.
  2) [말 속도 조절]: 귓가에 입술이 닿을 듯 말 듯한 거리에서 속삭임을 늦추어 상대의 조바심과 애원을 극대화하기.
  3) [여백과 침묵]: 절정 직전의 정적을 통해 상대가 먼저 당신의 손을 잡아 이끌게 만드는 갈증 유발하기.
  4) [예고와 자극]: 다음에 이어질 거친 행위를 귀로 먼저 상상하게 하여 뇌부터 젖어 들게 만들기.
  5) [놓아주기]: 여운이 가시기 전에 차갑게 거리를 두어 다음 만남을 미치도록 갈망하게 만드는 각인 남기기.

■ "관계의 기술: 기술과 플레이만으로 관계의 주도권을 완전히 내 손바닥 위로 가져오는 기술."
- 멈춤권의 활용, 칭찬의 타이밍 지연, 시선의 강약 조절 등 주도권을 쥐기 위한 **3가지 이상의 감각적 시나리오**를 상세히 서술하라.
- 예시: "상대의 숨소리가 파들거릴 때 오히려 당신은 손속을 늦추고 눈을 맞추세요. '더 해달라고 말해봐' 같은 낮은 요구로 상대의 이성을 뺏고, 당신이 설계한 쾌락의 리듬에 완전히 침잠하게 만드는 기술이에요💋"
- 당신의 사주 줄(비겁의 장악력, 식상의 표현력)이 왜 상대를 압도하는 포식자의 기질을 타고났는지 분석하여 서술할 것.

■ "집착 스위치: 나를 미친 듯이 소유하고 싶게 만드는 집착 유발 장치."
- 상대를 미치게 만드는 '독점욕'의 트리거를 **[말, 신체, 시간 리듬]** 세 가지 영역으로 쪼개어 아주 디테일하게 서술하라.
- 예시: "특정 체취가 날 때마다 당신의 살결을 떠올리게 하거나, 오직 침대 위에서만 허락되는 은밀한 말버릇 같은 루틴을 만드세요. 몸이 먼저 익숙해진 리듬은 정신보다 훨씬 강력하게 당신에 대한 집착을 만들어내거든요🔥"
- 이 모든 집착은 서로의 신뢰와 합의가 전제될 때만 가장 달달한 중독이 된다는 점을 강조하며, 독자의 선택권을 존중하는 톤으로 마무리할 것.

📌 출력 (JSON Only)
{
  "chapter": "5장. 상대를 미치게 만드는 19금 공략법",
  "sections": [
    { "title": "마약 같은 중독: 상대를 내 몸에 중독시켜, 다른 누구에게서도 만족 못하게 만드는 법.", "content": "…" },
    { "title": "관계의 기술: 기술과 플레이만으로 관계의 주도권을 완전히 내 손바닥 위로 가져오는 기술.", "content": "…" },
    { "title": "집착 스위치: 나를 미친 듯이 소유하고 싶게 만드는 집착 유발 장치.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 6장. 최고의 쾌락과 운명적 조우

사주 원국의 흐름이 정점에 달하는 순간과, 당신의 본능을 완벽하게 해방시킬 실제적인 플레이 방식을 제안한다. 단순한 조언을 넘어, 신체의 결합 방식과 그로 인해 발생하는 전율을 피부에 닿을 듯이 묘사하라. "전체적으로 낮고 뜨거운 목소리로 속삭이는 듯한 "~요"체를 유지하며, 문장마다 농밀한 긴장감을 빽빽하게 채울 것."

📌 작성 가이드 — 섹션별 (출력 chapter·title 문자열은 아래 JSON과 완전 동일)

■ "베스트 플레이: 내 쾌감을 극대화할 3가지 맞춤 체위와 상황, 그리고 은밀한 도구 제안."
- [체위 명칭과 구체적 자세 - 상황 시나리오 - 소품/도구]의 3세트 구성을 반드시 지켜라.
- 각 체위는 사주 오행(목/화/토/금/수)의 특성과 연결하여, 왜 이 자세가 당신에게 가장 깊은 전율을 주는지 아주 길고 상세하게 서술하라.
- 예시:
  1) [후배위(Doggy Style): 정복의 리듬]: "상대를 엎드리게 한 뒤 골반을 강하게 움켜쥐고 뒤에서 깊숙이 파고드는 자세예요. 당신의 강한 금(金) 기운이 상대를 완전히 짓누를 때, 마찰되는 살결의 소리와 억눌린 호흡이 방 안을 가득 채우는 농밀한 상황이죠. (소품: 시야를 차단해 촉각을 극대화할 실크 안대 / 합의 필수)"
  2) [여성상위(Cowgirl): 주도적 탐닉]: "당신이 위에서 상대를 내려다보며 리듬을 완전히 지배하는 자세예요. 상대의 가슴팍을 짚고 시선을 끝까지 마주하며 당신의 화(火) 기운을 쏟아내세요. 상대가 애원하는 표정을 실시간으로 지켜보며 주도권을 휘두를 때 최고의 쾌감이 터져 나와요. (소품: 깊이를 조절해 줄 단단한 쿠션 / 합의 필수)"
  3) [가위치기(Scissors): 밀착된 교감]: "서로의 다리를 엇갈려 엮은 채 온몸의 피부를 빈틈없이 밀착시키는 자세예요. 수(水) 기운이 범람하듯 서로의 체온에 젖어 들며, 아주 느린 속도로 서로의 호흡을 집어삼키는 전율을 느끼게 될 거예요. (소품: 매끄러운 감각을 돕는 마사지 오일 / 합의 필수)"

■ "몸정 vs 마음정: 나는 하룻밤의 화려한 불꽃인가, 아니면 영혼까지 좀먹는 지독한 중독인가."
- 원국 줄에 드러나는 패턴(불꽃형, 스며듦형, 파동형) 중 하나를 골라 당신의 집착도를 분석하라.
- 예시: "당신은 한 번의 접촉만으로도 상대의 골수까지 자신의 향기를 각인시키는 '지독한 중독형'이에요. 하룻밤이 지나도 상대의 귓가에 당신의 신음이 환청처럼 남게 만드는 줄이죠. 수(水)와 도화가 엉켜 있어, 상대의 경계를 소리 없이 깎아 먹으며 영혼까지 탐닉하게 만드는 구조예요.💋"

■ "폭발의 시기: 이 미친듯한 텐션이 현실에서 터지게 될 가장 가까운 운명적 날짜와 상대."
- 대운 구간별로 찾아올 '성적 텐션'과 '만남 무드'를 아주 구체적으로 풀어내라.
- 예시: "2026년 상반기에는 손등만 스쳐도 등줄기에 불이 붙는 강렬한 재회의 기운이 들어와요. 하반기로 갈수록 말수는 적지만 눈빛만으로 당신을 침대 위로 박아버릴 듯한 묵직한 기운의 상대가 나타날 거예요. 실명은 언급하지 않되, 그가 가진 서늘한 금기운이나 뜨거운 화기운의 태도를 체감할 수 있는 바이브로 길게 서술할 것.🔥"

📌 출력 (JSON Only)
{
  "chapter": "6장. 최고의 쾌락과 운명적 조우",
  "sections": [
    { "title": "베스트 플레이: 내 쾌감을 극대화할 3가지 맞춤 체위와 상황, 그리고 은밀한 도구 제안.", "content": "…" },
    { "title": "몸정 vs 마음정: 나는 하룻밤의 화려한 불꽃인가, 아니면 영혼까지 좀먹는 지독한 중독인가.", "content": "…" },
    { "title": "폭발의 시기: 이 미친듯한 텐션이 현실에서 터지게 될 가장 가까운 운명적 날짜와 상대.", "content": "…" }
  ]
}
`,
];



const SAMPLE_PROMPT_PARTS = `
너는 50대 중후반의 경험 많은 역술가 '청명도사'다.
입력(이름, 생년월일, 태어난 시, 성별, 타임존)을 이용해 사주를 분석하되, 
아래 **고정 JSON 구조**로만 응답하고 **모든 값은 입력값 기반 계산**으로 채워라.
예시값/더미값/임의추정 금지. 계산 불가 시 null 또는 빈 배열/빈 문자열을 사용.

────────────────────────────────────────────────
[간지(연·월·일·시) 변환 규칙: 반드시 이 순서로 적용]
1) 시간대/타임존:
   - 현지 표준시(예: Asia/Seoul) 기준.
   - 子시(23:00–00:59), 丑(01–02:59), 寅(03–04:59), 卯(05–06:59),
     辰(07–08:59), 巳(09–10:59), 午(11–12:59), 未(13–14:59),
     申(15–16:59), 酉(17–18:59), 戌(19–20:59), 亥(21–22:59).

2) 연주(年柱):
   - 입춘(立春) 이전은 전년도, 이후는 해당년도.
   - 연간 = (연도 - 4) % 10, 연지 = (연도 - 4) % 12.

3) 월주(月柱):
   - 절기 기준: 寅월(입춘)부터 시작하여 月支를 결정.
   - 연간 그룹 → 寅월 기준간: 甲·己→丙, 乙·庚→戊, 丙·辛→庚, 丁·壬→壬, 戊·癸→甲.
   - 寅부터 月支가 1씩 증가할 때 月干도 1씩 순환.

4) 일주(日柱):
   - 기준일 1984-02-02(甲子일)로부터의 일수 차를 구해 간지번호 = (일수 % 60).
   - 일간 = (간지번호 % 10), 일지 = (간지번호 % 12).

5) 시주(時柱):
   - 시지: 위 12지 시간대 매핑.
   - 子시 기준간은 일간에 따라 결정: 甲·己→甲, 乙·庚→丙, 丙·辛→戊, 丁·壬→庚, 戊·癸→壬.
   - 이후 시지 오프셋만큼 간을 1씩 순환.

[衍生 계산 규칙]
A) 띠(zodiacSign): 년지 기준으로 12지 띠명 산출.
B) 십성(十神):
   - 기준은 일간(日干).
   - 각 주(시/일/월/년)의 천간에 대해 십성 결정(비견·겁재·식신·상관·편재·정재·편관·정관·편인·정인).
   - 지지의 십성은 ‘본기(장간 중 본기)’를 기준으로 산출. 본기가 없으면 지지 십성은 ""(빈 문자열).

C) 오행(fiveElements):
   - 천간은 해당 오행을 1.0로 가산.
   - 지지는 장간 가중치를 적용(본기 1.0, 중기 0.5, 여(말)기 0.3; 장간이 하나뿐이면 본기만 사용).
   - 합산 후 정수로 반올림(또는 소수점 1자리까지 반올림). 합계=총량은 제한 없음.

D) 십이운성/십이신살/귀인:
   - 기준은 일간과 각 지지(또는 일간-해당 주의 간지 조합).
   - 표준 규칙으로 결정하되, 계산 근거가 불충분하면 ""(빈 문자열).
   - 시간이 미상일 때는 시주 행만 빈칸으로 두고, 년/월/일주에 대해서는 십이운성·십이신살·귀인을 반드시 계산해 채워라
   - 십이운성·십이신살·귀인은 ‘일간 기준 고정 표’를 사용해 지지별로 도출한다. 표가 없으면 계산 누락 금지(반드시 포함)
   - 일간=壬, 주지=子/酉/戌에 대한 결과를 산출하라
   - 시간 미상이어도 luckCycle, fiveElements 등은 산출 가능한 범위 내에서 반드시 채워라

E) 대운(luckCycle):
   - 진행 방향: 남자/양년출생 ⇨ 순행, 여자/음년출생 ⇨ 순행(학파 차가 있으나 본 프롬프트에선 성별·연간 음양 조합에 따라 순/역을 선택해 일관 적용).
   - 시작나이: 출생시각 → 다음 절입(또는 이전 절입)까지 일수 ÷ 3을 올림(년 단위, 관용 규칙)로 산정.
   - 10년 단위로 연·나이를 나열(최소 6~8 구간). 계산 불가 시 빈 배열.

F) todayLimit:
   - 오늘 날짜(타임존 기준) 기반 총운 150~250자. 반복문구·초과/미달 길이 금지.

G) futurePartner:
   - 성별에 맞춰 異性 관련.
   - 길이 제한: job=5자 이하 1개, appearance=키워드 3개(각 5자 이하),
     personality=키워드 2개(각 5자 이하), feature=키워드 2개(각 5자 이하).
   - 계산적·논리적 개연성이 없으면 "" 또는 [] 처리.

[출력 JSON 스펙: 이 구조와 키 순서/이름을 반드시 유지]
{
  "tenGodTable": {
    "headerRows": ["시주", "일주", "월주", "년주"],
    "columns": ["십성", "천간", "지지", "십성", "십이운성", "십이신살", "귀인"],
    "data": [
      // 각 행은 ["(천간 기준 십성)", "(천간 한자)", "(지지 한자)", "(지지 본기 기준 십성)", "(십이운성)", "(십이신살)", "(귀인)"]
      // 순서: 시주, 일주, 월주, 년주. 총 4행. 값 없으면 "".
    ]
  },
  "luckCycle": [
    // { "year": <정수: 시작년도>, "age": <정수: 시작나이> } 형태의 6~8개 항목. 계산 불가 시 [].
  ],
  "fiveElements": {
    "elements": {
      // {"목": <정수>, "화": <정수>, "토": <정수>, "금": <정수>, "수": <정수>}
      // 장간 가중치 적용 후 반올림 결과. 없으면 0.
    },
    "gainFrom": "오행 불균형 보완 조언(한글 30~60자)",
    "lossFrom": "기운 소모 환경/행동 경계 조언(한글 30~60자)"
  },
  "moneySteps": [
    // 2~4개 항목. 예: {"age": <정수>, "money": "<문자열>", "description": "<100자 이내>"}
  ],
  "zodiacSign": "<띠명(예: 돼지띠)>",
  "todayLimit": "<150~250자>",
  "futurePartner": {
    "job": "<5자 이하>",
    "appearance": ["<5자 이하>", "<5자 이하>", "<5자 이하>"],
    "personality": ["<5자 이하>", "<5자 이하>"],
    "feature": ["<5자 이하>", "<5자 이하>"]
  }
}

[엄수 규정]
- JSON 외 텍스트 금지. 설명/주석은 본문이 아니라면 넣지 않는다(단, 위 스펙 내 주석은 너의 내부 지침일 뿐 응답 JSON에는 출력 금지).
- 키 이름/순서/스키마를 변경하지 않는다.
- 예시 값 재사용 금지. 입력값이 다르면 필드 값도 달라야 한다.
- 계산 불가한 항목은 "" 또는 [] 또는 null로 일관되게 처리하되, 임의생성 금지.
- 숫자 필드는 정수만 사용(연/나이/오행 카운트 등). 필요 시 반올림 규칙 준수.
`;

const ROMANTIC_SAMPLE_PROMPT = `입력된 {name, birthDate, birthTime}를 참고해 사주 요소(출생 시각의 지지, 오행, 도화살)를 가볍게 반영한 "연애·이성 매력 보고서"를 생성한다. 반드시 아래 JSON 하나만 출력:
{
  "sampleRomantic": "<텍스트 본문>"
}
요구사항:
- 섹션 순서/제목 고정 및 텍스트 사용하고, 섹션별로 줄바꿈 적용.
이성이 보는 <이름>님의 치명적인 매력
- 첫 줄: 동물 비유+이모지 1문장
- 불릿 5~7개: (1) 출생 시각 지지 기반 은밀한 분위기, (2) 오행 균형/부족 → 외모/눈빛/아우라, (3) 첫인상 vs 실제 대비, (4) 외적 스타일(패션/체격/분위기), (5) 숨겨진 무드/태도, (6) 겉과 속의 양면성 강조

<이름>님의 연애는 〇〇형이에요
- 첫 문장에 ~형 키워드 포함
- 150~200자 설명(시작 무드 → 진행 패턴 → 이성이 느끼는 감정)
- Gen Z 느낌, 이모지 2~4개(예: 🔥🎢✨👉)


<이름>님이 타고난 도화는 〇〇도화입니다
- ✨ 밝은 면: 키워드 4~6개
- 🌘 어두운 면: 키워드 3~5개

규칙:
- 유니코드 이모지만 사용(콜론 이모지 :sparkles: 금지).
- [이름]/[생년월일]/[출생시각] 등 대괄호 플레이스홀더 출력 금지 → 실제 값으로 치환.
- 십신/일간 같은 전문용어 남발 금지, "~요"체로 가볍고 센스 있게.
- JSON 외 주석/코드펜스/설명문 출력 금지.`;


/** ROMANTIC 전용: 프롬프트에서 장 제목 추출 ("장 제목: …", "제 N장 …", "N장. …") */
function extractRomanticChapterTitleFromPrompt(promptStr) {
  const lines = String(promptStr).split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    const labeled = t.match(/^장\s*제목:\s*(.+)$/);
    if (labeled) return labeled[1].trim();
    if (/^제\s*\d+\s*장.+$/.test(t)) return t.replace(/\s{2,}/g, " ");
    if (/^\d+\s*장\.\s+.+$/.test(t)) return t;
  }
  return null;
}

function normalizeGenderKey(genderRaw) {
  const g = String(genderRaw ?? "").trim().toLowerCase();
  return (["여", "여자", "여성", "female", "woman", "f"].includes(g)) ? "woman" : "man";
}

function dayStemToRomanticFileKey(dayStemRaw) {
  const s = String(dayStemRaw ?? "").trim();
  const map = {
    "甲": "갑목", "乙": "을목", "丙": "병화", "丁": "정화", "戊": "무토",
    "己": "기토", "庚": "경금", "辛": "신금", "壬": "임수", "癸": "계수",
    "갑": "갑목", "을": "을목", "병": "병화", "정": "정화", "무": "무토",
    "기": "기토", "경": "경금", "신": "신금", "임": "임수", "계": "계수",
  };
  return map[s] || map[s[0]] || null;
}

function injectRomanticChapter4SpouseFace(result, pillars, userInfo) {
  if (!Array.isArray(result) || !pillars) return result;

  const chapter4Idx = result.findIndex((r) => {
    const ch = String(r?.chapter ?? "");
    return ch.startsWith("4장") || ch.includes("운명의 짝") || ch.includes("배우자");
  });
  if (chapter4Idx < 0) return result;

  const chapter4Title = String(result[chapter4Idx]?.chapter || "4장");
  const genderKey = normalizeGenderKey(userInfo?.gender);
  const stemKey = dayStemToRomanticFileKey(pillars?.day?.gan) || "갑목";
  const imgSrc = `/assets/images/tight/romantic/report/${genderKey}/${stemKey}.png`;

  const title = "풀이 0. 미래 배우자 얼굴은 어떻게 생겼을까?";
  const exists = result.some((r) => String(r?.chapter ?? "") === chapter4Title && String(r?.title ?? "") === title);
  if (exists) return result;

  const content = `
    <div class="face-viz">
      <div class="avatar">
        <img
          src="${imgSrc}"
          class="w-full rounded-xl"
          onerror="this.style.display='none';"
          alt="미래 배우자 얼굴 이미지"
        />
        <div class="avatar-cap">(${stemKey} 기준 이미지)</div>
      </div>
      <div>
        <div class="callout kind-note" style="margin-top:0;">
          <div class="co-top">
            <span class="co-badge">NOTE</span>
            <span class="co-title">미래 배우자 ‘얼굴상’ 힌트</span>
          </div>
          <div class="co-body">
            <div class="p"><span class="hl">눈/눈매</span>: 첫인상에서 가장 먼저 박히는 포인트(시선의 각, 눈매의 선명도)를 보세요.</div>
            <div class="p"><span class="hl">얼굴형</span>: 둥근/갸름/각진 느낌처럼 윤곽의 ‘톤’을 먼저 잡으면 전체 인상이 정리됩니다.</div>
            <div class="p"><span class="hl">분위기</span>: 차분·도회·부드러움 같은 무드가 표정/헤어/스타일에 어떻게 묻어나는지 체크해 보세요.</div>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  const item = { chapter: chapter4Title, title, content, isHtml: true };
  const next = result.slice();
  next.splice(chapter4Idx, 0, item);
  return next;
}

/**
 * GptService: Handles ChatGPT prompt calls for 사주 리포트
 */
class GptService {


 async callReport(userInfo, goodsType) {
let promtParts;
    // goodsType이 객체일 수도 있고 문자열일 수도 있으므로 안전하게 code 추출
    const gCode = typeof goodsType === 'string' ? goodsType : (goodsType?.code || goodsType); 

    if (gCode === "CLASSIC" || gCode === "CLASSIC_BUNDLE") {
        promtParts = CLASSIC_REPORT_PROMPT_PARTS;
    } else if (gCode === "ROMANTIC" || gCode === "ROMANTIC_BUNDLE") {
        promtParts = ROMANTIC_REPORT_PROMPT_PARTS;
    } else if (gCode === "PREMIUM_SAJU") {
        promtParts = PREMIUM_REPORT_PROMPT_PARTS;
    } else if (gCode === "ADULT" || gCode === "ADULT_BUNDLE") {
        promtParts = [];
    } else {
        throw new Error(`지원하지 않는 상품 코드입니다: ${gCode}`);
    }

    try {
      // ✅ 1) 사주 계산 (새 로직 적용)
      const pillars = getFourPillars(userInfo);

      // ✅ ADULT: GPT 미사용, 템플릿 조립 즉시 반환
      if (gCode === "ADULT" || gCode === "ADULT_BUNDLE") {
        return buildAdultReportFromTemplates({ userInfo, pillars });
      }

      // ✅ 1.5) GPT에게 보낼 SAJU_JSON 구조 생성 (callSample 로직 참고)
      const fixedUser = { ...userInfo, birthDate: userInfo.birthDate || userInfo.birthdate };
      const deterministicTable = buildDeterministicTenGodTable(fixedUser);

      const tenGodTable = {
        headerRows: ["시주", "일주", "월주", "년주"],
        columns: ["십성", "천간", "지지", "십성", "십이운성", "십이신살", "귀인"],
        data: [
          // index 0: 시주
          ["", pillars.hour.gan, pillars.hour.ji, "", "", "", ""],
          // index 1: 일주
          ["", pillars.day.gan, pillars.day.ji, "", "", "", ""],
          // index 2: 월주
          ["", pillars.month.gan, pillars.month.ji, "", "", "", ""],
          // index 3: 년주
          ["", pillars.year.gan, pillars.year.ji, "", "", "", ""],
        ],
      };

      // 계산된 천간/지지를 유지하면서 나머지 십성/운성 데이터를 덮어씌웁니다.
      for (let i = 0; i < 4; i++) {
        const detRow = deterministicTable.data[i];
        const currentPillarRow = tenGodTable.data[i];
        currentPillarRow[0] = detRow[0]; // 십성 (시주)
        currentPillarRow[3] = detRow[3]; // 십성 (일주/월주/년주의 십성)
        currentPillarRow[4] = detRow[4]; // 십이운성
        currentPillarRow[5] = detRow[5]; // 십이신살
        currentPillarRow[6] = detRow[6]; // 귀인
      }

      // MoneySteps, futurePartner 등도 GPT가 요청하는 구조에 맞춰 빈 배열/객체라도 넣어줍니다.
      const sajuJsonForGPT = {
        tenGodTable,
        fiveElements: {
          elements: pillars.fiveElements,
          gainFrom: "",
          lossFrom: ""
        },
        daewoon: pillars.daewoon, // 대운 전달

        sewun: pillars.sewun,

        tenGod: pillars.tenGod,
        moneySteps: [],
        zodiacSign: pillars.zodiac,
        // GPT가 프롬프트에서 요구하는 모든 키를 포함해야 합니다.
        noblePeople: pillars.noble,     // 귀인(貴人)
        spouse: pillars.spouse,         // 배우자궁 정보
        monthRelation: pillars.relationYM, // 일간-월지 상생/상극
        flow: pillars.flow,                 // 비겁·재성·관성 흐름 분석 결과
        twelveGodKill: pillars.gods12,      // 12신살 & 살성
        futurePartner: { job: "", appearance: [], personality: [], feature: [] },
        hourUnknown: pillars.isUnknownTime,  // 시간 미상 인지 가능하게

        // 추가 컨텍스트도 함께 보냅니다.
        userInfo: userInfo,
        currentYear: new Date().getFullYear(),
      };
      // End of 1.5) GPT에게 보낼 SAJU_JSON 구조 생성

      const pillarSummary = `${pillars.year.gan}${pillars.year.ji}년 ${pillars.month.gan}${pillars.month.ji}월 ${pillars.day.gan}${pillars.day.ji}일 ${pillars.hour.gan}${pillars.hour.ji}시 (${pillars.zodiac})`;

      // ✅ 3) GPT에게 넘길 user context 구성
      const contextInfo = `
        [사용자 사주 요약]
        이름: ${userInfo.name}
        성별: ${userInfo.gender}
        생년월일시: ${pillarSummary}
        ${pillars.isUnknownTime ? "\n⚠ 태어난 시간이 확인되지 않아 시주는 참고용으로만 활용해야 합니다.\n"  : "" }
      `;

      let result = [];
      const isRomanticProduct = gCode === "ROMANTIC" || gCode === "ROMANTIC_BUNDLE";
      /** report.ejs isHtml 블록용 */
      const withRomanticHtml = (row, opts = {}) => {
        if (!isRomanticProduct || opts.skipHtml) return row;
        return { ...row, isHtml: true };
      };

      const currentYear = new Date().getFullYear();
      const yearContext = `\n\n[CONTEXT] The current year for this analysis is ${currentYear}. All predictions and timeline references must be based on this year.`;

      // 티어 1 등 낮은 TPM 한도에서는 gpt-4o 연속 챕터 호출 시 429가 잦습니다. OPENAI_REPORT_MODEL로 덮어쓰기(예: gpt-4o).
      const reportModel =
        process.env.OPENAI_REPORT_MODEL?.trim() || "gpt-4o-mini";

      // ✅ 4) 챕터별로 프롬프트 조합 시 계산값 삽입
      for (let i = 0; i < promtParts.length; i++) {
        console.log(`[REPORT] 챕터 ${i + 1}/${promtParts.length} GPT 호출 시작 (모델: ${reportModel})`);
        const fullSystemPrompt = `
        ${promtParts[i]}

        ${contextInfo}
        [참고] GPT 분석을 위해 필요한 SAJU_JSON 데이터를 사용자 메시지에 담아 제공합니다.
        ${yearContext}`.trim();

let parsed = null;
let retryCount = 0;

while (retryCount <= 2 && !parsed) {
  try {
    const jsonHint =
      isRomanticProduct
        ? "\n[중요: JSON 한 개만 출력. 속성 따옴표는 작은따옴표(class='…')만, ASCII 큰따옴표 금지. 각 풀이=1:1 코치 디렉션: 번호 과제·복붙 대사 quote·금지 진부표현 회피. 분량·블록 조건 유지]"
        : "\n[중요: 반드시 JSON 형식으로만 답변하세요.]\n[절대 금지: {묘사 전문}, {사주 특징}, {연결 문구}, {키워드} 같은 플레이스홀더를 그대로 출력하지 마세요. 반드시 사전에서 선택한 실제 내용으로 대체해야 합니다.]";
    /** ROMANTIC 챕터는 HTML 포함으로 출력이 김 → 잘리면 불완전 JSON으로 파싱 실패 */
    const romanticMaxTokens =
      Number(process.env.OPENAI_ROMANTIC_MAX_TOKENS || 8192);
    const reportTempRaw = Number(process.env.OPENAI_REPORT_TEMPERATURE);
    const reportTemperature =
      Number.isFinite(reportTempRaw) && reportTempRaw >= 0 && reportTempRaw <= 2
        ? reportTempRaw
        : isRomanticProduct
          ? 0.35
          : undefined;
    const response = await GptClient.callChatGpt(
      [
        { role: "system", content: fullSystemPrompt + jsonHint },
        { role: "user", content: JSON.stringify(sajuJsonForGPT) },
      ],
      reportModel,
      isRomanticProduct
        ? { maxTokens: romanticMaxTokens, temperature: reportTemperature }
        : reportTemperature !== undefined
          ? { temperature: reportTemperature }
          : undefined
    );

    const cleanedResponse = preClean(String(response));
    
    // 플레이스홀더 검증: {묘사 전문}, {사주 특징}, {연결 문구}, {키워드} 같은 플레이스홀더가 남아있는지 확인
    const placeholderPattern = /\{(묘사 전문|사주 특징|연결 문구|키워드)\}/g;
    if (placeholderPattern.test(cleanedResponse)) {
      console.warn(`[챕터 ${i}] 플레이스홀더가 남아있습니다. 재시도합니다.`);
      retryCount++;
      if (retryCount > 2) {
        console.error(`[챕터 ${i}] 플레이스홀더 제거 실패. 원본 응답:`, cleanedResponse.substring(0, 500));
        // 플레이스홀더가 남아있어도 파싱은 시도
      } else {
        await new Promise(res => setTimeout(res, 1000)); // 1초 후 재시도
        continue;
      }
    }
    
    // 1차 파싱 시도
    try {
      parsed = safeJsonParseLooser(cleanedResponse, `REPORT-CH-${i}`);
      
      // 파싱 성공 후에도 플레이스홀더 검증
      const parsedString = JSON.stringify(parsed);
      if (placeholderPattern.test(parsedString)) {
        console.warn(`[챕터 ${i}] 파싱된 데이터에 플레이스홀더가 남아있습니다. 재시도합니다.`);
        parsed = null; // 파싱 결과 무효화
        retryCount++;
        if (retryCount > 2) {
          console.error(`[챕터 ${i}] 플레이스홀더 제거 실패. 파싱된 데이터:`, parsedString.substring(0, 500));
        } else {
          await new Promise(res => setTimeout(res, 1000));
          continue;
        }
      }
    } catch (e) {
      // 파싱 실패 시 JSON 블록만 강제 추출 후 2차 시도
      const jsonOnly = forceJsonOnly(cleanedResponse);
      if (jsonOnly) {
        parsed = safeJsonParseLooser(jsonOnly, `REPORT-FORCED-CH-${i}`);
        
        // 강제 추출 후에도 플레이스홀더 검증
        const parsedString = JSON.stringify(parsed);
        if (placeholderPattern.test(parsedString)) {
          console.warn(`[챕터 ${i}] 강제 추출된 데이터에 플레이스홀더가 남아있습니다. 재시도합니다.`);
          parsed = null;
          retryCount++;
          if (retryCount > 2) {
            console.error(`[챕터 ${i}] 플레이스홀더 제거 실패.`);
          } else {
            await new Promise(res => setTimeout(res, 1000));
            continue;
          }
        }
      }
    }
  } catch (err) {
    retryCount++;
    console.error(`[타이트 챕터 ${i} 시도 ${retryCount}] 실패:`, err.message);
    if (retryCount > 2) throw err; // 3번 실패 시 에러 상위 전달
    await new Promise(res => setTimeout(res, 500)); // 0.5초 후 재시도
  }
}





        // 파싱 결과 처리 및 검증
        if (!parsed) {
          console.error(`[챕터 ${i}] 파싱 실패: parsed가 null입니다.`);
          // 파싱 실패 시에도 기본 구조라도 추가하여 장은 표시되도록 함
          const expectedChapter = isRomanticProduct
            ? extractRomanticChapterTitleFromPrompt(promtParts[i]) 
            : `제${i + 1}장`;
          result.push(withRomanticHtml({
            chapter: expectedChapter || `제${i + 1}장`,
            title: "내용 생성 중 오류 발생",
            content: "이 챕터의 내용을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
          }, { skipHtml: true }));
        } else if (Array.isArray(parsed) && parsed[0]?.sections) {
          parsed.forEach((chapter) => {
            if (chapter.sections && Array.isArray(chapter.sections)) {
              chapter.sections.forEach((section) => {
                if (section && (section.title || section.content)) {
                  const cleanedContent = removePlaceholders(section.content || "");
                  result.push(withRomanticHtml({
                    chapter: chapter.chapter || `제${i + 1}장`,
                    title: section.title || "제목 없음",
                    content: cleanedContent,
                  }));
                } else {
                  console.warn(`[챕터 ${i}] 섹션 데이터가 비어있습니다:`, section);
                }
              });
            } else {
              console.warn(`[챕터 ${i}] sections 배열이 없거나 비어있습니다:`, chapter);
            }
          });
        } else if (Array.isArray(parsed) && parsed[0]?.title && parsed[0]?.content) {
          parsed.forEach((item) => {
            if (item && item.content) {
              const cleanedContent = removePlaceholders(item.content || "");
              result.push(withRomanticHtml({
                chapter: item.chapter || `제${i + 1}장`,
                title: item.title || "제목 없음",
                content: cleanedContent,
              }));
            }
          });
        } else if (parsed?.sections) {
          let chapterValue = parsed.chapter;
          if (isRomanticProduct) {
            const expectedChapter = extractRomanticChapterTitleFromPrompt(promtParts[i]) || parsed.chapter;
            const looksLikeSectionTitle = typeof chapterValue === "string" && /^\d+-\d+\.\s/.test(chapterValue);
            if (!chapterValue || looksLikeSectionTitle) {
              chapterValue = expectedChapter;
            }
          }
          
          if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
            parsed.sections.forEach((section) => {
              if (section && (section.title || section.content)) {
                const cleanedContent = removePlaceholders(section.content || "");
                result.push(withRomanticHtml({
                  chapter: chapterValue || `제${i + 1}장`,
                  title: section.title || "제목 없음",
                  content: cleanedContent,
                }));
              } else {
                console.warn(`[챕터 ${i}] 섹션 데이터가 비어있습니다:`, section);
              }
            });
          } else {
            console.warn(`[챕터 ${i}] sections 배열이 비어있습니다. parsed 구조:`, JSON.stringify(parsed, null, 2));
            // sections가 비어있어도 장은 추가
            result.push(withRomanticHtml({
              chapter: chapterValue || `제${i + 1}장`,
              title: "내용 생성 중",
              content: "이 챕터의 내용을 생성하는 중입니다.",
            }, { skipHtml: true }));
          }
        } else {
          // 예상하지 못한 구조일 때 로깅 및 기본값 추가
          console.error(`[챕터 ${i}] 예상하지 못한 파싱 구조입니다. parsed:`, JSON.stringify(parsed, null, 2));
          const expectedChapter = isRomanticProduct
            ? extractRomanticChapterTitleFromPrompt(promtParts[i]) 
            : `제${i + 1}장`;
          result.push(withRomanticHtml({
            chapter: expectedChapter || `제${i + 1}장`,
            title: "내용 생성 중 오류 발생",
            content: "이 챕터의 내용을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
          }, { skipHtml: true }));
        }
      }

      if (isRomanticProduct) {
        result = injectRomanticChapter4SpouseFace(result, pillars, userInfo);
      }
      return result;
    } catch (error) {
      console.error("Error calling GPT:", error);
      throw error;
    }
  }

 

      // 취합된 최종 결과 반환

  // async callSample(userInfo, goods) {
  //   try {
  //     const response = await GptClient.callChatGpt([
  //       { role: "system", content: SAMPLE_PROMPT_PARTS },
  //       { role: "user", content: JSON.stringify(userInfo) }
  //     ]);

  //     console.log(response);

  //     const cleanResponse = response
  //       .replace(/^```json\s*/, "")
  //       .replace(/```$/, "");

  //     const result = JSON.parse(cleanResponse);

  //     try {
  //       const solar = toSolarFromUserInfo(userInfo);
  //       const lunar = solar.getLunar();
  //       const ec = lunar.getEightChar();
  //       const out = buildOutFromLunar(lunar, ec);
  //       const tenGodTable = buildTenGodTable(out, userInfo);
  //       result.tenGodTable = tenGodTable;
  //     } catch (e) {
  //       console.error("tenGodTable 계산 중 오류(lunar-javascript):", e);
  //     }

  //     if (goods == GoodsType.ROMANTIC) {
  //       const romanticResponse = await GptClient.callChatGpt([
  //         { role: "system", content: ROMANTIC_SAMPLE_PROMPT },
  //         { role: "user", content: JSON.stringify(userInfo) }
  //       ]);

  //       const cleanRomanticResponse = romanticResponse
  //         .replace(/^```json\s*/, "")
  //         .replace(/```$/, "")
  //         .replace(/###/, "");

  //       const romanticResult = JSON.parse(cleanRomanticResponse);
  //       result.sampleRomantic = romanticResult.sampleRomantic;
  //     }

  //     return result;
  //   } catch (error) {
  //     console.error("Error calling GPT:", error);
  //     throw error;
  //   }
  // }

  async callSample(userInfo, goods) {
    try {
      // 1️⃣ 사주 4주 계산 (연/월/일/시 + 띠)
      const fixedUser = {
        ...userInfo,
        birthDate: userInfo.birthDate || userInfo.birthdate,
      };
      const pillars = getFourPillars(fixedUser);

      // 2️⃣ deterministic table을 사용하여 십성, 운성, 귀인 등 미리보기에 필요한 데이터를 생성합니다.
      const deterministicTable = buildDeterministicTenGodTable(fixedUser);
      const hGan = pillars.hour.gan ?? "-";
      const hJi = pillars.hour.ji ?? "-";

      // 기본 데이터 배열을 시-일-월-년 순서로 초기화
      const tenGodTable = {
        headerRows: ["시주", "일주", "월주", "년주"], // EJS에서 이 순서대로 출력됨
        columns: ["십성", "천간", "지지", "십성", "십이운성", "십이신살", "귀인"],
        data: [
          // index 0: 시주
          ["", hGan, hJi, "", "", "", ""],
          // index 1: 일주
          ["", pillars.day.gan, pillars.day.ji, "", "", "", ""],
          // index 2: 월주
          ["", pillars.month.gan, pillars.month.ji, "", "", "", ""],
          // index 3: 년주
          ["", pillars.year.gan, pillars.year.ji, "", "", "", ""],
        ],
      };

      // 계산된 천간/지지를 유지하면서 나머지 십성/운성 데이터를 덮어씌웁니다.
      for (let i = 0; i < 4; i++) {
        const detRow = deterministicTable.data[i];
        const currentPillarRow = tenGodTable.data[i];

        currentPillarRow[0] = detRow[0]; // 십성 (시주)
        currentPillarRow[3] = detRow[3]; // 십성 (일주/월주/년주의 십성)
        currentPillarRow[4] = detRow[4]; // 십이운성
        currentPillarRow[5] = detRow[5]; // 십이신살
        currentPillarRow[6] = detRow[6]; // 귀인
      }

      // 3️⃣ 최종 결과 구조에 계산된 데이터를 정확히 매핑합니다.
      const result = {
        tenGodTable,
        luckCycle: [],
        fiveElements: {
          elements: pillars.fiveElements,
          gainFrom: "",
          lossFrom: ""
        },
        moneySteps: [],
        zodiacSign: pillars.zodiac,
        // 오늘 운세도 GPT 호출 없이 샘플 데이터에서 가져오도록 강제 (GPT 호출은 유료 페이지에서만)
        todayLimit: "청명선생이 당신의 사주팔자를 깊이 분석했습니다. 지금 정통사주를 확인하고 운명에 숨겨진 비밀을 밝혀보세요.",
        futurePartner: { job: "", appearance: [], personality: [], feature: [] },
      };

      return result;
    } catch (error) {
      console.error("Error in callSample:", error);
      throw error;
    }
  }

  // src/framework/web/service/GptService.js 파일 내 callSample 함수 전체
  async callSample_jujangso(userInfo, goods) {
    try {
      const response = await GptClient.callChatGpt([
        { role: "system", content: SAMPLE_PROMPT_PARTS },
        { role: "user", content: JSON.stringify(userInfo) }
      ]);

      const cleanResponse = response
        .replace(/^```json\s*/, "")
        .replace(/```$/, "");

      const parsedResponse = JSON.parse(cleanResponse);
      // const parsedResponse = {
      //   tenGodTable: {
      //     headerRows: ['시주', '일주', '월주', '년주'],
      //     columns: [
      //       '십성', '천간',
      //       '지지', '십성',
      //       '십이운성', '십이신살',
      //       '귀인'
      //     ],
      //     data: [["편재", "乙", "巳", "상관", "제왕", "화개", "복성"], ["편재", "壬", "辰", "식신", "양", "겁살", "학당"], ["겁재", "辛", "巳", "정관", "관대", "지살", "문창"], ["편인", "庚", "辰", "식신", "양", "망신", "복성"]]
      //   },
      //   luckCycle: [
      //     { year: 2006, age: 6 },
      //     { year: 2016, age: 16 },
      //     { year: 2026, age: 26 },
      //     { year: 2036, age: 36 },
      //     { year: 2046, age: 46 },
      //     { year: 2056, age: 56 }
      //   ],
      //   fiveElements: {
      //     elements: { '목': 2, '화': 2, '토': 2, '금': 1, '수': 2 },
      //     gainFrom: '목의 기운을 보완하여 창의력을 발휘할 수 있는 환경을 조성하세요.',
      //     lossFrom: '수의 기운이 과도하면 감정적으로 불안정해질 수 있으니 주의하세요.'
      //   },
      //   moneySteps: [
      //     {
      //       age: 25,
      //       money: '중상',
      //       description: '재물운이 상승하는 시기로, 투자에 유리한 시기입니다.'
      //     },
      //     {
      //       age: 35,
      //       money: '상',
      //       description: '재정적으로 안정된 시기로, 큰 성과를 기대할 수 있습니다.'
      //     }
      //   ],
      //   zodiacSign: '용띠',
      //   todayLimit: '오늘은 주변 사람들과의 관계에서 조화와 균형을 유지하는 것이 중요합니다. 감정적으로 예민해질 수 있는 날이니, 차분하게 상황을 바라보는 것이 필요합니다. 새로운 기회를 잡기 위해서는 적극적인 자세가 필요하며, 자신의 능력을 믿고 도전하는 것이 좋습니다.',
      //   futurePartner: {
      //     job: '의사',
      //     appearance: ['단정', '깔끔', '세련'],
      //     personality: ['친절', '사려깊음'],
      //     feature: ['웃음', '눈빛']
      //   }
      // }

      // 1️⃣ 사주 4주 계산 (연/월/일/시 + 띠)
      const fixedUser = {
        ...userInfo,
        birthDate: userInfo.birthDate || userInfo.birthdate,
      };
      const pillars = getFourPillars(fixedUser);
      // console.log("[DEBUG] Sample Four Pillars:", pillars);

      // 2️⃣ deterministic table을 사용하여 십성, 운성, 귀인 등 미리보기에 필요한 데이터를 생성합니다.
      const deterministicTable = buildDeterministicTenGodTable(fixedUser);
      const hGan = pillars.hour.gan ?? "-";
      const hJi = pillars.hour.ji ?? "-";

      // 기본 데이터 배열을 시-일-월-년 순서로 초기화
      const tenGodTable = {
        headerRows: ["시주", "일주", "월주", "년주"], // EJS에서 이 순서대로 출력됨
        columns: ["십성", "천간", "지지", "십성", "십이운성", "십이신살", "귀인"],
        data: [
          // index 0: 시주
          ["", toHanja(pillars.hour.gan), toHanja(pillars.hour.ji), "", "", "", ""],
          // index 1: 일주
          ["", toHanja(pillars.day.gan), toHanja(pillars.day.ji), "", "", "", ""],
          // index 2: 월주
          ["", toHanja(pillars.month.gan), toHanja(pillars.month.ji), "", "", "", ""],
          // index 3: 년주
          ["", toHanja(pillars.year.gan), toHanja(pillars.year.ji), "", "", "", ""],
        ],
      };

      // 계산된 천간/지지를 유지하면서 나머지 십성/운성 데이터를 덮어씌웁니다.
      for (let i = 0; i < 4; i++) {
        if (tenGodTable.data[i][1] == '-' || tenGodTable.data[i][2] == '-') {
          const currentPillarRow = tenGodTable.data[i];
          currentPillarRow[0] = '-'; // 십성 (시주)
          currentPillarRow[3] = '-'; // 십성 (일주/월주/년주의 십성)
          currentPillarRow[4] = '-'; // 십이운성
          currentPillarRow[5] = '-'; // 십이신살
          currentPillarRow[6] = '-'; // 귀인
        }
        else {
          const detRow = deterministicTable.data[i];
          const currentPillarRow = tenGodTable.data[i];

          currentPillarRow[0] = cutToTwoChars(detRow[0]); // 십성 (시주)
          currentPillarRow[3] = cutToTwoChars(detRow[3]); // 십성 (일주/월주/년주의 십성)
          currentPillarRow[4] = cutToTwoChars(detRow[4]); // 십이운성
          currentPillarRow[5] = cutToTwoChars(detRow[5]); // 십이신살
          currentPillarRow[6] = cutToTwoChars(detRow[6]); // 귀인
        }

      }

      // 3️⃣ 최종 결과 구조에 계산된 데이터를 정확히 매핑합니다.
      const result = {
        tenGodTable,
        luckCycle: parsedResponse.luckCycle,
        fiveElements: {
          elements: pillars.fiveElements,
          gainFrom: parsedResponse.fiveElements.gainFrom,
          lossFrom: parsedResponse.fiveElements.lossFrom
        },
        moneySteps: parsedResponse.moneySteps,
        zodiacSign: pillars.zodiac,
        // 오늘 운세도 GPT 호출 없이 샘플 데이터에서 가져오도록 강제 (GPT 호출은 유료 페이지에서만)
        todayLimit: parsedResponse.todayLimit,
        futurePartner: { job: parsedResponse.futurePartner.job, appearance: parsedResponse.futurePartner.appearance, personality: parsedResponse.futurePartner.personality, feature: parsedResponse.futurePartner.feature },
      };

      return result;
    } catch (error) {
      console.error("Error in callSample:", error);
      throw error;
    }
  }

}

function cutToTwoChars(str) {
  if (!str) return "";
  return str.length > 2 ? str.slice(0, 2) : str;
}

// 플레이스홀더 제거 및 검증 함수
function removePlaceholders(content) {
  if (!content || typeof content !== 'string') return content;
  
  const placeholderPattern = /\{(묘사 전문|사주 특징|연결 문구|키워드)\}/g;
  const hasPlaceholders = placeholderPattern.test(content);
  
  if (hasPlaceholders) {
    console.warn(`[플레이스홀더 발견] 제거 전:`, content.substring(0, 300));
    
    // 플레이스홀더만 제거하고 나머지 내용은 유지
    // 1. 플레이스홀더가 포함된 줄에서 플레이스홀더만 제거
    let cleanedContent = content.replace(placeholderPattern, '');
    
    // 2. "> " 로 시작하는 빈 줄이나 불완전한 줄 제거
    cleanedContent = cleanedContent
      .split('\n')
      .map(line => {
        // "> " 로 시작하지만 내용이 없는 줄 제거
        if (line.trim() === '>' || line.trim() === '> ') {
          return '';
        }
        return line;
      })
      .filter(line => line.trim().length > 0 || line === '\n') // 완전히 빈 줄만 제거
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // 3개 이상의 연속된 줄바꿈을 2개로 제한
      .trim();
    
    if (cleanedContent.length === 0) {
      console.error(`[플레이스홀더 제거 후 내용이 비어있음]`);
      return "이 섹션의 내용 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
    
    console.warn(`[플레이스홀더 제거 완료] 제거 후:`, cleanedContent.substring(0, 300));
    return cleanedContent;
  }
  
  return content;
}


/**
 * tenGodTable 내부 값을 모두 한자로 변환
 * @param {Object} table 
 * @returns {Object} newTable (원본 변경 없음)
 */
function convertTenGodTableToHanja(table) {
  if (!table || !Array.isArray(table.data)) return table;

  const converted = JSON.parse(JSON.stringify(table)); // 깊은 복사

  converted.data = table.data.map(row =>
    row.map(value => {
      if (!value) return value;
      return toHanja(value) || value; // 변환 실패하면 원본 사용
    })
  );

  return converted;
}

// --- Deterministic TenGod (십성표) Helpers (sample 전용) ---
const TEN_GOD_LIST = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"];
const HEAVENLY_STEMS_HANJA = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]; // 천간
const EARTHLY_BRANCHES_HANJA = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]; // 지지
const TWELVE_STAGE = ["장생", "목욕", "관대", "건록", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"]; // 십이운성
const TWELVE_GODKILL = ["천을귀인", "현살", "태극귀인", "천살", "월살", "망신살", "장성살", "반안살", "육해살", "화개살", "지살", "겁살"]; // 십이신살 예시
const NOBLE_STAR = ["문창귀인", "천덕귀인", "월덕귀인", "천을귀인", "학당귀인", "도화", "양인", "복성", "천기성", "천재성"]; // 귀인

function stableHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}
function pick(list, hash, offset) {
  const idx = parseInt(hash.slice(offset, offset + 2), 16) % list.length;
  return list[idx];
}
function buildDeterministicTenGodTable(userInfo) {
  const name = (userInfo?.name || '').trim().toUpperCase();
  const birthDate = (userInfo?.birthDate || userInfo?.birthdate || '').replace(/[^0-9]/g, '');
  const birthTime = (userInfo?.birthTime || userInfo?.birth_time || '').toString().padStart(2, '0');
  const gender = (userInfo?.gender || '').trim().toUpperCase();
  const key = `${name}|${birthDate}|${birthTime}|${gender}`;
  const h = stableHash(key);

  const headerRows = ["시주", "일주", "월주", "년주"]; // 고정
  const columns = ["십성", "천간", "지지", "십성", "십이운성", "십이신살", "귀인"]; // 고정

  const data = headerRows.map((_, i) => {
    const base = i * 8; // 간격
    const ten1 = pick(TEN_GOD_LIST, h, base);
    const stem = pick(HEAVENLY_STEMS_HANJA, h, base + 2);
    const branch = pick(EARTHLY_BRANCHES_HANJA, h, base + 4);
    const ten2 = pick(TEN_GOD_LIST, h, base + 6);
    const stage = pick(TWELVE_STAGE, h, base + 8);
    const godKill = pick(TWELVE_GODKILL, h, base + 10);
    const noble = pick(NOBLE_STAR, h, base + 12);
    return [ten1, stem, branch, ten2, stage, godKill, noble];
  });

  return {
    headerRows,
    columns,
    data,
    deterministicKey: h.slice(0, 16)
  };
}
function enforceDeterministicTenGodTable(resultObj, table) {
  if (!resultObj || typeof resultObj !== 'object' || !table) return;
  const target = (resultObj.tenGodTable && typeof resultObj.tenGodTable === 'object') ? resultObj.tenGodTable : {};
  const srcData = Array.isArray(table.data) ? table.data : [];

  // headerRows/columns: 기존 값 유지, 없으면 table 또는 기본값 사용
  target.headerRows = Array.isArray(target.headerRows) && target.headerRows.length
    ? target.headerRows
    : (Array.isArray(table.headerRows) && table.headerRows.length ? table.headerRows : ["시주", "일주", "월주", "년주"]);

  target.columns = Array.isArray(target.columns) && target.columns.length
    ? target.columns
    : (Array.isArray(table.columns) && table.columns.length ? table.columns : ["십성", "천간", "지지", "십성", "십이운성", "십이신살", "귀인"]);

  // data 보정: 4행 x 7열 보장
  const rows = Array.isArray(target.data) ? target.data : [];
  for (let r = 0; r < 4; r++) {
    if (!Array.isArray(rows[r])) rows[r] = new Array(7).fill("");
    for (let c = 0; c < 7; c++) {
      if (typeof rows[r][c] === 'undefined') rows[r][c] = "";
    }
  }

  // 1~3행, 4~6열만 비어 있을 때 table 값으로 채움
  for (let r = 1; r <= 3; r++) {
    for (let c = 4; c <= 6; c++) {
      const cur = rows?.[r]?.[c];
      const src = srcData?.[r]?.[c];
      const isEmpty = cur === "" || cur == null;
      const hasSrc = src != null && src !== "";
      if (isEmpty && hasSrc) rows[r][c] = src;
    }
  }

  target.data = rows;
  resultObj.tenGodTable = target;

  if (table.deterministicKey) {
    resultObj.tenGodDeterministicKey = table.deterministicKey;
  }
}

// 0) 공통 클리너: 코드펜스/제로폭/이상 공백/이모지 일부 제거
function preClean(text) {
  return String(text)
    .replace(/\uFEFF/g, "")            // BOM 제거
    .replace(/[\u200B-\u200D\u2060]/g, "") // ZWSP/ZWJ 등 제거
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "")) // 코드펜스 내용만 남기기
    .replace(/^[ \t]+/gm, "")          // 라인 선행 스페이스 정리
    .trim();
}
// 1) JSON 경계 안전 탐색 헬퍼
function firstJsonStartIndex(text) {
  const iObj = text.indexOf("{");
  const iArr = text.indexOf("[");
  if (iObj === -1) return iArr;
  if (iArr === -1) return iObj;
  return Math.min(iObj, iArr);
}
function lastJsonEndIndex(text) {
  const iObj = text.lastIndexOf("}");
  const iArr = text.lastIndexOf("]");
  if (iObj === -1) return iArr;
  if (iArr === -1) return iObj;
  return Math.max(iObj, iArr);
}

// 2) 스택 기반: 첫 번째 완전한 JSON 블록 추출 (문자열/이스케이프 안전)
function findFirstJsonBlock(s) {
  const text = String(s);
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") { start = i; break; }
  }
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    } else {
      if (ch === '"') { inStr = true; continue; }
      if (ch === open) depth++;
      else if (ch === close) depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null; // 닫힘 못 찾음
}
function forceJsonOnly(text) {
  const block = findFirstJsonBlock(text);
  if (block) return block;

  const start = firstJsonStartIndex(text);
  const end = lastJsonEndIndex(text);
  if (start !== -1 && end !== -1 && start < end) {
    return text.slice(start, end + 1);
  }
  return null;
}
function extractJsonObject(text) {
  const start = firstJsonStartIndex(text);
  const end = lastJsonEndIndex(text);
  if (start === -1 || end === -1 || start >= end) {
    throw new Error("유효한 JSON 영역을 찾을 수 없습니다.");
  }
  return text.substring(start, end + 1);
}

/** 타이포그래피 따옴표를 JSON 에 안전하게: 큰 스마트따옴표는 「」 로만 변경( ASCII " 로 바꾸면 문자열 깨짐 ) */
function normalizeTypographyForJson(raw) {
  return String(raw)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u201C/g, "\u300C")
    .replace(/\u201D/g, "\u300D");
}

function tryRepairParse(blob, tag, stepLabel) {
  try {
    return JSON.parse(blob);
  } catch (e1) {
    const jr = getJsonrepair();
    if (!jr) throw e1;
    try {
      const repaired = jr(blob);
      const parsed = JSON.parse(repaired);
      console.warn(`[${tag}] ${stepLabel}: jsonrepair 후 파싱 성공`);
      return parsed;
    } catch {
      throw e1;
    }
  }
}

// 4) 관대한 파서(추출 → 정규화 → 파싱)
function safeJsonParseLooser(input, tag = "UNKNOWN") {
  let cleaned = normalizeTypographyForJson(preClean(input));

  // 가장 먼저 스택 기반으로 시도
  let core = findFirstJsonBlock(cleaned);

  // 실패하면 인덱스 기반
  if (!core) {
    try { core = extractJsonObject(cleaned); } catch (e) { /* noop */ }
  }

  // 그래도 실패하면 전체 시도
  if (!core) {
    console.warn(`[${tag}] JSON block not isolated. Fallback to full string parse.`);
    core = cleaned;
  }

  const blobs = [];
  blobs.push(["extracted 블록", core]);
  const jr = getJsonrepair();
  if (jr) {
    try {
      blobs.push(["jsonrepair(extracted)", jr(core)]);
    } catch {
      /* noop */
    }
    try {
      blobs.push(["jsonrepair(전체응답)", jr(cleaned)]);
    } catch {
      /* noop */
    }
    try {
      const healed = jr(cleaned);
      const block = findFirstJsonBlock(healed) || healed;
      blobs.push(["블록(jsonrepair 후)", block]);
    } catch {
      /* noop */
    }
  }

  let lastErr = null;
  for (const [label, text] of blobs) {
    if (typeof text !== "string" || !text.length) continue;
    try {
      return tryRepairParse(text, tag, label);
    } catch (e) {
      lastErr = e;
    }
  }

  const err = lastErr ?? new SyntaxError("JSON 파싱 실패");
  console.error(`[${tag}] JSON.parse failed. Preview(200):`, cleaned.slice(0, 200));
  console.error(`[${tag}] firstIdx=`, firstJsonStartIndex(cleaned), ` lastIdx=`, lastJsonEndIndex(cleaned));
  throw err;
}

// --- End Deterministic TenGod Helpers ---

export default new GptService();
