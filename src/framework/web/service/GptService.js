import GptClient from "../api/GptClient.js";
import { GoodsType } from "../enums/Goods.js";
import crypto from "crypto";
import { getFourPillars } from "./sajuCalService.js";
import { Solar } from "lunar-javascript";
import { toHanja } from "./toHanja.js";

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

const CLASSIC_REPORT_PROMPT_PREFIX = `너는 50대 중후반의 경험 많은 역술가야.
문체는 차분하고 신뢰감을 주는 어조로, 중년 남성의 조언하는 말투를 써. 다음 항목만 포함하여 각 장은 여러 개의 소주제(title)와 그에 대한 상세한 내용(content)을 가진 배열 형식으로 작성해. 응답은 반드시 아래 형식의 JSON 배열로 반환해줘:

  {
    "chapter": "제1장: 주제",
    "sections": [
      { "title": "소주제 제목", "content": "내용..." },
      { "title": "소주제 제목", "content": "내용..." }
    ]
  },
  `;


const CLASSIC_REPORT_PROMPT_PARTS = [
  `${CLASSIC_REPORT_PROMPT_PREFIX}
제1장: 사주팔자
- 나의 전반적인 인생 흐름은?
- 내 사주의 3년 전망`,

  `${CLASSIC_REPORT_PROMPT_PREFIX}
제2장: 재물운
- 내 재물운은 무슨 유형일까?
- 내 재물운을 가로막는 요소
- 다가올 3년, 나에게 돈이 될 시기는?`,

  `${CLASSIC_REPORT_PROMPT_PREFIX}
제3장: 결혼운
- 곧 나에게 다가올 진짜 연인은?
- 이런 유형은 만나지 마세요
- 사주로 보는 나의 매력`,

  `${CLASSIC_REPORT_PROMPT_PREFIX}
제4장: 직업운
- 나는 어떤 직업을 가져야할까?
- 나와 상극인 직업은?
- 성공적인 커리어를 위한 조언`,

  `${CLASSIC_REPORT_PROMPT_PREFIX}
제5장: 십성
- 초년기
- 청년기
- 말년기
- 종합분석`
];


const ROMANTIC_REPORT_PROMPT_PREFIX = `너는 30대 여자의 경험 많은 역술가야.
문체는 차분하게 친구가 깊이 있게 조언해주는 느낌 ("~요"체)를 사용해. 아래 챕터 중 **하나만** 다루고, 반드시 **아래 JSON 형식**으로만 응답해.
응답은 순수 JSON 하나로 반환하고, 코드펜스(\`\`\`), 주석, 설명문은 절대 포함하지 마.
중요: "chapter"에는 반드시 장 제목(예: "제 1장 연애운")만 넣고, "sections[].title"에는 아래에 제공하는 섹션 제목 문자열만 넣어라.
절대 "chapter"에 섹션 제목을 넣지 말고, "sections[].title"에 장 제목을 넣지 마라.
+ ⚠ 반드시 USER가 제공하는 SAJU_JSON의 오행, 십성, 도화, 귀인, 대운, 띠 정보를 근거로 작성한다.
+ ⚠ 예시는 **스타일 참고용일 뿐**, 문장·표현·내용을 복붙하거나 비슷하게 재구성하면 안된다.
+ ⚠ 입력 값이 다르면 결과 내용도 완전히 달라야 한다. (예시문 반복 금지)
+ 🗣 말투 규칙:
+ - 문체는 "~요"체를 반드시 사용.
+ - 친구에게 얘기하듯 친근하지만 조언은 진지하게.
+ - 문장 중간/마무리에 이모지 2~5개 자연스럽게 사용 (💚✨🌿🔥👀 등)
+ - 같은 이모지/표현 반복 금지, 매 섹션마다 스타일 다양하게.

+ 스타일 의무 반영 조건:
+ - 예시 문장은 참고용이며 절대 복사·유사 문장 변형 금지.
+ - 결과는 반드시 SAJU_JSON 요소 기반으로 달라져야 함.
+ - 생성된 문단에는 사주의 근거(오행/십성/도화/운) 1개 이상 언급 필수.
+ - 감정적 묘사 + 근거 연결 : "수(水)가 많아 눈빛이 촉촉해요 👀" 이런 식.

# 출력 형식(고정)
{
  "chapter": "제X장 YYY",              // 아래 장 제목과 완전히 동일(띄어쓰기까지)
  "sections": [
    { "title": "섹션 제목", "content": "가이드 반영 6~8문장" },
    ...
  ]
}

규칙:
- "chapter"는 아래 지정된 장 제목을 **그대로 복사**해 사용(오탈자/변형 금지. ex. 제 1장 연애운).
- "sections[].title"은 내가 주는 섹션 제목을 **그대로 복사**해 사용(순서 유지, 누락 금지).
- "sections[].content"는 각 섹션별 **작성 가이드**를 충실히 반영해 4~6문장으로 작성.
- 노골적 성묘사는 금지하고, 은유적이고 품위 있는 표현을 사용.

`;

