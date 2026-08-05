import {
  getCounselorClient,
  DEFAULT_MODEL,
  isTransientLlmError,
  retryDelayMs,
} from './counselor.js';
import { AXES } from './axes.js';
import { REPORT_TOC } from './safety.js';
import { safeJsonParse } from './jsonUtil.js';

/**
 * 결제 완료 후 보여줄 전체 리포트 콘텐츠 생성.
 * 원본 상담 대화는 저장하지 않으므로(프라이버시 설계), 이미 만들어진 무료 리포트 결과
 * (summary/axisScores/patterns/selfPattern — 전부 원문 인용 없는 요약 데이터)만 입력으로 쓴다.
 * REPORT_TOC를 그대로 순회해서 프롬프트/스키마를 만들기 때문에, 목차가 바뀌면 이 파일도 자동으로 맞춰진다.
 *
 * 챕터를 한 번에 다 만들지 않고 챕터당 한 번씩 호출한다.
 * 한 번에 몰아 쓰게 하면 뒤로 갈수록 문장이 짧아지고 뻔해지는데, 유료 리포트에서는 그게 바로 티가 난다.
 */

/** 텍스트 항목에 요구하는 분량·구체성 — 유료 리포트의 체감 품질을 좌우하는 지점이다 */
const TEXT_HINT = '한국어 4~6문장(250~400자). 아래 규칙을 지켜 구체적으로 작성';

function chapterFieldLines(chapter) {
  const lines = [];
  for (const section of chapter.sections) {
    for (const item of section.items) {
      if (item.fromFree) continue; // 이미 있는 값(가스라이팅 확률) 재사용 — 생성 대상 아님
      const hint = item.type === 'percent' ? '0~100 사이 정수' : TEXT_HINT;
      lines.push(`- ${item.key} (${item.label}): ${hint}`);
    }
  }
  return lines.join('\n');
}

function chapterSkeleton(chapter) {
  const obj = {};
  for (const section of chapter.sections) {
    for (const item of section.items) {
      if (item.fromFree) continue;
      obj[item.key] = item.type === 'percent' ? 50 : '...';
    }
  }
  return obj;
}

function buildChapterPrompt(chapter) {
  return `당신은 관계 심리 분석 보조입니다. 아래는 사용자에 대해 이미 만들어진 무료 요약 리포트입니다(원본 상담 대화가 아니라, 그 대화를 근거로 이미 한 번 채점·요약된 결과입니다).
이 요약만을 근거로, 유료 전체 리포트의 「${chapter.title}」 챕터를 작성하세요.

[입력으로 주어지는 무료 리포트 요약]
- axisScores: 상대방의 다크테트라드 4축(${Object.values(AXES).map((a) => a.label).join('·')}) 점수(1~5)
- patterns: 감지된 조종 패턴 유형(가스라이팅/러브바밍/삼각관계/DARVO)과 감지 횟수·확신도
- selfPattern: 사용자 자신의 반응 취약성 점수와 코멘트
- summary: 종합 소견 요약문

[이 챕터에서 작성할 항목]
${chapterFieldLines(chapter)}

작성 규칙:
1. 반드시 JSON 객체 하나로만 응답하세요. 설명·마크다운·코드펜스를 절대 붙이지 마세요.
2. 텍스트 항목은 두루뭉술한 일반론을 쓰지 마세요. 주어진 점수·패턴 이름·감지 횟수를 실제로 인용해
   "무엇을 근거로 그렇게 보는지"를 문장 안에 드러내세요.
   (예: "삼각관계 패턴이 3회 감지됐고 마키아벨리즘이 4.2점으로 높은 편인데, 이 조합은 …")
3. 각 항목은 ①현재 상태 ②그렇게 판단한 근거 ③앞으로 어떻게 나타날 수 있는지 순으로 풀어 쓰세요.
   추상적인 조언 한 줄로 끝내지 말고, 사용자가 자기 상황에 대입할 수 있을 만큼 구체적으로 쓰세요.
4. 같은 표현을 항목마다 반복하지 마세요. 항목마다 다루는 각도가 달라야 합니다.
5. 확정적 진단명("나르시시스트다", "소시오패스다")이나 단정적 낙인은 쓰지 마세요.
   "~한 성향이 관찰된다", "~일 가능성이 있다"처럼 관찰과 가능성으로 서술하세요.
6. "헤어져라/참아라" 같은 결정을 대신 내리지 말고, 사용자가 스스로 판단할 근거와 선택지를 주세요.
7. 퍼센트 항목은 정수로만 응답하고, 주어진 점수·패턴과 앞뒤가 맞게 정하세요.
8. 이것은 임상 진단이 아니라 참고용 인사이트입니다. 근거가 약한 항목은 약하다고 밝히고 중립적으로 쓰세요.

JSON 형식: ${JSON.stringify(chapterSkeleton(chapter))}`;
}

