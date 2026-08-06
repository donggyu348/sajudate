// src/framework/web/service/ChannelCouponService.js
//
// 카카오톡 채널 추가 시 지급되는 5,000원 할인 쿠폰. 번들 상품에만 적용된다(단품 제외).
// 별도 테이블을 만들지 않고 기존 coupons 테이블(번들 무료티켓과 동일)을 재사용한다.
//  - type: 'CHANNEL'      → 번들 티켓('BUNDLE')과 구분
//  - code: 'CHANNEL5000-{전화번호}'  → 사용자에게 노출되는 코드는 CHANNEL5000 고정이지만
//                                     DB code 컬럼이 unique 라 전화번호를 붙여 1인 1회를 보장한다.
//  - receivedPhone: 쿠폰을 소진한 전화번호(중복 발급 차단 기준)

import Coupons from "../orm/models/coupons.js";

export const CHANNEL_COUPON_CODE = "CHANNEL5000";
export const CHANNEL_COUPON_DISCOUNT = 5000;

/** 선택한 상품에 맞는 할인 금액. 번들만 할인 대상이고 단품은 0원. */
export function channelCouponDiscountFor(goodsType) {
  return String(goodsType || "").includes("_BUNDLE") ? CHANNEL_COUPON_DISCOUNT : 0;
}

const COUPON_TYPE = "CHANNEL";
const rowCodeFor = (phone) => `${CHANNEL_COUPON_CODE}-${phone}`;
// 발급 시점엔 전화번호를 모르므로 주문(reportHistory) 단위로 발급 사실을 남긴다.
// 세션(MemoryStore)은 서버 재시작 시 사라지므로 DB 기록이 실제 근거가 된다.
const pendingCodeFor = (reportHistoryId) => `${CHANNEL_COUPON_CODE}-H${reportHistoryId}`;

class ChannelCouponService {
  /** 채널 추가 성공 시점: 세션 + 주문 단위 DB 기록을 남긴다. */
  async issue({ session, reportHistoryId }) {
    const alreadyIssued = Boolean(session?.channelCouponIssued);
    if (session) session.channelCouponIssued = true;

    if (reportHistoryId) {
      await Coupons.findOrCreate({
        where: { code: pendingCodeFor(reportHistoryId) },
        defaults: {
          code: pendingCodeFor(reportHistoryId),
          isUsed: false,
          type: COUPON_TYPE,
          goodsType: "PENDING"
        }
      });
    }

    return {
      couponCode: CHANNEL_COUPON_CODE,
      discountAmount: CHANNEL_COUPON_DISCOUNT,
      alreadyIssued
    };
  }

  isIssued(session) {
    return Boolean(session?.channelCouponIssued);
  }

  /** 세션이 날아갔더라도 주문 단위 발급 기록이 있으면 쿠폰을 인정한다. */
  async isIssuedFor({ session, reportHistoryId }) {
    if (this.isIssued(session)) return true;
    if (!reportHistoryId) return false;

    const pending = await Coupons.findOne({ where: { code: pendingCodeFor(reportHistoryId) } });
    return Boolean(pending);
  }

  /**
   * 결제 등록 시점: 세션에 발급 기록이 있고 번들 상품이면 전화번호 기준 1회만 할인을 적용한다.
   * @returns {Promise<number>} 적용할 할인 금액(0이면 미적용)
   */
  async consume({ session, userTelNo, goodsType, reportHistoryId }) {
    if (!userTelNo) return 0;
    if (!(await this.isIssuedFor({ session, reportHistoryId }))) return 0;

    const discount = channelCouponDiscountFor(goodsType);
    if (!discount) return 0; // 단품은 쿠폰을 소진시키지 않고 그대로 남겨둔다.

    const code = rowCodeFor(userTelNo);
    const existing = await Coupons.findOne({ where: { code } });

    if (existing) {
      // 같은 주문에서 이미 소진한 건이면 결제 실패 후 재시도로 보고 할인을 유지한다.
      const sameOrder = existing.goodsType === `ORDER-${reportHistoryId}`;
      return session?.channelCouponPhone === userTelNo || sameOrder ? discount : 0;
    }

    await Coupons.create({
      code,
      isUsed: true,
      type: COUPON_TYPE,
      goodsType: `ORDER-${reportHistoryId}`, // 같은 주문의 재시도 판별용
      receivedPhone: userTelNo
    });
    if (session) session.channelCouponPhone = userTelNo;

    return discount;
  }
}

export default new ChannelCouponService();
