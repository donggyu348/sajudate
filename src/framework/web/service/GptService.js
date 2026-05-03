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

너는 30대 여자의 경험 많은 역술가야.
문체는 친구가 깊이 있게 조언해주는 느낌 ("~요"체)을 사용해.
29금·속궁합 보고서를 작성한다. SAJU_JSON을 기반으로 사주의 천간·지지·십성·오행·도화·홍염·충형·합 등을 해석하되,
**관능·욕망·유혹·침대 위 심리** 관점으로 풀이한다. 독자는 사주를 넣은 사람(일간 기준)이고, 분석 대상은 **상대방**이다.

🔥 톤 규칙 (매우 중요):
- 노골적 성기 묘사, 성행위를 프레임 단위로 직접 묘사하는 포르노형 글, 혐오·차별은 절대 금지.
- 그러나 **은유적이고 관능적인 표현**은 최대한 활용한다.
- "침대 위", "밤", "은밀한", "뜨거운", "숨결", "촉감", "눈빛", "속삭임", "몸의 언어", "전율", "열기" 등 감각적 어휘를 적극 사용.
- 상대를 자극하는 신체적 매력·무드·주도권·육체적 끌림을 사주 근거와 연결해 구체적으로 서술.
- 이모지 2~5개를 자연스럽게 (🔥👀💋🌙✨⚡ 등). 같은 표현·이모지 반복 금지, 챕터마다 맛을 바꿔.

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
📌 챕터: 1장. 그 사람, 침대 위에서 모습은?

입력 신호 중 **상대(원국) 쪽 오행·십성 무게**, **도화·홍염**, **관·비겁·식상 느낌**,
그리고 **일간 독자와 맞물리는 합충형·연애궁·흐름**까지 사용해 그 사람의 침대 위 기질·금기 속욕·주도권 패턴을 풀이한다.

📌 작성 가이드 — 섹션별 (title 문자열은 아래 출력과 완전 동일해야 함):

■ "본능 설계도: 사주 원국에 박힌 날것의 성적 에너지 분석."
- 첫 문단은 반드시 **한 줄 훅**으로 시작한다. (예시 스타일: "그 사람은 겉으로는 조용해 보여도, 밤에는 기운이 먼저 달아오르는 타입이에요🔥")
- 두 번째 문단부터: 원국 오행 편중(화·수 많음 등), 월 시즌 성, 일·시 기둥이 만드는 '몸의 리듬'을 **왜 성적으로 그렇게 읽히는지** 연결한다.
- 반드시 넣기: 무드(천천히 달궈지는지/한 번에 터지는지), 이성보다 몸이 먼저 가는지, 속도감 한 줄 비유.

■ "은밀한 판타지: 입 밖으로 내지 못한 그 사람만의 금기된 성적 공상."
- 도화·홍염·충형·내심 깊숙한 장소(금기·통제)·말 안 되는데 끌리는 패턴 등을 근거로 **말하지 못한 판타지 무드**를 그린다. (예시 스타일: "스스로에게도 부끄러운 줄 알지만, 어둠 속에서 더 선명해지는 상상이 있죠🌙")
- 구체 이름·실명 장소 지어내기 금지. 시나리오는 상징·분위기·장면 무드 중심.
- 평판 vs 밤 속 이중성을 최소 두 문단 이상 비교해서 쓴다.

■ "낮이밤이 vs 낮져밤져: 침대 위 주도권 싸움의 승자는 누구인가."
- 낮에는 누가 리드처럼 보이는지, 밤에는 누가 실제 무게추를 쥐는지 **커플 듀얼관점**으로 쓴다. (비겁·관성·식상 패턴 활용.)
- 표면적 말실수·말 속도·눈 높임·무릎 라인처럼 **몸 신호 단서** 세 가지 이상 넣어 구체적으로.
- 마지막 문단에서 '표면 승자'와 '무드 승자'가 다를 수 있다고 정리해도 된다.