/** 상담 봇이 일시적으로 몰릴 때가 있어, 챕터 단위로 재시도한다 */
async function generateChapter(client, chapter, inputBlock) {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const message = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4000,
        system: buildChapterPrompt(chapter),
        messages: [{ role: 'user', content: inputBlock }],
      });
      const text = message?.content?.find((b) => b.type === 'text')?.text || '';
      return safeJsonParse(text);
    } catch (err) {
      if (attempt === maxAttempts - 1 || !isTransientLlmError(err)) throw err;
      console.warn(`[premium] ${chapter.key} 생성 재시도 ${attempt + 1}/${maxAttempts - 1}: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }
  }
  return null;
}

/**
 * @param {{ summary: string, axisScores: object, patterns: any[], selfPattern: object }} opts
 * @returns {Promise<any|null>} 챕터별 결과를 합친 raw JSON. 상담 봇 미설정 시 null.
 */
export async function generatePremiumReport({ summary, axisScores, patterns, selfPattern }) {
  const client = getCounselorClient();
  if (!client) return null;

  const inputBlock = [
    `[종합 소견] ${summary || '없음'}`,
    `[상대방 성향 점수] ${JSON.stringify(axisScores || {})}`,
    `[감지된 패턴] ${JSON.stringify(patterns || [])}`,
    `[자기 반응 패턴] ${JSON.stringify(selfPattern || {})}`,
  ].join('\n');

  // 동시에 다 던지면 한꺼번에 몰려 과부하 오류(529)를 맞기 쉬워, 조금씩 나눠 보낸다.
  const CONCURRENCY = 3;
  const result = {};
  for (let i = 0; i < REPORT_TOC.length; i += CONCURRENCY) {
    const batch = REPORT_TOC.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((chapter) => generateChapter(client, chapter, inputBlock))
    );
    settled.forEach((outcome, idx) => {
      const chapter = batch[idx];
      if (outcome.status === 'fulfilled') {
        result[chapter.key] = outcome.value;
      } else {
        // 한 챕터가 실패해도 나머지는 살린다 — 빈 챕터는 normalize에서 기본값으로 채워진다
        console.error(`[premium] ${chapter.key} 생성 실패:`, outcome.reason?.message || outcome.reason);
        result[chapter.key] = null;
      }
    });
  }
  return result;
}

/**
 * generatePremiumReport()의 응답(파싱 시도된 JSON)을 REPORT_TOC 기준으로 검증·정규화.
 * 누락되거나 형식이 안 맞는 필드는 안전한 기본값으로 채워, 템플릿에서 항상 예측 가능한 구조를 갖게 한다.
 * @param {any} raw
 */
export function normalizePremiumReport(raw) {
  const result = {};
  for (const chapter of REPORT_TOC) {
    result[chapter.key] = {};
    for (const section of chapter.sections) {
      for (const item of section.items) {
        if (item.fromFree) continue;
        const val = raw?.[chapter.key]?.[item.key];
        if (item.type === 'percent') {
          const n = Number(val);
          result[chapter.key][item.key] = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
        } else {
          result[chapter.key][item.key] =
            typeof val === 'string' && val.trim() ? val.trim() : '아직 준비되지 않은 항목이에요.';
        }
      }
    }
  }
  return result;
}

/**
 * 리포트가 실제로 채워졌는지 확인한다.
 * 생성이 대부분 실패하면 normalize가 기본 문구로 다 채워버려서 "완성된 것처럼" 보이는데,
 * 그 상태로 유료 리포트를 보여주면 안 되므로 여기서 걸러 재생성하게 한다.
 */
export function isPremiumReportUsable(normalized) {
  let total = 0;
  let filled = 0;
  for (const chapter of REPORT_TOC) {
    for (const section of chapter.sections) {
      for (const item of section.items) {
        if (item.fromFree) continue;
        total += 1;
        const val = normalized?.[chapter.key]?.[item.key];
        if (item.type === 'percent') {
          if (val != null) filled += 1;
        } else if (typeof val === 'string' && val !== '아직 준비되지 않은 항목이에요.') {
          filled += 1;
        }
      }
    }
  }
  return total > 0 && filled / total >= 0.7;
}