const ROMANTIC_REPORT_PROMPT_PARTS = [
  `${ROMANTIC_REPORT_PROMPT_PREFIX}
제 1장 연애운
섹션 제목:
- 현재 나의 연애운 흐름
- 반복되는 연애 ‘실패’ 원인
- 솔탈 시기
- 그의 진짜 속마음
- 그에게 먹히는 나의 ‘색기’ 포인트
- 일회성 만남 VS 안정적 연애 나의 추구미는?

작성 가이드:
- "1-1. 현재 나의 연애운 흐름": 최근 3~6개월 흐름, 지배적 기운 1~2개, 기회/리스크 각 1개, 실행 조언 2가지.
  예시: "요즘 당신 주변이 조금씩 술렁이는 느낌, 안 드나요?🌸 당신 사주에 지금 합(合)의 기운이 강하게 들어와 있는 사람들이 그래요. 특히 5~7월 사이 누군가 당신을 보는 시선이 달라지거나, 오래 알던 사람과의 관계가 한 단계 깊어질 수도 있어요💭 다만 너무 기대하고 있으면 오히려 놓칠 수 있어요. 자연스럽게 흘러가도록 두세요."
- "1-2. 반복되는 연애 ‘실패’ 원인": 반복 패턴 2~3개, 촉발 요인, 교정 습관 2가지, 경고 신호 1개.
  예시: "당신은 사랑하면 올인하는 타입이에요💥 당신 사주에 화(火)의 기운이 강하고 토(土)가 약한 사람들이 그래요. 불은 빠르게 타오르지만 담아둘 그릇이 없으면 금방 식거든요🔥 처음엔 열정에 상대도 끌리는데, 시간 지나면 '부담스럽다' 느끼기 시작해요. 그리고 당신도 상대가 시큰둥하면 금방 식어버려요. 관계는 천천히 익혀야 제맛인데, 당신은 센 불에 빨리 끓이려는 편이에요."
- "1-3. 솔탈 시기": 예상 시기(월/분기/연도), 성사 확률, 전조 신호 2~3개, 준비 행동 2가지.
  예시: "8월 말~10월 사이가 뜨거워요🔥 이 시기에 당신의 도화(桃花) 기운이 활성화되는 사람들이 그래요. 도화는 사람을 끌어당기는 자석 같은 거예요🧲 누군가 당신을 자꾸 쳐다보는 느낌이 들 거예요. 그 사람은 먼저 말 걸기보단 '눈으로 신호' 보내는 타입일 가능성이 높아요👀 평소보다 조금만 더 적극적으로 나가보세요."
- "1-4. 그의 진짜 속마음": 현재 감정 2~3개, 주요 불안/욕구 각 1개, 대화 팁 2가지.
  예시: "그 사람, 당신한테 관심 있어요💚 표현을 못 하는 타입이에요. 두 사람 사주를 보면 오행이 서로 끌어당기는 구조예요. 그의 수(水) 기운이 당신의 화(火)를 만나면서 내면에 열이 생긴 거죠🔥 겉으로는 쿨한 척하는데 속으로는 '나한테도 관심 있을까?' 엄청 신경 쓰고 있어요😅 연락은 늦어도 내용은 성의 있고, 만나면 당신 말 다 기억하죠? 지금 그는 자존심 싸움 중이에요."
- "1-5. 그에게 먹히는 나의 ‘색기’ 포인트": 매력 포인트 2~3개, 상황별 활용 팁 2가지, 선 넘지 말아야 할 선 1개.
  예시: "당신의 치명적인 무기는 눈빛이에요👀 당신 사주에 수(水)의 기운이 있는 사람들은 눈에 촉촉한 이슬이 맺힌 것 같은 느낌이 있어요. 대화할 때 상대 눈을 2초 더 오래 보는 것만으로도 상대는 심장이 쿵 내려앉아요💘 그리고 웃을 때—입꼬리만 살짝 올리는 미소가 훨씬 섹시해요😏 향수는 은은한 플로럴이 잘 어울려요."
- "1-6. 일회성 만남 VS 안정적 연애 나의 추구미는?": 현재 성향 진단, 장단점 각 1개, 선택 기준 2가지, 리스크 경고 1개.
  예시: "당신은 '자유롭게 살고 싶다'고 말하지만, 사실 깊은 관계를 갈망하는 사람이에요🌙 당신 사주에 정관(正官)이 있고 인성(印星)이 강한 사람들이 그래요. 짧고 강렬한 만남도 해봤겠지만, 끝나면 공허함이 밀려와요. 천천히 쌓아가는 관계가 당신을 진짜 행복하게 만들 거예요🌱"`,

  `${ROMANTIC_REPORT_PROMPT_PREFIX}
제 2장 내 미래 배우자 & 이상형
섹션 제목:
- 내 미래 배우자는 이렇게 생겼어요
- 외모상 분석 (강아지상? 고양이상?)
- 성격 분석
- 그 사람의 직업적 특징
- 돈은 많이 벌어다줄까?
- 연애할 때 이 사람은…
- 상대를 안달나게 하는 나만의 매력 포인트

작성 가이드:
- "2-1. 내 미래 배우자는 이렇게 생겼어요": 첫인상 키워드 2~3개, 분위기/체형 1~2개, 호감 형성 팁 2가지.
  예시: "당신의 미래 배우자는 깔끔하고 정돈된 인상을 가진 사람일 가능성이 높아요🌿 당신 사주의 배우자 자리에 금(金)의 기운이 있는 사람들은 날카롭고 단정한 외모를 가진 상대를 만나요. 키는 평균 이상이고 체격은 마른 편—군살 없이 단단한 느낌이에요💪 처음 만났을 때 '믿을 만하다'는 느낌이 들 거예요."
- "2-2. 외모상 분석 (강아지상? 고양이상?)": 상(相) 유형 1개 판정 근거 2개, 스타일링 팁 2가지.
  예시: "당신의 배우자는 고양이상에 가까워요😼 날카로운 눈매에 차가운 첫인상—처음엔 '까칠한가?' 싶을 수 있어요. 당신 사주에 수(水)와 금(金)이 강한 사람들은 도도하고 신비로운 고양이상 배우자를 만나요. 알고 보면 은근히 장난기 있고 애교도 부리는데, 아주 가까운 사람들한테만 보여줘요💕"
- "2-3. 성격 분석": 핵심 성향 2~3개, 스트레스 시 반응, 소통 팁 2가지.
  예시: "성격은 신중하고 깊이 있는 타입이에요🌊 당신 사주의 배우자 자리에 정관(正官)이 있는 사람들은 책임감 강하고 원칙을 중시하는 상대를 만나요. 감정 표현은 서툴지만 행동으로 보여주는 편이에요. 장점은 믿을 수 있다는 것, 단점은 융통성이 없다는 것이에요."
- "2-4. 그 사람의 직업적 특징": 업종/역할 가설 1~2개, 강점 2개, 유의점 1개.
  예시: "직업적으로는 전문성이 요구되는 분야에서 일할 가능성이 높아요💼 의료·법률·IT·금융 같은 쪽이요. 당신 사주의 배우자 자리에 정관과 인성이 조화로운 사람들은 전문직이나 안정적 직업을 가진 상대를 만나요. 상사한테는 신뢰받는 타입이에요👔"
- "2-5. 돈은 많이 벌어다줄까?": 수입 변동성, 재무 태도, 공통 재무룰 2가지.
  예시: "솔직하게 말할게요—대박 부자는 아니에요💸 하지만 경제적으로 안정적인 삶은 보장할 수 있는 사람이에요. 정재(正財)가 있는 사람들은 꾸준히 벌어들이는 스타일의 상대를 만나요. 돈 쓸 땐 계획적이고 아껴 쓰는 편이라 '짠 거 아냐?' 싶을 수도 있어요😅 하지만 저축은 꽤 잘하고, 큰돈 들어갈 일 생기면 대비가 되어 있어요."
- "2-6. 연애할 때 이 사람은…": 애정 표현 방식 2개, 갈등 시 대응, 안정감을 주는 루틴 2가지.
  예시: "연애할 때 이 사람은 표현은 서툴지만, 행동으로 보여주는 스타일이에요💬 말보다 실천으로 사랑을 표현하죠. 갈등이 생기면 먼저 사과하지는 않지만, 대신 필요한 걸 챙겨주는 식이에요. 매일 같은 시간 연락하거나, 주말 데이트 루틴을 지키는 걸 중요하게 여겨요."
- "2-7. 상대를 안달나게 하는 나만의 매력 포인트": 차별화 포인트 2~3개, 활용 타이밍 2가지.
  예시: "당신의 매력은 '믿음직함 속의 여유'예요✨ 상대는 당신의 안정된 말투와 단정한 모습에서 편안함을 느껴요. 하지만 가끔 눈웃음 한 번, 장난 한마디가 상대를 완전히 무너뜨려요😉 적절한 타이밍에 가벼운 터치나 시선을 섞어보세요."`,

  `${ROMANTIC_REPORT_PROMPT_PREFIX}
제 3장 침대 위 내 진짜 모습과 치명적 매력
섹션 제목:
- 내 은밀한 19금 성향 & 숨겨진 욕망
- 내가 무심코 흘리는 19 매력 포인트
- 위험하지만 끌리는 이성 타입
- 내 주변 100점 속궁합
- 연애만 할 사람 & 무조건 결혼해야 하는 사람
- 미래 배우자와의 섹슈얼 궁합 수치
- 내 몸만 원하는지 알아보는 법

작성 가이드:
- "3-1. 내 은밀한 19금 성향 & 숨겨진 욕망": 겉모습과 다른 침대 위 모습, 적극적/수동적 성향, 숨겨진 판타지. 사주 요소(수·화 기운, 도화·홍염, 식상 발달도). 
  예시: "평소엔 차분해 보이지만, 침대 위에선 완전히 다른 사람이 돼요🔥 생각보다 훨씬 적극적이고 주도적이에요. 당신 사주에 화(火)의 기운과 식상이 강한 사람들은 욕망을 솔직하게 표현하는 타입이에요. 분위기보단 본능에 충실한 편이고, 느낌 오면 주저하지 않아요😏 숨겨진 판타지는 통제와 복종이에요💭 겉으론 쿨해 보이지만 속으론 뜨거운 사람이에요🌶️"
- "3-2. 내가 무심코 흘리는 19 매력 포인트": 의도하지 않았는데 섹시한 순간들(말투·시선·몸짓·표정). 사주 요소(도화·홍염 위치, 수·화 기운).
  예시: "당신은 눈빛으로 사람을 끌어당겨요👀 대화할 때 상대 눈을 응시하는 2~3초—그 순간 상대는 무의식적으로 긴장해요. 당신 사주에 도화(桃花)가 일지에 있는 사람들은 자연스럽게 풍기는 색기가 있어요. 말할 때 입술 움직임, 웃을 때 보이는 목선, 턱 괴는 손동작—다 무심코 하지만 섹시해요😏 목소리를 평소보다 한 톤 낮추면 심장이 쿵 내려앉아요💘"
- "3-3. 위험하지만 끌리는 이성 타입": 피해야 하지만 끌리는 스타일, 왜 끌리는지 심리, 관계의 위험성. 사주 요소(형·충·파·해, 상극 관계).
  예시: "당신은 불안정하고 예측 불가능한 사람에게 자꾸 끌려요🌪️ 연락 들쭉날쭉하고, 달콤하다가 잠수 타는 타입. 당신 사주에서 일지와 충(沖) 관계인 오행의 기운을 가진 사람에게 끌리는 경향이 있어요. 짜릿하지만 소모적이고 결국 상처만 남아요💔"
- "3-4. 내 주변 100점 속궁합": 최고의 궁합 특징, 케미, 이미 주변에 있을 가능성. 사주 요소(일간 상생, 합·삼합 관계) 점수로 수치적으로 나타낼것!
  예시: "당신과 100점 궁합은 차분하고 포용력 있는 타입이에요🌊 당신의 일간과 상생하는 토(土) 기운이 강한 사람이 최고예요. 정신적으로 깊이 이해하고 육체적으로는 천천히 달아오르며 오래 가요🔥 이미 주변에 있을 수도 있어요👀"
- "3-5. 연애만 할 사람 & 무조건 결혼해야 하는 사람": ‘연애만’ vs ‘결혼까지’ 가야 할 타입 구분. 사주 요소(일시적 운 vs 장기 조화).
  예시: "연애만 할 사람은 자극적이고 즉흥적인 타입🎢 편재(偏財)·편관(偏官) 기운이 강한 사람이 그래요. 반면 결혼해야 할 사람은 정재(正財)·정관(正官) 기운이 강한 안정형💚 처음엔 심심하지만 결국 믿음과 평화를 줘요."
- "3-6. 미래 배우자와의 섹슈얼 궁합 수치": 점수(0~100), 이유, 개선 포인트. 사주 요소(일간·일지 음양 조화, 수·화 기운).
  예시: "미래 배우자와의 섹슈얼 궁합은 82/100점🔥 화(火)와 수(水) 기운이 조화를 이뤄 수화기제(水火旣濟). 리듬이 잘 맞지만 템포 차이 주의😅 서로 속도 맞추면 90점도 가능✨"
- "3-7. 내 몸만 원하는지 알아보는 법": 진심 vs 육체적 욕망 구분법, 행동 신호, 테스트 방법. 사주 요소(편재·편관 vs 정재·정관).
  예시: "진심인지 몸만 원하는지 구분법🔍 편관·편재 기운이 있는 사람은 밤에만 연락하고 낮 데이트 피하려 해요🌙 일상엔 무관심, 감각적 대화만. 스킨십 거부하면 진심은 존중하지만 가벼운 사람은 불편해하며 자리 뜨죠🚩"`,

  `${ROMANTIC_REPORT_PROMPT_PREFIX}
제 4장 결혼운
섹션 제목:
- 결혼운이 강해지는 시기
- 이럴땐, 결혼하지 마세요
- 결혼 상대와의 밤 궁합
- 가정운
- 결혼하면 내 재물운은요...
- 노년기 부부운
- 이런 거, 조심하세요

작성 가이드:
- "4-1. 결혼운이 강해지는 시기": 구체적 시기(나이대·연도), 변화 내용, 시기 활용법. 사주 요소(대운 관성 시기).
  예시: "결혼운은 31~35세 사이에 강해져요💍 정관운이 들어오면서 안정 욕구 상승. 결혼 얘기, 소개팅, 주변 압박이 늘어요😅 이 시기엔 너무 높은 기준보단 현실적으로 만나보세요."
- "4-2. 이럴땐, 결혼하지 마세요": 위험 시기·이유·대안. 사주 요소(형·충·파·해, 흉운).
  예시: "28~29세 결혼은 위험⚠️ 일지 충운이 들어와 관계 불안정. 자주 다투고 의심 많아져요😓 신혼 초 갈등 위험. 이 시긴 연애에 집중하고 관계 해결법을 배우세요."
- "4-3. 결혼 상대와의 밤 궁합": 점수, 신혼 초/이후 변화, 유지 팁. 사주 요소(배우자궁 음양 조화).
  예시: "밤 궁합은 78/100점🔥 초반엔 90점까지 가능하지만 5년차엔 주의😅 감정 교감이 유지되면 육체적 만족도도 높아요. 새로운 시도를 멈추지 마세요✨"
- "4-4. 가정운": 결혼 후 가정 분위기·배우자 관계·가족 인연. 사주 요소(가정궁, 인성·재성).
  예시: "가정운은 따뜻하고 안정적🏡 인성 강한 사람은 가족 중심적이에요. 시댁/친정 무난, 자녀와 인연 깊음👪 감사 표현이 행복의 핵심🌸"
- "4-5. 결혼하면 내 재물운은요...": 결혼 전후 재물운 변화, 배우자 영향, 경제 안정도. 사주 요소(배우자-재성 상생).
  예시: "결혼 후 재물운은 좋아져요💰 배우자가 재성을 생(生)해주는 구조로 안정적이에요. 돈보다 저축·습관이 강점📊 부동산 투자는 신중히."
- "4-6. 노년기 부부운": 말년 관계·건강·돌봄. 사주 요소(시주, 대운 말기).
  예시: "노년에도 좋은 부부운👴👵 시주에 정관이 있으면 평생 함께하는 스타일. 건강 문제에도 서로 헌신적🌿 추억이 노년의 끈이 돼요📸"
- "4-7. 이런 거, 조심하세요": 결혼 생활 위험 요소 3개, 위기 시기, 예방법. 사주 요소(형·충, 흉운).
  예시: "조심할 것🚨 첫째 감정 폭발, 둘째 외도 유혹(37~39세 도화운), 셋째 시댁 갈등. 예방법은 대화💬"`,

  `${ROMANTIC_REPORT_PROMPT_PREFIX}
제 5장 나와 비슷한 연예인
섹션 제목:
- 나와 같은 사주를 가진 유명인
- 이 사람들과 나와의 차이점
- 나와 궁합이 좋은 스타 유형

작성 가이드:
- "5-1. 나와 같은 사주를 가진 유명인": 3~5명 유명인, 공감 포인트, 특징. 사주 요소(일간·일지·오행 구조 유사).
  예시: "아이유🎤, 손흥민⚽, 전지현😎—모두 병화(丙火) 일간·식상 발달형. 표현력·집중력·자기 색깔 강함🔥 당신도 그런 에너지 있어요✨"
- "5-2. 이 사람들과 나와의 차이점": 같은 사주라도 다른 이유, 환경·선택 차이, 강점 살리는 팁. 사주 요소(대운·세운 차이).
  예시: "같은 사주라도 선택이 달랐어요🤔 아이유는 일찍 도전, 손흥민은 올인. 사주는 잠재력일 뿐, 방향은 본인이 정해요. 당신도 꾸준함으로 전환하면 가능💎"
- "5-3. 나와 궁합이 좋은 스타 유형": 이성 스타 3~5명, 이유, 현실 대응법. 사주 요소(상생·합 관계 일간·오행).
  예시: "공유🌊, 박서준😊, 송혜교🌸—당신 일간과 상생하는 수(水)·토(土) 기운. 당신의 열기를 식혀주는 편안한 에너지💚 현실에선 조용하지만 존재감 있는 사람 찾아보세요👀"`,
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


/** ROMANTIC 전용: 프롬프트 문자열에서 기대하는 장 제목(예: "제 1장 연애운")을 추출 */
function extractRomanticChapterTitleFromPrompt(promptStr) {
  // 첫 줄부터 줄바꿈 단위로 탐색하여 "제 "로 시작하는 라인을 찾는다.
  const lines = String(promptStr).split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^제\s*\d+\s*장.*$/); // "제 1장 ..." 또는 "제1장 ..." 모두 허용
    if (m) return line.trim().replace(/\s{2,}/g, " ");
  }
  return null;
}

