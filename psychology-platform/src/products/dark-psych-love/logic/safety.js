/**
 * 안전 안내 데이터.
 * 리포트 하단 및 업로드 전 고지에 사용.
 *
 * 주의: 아래 기관/연락처는 실제 배포 전 최신 정보로 검증 후 확정할 것.
 *       (플레이스홀더 아님을 명시하기 위해 verified 플래그로 관리)
 */

export const PRIVACY_NOTICE = {
  title: '업로드 전 안내',
  bullets: [
    '업로드한 대화는 분석에만 사용되며 분석 직후 즉시 삭제됩니다.',
    '대화 원문은 서버에 저장되지 않습니다. (통계·패턴 요약만 보관)',
    '리포트에는 실제 대화 문장이 인용되거나 표시되지 않습니다.',
  ],
};

export const REPORT_DISCLAIMER =
  '본 리포트는 심리학 척도를 각색한 참고용 인사이트입니다. 임상적 진단이나 법적 판단을 대체하지 않으며, ' +
  '관계의 위험 신호가 의심된다면 아래의 전문 상담 기관에 도움을 요청하세요.';

/**
 * 상담/도움 기관 링크.
 * verified:false 는 배포 전 확인 필요(placeholder). 확인되면 true 로 전환.
 */
export const HELP_RESOURCES = [
  {
    name: '여성긴급전화',
    contact: '1366',
    desc: '가정폭력·데이트폭력·스토킹 등 24시간 상담',
    url: null,
    verified: false,
  },
  {
    name: '한국생명의전화',
    contact: '1588-9191',
    desc: '위기 상담 및 정서 지원',
    url: null,
    verified: false,
  },
  {
    name: '정신건강 위기상담전화',
    contact: '1577-0199',
    desc: '정신건강 관련 위기 상담',
    url: null,
    verified: false,
  },
];
