const PARTNER_IMAGE_POOL = {
  man: [
    "Rectangle 157.png",
    "Rectangle 159.png",
    "Rectangle 160.png",
    "Rectangle 161.png",
    "Rectangle 162.png",
  ],
  woman: [
    "Rectangle 152.png",
    "Rectangle 153.png",
    "Rectangle 154.png",
    "Rectangle 155.png",
    "Rectangle 156.png",
  ],
};

function hashSeed(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function isFemaleGender(gender) {
  const g = String(gender || "").trim();
  return ["여", "여자", "여성", "female", "F", "woman"].some(
    (v) => g === v || g.toLowerCase() === v.toLowerCase()
  );
}

function countTenGods(tenGod, types) {
  const gods = [tenGod?.year, tenGod?.month, tenGod?.day, tenGod?.hour].filter(Boolean);
  return gods.filter((g) => types.includes(g)).length;
}

const DAY_GAN_TENDENCY = {
  갑: "적극적으로 마음을 표현하는",
  을: "상대의 기분을 섬세하게 살피는",
  병: "열정적으로 올인하는",
  정: "은은하게 깊게 스며드는",
  무: "한 사람에게 오래 가는",
  기: "실속 있게 관계를 쌓아가는",
  경: "기준이 분명하고 솔직한",
  신: "완벽함을 추구하는",
  임: "감정의 흐름에 맞춰 움직이는",
  계: "조용히 깊이 빠지는",
};

const ELEMENT_LOVE_NOTE = {
  목: "새로운 설렘에 마음이 먼저 움직이며",
  화: "감정이 빠르게 타오르며",
  토: "신뢰가 쌓일수록 마음이 깊어지며",
  금: "확신이 서야 마음을 여는",
  수: "분위기와 교감을 중시하며",
};

function dominantElement(el) {
  const entries = [
    ["목", Number(el?.목) || 0],
    ["화", Number(el?.화) || 0],
    ["토", Number(el?.토) || 0],
    ["금", Number(el?.금) || 0],
    ["수", Number(el?.수) || 0],
  ];
  return entries.sort((a, b) => b[1] - a[1])[0];
}

export function buildLoveTendencyPreview(userInfo, saju) {
  const userName = userInfo?.name || "당신";
  const dayGan = saju?.day?.gan || "";
  const dayJi = saju?.day?.ji || "";
  const tendency = DAY_GAN_TENDENCY[dayGan] || "감정을 깊게 쌓아가는";
  const el = saju?.fiveElementsWeighted || saju?.fiveElements || {};
  const [topKey] = dominantElement(el);
  const elNote = ELEMENT_LOVE_NOTE[topKey] || "인연의 흐름을 세심하게 읽으며";
  const tenGod = saju?.tenGod || {};
  const gods12 = Array.isArray(saju?.gods12) ? saju.gods12 : [];

  const spouseCount = countTenGods(
    tenGod,
    isFemaleGender(userInfo?.gender) ? ["정관", "편관"] : ["정재", "편재"]
  );
  const expressionCount = countTenGods(tenGod, ["식신", "상관"]);
  const bondCount = countTenGods(tenGod, ["비견", "겁재"]);

  let styleHint = "관계가 깊어질수록 마음을 드러내는 편";
  if (expressionCount >= 2) styleHint = "좋아하는 마음을 비교적 솔직하게 표현하는 편";
  else if (bondCount >= 2) styleHint = "한번 마음을 주면 오래 가는 편";
  else if (spouseCount >= 1) styleHint = "진지한 인연에 끌리는 편";

  let specialNote = "";
  if (gods12.includes("도화")) specialNote = " 주변에서도 인기 있는 기운(도화)이 함께해, 자연스럽게 이성의 시선을 받기 쉽습니다.";
  else if (gods12.includes("홍염")) specialNote = " 강한 끌림(홍염)이 있어, 특별히 마음이 가는 순간이 분명하게 찾아옵니다.";

  const opening = `${userName}님은 ${tendency} 경향입니다.`;
  const previewHead =
    ` 일간 ${dayGan}${dayJi ? dayJi : ""}와 ${topKey}(${Number(el[topKey]) || 0}) 오행이 만나, ${elNote} ${styleHint}입니다.${specialNote}`;

  const blurred =
    ` 첫 만남에서는 ${expressionCount >= 2 ? "적극적으로 다가가지만" : "조심스럽게 거리를 두다가"}, 마음이 열리면 ${bondCount >= 2 ? "깊은 헌신형" : "점진적으로 깊어지는"} 연애를 이어갑니다.` +
    " 반복되는 연애 패턴의 핵심 원인과, 당신에게 맞는 상대의 천간지지·오행 조합, " +
    "썸·연애·결혼으로 이어지는 시기와 장소, 상대의 속마음과 처음 반하는 이유, " +
    "피해야 할 인연 유형과 관계를 오래 가게 만드는 구체적인 방법까지 " +
    "홍연 보고서에서 상세히 확인할 수 있습니다.";

  return { userName, tendency, visible: opening + previewHead, blurred };
}

export function buildRomanticPreview(userInfo, saju) {
  const isFemale = isFemaleGender(userInfo?.gender);
  const rawBirth = String(userInfo?.birthDate || userInfo?.birthdate || "").replace(/\D/g, "");
  const seed = hashSeed(
    `${rawBirth}-${userInfo?.gender}-${saju?.day?.gan}${saju?.day?.ji}-${userInfo?.birthTime || ""}`
  );

  // 폴더는 "보는 사용자 성별" 기준: man 폴더=여성 얼굴, woman 폴더=남성 얼굴
  // → 여성 사용자 → 남성 얼굴(woman 폴더), 남성 사용자 → 여성 얼굴(man 폴더)
  const genderKey = isFemale ? "woman" : "man";
  const files = PARTNER_IMAGE_POOL[genderKey];
  const partnerFile = files[seed % files.length];
  const partnerImageSrc = `/assets/images/tight/romantic/result/${genderKey}/${encodeURIComponent(partnerFile)}`;

  return { partnerImageSrc, userName: userInfo?.name || "당신" };
}