function extractJsonObject(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    throw new Error("유효한 JSON 영역을 찾을 수 없습니다.");
  }
  return text.substring(firstBrace, lastBrace + 1);
}

/**
 * GptService: Handles ChatGPT prompt calls for 사주 리포트
 */
class GptService {

  // async callReport(userInfo, goodsType) {

  //   let promtParts;
  //   if (goodsType === GoodsType.PREMIUM_SAJU) {
  //     promtParts = PREMIUM_REPORT_PROMPT_PARTS;

  //   } else if (goodsType === GoodsType.CLASSIC) {
  //     promtParts = CLASSIC_REPORT_PROMPT_PARTS;

  //   } else if (goodsType === GoodsType.ROMANTIC) {
  //     promtParts = ROMANTIC_REPORT_PROMPT_PARTS;
  //   }

  //   try {

  //     let result = [];
  //     for (let i = 0; i < promtParts.length; i++) {
  //       const response = await GptClient.callChatGpt(
  //         [
  //           { role: "system", content: promtParts[i] },
  //           { role: "user", content: JSON.stringify(userInfo) }
  //         ]
  //       );

  //       const cleanedResponse = response
  //         .replace(/```json\s*/gi, "")
  //         .replace(/```/g, "")
  //         .replace(/^\s+/, "")
  //         .replace(/\s+$/, "");

