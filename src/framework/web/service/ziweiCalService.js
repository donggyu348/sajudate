// src/framework/web/service/ziweiCalService.js
// 자미두수(紫微斗數) 명반 계산 서비스
//
// 별 배치(안성결/安星訣) 자체는 입력값(생년월일시·성별)만 넣으면 답이 하나로
// 정해지는 순수 계산이라, 검증된 오픈소스 iztro(2.5.x)로 배치하고
// 이 프로젝트의 데이터 형태(getFourPillars 스타일)에 맞춰 한글 라벨로 정규화한다.
//
// - 입력: userInfo { birthDate|birthdate: "YYYYMMDD", birthTime: 코드, gender: "남"|"여" }
// - 출력: 12궁 + 주성/보조성 + 사화 + 오행국 + 명주/신주 + 대운/유년(운세)
//
// ⚠️ 자미두수는 명궁 위치가 '태어난 시(時)'에 의존하므로, 시간을 모르면
//    명반 전체가 흔들린다. 시간 모름일 때는 정오(午時)로 가정하고
//    isUnknownTime: true 플래그를 실어 소비자가 '참고용'임을 알 수 있게 한다.

import { astro } from "iztro";

// 프로젝트 birthTime 코드 → iztro 시간 인덱스(0~12)
// iztro 규칙: 0=조자(00:00~01:00) 1=축 2=인 3=묘 4=진 5=사 6=오
//            7=미 8=신 9=유 10=술 11=해 12=야자(23:00~24:00)
const CODE_TO_TIME_INDEX = {
  "00": 0,  // 조자 子
  "02": 1,  // 축 丑
  "04": 2,  // 인 寅
  "06": 3,  // 묘 卯
  "08": 4,  // 진 辰
  "10": 5,  // 사 巳
  "12": 6,  // 오 午
  "14": 7,  // 미 未
  "16": 8,  // 신 申
  "18": 9,  // 유 酉
  "20": 10, // 술 戌
  "22": 11, // 해 亥
  "24": 12, // 야자 夜子
};

const DEFAULT_TIME_INDEX = 6; // 시간 모름 → 오시(정오) 가정

// 지지(24시각) → iztro 시간 인덱스. 코드 매핑이 실패한 경우의 폴백.
function hourToTimeIndex(hour) {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h === 23) return 12; // 야자
  return Math.floor((h + 1) / 2); // 0→0, 1·2→1(축), 3·4→2(인) ...
}

function isUnknownBirthTime(birthTime) {
  return (
    birthTime === null ||
    birthTime === undefined ||
    birthTime === "" ||
    birthTime === "unknown" ||
    birthTime === "99" ||
    Number(birthTime) === 99 ||
    Number.isNaN(Number(birthTime))
  );
}

function resolveTimeIndex(birthTime) {
  const code = String(birthTime).padStart(2, "0");
  if (Object.prototype.hasOwnProperty.call(CODE_TO_TIME_INDEX, code)) {
    return CODE_TO_TIME_INDEX[code];
  }
  return hourToTimeIndex(Number(birthTime));
}

function normalizeGender(gender) {
  // iztro는 "남"/"여"(ko-KR), "男"/"女", "male"/"female" 모두 허용.
  if (gender === "남" || gender === "여") return gender;
  if (gender === "male" || gender === "남자" || gender === "M" || gender === "m") return "남";
  if (gender === "female" || gender === "여자" || gender === "F" || gender === "f") return "여";
  // 기타 값은 그대로 넘겨 iztro의 판단에 맡긴다(기본 남).
  return gender || "남";
}

function parseBirthDate(userInfo) {
  const digits = String(userInfo.birthDate || userInfo.birthdate || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(
      `유효하지 않은 birthDate/birthdate 값입니다: ${userInfo.birthDate || userInfo.birthdate}`
    );
  }
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  return { y, m, d, solarStr: `${y}-${m}-${d}` };
}

// iztro 별 객체 → 슬림한 형태로 정규화
function normalizeStar(star) {
  if (!star) return null;
  return {
    name: star.name,
    type: star.type,          // major | soft | tough | flower | lucun | tianma | helper | adjective ...
    brightness: star.brightness || "", // 묘왕평함(밝기) [+3]~[-2]
    mutagen: star.mutagen || "",        // 사화: 록/권/과/기
    scope: star.scope,        // origin | decadal | yearly ...
  };
}

