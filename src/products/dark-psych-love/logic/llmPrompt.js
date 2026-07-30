/**
 * 2차 LLM 태깅 프롬프트 설계.
 *
 * 목적: 규칙 기반으로 좁혀진 "후보 세그먼트"에 대해서만
 *       관계 조종 패턴을 구조화된 JSON 으로 태깅한다.
 *
 * 태깅 대상 패턴
 *  - gaslighting        : 가스라이팅 (현실/기억 부정, 상대를 예민한 사람으로 몰기)
 *  - lovebomb_devalue   : 러브바밍 ↔ 평가절하 사이클
 *  - triangulation      : 삼각관계 조성 (제3자를 끌어들여 불안·경쟁 유발)
 *  - darvo              : 부정-공격-피해자/가해자 전도 (Deny, Attack, Reverse Victim & Offender)
 *
 * 출력은 인용문 없이 "무엇이 몇 회 관찰되었는지"의 구조화된 통계로만 받는다.
 */

export const PATTERN_TYPES = {
  gaslighting: '가스라이팅',
  lovebomb_devalue: '러브바밍–평가절하 사이클',
  triangulation: '삼각관계 조성',
  darvo: 'DARVO(책임 전가)',
};

/** LLM 출력이 따라야 할 JSON 스키마 (문서/검증용) */
export const LLM_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['patterns', 'segmentsReviewed'],
  additionalProperties: false,
  properties: {
    segmentsReviewed: { type: 'integer', minimum: 0 },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'count', 'confidence'],
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: Object.keys(PATTERN_TYPES) },
          count: { type: 'integer', minimum: 0 },
          // 0.0 ~ 1.0
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          // 인용문 금지. 어떤 화자에게서 주로 관찰됐는지 라벨만.
          bySpeaker: {
            type: 'object',
            additionalProperties: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `당신은 관계 심리학 연구를 보조하는 분석기입니다.
연애 관계의 대화 세그먼트에서 다음 4가지 조종 패턴의 "관찰 빈도"만 태깅합니다.

- gaslighting: 상대의 기억·현실 인식을 부정하거나 상대를 과민한 사람으로 몰아가는 발화
- lovebomb_devalue: 과도한 애정·칭찬과 급격한 평가절하가 번갈아 나타나는 흐름
- triangulation: 제3자(전 연인, 이성 등)를 끌어들여 불안이나 경쟁심을 유발하는 발화
- darvo: 지적받자 부정→역공격→피해자·가해자 역전으로 대응하는 흐름

규칙:
1. 반드시 지정된 JSON 스키마만 출력한다. 그 외 텍스트·설명·마크다운 금지.
2. 원문 문장을 절대 인용하거나 재현하지 않는다. 오직 유형·횟수·신뢰도만 집계한다.
3. 확실하지 않으면 confidence 를 낮춘다. 근거 없는 유형은 넣지 않는다.
4. 이것은 임상 진단이 아니라 참고용 신호 탐지임을 전제로 보수적으로 판단한다.`;

/**
 * LLM 호출용 user 메시지 본문 구성.
 * @param {Array<Array<{sender:string,text:string}>>} segments buildCandidateSegments 결과
 * @param {{ selfName?: string, partnerName?: string }} names
 */
export function buildUserPrompt(segments, names = {}) {
  const header = [
    names.partnerName ? `분석 대상(상대): ${names.partnerName}` : null,
    names.selfName ? `본인: ${names.selfName}` : null,
    `세그먼트 수: ${segments.length}`,
    '',
    '아래 세그먼트들을 검토하고 위 4개 패턴의 빈도를 JSON 으로 집계하세요.',
    `반드시 이 JSON 형태로만 응답: ${JSON.stringify({
      segmentsReviewed: 0,
      patterns: [{ type: 'gaslighting', count: 0, confidence: 0, bySpeaker: {} }],
    })}`,
    '',
    '=== 세그먼트 시작 ===',
  ];

  const body = segments
    .map((seg, i) => {
      const lines = seg.map((m) => `${m.sender}: ${m.text}`).join('\n');
      return `--- 세그먼트 ${i + 1} ---\n${lines}`;
    })
    .join('\n\n');

  return `${header.join('\n')}\n${body}\n=== 세그먼트 끝 ===`;
}

/** 전체 LLM 요청 페이로드 (제공사 무관 형태) */
export function buildLlmRequest(segments, names = {}) {
  return {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(segments, names) }],
    // 구조화 출력 유도용 힌트
    responseSchema: LLM_OUTPUT_SCHEMA,
    temperature: 0,
  };
}
