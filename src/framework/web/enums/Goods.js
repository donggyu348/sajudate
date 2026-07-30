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
    title: '홍연사주(연애사주)',
    originalPrice: 53800,
    discountPrice: 18900,
    price: 34900,
    platform: Platform.TIGHT
  },
   CLASSIC_BUNDLE: {
    code: "CLASSIC_BUNDLE",
    title: '정통사주 (+홍연사주(연애사주) 무료티켓 증정)',
    originalPrice: 149800,
    discountPrice: 100000,
    price: 49800,
    platform: Platform.TIGHT,
    reportCode: "CLASSIC",   // 이 번들의 본 리포트는 CLASSIC
    giveTicket: "ROMANTIC" // 이 상품을 사면 ROMANTIC 티켓을 줌
  },

  // 연애사주 + 29금 사주 번들, 연애사주 구매 시 29금 사주 티켓 증정
  ROMANTIC_BUNDLE: {
    code: "ROMANTIC_BUNDLE",
    title: '홍연사주(연애사주) + S궁합사주',
    originalPrice: 71700,
    discountPrice: 21900,
    price: 49800,
    platform: Platform.TIGHT,
    reportCode: "ROMANTIC",  // 본 리포트 = 연애사주
    giveTicket: "ADULT" // 이 상품을 사면 ADULT(29금) 티켓을 줌
  },

  // 성인용 연애·관계 운세
  ADULT: {
    code: "ADULT",
    title: "S궁합사주",
    originalPrice: 56800,
    discountPrice: 19000,
    price: 37800,
    platform: Platform.TIGHT
  },

  // 29금 사주 + 연애사주 번들
  ADULT_BUNDLE: {
    code: "ADULT_BUNDLE",
    title: "S궁합사주 + 홍연사주(연애사주)",
    originalPrice: 71700,
    discountPrice: 21900,
    price: 49800,
    platform: Platform.TIGHT,
    reportCode: "ADULT",     // 본 리포트 = 29금(S궁합) 사주
    giveTicket: "ROMANTIC"
  },

  /** 사자록 — 가격은 result 노잣돈 카드(63,000 → 37,800)와 일치 */
  REAPER: {
    code: "REAPER",
    title: "사자록(정통사주)",
    originalPrice: 63000,
    discountPrice: 25200,
    price: 37800,
    platform: Platform.TIGHT
  },

  /* ── 추가 번들: 연애사주 · 29금(S궁합) · 저승사자(리퍼) 교차 묶음 ──
     각 상품 결제창에서 reportCode(본 리포트) 기준으로 2개씩 노출된다. */

  // 연애사주 + 저승사자 사주 (연애 구매 시 리퍼 티켓 증정)
  ROMANTIC_REAPER_BUNDLE: {
    code: "ROMANTIC_REAPER_BUNDLE",
    title: "홍연사주(연애사주) + 사자록(정통사주)",
    originalPrice: 72400,
    discountPrice: 20800,
    price: 51600,
    platform: Platform.TIGHT,
    reportCode: "ROMANTIC",
    giveTicket: "REAPER"
  },

  // 29금(S궁합) + 저승사자 사주, 29금 구매 시 리퍼 티켓 증정
  ADULT_REAPER_BUNDLE: {
    code: "ADULT_REAPER_BUNDLE",
    title: "S궁합사주 + 사자록(정통사주)",
    originalPrice: 72400,
    discountPrice: 20800,
    price: 51600,
    platform: Platform.TIGHT,
    reportCode: "ADULT",
    giveTicket: "REAPER"
  },

  // 저승사자 사주 + 연애사주 (리퍼 구매 시 연애 티켓 증정)
  REAPER_ROMANTIC_BUNDLE: {
    code: "REAPER_ROMANTIC_BUNDLE",
    title: "사자록(정통사주) + 홍연사주(연애사주)",
    originalPrice: 72400,
    discountPrice: 20800,
    price: 51600,
    platform: Platform.TIGHT,
    reportCode: "REAPER",
    giveTicket: "ROMANTIC"
  },

  // 저승사자 사주 + 29금(S궁합) 사주, 리퍼 구매 시 29금 티켓 증정
  REAPER_ADULT_BUNDLE: {
    code: "REAPER_ADULT_BUNDLE",
    title: "사자록(정통사주) + S궁합사주",
    originalPrice: 72400,
    discountPrice: 20800,
    price: 51600,
    platform: Platform.TIGHT,
    reportCode: "REAPER",
    giveTicket: "ADULT"
  }
});