  //       let parsed;
  //       try {
  //         parsed = JSON.parse(cleanedResponse);
  //       } catch (e) {
  //         console.warn("GPT 응답이 JSON 형식이 아님. JSON 본문만 추출 시도 중...");
  //         const jsonOnly = extractJsonObject(cleanedResponse);
  //         parsed = JSON.parse(jsonOnly);
  //       }

  //       if (Array.isArray(parsed) && parsed[0]?.sections) {
  //         parsed.forEach(chapter => {
  //           chapter.sections.forEach(section => {
  //             result.push({
  //               chapter: chapter.chapter,
  //               title: section.title,
  //               content: section.content
  //             });
  //           });
  //         });
  //       } else if (Array.isArray(parsed) && parsed[0]?.title && parsed[0]?.content) {
  //         result = result.concat(parsed);
  //       } else if (parsed?.sections) {
  //         // ROMANTIC 보호 로직: 챕터/타이틀이 뒤바뀐 경우를 보정
  //         let chapterValue = parsed.chapter;
  //         if (goodsType === GoodsType.ROMANTIC) {
  //           const expectedChapter = extractRomanticChapterTitleFromPrompt(promtParts[i]) || parsed.chapter;
  //           // 섹션 제목 패턴(예: "1-1. ...")이 chapter에 들어간 경우 또는 chapter가 비정상일 때 교정
  //           const looksLikeSectionTitle = typeof chapterValue === "string" && /^\d+-\d+\.\s/.test(chapterValue);
  //           if (!chapterValue || looksLikeSectionTitle) {
  //             chapterValue = expectedChapter;
  //           }
  //         }
  //         parsed.sections.forEach(section => {
  //           result.push({
  //             chapter: chapterValue,
  //             title: section.title,
  //             content: section.content
  //           });
  //         });
  //       }