function normalizePalace(palace, soulBranch) {
  return {
    index: palace.index,
    name: palace.name,                       // 궁 이름: 명궁/형제/부처/자녀/재백/질액/천이/노복/관록/전택/복덕/부모
    heavenlyStem: palace.heavenlyStem,       // 궁간
    earthlyBranch: palace.earthlyBranch,     // 궁지
    isSoulPalace: palace.earthlyBranch === soulBranch, // 명궁 여부
    isBodyPalace: palace.isBodyPalace,       // 신궁 여부
    isOriginalPalace: palace.isOriginalPalace, // 내생년 본궁(래인궁) 여부
    majorStars: (palace.majorStars || []).map(normalizeStar),     // 14 주성
    minorStars: (palace.minorStars || []).map(normalizeStar),     // 보조 길·살성(문창·문곡·좌보·우필·화성·영성 등)
    adjectiveStars: (palace.adjectiveStars || []).map(normalizeStar), // 잡성
    changsheng12: palace.changsheng12,       // 십이장생
    boshi12: palace.boshi12,                 // 박사12신
    jiangqian12: palace.jiangqian12,         // 장전12신
    suiqian12: palace.suiqian12,             // 세전12신
    decadal: palace.decadal,                 // 대운 구간 {range:[시작나이,끝나이], heavenlyStem, earthlyBranch}
    ages: palace.ages,                       // 소한(유년) 나이들
  };
}

// 운세(대운/유년/유월/유일) 정규화
function normalizeScope(scope) {
  if (!scope) return null;
  return {
    index: scope.index,                 // 해당 운이 떨어지는 궁 인덱스
    name: scope.name,                   // (대한 등)
    heavenlyStem: scope.heavenlyStem,
    earthlyBranch: scope.earthlyBranch,
    mutagen: scope.mutagen,             // 이 운의 사화 [화록, 화권, 화과, 화기] 대상 별
    palaceNames: scope.palaceNames,     // 이 운 기준 12궁 이름 재배치
  };
}

/**
 * 자미두수 명반 계산
 * @param {object} userInfo - { birthDate|birthdate, birthTime, gender }
 * @param {object} [options]
 * @param {string} [options.targetDate] - 운세 기준일 "YYYY-MM-DD" (기본: 오늘)
 * @param {boolean} [options.withHoroscope=true] - 대운/유년 운세 포함 여부
 * @param {string} [options.language="ko-KR"] - iztro 출력 언어
 * @returns {object} 정규화된 명반 데이터
 */
export function getZiweiChart(userInfo, options = {}) {
  if (Array.isArray(userInfo)) userInfo = userInfo[0];
  const {
    targetDate,
    withHoroscope = true,
    language = "ko-KR",
  } = options;

  const { solarStr } = parseBirthDate(userInfo);
  const gender = normalizeGender(userInfo.gender);

  const unknownTime = isUnknownBirthTime(userInfo.birthTime);
  const timeIndex = unknownTime ? DEFAULT_TIME_INDEX : resolveTimeIndex(userInfo.birthTime);

  // fixLeap=true: 윤달은 15일 기준으로 앞/뒤 달에 귀속(iztro 표준)
  const astrolabe = astro.bySolar(solarStr, timeIndex, gender, true, language);

  const soulBranch = astrolabe.earthlyBranchOfSoulPalace;
  const palaces = astrolabe.palaces.map((p) => normalizePalace(p, soulBranch));

  const result = {
    meta: {
      solarDate: astrolabe.solarDate,
      lunarDate: astrolabe.lunarDate,       // 음력(한자 숫자 표기)
      chineseDate: astrolabe.chineseDate,   // 사주 사간지(연월일시)
      rawDates: astrolabe.rawDates,         // 숫자형 음/양력 원본
      time: astrolabe.time,                 // 시(예: "오시")
      timeRange: astrolabe.timeRange,       // 시각 구간
      gender,
      zodiac: astrolabe.zodiac,             // 띠
      sign: astrolabe.sign,                 // 12궁(양력 별자리)
      soul: astrolabe.soul,                 // 명주(命主)
      body: astrolabe.body,                 // 신주(身主)
      fiveElementsClass: astrolabe.fiveElementsClass, // 오행국(예: 목삼국)
      earthlyBranchOfSoulPalace: astrolabe.earthlyBranchOfSoulPalace, // 명궁 지지
      earthlyBranchOfBodyPalace: astrolabe.earthlyBranchOfBodyPalace, // 신궁 지지
      isUnknownTime: unknownTime,           // 시간 모름 → 정오 가정(참고용)
    },
    palaces, // index 0=인궁부터 지지순(인묘진사오미신유술해자축)
  };

  if (withHoroscope) {
    const when = targetDate || new Date().toISOString().slice(0, 10);
    try {
      const h = astrolabe.horoscope(when);
      result.horoscope = {
        targetDate: h.solarDate || when,
        lunarDate: h.lunarDate,
        age: h.age,                          // 나이 정보
        decadal: normalizeScope(h.decadal),  // 대운(대한)
        yearly: normalizeScope(h.yearly),    // 유년(세운)
        monthly: normalizeScope(h.monthly),  // 유월
        daily: normalizeScope(h.daily),      // 유일
      };
    } catch (e) {
      result.horoscope = null;
      result.horoscopeError = e?.message || String(e);
    }
  }

  // 원본 iztro 인스턴스가 필요할 수 있는 소비자를 위해 논-열거 접근자 제공
  Object.defineProperty(result, "_astrolabe", { value: astrolabe, enumerable: false });

  return result;
}

export default getZiweiChart;
