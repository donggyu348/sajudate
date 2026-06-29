function hashSeed(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

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

function weakestElement(el) {
  const entries = [
    ["목", Number(el?.목) || 0],
    ["화", Number(el?.화) || 0],
    ["토", Number(el?.토) || 0],
    ["금", Number(el?.금) || 0],
    ["수", Number(el?.수) || 0],
  ];
  return entries.sort((a, b) => a[1] - b[1])[0];
}

export function buildAdultCompatibilityPreview(userInfo, mySaju, partnerInfo, partnerSaju) {
  const myEl = mySaju?.fiveElementsWeighted || {};
  const partnerEl = partnerSaju?.fiveElementsWeighted || {};
  const myWeak = weakestElement(myEl);
  const partnerStrong = dominantElement(partnerEl);

  let score = 68;
  if (myWeak[0] === partnerStrong[0]) score += 12;
  if (mySaju?.day?.ji && partnerSaju?.day?.ji && mySaju.day.ji !== partnerSaju.day.ji) score += 6;

  const seed = hashSeed(
    `${userInfo?.name || ""}${partnerInfo?.name || ""}${mySaju?.day?.gan || ""}${partnerSaju?.day?.gan || ""}`
  );
  score = Math.min(97, Math.max(62, score + (seed % 14)));

  return {
    score,
    partnerName: partnerInfo?.name || "상대",
    myName: userInfo?.name || "나",
    myDayPillar: mySaju?.day ? `${mySaju.day.gan}${mySaju.day.ji}` : "",
    partnerDayPillar: partnerSaju?.day ? `${partnerSaju.day.gan}${partnerSaju.day.ji}` : "",
    complementElement: partnerStrong[0],
    myLackingElement: myWeak[0],
  };
}

const ELEMENT_LABEL = { 목: "목", 화: "불", 토: "흙", 금: "금", 수: "물" };

const ELEMENT_SOKGUNG = {
  목: {
    lack: "쉽게 달아오르지 않고 리듬이 늦게 잡히는",
    partner: "천천히 밀어붙이며 몸의 긴장을 풀어 주는",
    spark: "처음엔 가볍다가 갈수록 깊어지는 리듬",
  },
  화: {
    lack: "열기가 금방 식어 버리는",
    partner: "체온과 숨결로 먼저 몸을 데우는",
    spark: "스치는 순간 바로 올라오는 뜨거운 반응",
  },
  토: {
    lack: "감각이 무뎌지기 쉬운",
    partner: "묵직하게 밀착하며 오래 머무는",
    spark: "느리지만 끝까지 밀어붙이는 압박감",
  },
  금: {
    lack: "예민한 포인트를 잘 못 건드리는",
    partner: "작은 자극에도 몸이 먼저 반응하게 만드는",
    spark: "닿는 곳마다 전류가 흐르는 예민함",
  },
  수: {
    lack: "깊이까지 이어지기 어려운",
    partner: "점점 젖어 들며 안쪽까지 퍼지는",
    spark: "겉보다 속에서 더 크게 번지는 쾌감",
  },
};

const SCORE_GRADE = [
  { min: 90, label: "폭발적인", hook: "손만 스쳐도 몸이 먼저 반응하는" },
  { min: 80, label: "뜨거운", hook: "숨결이 섞이면 금방 무너지는" },
  { min: 72, label: "은밀한", hook: "겉으론 담담해도 맞닿으면 숨이 가빠지는" },
  { min: 0, label: "스며드는", hook: "천천히 달아오르다 한순간에 깊어지는" },
];

function pickVariant(seed, list) {
  return list[seed % list.length];
}

function buildScoreReason(myName, partnerName, mySaju, partnerSaju, compat, score) {
  const myDay = compat?.myDayPillar || "";
  const ptDay = compat?.partnerDayPillar || "";
  const myElem = compat?.myLackingElement || "";
  const ptElem = compat?.complementElement || "";
  const mySok = ELEMENT_SOKGUNG[myElem] || ELEMENT_SOKGUNG.화;
  const ptSok = ELEMENT_SOKGUNG[ptElem] || ELEMENT_SOKGUNG.수;
  const seed = hashSeed(`${myName}${partnerName}${myDay}${ptDay}${score}`);
  const grade = SCORE_GRADE.find((g) => score >= g.min) || SCORE_GRADE[SCORE_GRADE.length - 1];

  const clearHooks = [];

  if (myElem && ptElem && myElem === ptElem) {
    clearHooks.push(
      `${partnerName}님의 <strong>${ELEMENT_LABEL[ptElem]}</strong> 기운이 ${myName}님의 <strong>${ELEMENT_LABEL[myElem]}</strong> 결핍을 채워, ${mySok.lack} 몸이 상대 앞에서 ${ptSok.spark}으로 바뀝니다`
    );
  } else if (myElem && ptElem) {
    clearHooks.push(
      `${myName}님은 <strong>${ELEMENT_LABEL[myElem]}</strong> 쪽 감각이 약한데, ${partnerName}님은 <strong>${ELEMENT_LABEL[ptElem]}</strong> 기운이 강해 ${ptSok.partner} 타입이라 서로 다른 방식으로 끌립니다`
    );
  }

  if (mySaju?.day?.ji && partnerSaju?.day?.ji) {
    if (mySaju.day.ji !== partnerSaju.day.ji) {
      clearHooks.push(
        `일지 <strong>${myDay}</strong>·<strong>${ptDay}</strong> 조합은 평소엔 거리감이 있어 보여도, 맞닿는 순간 긴장과 끌림이 동시에 올라오는 속궁합입니다`
      );
    } else {
      clearHooks.push(
        `일지가 맞는 <strong>${myDay}</strong>·<strong>${ptDay}</strong> 조합이라 본능이 먼저 몸을 인정하고, 숨결이 섞일수록 같은 리듬으로 무너집니다`
      );
    }
  } else if (myDay && ptDay) {
    clearHooks.push(
      `일주 <strong>${myDay}</strong>·<strong>${ptDay}</strong>가 맞물리며 ${grade.hook} 흐름이 잡혔습니다`
    );
  }

  if (!clearHooks.length) {
    clearHooks.push(`${partnerName}님과 ${myName}님 사이에 ${grade.hook} 속궁합 기운이 읽힙니다`);
  }

  const fadeHooks = [
    `두 사람이 어떤 분위기에서 가장 빠르게 달아오르는지, 상대의 어떤 손길·목소리·체취에 몸이 먼저 굴복하는지, 그리고 밤이 깊어질수록 리듬이 어떻게 거세지는지까지 읽어내려면 일주·시지와 십성·신살까지 대조해야 합니다`,
    `${partnerName}님이 ${myName}님의 약한 지점을 어디서 건드리면 가장 오래 달아오르는지, 겉으론 차분해도 침대 위에서 어떤 본능이 드러나는지는 사주 원국 전체를 맞춰 봐야 정확히 드러납니다`,
    `처음 스침부터 절정까지 이어지는 속도, 상대가 어떤 리듬으로 밀어붙일 때 몸이 가장 깊게 반응하는지, 그리고 한 번 맞은 뒤 다시 끌리는 중독 포인트는 두 사람의 사주를 겹쳐 봐야 합니다`,
  ];

  const visible = `${myName}님과 ${partnerName}님의 속궁합은 <strong>${score}점</strong>, ${grade.label} 편입니다. ${pickVariant(seed, clearHooks)}.`;

  const blurred = pickVariant(seed + 1, fadeHooks);

  return { visible, blurred };
}

export function buildAdultResultPreview(userInfo, partnerInfo, mySaju, partnerSaju, compat) {
  const myName = userInfo?.name || "당신";
  const partnerName = partnerInfo?.name || "상대";
  const score = compat?.score || 82;
  const scoreHigh = Math.min(10, Math.max(6, Math.round(score / 10)));
  const scoreLow = Math.max(1, scoreHigh - 2);
  const myTop = dominantElement(mySaju?.fiveElementsWeighted || {});
  const partnerTop = dominantElement(partnerSaju?.fiveElementsWeighted || {});
  const gradeLetters = ["D", "C", "B", "B", "A", "A", "S", "S"];
  const gradeCode = `${gradeLetters[Math.min(7, Math.floor((score - 62) / 5))]}-${score}`;
  const scoreReason = buildScoreReason(myName, partnerName, mySaju, partnerSaju, compat, score);

  return {
    myName,
    partnerName,
    score,
    myDayPillar: compat?.myDayPillar || "",
    partnerDayPillar: compat?.partnerDayPillar || "",
    introLine: `${myName}님은 특정 분위기에서만 몸이 뜨겁게 반응하는 패턴이 보입니다.`,
    tendencyTitle: `더 자세한 ${myName}님의 ㅅ적 취향`,
    elementLine: `${myName}님은 <strong>${ELEMENT_LABEL[myTop[0]] || myTop[0]}</strong>의 기운, ${partnerName}님은 <strong>${ELEMENT_LABEL[partnerTop[0]] || partnerTop[0]}</strong>의 기운으로`,
    scoreRange: `${scoreLow}~${scoreHigh}`,
    gradeCode,
    chemistryLine: `${myName}님은 천천히 달아오르는 타입, ${partnerName}님은 순간적으로 폭발하는 타입.`,
    preview1Visible: `${myName}님은 평소엔 차분하고 이성적인 이미지를 주지만, 특정한 분위기와 텐션 앞에서만 급격하게 무너지는 강한 패턴을 가지고 있습니다.`,
    preview1Blurred: "특히 중저음의 낮고 부드러운 목소리와 진한 우드향이 나는 남성적인 체취에 매우 강하게 반응합니다. 이 두 가지가 동시에 느껴질 때, 몸은 생각보다 빠르고 깊게 달아오르는 경향이 강합니다.",
    preview2Visible: compat
      ? `${myName}님과 ${partnerName}님의 일주 <strong>${compat.myDayPillar}</strong>·<strong>${compat.partnerDayPillar}</strong> 조합에서 속궁합 <strong>${score}점</strong>이 나왔습니다.`
      : `${myName}님은 부드러움과 강렬함이 동시에 오는 플레이를 가장 좋아합니다.`,
    preview2Blurred: "단순한 빠른 움직임보다는, 천천히 깊게 밀어붙이면서도 순간적으로 강하게 압박하는 리듬에 크게 반응합니다. 목덜미와 쇄골을 손으로 쓸어올리거나 살짝 물어뜯는 터치에 몸이 격하게 반응합니다.",
    scoreReasonVisible: scoreReason.visible,
    scoreReasonBlurred: scoreReason.blurred,
    closingLine: `여기까지는 시작에 불과하다. ${myName}님과 ${partnerName}님의 사주가 만났을 때의 정욕합의 기록은 아직 끝나지 않았으니까.`,
  };
}