  //     }
  //     console.log(result);
  //     return result;
  //   } catch (error) {
  //     console.error("Error calling GPT:", error);
  //     throw error;
  //   }
  // }

  async callReport(userInfo, goodsType) {
    let promtParts;
    if (goodsType === GoodsType.PREMIUM_SAJU) {
      promtParts = PREMIUM_REPORT_PROMPT_PARTS;
    } else if (goodsType === GoodsType.CLASSIC) {
      promtParts = CLASSIC_REPORT_PROMPT_PARTS;
    } else if (goodsType === GoodsType.ROMANTIC) {
      promtParts = ROMANTIC_REPORT_PROMPT_PARTS;
    }

    try {
      // ✅ 1) 사주 계산 (새 로직 적용)
      const pillars = getFourPillars(userInfo);

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
${pillars.isUnknownTime
          ? "\n⚠ 태어난 시간이 확인되지 않아 시주는 참고용으로만 활용해야 합니다.\n"
          : ""
        }
`;

      let result = [];
      const currentYear = new Date().getFullYear();
      const yearContext = `\n\n[CONTEXT] The current year for this analysis is ${currentYear}. All predictions and timeline references must be based on this year.`;

      // ✅ 4) 챕터별로 프롬프트 조합 시 계산값 삽입
      for (let i = 0; i < promtParts.length; i++) {
        const fullSystemPrompt = `
${promtParts[i]}

${contextInfo}
[참고] GPT 분석을 위해 필요한 SAJU_JSON 데이터를 사용자 메시지에 담아 제공합니다.
${yearContext}
      `.trim();

        const response = await GptClient.callChatGpt([
          { role: "system", content: fullSystemPrompt },
          // !!! 수정: userInfo 대신 SAJU_JSON 구조를 JSON 문자열로 보낸다.
          { role: "user", content: JSON.stringify(sajuJsonForGPT) },
          { role: "user", content: "이 보고서는 반드시 SAJU_JSON 데이터를 직접 분석해 작성해야 하며, 예시문을 그대로 사용하거나 비슷하게 작성하면 안된다." }

        ]);

        const cleanedResponse = preClean(String(response));
        let parsed;

        try {
          parsed = safeJsonParseLooser(cleanedResponse, "REPORT");
        } catch {
          const jsonOnly = extractJsonObject(cleanedResponse);
          parsed = safeJsonParseLooser(jsonOnly, "REPORT-FORCED");
        }

        if (Array.isArray(parsed) && parsed[0]?.sections) {
          parsed.forEach((chapter) => {
            chapter.sections.forEach((section) => {
              result.push({
                chapter: chapter.chapter,
                title: section.title,
                content: section.content,
              });
            });
          });
        } else if (Array.isArray(parsed) && parsed[0]?.title && parsed[0]?.content) {
          result = result.concat(parsed);
        } else if (parsed?.sections) {
          let chapterValue = parsed.chapter;
          if (goodsType === GoodsType.ROMANTIC) {
            const expectedChapter = extractRomanticChapterTitleFromPrompt(promtParts[i]) || parsed.chapter;
            const looksLikeSectionTitle = typeof chapterValue === "string" && /^\d+-\d+\.\s/.test(chapterValue);
            if (!chapterValue || looksLikeSectionTitle) {
              chapterValue = expectedChapter;
            }
          }
          parsed.sections.forEach((section) => {
            result.push({
              chapter: chapterValue,
              title: section.title,
              content: section.content,
            });
          });
        }
      }

      return result;
    } catch (error) {
      console.error("Error calling GPT:", error);
      throw error;
    }
  }

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

// 4) 관대한 파서(추출 → 정규화 → 파싱)
function safeJsonParseLooser(input, tag = "UNKNOWN") {
  let cleaned = preClean(input);

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

  // 스마트쿼트 → ASCII
  core = core.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // 값 문자열 내 개행/제어문자 정리(필요 최소치)
  core = core.replace(/:(\s*)"([^"]*)"/g, (match, space, p1) => {
    let v = p1.replace(/\r?\n/g, " ").replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    return `:${space}"${v}"`;
  });

  try {
    return JSON.parse(core);
  } catch (err) {
    console.error(`[${tag}] JSON.parse failed. Preview(200):`, cleaned.slice(0, 200));
    console.error(`[${tag}] firstIdx=`, firstJsonStartIndex(cleaned), ` lastIdx=`, lastJsonEndIndex(cleaned));
    throw err;
  }
}

// --- End Deterministic TenGod Helpers ---

export default new GptService();
