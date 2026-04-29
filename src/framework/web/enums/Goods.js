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
    originalPrice: 56000,
    discountPrice: 21100,
    price: 34900,
    platform: Platform.TIGHT
  },
   CLASSIC_BUNDLE: {
    code: "CLASSIC_BUNDLE",
    title: '정통사주 (+연애사주 무료티켓 증정)',
    originalPrice: 149800,
    discountPrice: 100000,
    price: 49800,
    platform: Platform.TIGHT,
    giveTicket: "ROMANTIC" // 이 상품을 사면 ROMANTIC 티켓을 줌
  },
  
  // 연애사주 + 29금 사주 번들 (연애사주 구매 시 29금 사주 티켓 증정)
  ROMANTIC_BUNDLE: {
    code: "ROMANTIC_BUNDLE",
    title: '연애사주 + 29금 사주',
    originalPrice: 67700,
    discountPrice: 17900,
    price: 49800,
    platform: Platform.TIGHT,
    giveTicket: "ADULT" // 이 상품을 사면 ADULT(29금) 티켓을 줌
  },

  /** 29금 사주 (성인용 연애·관계 운세) */
  ADULT: {
    code: "ADULT",
    title: "29금 사주",
    originalPrice: 49000,
    discountPrice: 14100,
    price: 34900,
    platform: Platform.TIGHT
  },

  /** 29금 사주 + 연애사주 번들 */
  ADULT_BUNDLE: {
    code: "ADULT_BUNDLE",
    title: "29금 사주 + 연애사주",
    originalPrice: 67700,
    discountPrice: 17900,
    price: 49800,
    platform: Platform.TIGHT,
    giveTicket: "ROMANTIC"
  }
});
