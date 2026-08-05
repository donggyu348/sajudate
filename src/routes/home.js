import { Router } from 'express';
import { Op } from 'sequelize';
import { Product } from '../models/index.js';

const router = Router();

/** 훅 섹션 동적 카피 (상품 아님 — 플랫폼 카피) */
const HOOK_SECTION = {
  title: '지금, 내 관계를 진지하게 들여다보기',
  subtitle: '심리학 척도 기반의 진단으로 관계의 신호를 읽어보세요',
};

// GET / → 메인 페이지
router.get('/', async (req, res, next) => {
  try {
    const activeProducts = await Product.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    });

    // 카테고리 탭 동적 생성 (전체 + 등장하는 카테고리들)
    const categories = ['전체', ...new Set(activeProducts.map((p) => p.category))];

    // 선택된 카테고리 필터
    const selected = req.query.category && categories.includes(req.query.category)
      ? req.query.category
      : '전체';
    const products =
      selected === '전체'
        ? activeProducts
        : activeProducts.filter((p) => p.category === selected);

    // 배너 캐러셀 = 추천 상품
    const featured = activeProducts.filter((p) => p.isFeatured);

    res.render('platform/home', {
      title: '해답',
      activeTab: 'home',
      categories,
      selected,
      products,
      featured,
      hook: HOOK_SECTION,
    });
  } catch (err) {
    next(err);
  }
});

// GET /library → 보관함 (내가 받은 리포트 모음) — 로그인/유저 연결 전까지 안내 화면
router.get('/library', (req, res) => {
  res.render('platform/placeholder', {
    title: '보관함',
    activeTab: 'library',
    icon:
      '<path d="M9 4v13l-3 -2l-3 2v-13a2 2 0 0 1 2 -2h4a2 2 0 0 0 -1 3z" /><path d="M9 4h7a2 2 0 0 1 2 2v13l-3 -2l-3 2" />',
    heading: '보관함',
    message: '여기에서 받은 진단 리포트를 모아 볼 수 있어요. (준비 중)',
  });
});

// GET /my → 마이페이지
router.get('/my', (req, res) => {
  res.render('platform/placeholder', {
    title: '마이',
    activeTab: 'my',
    icon:
      '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />',
    heading: '마이페이지',
    message: '내 정보와 이용 내역을 관리하는 공간이에요. (준비 중)',
  });
});

// GET /terms, /privacy → 법적 고지 페이지 (전자상거래법상 필수 고지)
router.get('/terms', (req, res) => {
  res.render('platform/terms', { title: '서비스 이용약관', layout: 'layouts/plain' });
});

router.get('/privacy', (req, res) => {
  res.render('platform/privacy', { title: '개인정보 처리방침', layout: 'layouts/plain' });
});

// GET /products/:slug → 상품 상세 진입 (전용 모듈이 없는 경우의 기본 처리)
router.get('/products/:slug', async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: { slug: req.params.slug, isActive: true },
    });
    if (!product) return res.status(404).render('platform/404', { title: '상품을 찾을 수 없음' });

    // 전용 모듈 라우트가 이 경로를 먼저 가로채므로, 여기 도달하면 일반 상세 페이지
    res.render('platform/product-generic', { title: product.name, product, activeTab: 'home' });
  } catch (err) {
    next(err);
  }
});

export default router;
