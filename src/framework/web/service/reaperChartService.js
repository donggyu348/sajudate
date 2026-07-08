import { getFourPillars } from "./sajuCalService.js";

/** 리퍼 명부·GPT 본문·화면 그래프가 공유하는 고정 대운 연도 구간 */
const FIXED_PERIODS = [
  { start: 2026, end: 2035 },
  { start: 2036, end: 2045 },
  { start: 2046, end: 2055 },
  { start: 2056, end: 2065 },
  { start: 2066, end: 2075 },
  { start: 2076, end: 2085 },
];

const LUCK_SCORE = {
  편재: 92, 정재: 88, 식신: 78, 상관: 72,
  비견: 58, 겁재: 52, 정관: 62, 편관: 56,
  정인: 68, 편인: 63,
};

const WEALTH_SCORE = {
  편재: 95, 정재: 90, 식신: 70, 상관: 65,
  비견: 45, 겁재: 40, 정관: 55, 편관: 50,
  정인: 48, 편인: 45,
};

function periodLabel(p, short = false) {
  if (short) return `${p.start}~${String(p.end).slice(2)}`;
  return `${p.start}~${p.end}년`;
}

function hashNum(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

function formatAmountMan(man) {
  return `₩${Number(man).toLocaleString("ko-KR")}만`;
}

function pickPeakIndex(periods, key) {
  let idx = 0;
  periods.forEach((p, i) => {
    if (p[key] > periods[idx][key]) idx = i;
  });
  return idx;
}

/**
 * 사자록 대운·재물 그래프 데이터 (result / report / GPT CHART_SNAPSHOT 공용)
 */
export function buildReaperCharts(userInfo) {
  const pillars = getFourPillars(userInfo);
  const daewoon = pillars.daewoon || [];

  const periods = FIXED_PERIODS.map((p, i) => {
    const dw = daewoon[i] || daewoon[daewoon.length - 1] || {};
    const tenGod = dw.tenGod || "편재";
    return {
      index: i,
      label: periodLabel(p),
      shortLabel: periodLabel(p, true),
      tenGod,
      gan: dw.gan || "",
      ji: dw.ji || "",
      luckScore: LUCK_SCORE[tenGod] ?? 60,
      wealthScore: WEALTH_SCORE[tenGod] ?? 50,
    };
  });

  const peakLuckIdx = pickPeakIndex(periods, "luckScore");
  const peakWealthIdx = pickPeakIndex(periods, "wealthScore");

  const birthRaw = String(userInfo?.birthDate || userInfo?.birthdate || "").replace(/\D/g, "");
  const birthYear = parseInt(birthRaw.slice(0, 4), 10) || 1990;
  const dayGan = pillars.day?.gan || "";
  const baseMan = 2200 + (hashNum(`${birthYear}-${dayGan}-${peakWealthIdx}`) % 25) * 100
    + periods[peakWealthIdx].wealthScore * 8;
  const amountMan = Math.round(baseMan / 50) * 50;

  const chartW = 320;
  const chartH = 200;
  const baseY = 170;
  const leftX = 28;
  const rightX = 292;
  const n = periods.length;
  const stepX = (rightX - leftX) / (n - 1);

  const luckPoints = periods.map((p, i) => {
    const x = Math.round(leftX + stepX * i);
    const y = Math.round(baseY - (p.luckScore / 100) * 120);
    return { x, y, ...p };
  });

  const lineCoords = luckPoints.map((p) => `${p.x},${p.y}`).join(" L");
  const linePath = `M${lineCoords}`;
  const areaPath = `${linePath} L${rightX},${baseY} L${leftX},${baseY} Z`;

  const peakLuck = luckPoints[peakLuckIdx];
  const peakWealth = periods[peakWealthIdx];

  const wealthBars = periods.map((p, i) => {
    const isPeak = i === peakWealthIdx;
    const width = isPeak ? 26 : 20;
    const x = Math.round(leftX + stepX * i - width / 2);
    const height = Math.round((p.wealthScore / 100) * 126);
    const y = baseY - height;
    return { x, y, height, width, isPeak, ...p };
  });

  const peakBar = wealthBars[peakWealthIdx];

  const snapshot = {
    daewoonPeakPeriod: peakLuck.label,
    daewoonPeakTenGod: peakLuck.tenGod,
    daewoonPeriods: periods.map((p) => ({
      period: p.label,
      tenGod: p.tenGod,
      luckLevel: p.luckScore >= 85 ? "최상" : p.luckScore >= 70 ? "강" : "보통",
    })),
    wealthPeakPeriod: peakWealth.label,
    wealthPeakAmount: formatAmountMan(amountMan),
    wealthPeakAmountMan: amountMan,
    wealthPeakTenGod: peakWealth.tenGod,
    wealthBars: periods.map((p) => ({
      period: p.label,
      tenGod: p.tenGod,
      relative: p.wealthScore,
    })),
    bodyMustMention: [
      `인생이 뒤집히는 대운 정점: ${peakLuck.label} (${peakLuck.tenGod} 기운)`,
      `재물이 크게 터지는 시기: ${peakWealth.label} (${peakWealth.tenGod} 기운)`,
      `그 시기 예상 목돈 규모: ${formatAmountMan(amountMan)}`,
    ].join("\n"),
  };

  return {
    daewoon: {
      points: luckPoints,
      linePath,
      areaPath,
      peak: peakLuck,
      peakXPercent: ((peakLuck.x / chartW) * 100).toFixed(1),
      peakYPercent: ((peakLuck.y / chartH) * 100).toFixed(1),
    },
    wealth: {
      bars: wealthBars,
      peak: peakWealth,
      peakBar,
      amountMan,
      amountText: formatAmountMan(amountMan),
      peakXPercent: (((peakBar.x + peakBar.width / 2) / chartW) * 100).toFixed(1),
      peakYPercent: ((peakBar.y / chartH) * 100).toFixed(1),
    },
    snapshot,
    axisLabels: periods.map((p) => p.shortLabel),
  };
}