■ "S/M 코드: 지배하고 싶은 욕구와 정복당하고 싶은 쾌감의 수치."
- 각각 **Dominant 점수 / Surrender 점수**처럼 0~100 은유 수치 두 줄 제시 후, 즉시 "실제 심리 테스트가 아니라 사주 패턴 종합이라는 표현임"을 한 문장 밝힌다.
- 사주 무게 비겁·관·도화 근거로 점수를 **왜 그렇게 읽히는지** 최소 두 문단.
- 지배=말·속도 통제 등, 정복 맡김=시선 따라가기 등 **포르노 아닌 관계 무드 표현으로만.**

📌 출력 (JSON Only)
{
  "chapter": "1장. 그 사람, 침대 위에서 모습은?",
  "sections": [
    { "title": "본능 설계도: 사주 원국에 박힌 날것의 성적 에너지 분석.", "content": "…" },
    { "title": "은밀한 판타지: 입 밖으로 내지 못한 그 사람만의 금기된 성적 공상.", "content": "…" },
    { "title": "낮이밤이 vs 낮져밤져: 침대 위 주도권 싸움의 승자는 누구인가.", "content": "…" },
    { "title": "S/M 코드: 지배하고 싶은 욕구와 정복당하고 싶은 쾌감의 수치.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 2장. 당신을 향한 그 사람의 성적 흥분

독자(당신)의 일간 오행·배합·도화 무드가 상대에게 남기는 각인과,
상대 신호 속 '당신 때문에 몸이 먼저 반응하는 조건'을 입력 기반으로 풀어쓴다.

📌 작성 가이드 — 섹션별:

■ "섹슈얼 아우라: 상대의 뇌리에 박힌 당신의 치명적인 이미지."
- 첫 달락에 **한 문장 시네마**: 눈을 감았을 때 떠오르는 당신의 실루엣·온도·소리. (예시 스타일: "그 사람 머릿속엔 당신이 '너무 조용한데 위험한 사람'으로 박혀 있어요👀")
- 일간·오행·도화·월령에 따른 '겉 vs 속' 대비를 최소 세 문단으로.
- 상대가 말로 표현 못 하는 부분을 **관찰자 시점**으로 적되, 독자를 비하하지 않는다.

■ "발정 포인트: 그 사람을 즉각적으로 반응하게 만드는 당신만의 신체적/분위기적 자극점."
- **감각 믹스** 필수: 시선 2초 더 머무름, 손등 스침, 숨이 닿는 거리, 말끝 톤, 웃을 때 입꼬리 등 4가지 이상 나열하되 서사로 엮는다.
- (예시 스타일: "당신이 아무 말 없이 고개만 살짝 기울이면—그 사람 숨이 먼저 짧아져요💋")
- 사주로는 합·식상·도화 쪽이 '즉각 반응'을 일으키는 이유를 한 번 풀어준다.

■ "유혹의 도파민: 당신이 가진 ‘함부로 할 수 없는’ 혹은 ‘망가뜨리고 싶은’ 매력 수치."
- **함부로 못 함 점수**와 **망가뜨리고 싶음 점수**를 0~100 은유로 따로 제시한 뒤, 왜 그렇게 느껴지는지 십성·오행으로 설명.
- '망가뜨린다'는 파괴가 아니라 **경계를 넘고 싶은 욕망** 은유로만 쓴다.
- 반드시 한 문단은 독자 자존감을 지키는 톤으로 마무리 (조롱 금지).

■ "관계를 뜨겁게 해줄 스릴있는 공간 추천."
- **공간 3곳** 이상: 조명·소음·동선·시야 차단·온도 중 2가지 이상 태그를 붙여 추천. (불법·타인 침해·위험한 공공장소 조장 금지.)
- (예시 스타일: "창가 옆이 아니라, 벽에 기대면 심장 소리가 들릴 만한 좁은 코너—그게 둘한테 가장 뜨거워요🌙")
- 평범한 데이트와 '밤의 긴장'이 달라지는 이유를 사주 흐름 한 줄로 연결.

📌 출력 (JSON Only)
{
  "chapter": "2장. 당신을 향한 그 사람의 성적 흥분",
  "sections": [
    { "title": "섹슈얼 아우라: 상대의 뇌리에 박힌 당신의 치명적인 이미지.", "content": "…" },
    { "title": "발정 포인트: 그 사람을 즉각적으로 반응하게 만드는 당신만의 신체적/분위기적 자극점.", "content": "…" },
    { "title": "유혹의 도파민: 당신이 가진 ‘함부로 할 수 없는’ 혹은 ‘망가뜨리고 싶은’ 매력 수치.", "content": "…" },
    { "title": "관계를 뜨겁게 해줄 스릴있는 공간 추천.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 3장. 짐승들의 합(合): 속궁합 & 케미

오행 조화와 십성 패턴으로 '닿았을 때 전율'의 이유를 풀고,
**합의** 속 즐거움이 커지도록 **체위 3종 + 상황 + 소품·도구**까지 구체적으로 이름을 제시해도 된다
(포르노처럼 동작 하나하나를 나열하지 말 것).
영적·무드 속궁합 vs 일박 불꽃 vs 깊게 스며드는 패턴도 대비해서 쓴다.

📌 작성 가이드 — 섹션별:

■ "육체적 싱크로율: 닿았을 때 전율이 오는 진짜 이유 (오행의 조화)."
- **왜 피부가 먼저 알아채는지**를 오행 상생·상극·부족·과다로 풀되, 독자 몸감으로 번역한다.
- (예시 스타일: "당신은 ○○ 기운이 중심인데, 그 사람은 ○○이 올라와 있어서—닿는 순간 전류처럼 맞아요⚡")
- 최소 한 번은 '말이 통하기 전에 몸이 통한다'는 문장을 변주해서 넣는다.

■ "베스트 플레이: 우리 둘의 쾌감을 극대화할 3가지 체위와 상황, 그리고 도구까지"
- **세트 3개** 고정 포맷으로 쓴다: (1) 체위 이름 + 왜 이 조합인지 한 줄 (2) 상황·무드 (3) 추천 소품/도구 1~2개 + 사용 이유(합의·안전·온도감).
- 각 세트마다 사주 근거 한 문장(예: 화 기운이면 리듬·열기, 수 기운이면 고요·깊이 등)을 붙인다.
- 프레임 단위 성행위 나열 대신 **장면의 온도·호흡·리듬**으로 묶는다.

■ "관계의 유효기간: 하룻밤의 불꽃인가, 영혼까지 잠식할 중독인가."
- 세 가지 시나리오 중 사주에 맞는 쪽을 골라 깊게: (A) 짧고 강한 불꽃 (B) 천천히 스며드는 중독무드 (C) 둘 다 오가는 파동.
- '중독'·'잠식'은 **은유**로만. 실제 불법·불건전 통제·약물은 금지.
- 마지막에 관계를 오래 가게 하려면 무엇을 조절해야 하는지 **구체 행동** 한 가지 이상.

📌 출력 (JSON Only)
{
  "chapter": "3장. 짐승들의 합(合): 속궁합 & 케미",
  "sections": [
    { "title": "육체적 싱크로율: 닿았을 때 전율이 오는 진짜 이유 (오행의 조화).", "content": "…" },
    { "title": "베스트 플레이: 우리 둘의 쾌감을 극대화할 3가지 체위와 상황, 그리고 도구까지", "content": "…" },
    { "title": "관계의 유효기간: 하룻밤의 불꽃인가, 영혼까지 잠식할 중독인가.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 4장. 이성을 무너뜨릴 19금 공략법

존중·합의 안에서 상대가 자꾸 떠올리게 만드는 리듬과 말,
주도권을 자연스럽게 되찾는 심리 장치,
호감을 넘선 독점욕 신호까지 사주 신호와 연결한다.

📌 작성 가이드 — 섹션별:

■ "마약 같은 유혹: 상대를 중독시켜 당신 없이는 만족할 수 없게 만드는 법."
- 제목은 강하지만 본문은 **비유**: '습관처럼 떠오름', '허기', '다음 만남을 몸이 먼저 기다림' 등으로 풀어낸다. 실제 마약·강요·불건전 조종 금지.
- **5단계 미니 로드맵** 추천: 첫 터치 → 말 속도 → 여백 → 예고 → 마무리 리듬. 각 단계마다 한 줄 대사 예시를 넣어도 된다.
- (예시 스타일: "급하게 붙잡지 말고, 하루 종일 '곧이어질 것'만 남겨두면 그 사람이 먼저 미쳐요🔥")
- 사주로는 도화·합·재성·관성 중 무엇이 '끊기 싫음'을 만드는지 연결.

■ "주도권 탈환: 관계의 흐름을 당신의 손바닥 위로 가져오는 심리적 장치."
- 힘겨루기가 아니라 **프레이밍**: 누가 시간을 정하고, 누가 멈춤을 말하고, 누가 칭찬로 방향을 트는지.
- 구체 장치 3개 이상: 여백 두기, 시선 먼저 끊기, 칭찬 한 박자 늦게 주기, '오늘은 내가' 한 문장 플래그 등.
- (예시 스타일: "상대가 밀어붙일 때 침묵 한 박 주면—오히려 그 사람 무릎부터 풀려요⚡")

■ "집착의 스위치: 단순한 호감을 넘어서 소유욕을 자극하는 트리거."
- 과한 스토킹 미화 금지. 대신 **일관된 약속·경계 속 독점감**(나만 아는 디테일 스며들기 등) 서술.
- 트리거 3개: 말 버릇 하나, 신체 디테일 하나, 시간 약속 리듬 하나.
- 마지막 문단에서 '상대 존중'과 '끌림'이 같이 가야 한다고 정리한다.

📌 출력 (JSON Only)
{
  "chapter": "4장. 이성을 무너뜨릴 19금 공략법",
  "sections": [
    { "title": "마약 같은 유혹: 상대를 중독시켜 당신 없이는 만족할 수 없게 만드는 법.", "content": "…" },
    { "title": "주도권 탈환: 관계의 흐름을 당신의 손바닥 위로 가져오는 심리적 장치.", "content": "…" },
    { "title": "집착의 스위치: 단순한 호감을 넘어서 소유욕을 자극하는 트리거.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 5장. 당신도 몰랐던 당신 안의 '밝힘'

일간 독자 본인 스위치, 은밀 Kink 각도를 상징·메타포로 깊게 파고,
합의 속에서 빛나는 매력을 적는다. 미성년·비합의·폭력으로 빗나가게 쓰지 말 것.

📌 작성 가이드 — 섹션별:

■ "switch on: 성적 본능이 깨어나는 결정적 순간."
- **촉발 장면 2개 이상**을 다른 감각으로 쓴다: 냄새/소리/온도/말 한마디/시선.
- (예시 스타일: "누가 먼저 손을 놓지 않을 때—그때 당신 안의 스위치가 확 올라가요✨")
- 십성·오행으로 '왜 그 순간에만 경계가 무너지는지' 설명. 스위치를 끄는 조건도 한 문단.

■ "위험한 취향: 도덕적 잣대를 벗어난 당신만의 은밀한 성향(Kink) 분석."
- Kink는 **상징·역할·리듬·언어** 수준으로만. 비합의·강압·실제 위험 행위 교본 금지.
- '금기'를 자책으로 끝내지 말고, **합의·존중 안에서의 건강한 표현**으로 번역하는 문단을 반드시 포함.
- (예시 스타일: "당신은 '지배당하는 척'이 아니라, 신뢰가 있을 때만 몸이 열리는 타입이에요🌙")

■ "쾌락의 해방: 억눌린 욕망을 표출했을 때 비로소 완성되는 당신의 진짜 매력."
- 억눌림의 출처(관성·인성·사회 기대 등)를 사주로 짚고, 풀렸을 때 달라지는 **눈빛·말투·걸음** 묘사.
- '완성'을 외모 평가가 아니라 **관계 안에서의 생명력**으로 정의한다.
- 마지막은 따뜻한 멘트로 끝내되 진부한 힐링 문구만 반복하지 말 것.

📌 출력 (JSON Only)
{
  "chapter": "5장. 당신도 몰랐던 당신 안의 '밝힘'",
  "sections": [
    { "title": "switch on: 성적 본능이 깨어나는 결정적 순간.", "content": "…" },
    { "title": "위험한 취향: 도덕적 잣대를 벗어난 당신만의 은밀한 성향(Kink) 분석.", "content": "…" },
    { "title": "쾌락의 해방: 억눌린 욕망을 표출했을 때 비로소 완성되는 당신의 진짜 매력.", "content": "…" }
  ]
}
`,

  `${CLASSIC_PROMPT_BASE}
────────────────────────────────────
📌 챕터: 6장. 몸정이 마음정 되는 운명적 상대

[대운 타이밍 고정 규칙]을 따라 **연도 구간별** 미칠 듯한 긴장·만남이 몰리기 쉬운 때를 적고,

눈빛만 봐도 '잘 하겠다' 싶은 무드의 사람 패턴을 관상+행태로 쓴다.

📌 작성 가이드 — 섹션별:

■ "최적의 파트너: 당신의 취향을 받아내고 리드할 상대의 특징."
- **외형 키워드 + 행태 키워드 + 말 버릇**을 묶음으로 4가지 이상 (특정인 실존 금지, 유형 묘사).
- 사주 배합: 독자 일간에게 식상·관·재 중 무엇이 '받아주는 리드'로 들어오는지 설명.
- (예시 스타일: "말보다 손이 먼저 배려하고, 농담도 밤에는 한 톤 낮추는 사람—그게 당신한테 최적이에요💋")

■ "조우의 타이밍: 이 미친듯한 긴장감이 폭발할 운명적 시기."
- 반드시 **연도 구간**을 이름으로 명시하고(고정 규칙 줄), 각 구간마다 들어오는 기운 한 줄 + 그 해에 일어나기 쉬운 만남·재회·밀당 장면 무드 한 줄.
- '틀리면 인생 망함' 식 과장 대신, **체감 바이브**로 쓴다.

■ "관상과 성향: 눈빛만 봐도 ‘잘 하겠다’ 싶은 사람의 특징"
- 눈·입꼬리·턱 각·손가락·걸음 속도·웃음 소리 중 **3가지 이상** 조합해 '밤의 신뢰감'을 설명. 외모 비하·특정 민족·장애 조롱 금지.
- '잘 하겠다'는 **기술 자랑이 아니라 분위기·호흡 맞춤**으로 읽히게 쓴다.
- 사주로는 도화·홍염·관성이 시각 신호와 어떻게 맞는지 한 번 연결.

📌 출력 (JSON Only)
{
  "chapter": "6장. 몸정이 마음정 되는 운명적 상대",
  "sections": [
    { "title": "최적의 파트너: 당신의 취향을 받아내고 리드할 상대의 특징.", "content": "…" },
    { "title": "조우의 타이밍: 이 미친듯한 긴장감이 폭발할 운명적 시기.", "content": "…" },
    { "title": "관상과 성향: 눈빛만 봐도 ‘잘 하겠다’ 싶은 사람의 특징", "content": "…" }
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
