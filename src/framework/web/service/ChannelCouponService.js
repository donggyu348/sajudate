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
// 결제 등록 시 남기는 주문 단위 예약 기록. 승인되면 전화번호 단위 소진으로 승격된다.
const orderCodeFor = (shopOrderNo) => `${CHANNEL_COUPON_CODE}-O${shopOrderNo}`;

class ChannelCouponService {
  /** 채널 추가 성공 시점: 세션 + 주문 단위 DB 기록을 남긴다. */
  async issue({ session, reportHistoryId }) {
    const alreadyIssued = Boolean(session?.channelCouponIssued);
    if (session) session.channelCouponIssued = true;

    if (reportHistoryId) {
      // coupons 테이블 스키마가 모델과 어긋난 환경에서도 쿠폰 발급 자체는 막지 않는다.
      // (이 경우 세션에만 기록되어 서버 재시작 시 유실될 수 있다)
      try {
        await Coupons.findOrCreate({
          where: { code: pendingCodeFor(reportHistoryId) },
          defaults: {
            code: pendingCodeFor(reportHistoryId),
            isUsed: false,
            type: COUPON_TYPE,
            goodsType: "PENDING"
          }
        });
      } catch (err) {
        console.error("[ChannelCoupon] 발급 기록 저장 실패:", err.message);
      }
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

    try {
      const pending = await Coupons.findOne({ where: { code: pendingCodeFor(reportHistoryId) } });
      return Boolean(pending);
    } catch (err) {
      // 스키마 불일치 등으로 조회가 실패해도 결제 페이지 자체는 뜨게 한다.
      console.error("[ChannelCoupon] 발급 기록 조회 실패:", err.message);
      return false;
    }
  }

  /**
   * 결제 등록 시점: 발급 기록이 있고 번들 상품이면 할인 금액을 돌려준다.
   * 쿠폰을 여기서 소진시키지는 않는다. 결제를 끝내지 않은 사용자는 다음에 다시 쓸 수 있어야 하므로,
   * 실제 소진(전화번호 1회 제한)은 결제 승인 시점의 markUsedByOrder()에서 처리한다.
   * @returns {Promise<number>} 적용할 할인 금액(0이면 미적용)
   */
  async consume({ session, userTelNo, goodsType, reportHistoryId, shopOrderNo }) {
    if (!userTelNo) return 0;
    if (!(await this.isIssuedFor({ session, reportHistoryId }))) return 0;

    const discount = channelCouponDiscountFor(goodsType);
    if (!discount) return 0; // 단품은 할인 대상이 아니다.

    // 이미 결제까지 마친 전화번호면 재사용 불가
    const used = await Coupons.findOne({ where: { code: rowCodeFor(userTelNo) } });
    if (used) return 0;

    // 승인 콜백에서 이 주문이 쿠폰을 썼는지 알 수 있도록 예약 기록을 남긴다.
    if (shopOrderNo) {
      await Coupons.findOrCreate({
        where: { code: orderCodeFor(shopOrderNo) },
        defaults: {
          code: orderCodeFor(shopOrderNo),
          isUsed: false,
          type: COUPON_TYPE,
          goodsType: "RESERVED",
          receivedPhone: userTelNo
        }
      });
    }
    if (session) session.channelCouponPhone = userTelNo;

    return discount;
  }

  /**
   * 결제 승인 시점: 그 주문이 쿠폰을 썼다면 전화번호 단위로 소진 처리한다.
   * 결제를 완료하지 않은 사용자의 쿠폰은 남아 있어 다음 방문에도 그대로 쓸 수 있다.
   */
  async markUsedByOrder(shopOrderNo) {
    if (!shopOrderNo) return false;

    try {
      const reserved = await Coupons.findOne({ where: { code: orderCodeFor(shopOrderNo) } });
      if (!reserved || reserved.isUsed) return false;

      const phone = reserved.receivedPhone;
      await reserved.update({ isUsed: true, goodsType: "USED" });

      if (phone) {
        await Coupons.findOrCreate({
          where: { code: rowCodeFor(phone) },
          defaults: {
            code: rowCodeFor(phone),
            isUsed: true,
            type: COUPON_TYPE,
            goodsType: `ORDER-${shopOrderNo}`,
            receivedPhone: phone
          }
        });
      }
      console.log(`[ChannelCoupon] 쿠폰 소진 처리: ${shopOrderNo} (${phone})`);
      return true;
    } catch (err) {
      console.error("[ChannelCoupon] 소진 처리 실패:", err.message);
      return false;
    }
  }
}

export default new ChannelCouponService();
