/**
 * 29+ 리포트 텍스트 템플릿(사용자 직접 입력용)
 *
 * - 이 파일은 "문장 생성"이 아니라 "사주 키 매칭 → 텍스트 조립"만을 위해 존재합니다.
 * - 아래 값(문단 텍스트)은 사용자님이 직접 붙여넣으세요.
 * - 키:
 *   - dayGan: 일간 천간 (갑/을/병/정/무/기/경/신/임/계)
 *   - monthJi: 월지 지지 (자/축/인/묘/진/사/오/미/신/유/술/해)
 *   - dayJi: 일지 지지 (자/축/인/묘/진/사/오/미/신/유/술/해)
 *   - gods12: `getFourPillars().gods12`에 들어오는 값들(도화/홍염/역마/장성/천살/겁살/월살/재살/격각 등)
 */

function normalizeHangulStemOrBranch(v) {
  if (!v) return "";
  const s = String(v).trim();
  // 한자 → 한글(천간/지지) 최소 변환
  const map = {
    甲: "갑", 乙: "을", 丙: "병", 丁: "정", 戊: "무",
    己: "기", 庚: "경", 辛: "신", 壬: "임", 癸: "계",
    子: "자", 丑: "축", 寅: "인", 卯: "묘", 辰: "진", 巳: "사",
    午: "오", 未: "미", 申: "신", 酉: "유", 戌: "술", 亥: "해",
  };
  return map[s] || s;
}

function normalizeElements(elements) {
  const e = elements || {};
  return {
    목: Number(e.목 ?? e["목"] ?? 0) || 0,
    화: Number(e.화 ?? e["화"] ?? 0) || 0,
    토: Number(e.토 ?? e["토"] ?? 0) || 0,
    금: Number(e.금 ?? e["금"] ?? 0) || 0,
    수: Number(e.수 ?? e["수"] ?? 0) || 0,
  };
}

function getSeasonGroupKey(monthJi) {
  const m = normalizeHangulStemOrBranch(monthJi);
  const springSummer = new Set(["인", "묘", "진", "사", "오", "미"]);
  return springSummer.has(m) ? "springSummer" : "autumnWinter";
}

function isDohwaDayJi(dayJi) {
  const d = normalizeHangulStemOrBranch(dayJi);
  return new Set(["자", "오", "묘", "유"]).has(d);
}

function countEarthStorageBranches(pillars) {
  const set = new Set(["진", "술", "축", "미"]);
  const jis = [
    pillars?.year?.ji,
    pillars?.month?.ji,
    pillars?.day?.ji,
    pillars?.hour?.ji,
  ].map(normalizeHangulStemOrBranch).filter(Boolean);
  return jis.filter((j) => set.has(j)).length;
}

/**
 * 유형 선택:
 * - metalWater: 금+수 강세
 * - fireWood: 화+목 강세
 * - earthStorage: 토 강세 + 진술축미 지지 포함(2개 이상)
 */
function pickAdultElementProfile(pillars) {
  const el = normalizeElements(pillars?.fiveElements);
  const metalWater = el.금 + el.수;
  const fireWood = el.화 + el.목;
  const earth = el.토;

  const earthStorageCount = countEarthStorageBranches(pillars);
  if (earth >= Math.max(metalWater, fireWood) && earthStorageCount >= 2) return "earthStorage";
  if (metalWater >= fireWood && metalWater >= earth) return "metalWater";
  if (fireWood >= metalWater && fireWood >= earth) return "fireWood";
  return "metalWater";
}

/**
 * 템플릿 기반 29+ 리포트 조립기
 * - 반환 형식: adult/report.ejs 가 렌더링하는 reportInfo 배열( {chapter,title,content}[] )
 */
