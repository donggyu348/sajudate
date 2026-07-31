import { sequelize, Product, Agent } from '../models/index.js';
import { DEFAULT_COUNSELOR_SYSTEM_PROMPT } from '../products/dark-psych-love/logic/counselor.js';

/** 초기 상품 시드. 플랫폼 구조 검증용 더미 + 첫 상품(dark-psych-love). */
const PRODUCTS = [
  {
    slug: 'dark-psych-love',
    name: '관계 심리 리포트',
    description:
      '연애 관계 안에서 상대가 보이는 조종·가해 성향 패턴을 심리학 척도 기반으로 진지하게 진단합니다.',
    category: '연애진단',
    isFeatured: true,
    headline: '내 관계, 안전한가요?',
    subcopy: '다크 테트라드 척도로 읽는 관계의 위험 신호',
    thumbnailUrl: null, // 직접 업로드 예정
    isActive: true,
    sortOrder: 1,
  },
  {
    slug: 'attachment-check',
    name: '애착 유형 체크',
    description: '성인 애착 이론(ECR) 기반의 간단한 애착 유형 체크리스트입니다. (준비 중)',
    category: '체크리스트',
    isFeatured: false,
    headline: '나의 애착 유형은?',
    subcopy: '안정 · 불안 · 회피 — 관계 패턴의 뿌리',
    thumbnailUrl: null,
    isActive: true,
    sortOrder: 2,
  },
  {
    slug: 'relationship-report-sample',
    name: '관계 종합 리포트',
    description: '여러 진단을 종합한 관계 리포트 상품입니다. (준비 중)',
    category: '리포트',
    isFeatured: true,
    headline: '흩어진 신호를 하나의 리포트로',
    subcopy: '진단 결과를 종합해 관계를 입체적으로',
    thumbnailUrl: null,
    isActive: true,
    sortOrder: 3,
  },
];

/** 기본 상담 에이전트 (관리자 UI에서 이후 자유롭게 수정/추가) */
const AGENTS = [
  {
    slug: 'relationship-counselor',
    name: '관계 상담사',
    description: '연애 관계의 조종·가해 신호를 함께 살펴보는 대화형 상담 봇',
    systemPrompt: DEFAULT_COUNSELOR_SYSTEM_PROMPT,
    greeting: '안녕하세요. 요즘 관계에서 마음이 힘드셨나요? 어떤 일이 있었는지 편하게 이야기해 주세요.',
    model: '',
    maxTokens: 1600,
    effort: 'low',
    isActive: true,
    sortOrder: 1,
  },
];

async function run() {
  await sequelize.sync({ alter: true });
  for (const p of PRODUCTS) {
    const [row, created] = await Product.findOrCreate({ where: { slug: p.slug }, defaults: p });
    if (!created) await row.update(p);
    console.log(`${created ? '[created]' : '[updated]'} product ${p.slug}`);
  }
  for (const a of AGENTS) {
    // 기존 봇의 관리자 수정 내용을 덮어쓰지 않도록 create-only
    const [, created] = await Agent.findOrCreate({ where: { slug: a.slug }, defaults: a });
    console.log(`${created ? '[created]' : '[kept]'} agent ${a.slug}`);
  }
  console.log('시드 완료');
  await sequelize.close();
}

run().catch((err) => {
  console.error('시드 실패:', err);
  process.exit(1);
});
