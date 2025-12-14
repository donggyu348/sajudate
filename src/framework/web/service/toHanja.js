/**************************************
 * 1) 천간(十天干)
 **************************************/
export const CHEONGAN_MAP = {
  "갑": "甲", "을": "乙", "병": "丙", "정": "丁", "무": "戊",
  "기": "己", "경": "庚", "신": "辛", "임": "壬", "계": "癸"
};

export const CHEONGAN_REVERSE = Object.fromEntries(
  Object.entries(CHEONGAN_MAP).map(([k, v]) => [v, k])
);


/**************************************
 * 2) 지지(十二地支)
 **************************************/
export const JIJI_MAP = {
  "자": "子", "축": "丑", "인": "寅", "묘": "卯", "진": "辰",
  "사": "巳", "오": "午", "미": "未", "신": "申", "유": "酉",
  "술": "戌", "해": "亥"
};

export const JIJI_REVERSE = Object.fromEntries(
  Object.entries(JIJI_MAP).map(([k, v]) => [v, k])
);


/**************************************
 * 3) 십성(十神) — 한글 ↔ 한자
 * (일간 기준 오행 상생/상극으로 결정되지만,
 *  여기서는 텍스트 매핑만 다룸)
 **************************************/
export const SIPSEONG_MAP = {
  "비견": "比肩",
  "겁재": "劫財",
  "식신": "食神",
  "상관": "傷官",
  "편재": "偏財",
  "정재": "正財",
  "편관": "偏官",
  "정관": "正官",
  "편인": "偏印",
  "정인": "正印"
};

export const SIPSEONG_REVERSE = Object.fromEntries(
  Object.entries(SIPSEONG_MAP).map(([k, v]) => [v, k])
);


/**************************************
 * 4) 지지-본기 기준 십성 (예: 자(癸)=정인 등)
 * (계산 로직이 아닌 "텍스트 매핑"만)
 **************************************/
export const SIPSEONG_JIJI_MAP = {
  "본기": "本氣", 
  "중기": "中氣",
  "여기": "餘氣"
};

export const SIPSEONG_JIJI_REVERSE = Object.fromEntries(
  Object.entries(SIPSEONG_JIJI_MAP).map(([k, v]) => [v, k])
);


/**************************************
 * 5) 지장간(地藏干)
 * (각 지지 내부의 장간 — 실제 사주 계산에서 사용)
 **************************************/
export const JIJANGGAN_MAP = {
  "자": ["癸"],
  "축": ["己", "癸", "辛"],
  "인": ["甲", "丙", "戊"],
  "묘": ["乙"],
  "진": ["戊", "乙", "癸"],
  "사": ["丙", "戊", "庚"],
  "오": ["丁", "己"],
  "미": ["己", "丁", "乙"],
  "신": ["庚", "壬", "戊"],
  "유": ["辛"],
  "술": ["戊", "辛", "丁"],
  "해": ["壬", "甲"]
};


/**************************************
 * 6) 십이운성(十二運星)
 **************************************/
export const SIPI_WUNSEONG_MAP = {
  "장생": "長生",
  "목욕": "沐浴",
  "관대": "冠帶",
  "건록": "建祿",
  "제왕": "帝旺",
  "쇠": "衰",
  "병": "病",
  "사": "死",
  "묘": "墓",
  "절": "絶",
  "태": "胎",
  "양": "養"
};

export const SIPI_WUNSEONG_REVERSE = Object.fromEntries(
  Object.entries(SIPI_WUNSEONG_MAP).map(([k, v]) => [v, k])
);


/**************************************
 * 7) 십이신살(十二神殺)
 **************************************/
export const SIPI_SINSAL_MAP = {
  "도화": "桃花",
  "역마": "驛馬",
  "천을귀인": "天乙貴人",
  "월덕귀인": "月德貴人",
  "천덕귀인": "天德貴人",
  "문창귀인": "文昌貴人",
  "학당귀인": "學堂貴人",
  "장성": "將星",
  "백호": "白虎",
  "겁살": "劫殺",
  "재살": "災殺",
  "혈인": "血刃",
  "화개": "華蓋",
  "천살": "天煞",
  "지살": "地煞",
  "망신": "亡神",
  "육해": "六害",
  "반안": "攀鞍"
};

export const SIPI_SINSAL_REVERSE = Object.fromEntries(
  Object.entries(SIPI_SINSAL_MAP).map(([k, v]) => [v, k])
);


/**************************************
 * 8) 공통 변환 함수
 **************************************/
export function toHanja(str) {
  if (!str) return "-";

  // 천간
  if (CHEONGAN_MAP[str]) return CHEONGAN_MAP[str];

  // 지지
  if (JIJI_MAP[str]) return JIJI_MAP[str];

  // // 십성
  // if (SIPSEONG_MAP[str]) return SIPSEONG_MAP[str];

  // // 십이운성
  // if (SIPI_WUNSEONG_MAP[str]) return SIPI_WUNSEONG_MAP[str];

  // // 십이신살
  // if (SIPI_SINSAL_MAP[str]) return SIPI_SINSAL_MAP[str];

  // // 지지-지장간 (리스트라서 그대로 반환)
  // if (JIJANGGAN_MAP[str]) return JIJANGGAN_MAP[str];

  return str; // fallback
}

export function toHangul(str) {
  if (!str) return "";

  if (CHEONGAN_REVERSE[str]) return CHEONGAN_REVERSE[str];
  if (JIJI_REVERSE[str]) return JIJI_REVERSE[str];
  if (SIPSEONG_REVERSE[str]) return SIPSEONG_REVERSE[str];
  if (SIPI_WUNSEONG_REVERSE[str]) return SIPI_WUNSEONG_REVERSE[str];
  if (SIPI_SINSAL_REVERSE[str]) return SIPI_SINSAL_REVERSE[str];

  return str;
}
