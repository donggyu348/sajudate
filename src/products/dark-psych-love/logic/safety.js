/**
 * 안전 안내 데이터.
 * 리포트 하단 고지에 사용.
 */

export const REPORT_DISCLAIMER =
  '본 리포트는 심리학 척도를 각색한 참고용 인사이트입니다. 임상적 진단이나 법적 판단을 대체하지 않으며, ' +
  '관계의 위험 신호가 의심된다면 전문 상담 기관에 도움을 요청하세요.';

/**
 * 리포트 맨 아래 "해결법" 섹션의 목차.
 * 실제 분석 로직 없이 제목만 나열 — 앞으로 제공될 내용의 목차 역할만 한다.
 * (결제 시스템은 아직 연동 전 — 잠금 UI만 우선 구현)
 */
export const REPORT_TOC = [
  {
    key: 'diagnosis',
    title: 'AI 최종 진단',
    sections: [
      {
        title: '관계 종합 분석',
        items: [
          { key: 'relationshipHealth', label: '관계 건강도', type: 'percent' },
          { key: 'gaslightingRisk', label: '가스라이팅 위험도', type: 'percent', fromFree: true },
          { key: 'continueRecommendation', label: '관계 지속 추천도', type: 'percent' },
        ],
      },
      {
        title: '핵심 진단',
        items: [
          { key: 'biggestProblem', label: '가장 큰 문제점', type: 'text' },
          { key: 'relationshipStage', label: '현재 관계 단계', type: 'text' },
          { key: 'oneLineConclusion', label: 'AI 한 줄 결론', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'partnerPsychology',
    title: '상대 심리 분석',
    sections: [
      {
        title: '성향 분석',
        items: [
          { key: 'responsibilityAvoidance', label: '책임 회피 성향', type: 'text' },
          { key: 'empathy', label: '공감 능력', type: 'text' },
          { key: 'conflictStyle', label: '갈등 해결 방식', type: 'text' },
        ],
      },
      {
        title: '행동 패턴',
        items: [
          { key: 'repeatedBehavior', label: '반복되는 행동', type: 'text' },
          { key: 'manipulationStyle', label: '감정 조종 방식', type: 'text' },
          { key: 'changePotential', label: '변화 가능성', type: 'text' },
        ],
      },
      {
        title: '종합 평가',
        items: [
          { key: 'recoveryPotential', label: '관계 회복 가능성', type: 'percent' },
          { key: 'trustRecoveryPotential', label: '신뢰 회복 가능성', type: 'percent' },
        ],
      },
    ],
  },
  {
    key: 'selfPsychology',
    title: '내 심리 분석',
    sections: [
      {
        title: '감정 상태',
        items: [
          { key: 'selfEsteemChange', label: '자존감 변화', type: 'text' },
          { key: 'guiltSensitivity', label: '죄책감 민감도', type: 'text' },
          { key: 'emotionalExhaustion', label: '감정 소진 정도', type: 'text' },
        ],
      },
      {
        title: '관계 성향',
        items: [
          { key: 'conflictAvoidance', label: '갈등 회피 성향', type: 'text' },
          { key: 'partnerCenteredThinking', label: '상대 중심 사고', type: 'text' },
          { key: 'psychologicalWeakness', label: '나의 심리적 약점', type: 'text' },
        ],
      },
      {
        title: '종합 평가',
        items: [
          { key: 'whyIWavered', label: '왜 흔들렸는지', type: 'text' },
          { key: 'whatToWatchFor', label: '가장 조심해야 할 점', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'futureOutlook',
    title: '관계의 현재와 미래',
    sections: [
      {
        title: '현재 관계 진단',
        items: [
          { key: 'coreConflictCause', label: '핵심 갈등 원인', type: 'text' },
          { key: 'repeatedProblem', label: '반복되는 문제', type: 'text' },
          { key: 'mostDangerousSignal', label: '가장 위험한 신호', type: 'text' },
        ],
      },
      {
        title: '미래 시나리오',
        items: [
          { key: 'ifContinue', label: '계속 만난다면', type: 'text' },
          { key: 'ifDistance', label: '거리를 둔다면', type: 'text' },
          { key: 'ifEnd', label: '관계를 끝낸다면', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'actionGuide',
    title: '관계를 위한 행동 가이드',
    sections: [
      {
        title: '지금 해야 할 행동',
        items: [
          { key: 'today', label: '오늘', type: 'text' },
          { key: 'thisWeek', label: '이번 주', type: 'text' },
          { key: 'thisMonth', label: '이번 달', type: 'text' },
        ],
      },
      {
        title: '마지막 기회 체크리스트',
        items: [
          { key: 'checklistCriteria', label: '변화를 확인해야 할 기준', type: 'text' },
          { key: 'checklistBehavior', label: '반드시 지켜봐야 할 행동', type: 'text' },
          { key: 'checklistMinimum', label: '관계를 이어갈 최소 조건', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'strategy',
    title: '앞으로의 관계 전략',
    sections: [
      {
        title: '다시는 당하지 않는 법',
        items: [
          { key: 'warningSignsToNotice', label: '위험 신호 알아보기', type: 'text' },
          { key: 'healthyRelationshipCriteria', label: '건강한 관계의 기준', type: 'text' },
          { key: 'boundariesToKeep', label: '경계해야 할 행동', type: 'text' },
        ],
      },
      {
        title: '나만의 관계 사용설명서',
        items: [
          { key: 'compatibleType', label: '잘 맞는 사람의 특징', type: 'text' },
          { key: 'incompatibleType', label: '피해야 할 사람의 특징', type: 'text' },
          { key: 'relationshipPrinciple', label: '앞으로의 관계 원칙', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'finalSuggestion',
    title: 'AI 최종 제안',
    sections: [
      {
        title: '가장 추천하는 선택',
        items: [
          { key: 'optionStay', label: '관계 유지', type: 'percent' },
          { key: 'optionDistance', label: '거리 두기', type: 'percent' },
          { key: 'optionEnd', label: '관계 종료', type: 'percent' },
        ],
      },
      {
        title: '마지막 조언',
        items: [
          { key: 'mostImportantThing', label: '지금 가장 중요한 한 가지', type: 'text' },
          { key: 'finalMessage', label: 'AI 최종 메시지', type: 'text' },
        ],
      },
    ],
  },
];

