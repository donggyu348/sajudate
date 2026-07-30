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
      title: '심리 플랫폼',
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
