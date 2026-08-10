import { sequelize, Product, Agent } from '../models/index.js';
import { DEFAULT_COUNSELOR_SYSTEM_PROMPT } from '../products/dark-psych-love/logic/counselor.js';

/**
 * 초기 상품 시드.
 * 실제로 동작하는 상품만 넣는다 — 페이지가 없는 상품을 시드하면 메인에 노출된 뒤
 * 누르는 순간 404가 나서 판매 중인 서비스처럼 보이지 않는다.
 * 새 상품은 products/registry.js에 모듈을 등록한 뒤 여기에 추가한다.
 */
const PRODUCTS = [
  {
    slug: 'dark-psych-love',
    name: '관계 심리 리포트',
    description:
      '일상생활 안에서 상대가 보이는 조종·가해 성향 패턴을 심리학 척도 기반으로 진지하게 진단합니다.',
    category: '가스라이팅 진단',
    isFeatured: true,
    headline: '내 관계, 안전한가요?',
    subcopy: '다크 테트라드 척도로 읽는 관계의 위험 신호',
    // 히어로 배너 이미지 — public/assets/hero-dark-psych.png 에 파일 저장 시 노출
    thumbnailUrl: '/assets/hero-dark-psych.png',
    isActive: true,
    sortOrder: 1,
  },
  {
    slug: 'love-counsel',
    name: '연애 상담 AI',
    description:
      '체크리스트 10문항으로 관계 구조를 판정하고, 지금 해야 할 행동 하나를 알려드립니다. 현재는 썸 단계만 열려 있습니다.',
    category: '연애 상담',
    isFeatured: false,
    headline: '이 사람, 나한테 관심 있나요?',
    subcopy: '답장 속도 말고 행동으로 판정합니다',
    isActive: true,
    sortOrder: 2,
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
