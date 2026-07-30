import darkPsychLoveRouter, { SLUG as DPL_SLUG } from './dark-psych-love/router.js';

/**
 * 상품 모듈 레지스트리.
 * 새 상품을 추가할 때: (1) 모듈 라우터 작성 → (2) 여기 등록 → (3) Product 테이블에 시드.
 * 각 상품은 /products/:slug 하위에서 자기 라우트를 독립적으로 소유한다.
 */
export const PRODUCT_MODULES = [
  { slug: DPL_SLUG, router: darkPsychLoveRouter },
];

export function mountProductModules(app) {
  for (const mod of PRODUCT_MODULES) {
    app.use(`/products/${mod.slug}`, mod.router);
  }
}
