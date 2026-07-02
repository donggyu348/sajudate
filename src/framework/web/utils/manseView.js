// 재회사주 미리보기용 만세력(사주 원국) 표시 데이터 생성
// - 원국/십성 계산은 기존 sajuCalService.getFourPillars 사용
// - 여기서는 화면 표시용(한자/오행색/지지 십성/십이운성)만 가공
import { getFourPillars } from "../service/sajuCalService.js";

const GAN_HANJA = { 갑:"甲", 을:"乙", 병:"丙", 정:"丁", 무:"戊", 기:"己", 경:"庚", 신:"辛", 임:"壬", 계:"癸" };
const JI_HANJA  = { 자:"子", 축:"丑", 인:"寅", 묘:"卯", 진:"辰", 사:"巳", 오:"午", 미:"未", 신:"申", 유:"酉", 술:"戌", 해:"亥" };

const STEM_EL   = { 갑:"목", 을:"목", 병:"화", 정:"화", 무:"토", 기:"토", 경:"금", 신:"금", 임:"수", 계:"수" };
const BRANCH_EL = { 자:"수", 축:"토", 인:"목", 묘:"목", 진:"토", 사:"화", 오:"화", 미:"토", 신:"금", 유:"금", 술:"토", 해:"수" };

// 지지 정기(대표 천간)
const BRANCH_MAIN_GAN = { 자:"계", 축:"기", 인:"갑", 묘:"을", 진:"무", 사:"병", 오:"정", 미:"기", 신:"경", 유:"신", 술:"무", 해:"임" };

// 오행별 색상 (목:초록 / 화:분홍레드 / 토:주황 / 금:밝은회색 / 수:짙은회색)
const EL_COLOR = {
  목: { bg: "#2f6b4a", fg: "#eafff3" },
  화: { bg: "#c94f6a", fg: "#fff0f3" },
  토: { bg: "#c98a3c", fg: "#fff6e9" },
  금: { bg: "#c9c3b6", fg: "#2a2a2a" },
  수: { bg: "#3a3f4a", fg: "#eef2f8" },
};

// 십성 계산 (sajuCalService와 동일 규칙)
const FIVE = { 목:0, 화:1, 토:2, 금:3, 수:4 };
const YINYANG = { 갑:1, 을:0, 병:1, 정:0, 무:1, 기:0, 경:1, 신:0, 임:1, 계:0 };
const TEN_GOD = {
  0: ["비견","겁재"],
  1: ["식신","상관"],
  2: ["편재","정재"],
  3: ["편관","정관"],
  4: ["편인","정인"],
};
function tenGodOfStem(dayGan, targetGan) {
  if (!dayGan || !targetGan) return "";
  const diff = (FIVE[STEM_EL[targetGan]] - FIVE[STEM_EL[dayGan]] + 5) % 5;
  const same = YINYANG[dayGan] === YINYANG[targetGan];
  return TEN_GOD[diff][same ? 0 : 1];
}

// 십이운성 계산
const JI_ORDER = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
const YANG_GAN = ["갑","병","무","경","임"];
const JANGSAENG = { 갑:"해", 병:"인", 무:"인", 경:"사", 임:"신", 을:"오", 정:"유", 기:"유", 신:"자", 계:"묘" };
const UNSEONG = ["장생","목욕","관대","건록","제왕","쇠","병","사","묘","절","태","양"];
function getUnseong(dayGan, ji) {
  if (!dayGan || !ji) return "";
  const startIdx = JI_ORDER.indexOf(JANGSAENG[dayGan]);
  const jiIdx = JI_ORDER.indexOf(ji);
  const forward = YANG_GAN.includes(dayGan);
  const k = forward ? (jiIdx - startIdx + 12) % 12 : (startIdx - jiIdx + 12) % 12;
  return UNSEONG[k];
}

function makePillar(dayGan, p, isDay) {
  if (!p || !p.gan || !p.ji) return null;
  const ganEl = STEM_EL[p.gan];
  const jiEl = BRANCH_EL[p.ji];
  return {
    isDay,
    topGod: isDay ? "일간(나)" : tenGodOfStem(dayGan, p.gan),
    ganHanja: GAN_HANJA[p.gan], ganKor: p.gan, ganEl, ganColor: EL_COLOR[ganEl],
    jiHanja: JI_HANJA[p.ji], jiKor: p.ji, jiEl, jiColor: EL_COLOR[jiEl],
    bottomGod: tenGodOfStem(dayGan, BRANCH_MAIN_GAN[p.ji]),
    unseong: getUnseong(dayGan, p.ji),
  };
}

/**
 * @param {object} info  { birthdate:'YYYYMMDD', birthType:'양력'|'음력', gender?, birthTime? }
 * @returns {{pillars: object[], dateLabel: string, calLabel: string} | null}
 */
export function buildManse(info) {
  if (!info || !info.birthdate || !/^\d{8}$/.test(String(info.birthdate))) return null;
  // 출생 시간 파싱: "HH:MM" 또는 숫자(시). 미입력 시 정오(오시)를 기본값으로 시주 표시
  const SIJIN = ["자시","축시","인시","묘시","진시","사시","오시","미시","신시","유시","술시","해시"];
  const btRaw = info.birthTime;
  const hasTime = btRaw !== undefined && btRaw !== null && String(btRaw).trim() !== "";
  let repHour = 12;             // getFourPillars에 넘길 대표 시각(정시)
  let timeLabel = "시간 모름";
  if (hasTime) {
    const s = String(btRaw).trim();
    if (s.includes(":")) {
      const [hh, mm] = s.split(":").map(n => parseInt(n, 10));
      if (!isNaN(hh) && !isNaN(mm)) {
        const idx = Math.floor(((hh * 60 + mm + 30) % 1440) / 120); // :30 경계 반영한 시진
        repHour = (2 * idx) % 24;
        timeLabel = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
      }
    } else if (!isNaN(Number(s))) {
      repHour = Number(s);
      timeLabel = SIJIN[Math.floor(((repHour + 1) % 24) / 2)];
    }
  }

  // 성별 정규화 (getFourPillars 대운 계산은 "남"/"여" 사용)
  const gender = info.gender ? (String(info.gender).startsWith("남") ? "남" : "여") : undefined;
  const genderLabel = info.gender ? (gender === "남" ? "남자" : "여자") : "";

  let fp;
  try {
    fp = getFourPillars({ birthdate: info.birthdate, birthTime: repHour, gender });
  } catch (e) {
    console.error("[manseView] getFourPillars 실패:", e);
    return null;
  }
  const dayGan = fp.day.gan;

  // 표시 순서: 시 · 일 · 월 · 년 (시간 미입력 시 시주 제외)
  const ordered = [
    makePillar(dayGan, fp.hour, false),
    makePillar(dayGan, fp.day, true),
    makePillar(dayGan, fp.month, false),
    makePillar(dayGan, fp.year, false),
  ].filter(Boolean);

  const raw = String(info.birthdate);
  const dateLabel = `${raw.slice(0,4)}.${raw.slice(4,6)}.${raw.slice(6,8)}`;
  const calLabel = info.birthType || "";

  return { pillars: ordered, dateLabel, calLabel, timeLabel, genderLabel };
}
