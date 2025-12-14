import { Platform } from "./Platform.js";

/**
 * 이지페이 결제수단 코드 ENUM
 */
export const GoodsType = Object.freeze({
  PREMIUM_SAJU: {
    code: "PREMIUM_SAJU",
    title: '프리미엄 종합사주',
    originalPrice: 52800,
    discountPrice: 17000,
    price: 35800,
    platform: Platform.JUJANGSO
  },
  CLASSIC: {
    code: "CLASSIC",
    title: '정통사주',
    originalPrice: 69800,
    discountPrice: 37000,
    price: 32800,
    platform: Platform.TIGHT
  },
  ROMANTIC: {
    code: "ROMANTIC",
    title: '연애사주',
    originalPrice: 80000,
    discountPrice: 52400,
    price: 27600,
    platform: Platform.TIGHT
  }
});
