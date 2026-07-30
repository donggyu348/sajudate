import { sequelize, Product } from '../models/index.js';

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

async function run() {
  await sequelize.sync({ alter: true });
  for (const p of PRODUCTS) {
    const [row, created] = await Product.findOrCreate({ where: { slug: p.slug }, defaults: p });
    if (!created) await row.update(p);
    console.log(`${created ? '[created]' : '[updated]'} ${p.slug}`);
  }
  console.log('시드 완료');
  await sequelize.close();
}

run().catch((err) => {
  console.error('시드 실패:', err);
  process.exit(1);
});
