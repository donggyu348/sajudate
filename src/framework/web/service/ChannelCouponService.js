// src/framework/web/service/ChannelCouponService.js
//
// 카카오톡 채널 추가 시 지급되는 4,000원 할인 쿠폰.
// 별도 테이블을 만들지 않고 기존 coupons 테이블(번들 무료티켓과 동일)을 재사용한다.
//  - type: 'CHANNEL'      → 번들 티켓('BUNDLE')과 구분
//  - code: 'CHANNEL4000-{전화번호}'  → 사용자에게 노출되는 코드는 CHANNEL4000 고정이지만
//                                     DB code 컬럼이 unique 라 전화번호를 붙여 1인 1회를 보장한다.
//  - receivedPhone: 쿠폰을 소진한 전화번호(중복 발급 차단 기준)

import Coupons from "../orm/models/coupons.js";

export const CHANNEL_COUPON_CODE = "CHANNEL4000";
export const CHANNEL_COUPON_DISCOUNT = 4000;

const COUPON_TYPE = "CHANNEL";
const rowCodeFor = (phone) => `${CHANNEL_COUPON_CODE}-${phone}`;

class ChannelCouponService {
  /** 채널 추가 성공 시점: 아직 전화번호를 모르므로 세션에만 발급 사실을 기록한다. */
  issue(session) {
    const alreadyIssued = Boolean(session?.channelCouponIssued);
    if (session) session.channelCouponIssued = true;

    return {
      couponCode: CHANNEL_COUPON_CODE,
      discountAmount: CHANNEL_COUPON_DISCOUNT,
      alreadyIssued
    };
  }

  isIssued(session) {
    return Boolean(session?.channelCouponIssued);
  }

  /**
   * 결제 등록 시점: 세션에 발급 기록이 있으면 전화번호 기준으로 1회만 할인을 적용한다.
   * @returns {Promise<number>} 적용할 할인 금액(0이면 미적용)
   */
  async consume({ session, userTelNo }) {
    if (!this.isIssued(session) || !userTelNo) return 0;

    const code = rowCodeFor(userTelNo);
    const existing = await Coupons.findOne({ where: { code } });

    if (existing) {
      // 같은 세션에서 이미 소진한 건이면 결제 실패 후 재시도로 보고 할인을 유지한다.
      return session.channelCouponPhone === userTelNo ? CHANNEL_COUPON_DISCOUNT : 0;
    }

    await Coupons.create({
      code,
      isUsed: true,
      type: COUPON_TYPE,
      goodsType: "DISCOUNT",
      receivedPhone: userTelNo
    });
    session.channelCouponPhone = userTelNo;

    return CHANNEL_COUPON_DISCOUNT;
  }
}

export default new ChannelCouponService();
