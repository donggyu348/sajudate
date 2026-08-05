/**
 * 목차에서 "이 사람이 꼭 봐야 할 챕터"를 고른다.
 *
 * 무작위나 고정값이 아니라 실제 진단 결과에서 뽑는다 — 근거 없이 추천하면
 * 사용자가 바로 알아채고, 리포트 전체의 신뢰도가 떨어진다.
 * 각 추천에는 왜 골랐는지(reason)를 함께 담아 화면에 근거를 보여줄 수 있게 한다.
 */

/** 챕터 key → REPORT_TOC 안에서의 순번(1-based)을 찾는다 */
function indexOfChapter(toc, key) {
  const i = toc.findIndex((c) => c.key === key);
  return i === -1 ? null : i + 1;
}

/**
 * @param {object} opts
 * @param {Array} opts.toc REPORT_TOC
 * @param {number} opts.gaslightingPercent 0~100
 * @param {Array} opts.rows 축별 점수 (score 내림차순 정렬 상태)
 * @param {object|null} opts.selfPattern 자기 반응 취약성
 * @param {Array} opts.patterns 감지된 패턴 목록
 * @returns {{ number: string, key: string, title: string, reason: string }[]}
 */
export function recommendChapters({ toc, gaslightingPercent, rows, selfPattern, patterns }) {
  const candidates = [];
  const push = (key, reason, weight) => {
    const idx = indexOfChapter(toc, key);
    if (!idx) return;
    candidates.push({ idx, key, reason, weight, title: toc[idx - 1].title });
  };

  // 가스라이팅 신호가 뚜렷할수록 "무슨 일이 벌어지고 있는지" 확인이 먼저다
  if (gaslightingPercent >= 60) {
    push('diagnosis', `가스라이팅 확률이 ${gaslightingPercent}%로 높게 나왔어요`, 100 + gaslightingPercent);
  }

  // 상대 성향이 특정 축으로 크게 기울면 그 축을 다루는 챕터
  const top = rows && rows.length ? rows[0] : null;
  if (top && top.score >= 3.5) {
    push('partnerPsychology', `${top.label} 성향이 ${top.score.toFixed(1)}점으로 두드러져요`, 90 + top.score * 10);
  }

  // 사용자 자신의 반응 패턴이 취약하면 자기 심리 챕터
  if (selfPattern && selfPattern.score >= 3) {
    push('selfPsychology', `자기 반응 취약성이 ${selfPattern.score.toFixed(1)}점이에요`, 85 + selfPattern.score * 10);
  }

  // 조종 패턴이 반복적으로 감지되면 당장 무엇을 할지가 급하다
  const totalPatternCount = (patterns || []).reduce((n, p) => n + (p.count || 0), 0);
  if (totalPatternCount >= 5) {
    push('actionGuide', `조종 신호가 ${totalPatternCount}회 감지됐어요`, 80 + totalPatternCount);
  }

  // 신호가 약하면 "이 관계를 어떻게 볼 것인가"로 안내
  if (candidates.length === 0) {
    push('futureOutlook', '지금 관계가 어디로 향하는지 짚어드려요', 50);
    push('strategy', '앞으로의 대응 방향을 정리해드려요', 40);
  }

  // 점수 높은 순으로 최대 2개 — 너무 많이 추천하면 "꼭 봐야 할" 의미가 없어진다
  const picked = candidates.sort((a, b) => b.weight - a.weight).slice(0, 2);

  return picked
    .sort((a, b) => a.idx - b.idx) // 화면에는 목차 순서대로
    .map((c) => ({
      number: String(c.idx).padStart(2, '0'),
      key: c.key,
      title: c.title,
      reason: c.reason,
    }));
}