export function buildAdultReportFromTemplates({ userInfo, pillars }) {
  const dayGan = normalizeHangulStemOrBranch(pillars?.day?.gan);
  const monthJi = normalizeHangulStemOrBranch(pillars?.month?.ji);
  const dayJi = normalizeHangulStemOrBranch(pillars?.day?.ji);
  const gods12 = Array.isArray(pillars?.gods12) ? pillars.gods12.map(normalizeHangulStemOrBranch) : [];

  const items = [];

  Object.entries(adultReportTemplates).forEach(([key, t]) => {
    if (!t) return;

    const seasonGroupKey = getSeasonGroupKey(monthJi);
    const isDohwa = isDohwaDayJi(dayJi);
    const profileKey = pickAdultElementProfile(pillars);

    const layer1 = (t?.layer1_byDayGan && dayGan && t.layer1_byDayGan[dayGan]) ? t.layer1_byDayGan[dayGan] : "";
    const layer2 = (t?.layer2_bySeasonGroup && t.layer2_bySeasonGroup[seasonGroupKey]) ? t.layer2_bySeasonGroup[seasonGroupKey] : "";
    const layer0 = (t?.layer0_byElementProfile && t.layer0_byElementProfile[profileKey]) ? t.layer0_byElementProfile[profileKey] : "";

    // gods12 기반 텍스트가 있으면 해당되는 것들을 전부(순서대로) 붙이고,
    // 없으면 도화 여부로 폴백
    const godTexts = [];
    if (t?.layer3?.byGods12 && gods12.length) {
      gods12.forEach((g) => {
        const txt = t.layer3.byGods12[g];
        if (txt) godTexts.push(String(txt));
      });
    }
    const layer3 =
      (godTexts.length ? godTexts.join("\n\n") : (isDohwa ? (t?.layer3?.byDayJi_isDohwa_true || "") : (t?.layer3?.byDayJi_isDohwa_false || "")));

    const parts = [
      (t?.intro || "").trim(),
      String(layer0 || "").trim(),
      String(layer1 || "").trim(),
      String(layer2 || "").trim(),
      String(layer3 || "").trim(),
      (t?.outro || "").trim(),
    ].filter(Boolean);

    if (!parts.length) return;

    items.push({
      chapter: t?.chapter || "1장. 그 사람의 성적 친밀감 리듬",
      title: t?.title || "본능 설계도",
      content: parts.join("\n\n"),
      _key: key
    });
  });

  // 안정적 순서 보장: chapter1_section1, chapter1_section2 ... 같은 키 네이밍을 가정
  items.sort((a, b) => String(a._key).localeCompare(String(b._key), "ko"));
  return items.map(({ _key, ...rest }) => rest);
}

export const adultReportTemplates = {
  chapter1_section1: {
    chapter: "1장. 그 사람의 성적 친밀감 리듬",
    title: "본능 설계도",
    intro: "",
    outro: "",

    /**
     * LAYER 0: 오행/지지 기반 "유형" 텍스트(사용자 직접 입력)
     * - metalWater: 금+수 강세
     * - fireWood: 화+목 강세
     * - earthStorage: 토 강세 + 진술축미 지지 2개 이상
     */
    layer0_byElementProfile: {
      metalWater: "",
      fireWood: "",
      earthStorage: "",
    },

    /**
     * LAYER 1: 일간(성적 기질) 텍스트
     * - key: dayGan (예: "임", "계")
     */
    layer1_byDayGan: {
      갑: "",
      을: "",
      병: "",
      정: "",
      무: "",
      기: "",
      경: "",
      신: "",
      임: "",
      계: "",
    },

    /**
     * LAYER 2: 월지/계절(지구력/배경) 텍스트
     * - 아래 2그룹은 현재 코드 기준으로 월지를 그룹핑해서 사용합니다.
     *   - springSummer: 인묘진사오미
     *   - autumnWinter: 신유술해자축
     */
    layer2_bySeasonGroup: {
      springSummer: "",
      autumnWinter: "",
    },

    /**
     * LAYER 3: 일지/신살(강한 트리거) 텍스트
     *
     * - 현재 `getFourPillars().gods12`는 아래 표에서 생성됩니다:
     *   역마/장성/천살/겁살/홍염/도화/월살/재살/격각 (dayJi에 따라 2개)
     *
     * - 1차 구현은 "일지 도화 여부(자오묘유)"와 `gods12` 포함 여부로만 분기합니다.
     */
    layer3: {
      byDayJi_isDohwa_true: "",
      byDayJi_isDohwa_false: "",
      byGods12: {
        도화: "",
        홍염: "",
        역마: "",
        장성: "",
        천살: "",
        겁살: "",
        월살: "",
        재살: "",
        격각: "",
      },
    },
  },
};

