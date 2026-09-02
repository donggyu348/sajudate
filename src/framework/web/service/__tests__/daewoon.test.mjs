/**
 * 대운(大運) 회귀 테스트
 *
 * 실행: node src/framework/web/service/__tests__/daewoon.test.mjs
 *
 * 과거에 아래 네 가지가 동시에 틀려 있었다. 하나라도 되돌아가면 여기서 잡힌다.
 *
 *  1) 성별 문자열 — 폼은 "남성"/"여성"을 보내는데 "남"/"여"로만 비교해
 *     두 조건이 모두 거짓이 되어 **모든 사람이 역행** 처리됐다.
 *  2) 양간 목록에 신(辛)이 들어가고 임(壬)이 빠져 있었다. 신은 음간, 임이 양간이다.
 *  3) 대운 목록이 월주 자신부터 시작해 전체가 한 칸씩 밀렸다.
 *     첫 대운은 월주 다음(순행)/이전(역행) 간지다.
 *  4) 대운수를 출생년 입춘(2/4) 하나로만 재서, 늦가을·겨울 출생은
 *     차이가 음수가 되어 무조건 1세로 깎였다. 12절 전체를 기준으로 재야 한다.
 */

import { getFourPillars, findCurrentDaewoon } from "../sajuCalService.js";

/** 나이 기준 해 — 테스트가 해가 바뀌어도 흔들리지 않도록 고정한다 */
const REF_YEAR = 2026;

const CASES = [
  {
    label: "여성 1992-11-12 09:47 — 여자+양년간(임)이면 역행",
    userInfo: { name: "테스트A", gender: "여성", birthDate: "19921112", birthTime: "10" },
    birthYear: 1992,
    expect: {
      monthPillar: "신해",
      isForward: false,
      // 역행: 월주(신해) 이전 간지부터
      firstFour: ["경술", "기유", "무신", "정미"],
      startAgeRange: [1, 3],        // 대운수 약 1.6세
      currentDaewoon: "정미",        // 만 34세 = 4번째 구간
      currentIndex: 3,
    },
  },
  {
    label: "남성 1994-12-22 17:00 — 남자+양년간(갑)이면 순행",
    userInfo: { name: "테스트B", gender: "남성", birthDate: "19941222", birthTime: "18" },
    birthYear: 1994,
    expect: {
      monthPillar: "병자",
      isForward: true,
      // 순행: 월주(병자) 다음 간지부터
      firstFour: ["정축", "무인", "기묘", "경진"],
      startAgeRange: [4, 6],        // 대운수 약 4.8세
      currentDaewoon: "기묘",        // 만 32세 = 3번째 구간
      currentIndex: 2,
    },
  },
];

let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
}

function checkRange(label, actual, [min, max]) {
  const ok = actual >= min && actual <= max;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        기대 ${min}~${max} / 실제 ${actual}`);
}

for (const c of CASES) {
  console.log(`\n── ${c.label}`);

  const p = getFourPillars(c.userInfo);
  const dw = p.daewoon;
  const age = REF_YEAR - c.birthYear;

  check("월주", `${p.month.gan}${p.month.ji}`, c.expect.monthPillar);

  // 방향은 목록의 진행으로 검증한다 (내부 플래그를 노출하지 않으므로)
  const firstFour = dw.slice(0, 4).map((d) => `${d.gan}${d.ji}`);
  check("첫 4개 대운(방향 + 시작 지점)", firstFour, c.expect.firstFour);

  // 월주 자신이 대운 목록에 끼어 있으면 안 된다
  check("월주가 대운에 포함되지 않음", firstFour.includes(c.expect.monthPillar), false);

  checkRange("대운수(첫 대운 시작 나이)", dw[0].startAge, c.expect.startAgeRange);

  // 구간이 겹치거나 비지 않고 이어지는지
  const contiguous = dw.every((d, i) => i === 0 || d.startAge === dw[i - 1].endAge + 1);
  check("나이 구간이 빈틈·겹침 없이 연속", contiguous, true);

  const cur = findCurrentDaewoon(dw, age);
  check(`만 ${age}세 현재 대운`, `${cur.gan}${cur.ji}`, c.expect.currentDaewoon);
  check("현재 대운의 순번(0-based)", dw.indexOf(cur), c.expect.currentIndex);
}

/* 방향 판별을 성별·년간 조합 전체로 훑는다 (표기 흔들림 포함) */
console.log("\n── 방향 판별 — 남양여음 순행 / 남음여양 역행");
{
  // 1994(갑술, 양간) / 1995(을해, 음간) 같은 날짜로 성별만 바꿔 본다
  const combos = [
    { gender: "남성", birthDate: "19941222", yang: true, forward: true },
    { gender: "남",   birthDate: "19941222", yang: true, forward: true },
    { gender: "여성", birthDate: "19941222", yang: true, forward: false },
    { gender: "남성", birthDate: "19951222", yang: false, forward: false },
    { gender: "여성", birthDate: "19951222", yang: false, forward: true },
    { gender: "여",   birthDate: "19951222", yang: false, forward: true },
  ];
  for (const c of combos) {
    const p = getFourPillars({ name: "T", gender: c.gender, birthDate: c.birthDate, birthTime: "12" });
    const GAN = ["갑","을","병","정","무","기","경","신","임","계"];
    const JI = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
    // 첫 대운이 월주 기준 +1인지 -1인지로 방향을 읽는다
    const mg = GAN.indexOf(p.month.gan), d0 = GAN.indexOf(p.daewoon[0].gan);
    const stepped = ((d0 - mg) % 10 + 10) % 10;
    const actualForward = stepped === 1;
    const label = `${c.gender} / 년간 ${p.year.gan}(${c.yang ? "양" : "음"}) → ${c.forward ? "순행" : "역행"}`;
    check(label, actualForward, c.forward);
  }
}

console.log(`\n${failed === 0 ? "✅ 전부 통과" : `❌ 실패 ${failed}건`}`);
process.exit(failed === 0 ? 0 : 1);
