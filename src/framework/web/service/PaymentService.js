  // src/framework/web/service/PaymentService.js

  import UsersRepository from "../repository/UsersRepository.js";
  import PaymentTransactionRepository from "../repository/PaymentTransactionRepository.js";
  import ReportHistoryService from "./ReportHistoryService.js";
  import { generateShopOrderNo } from "../utils/CommonUtils.js";
  import { PaymentStatus, PayMethodTypeCode, DeviceType } from "../enums/Payment.js";
  import { GoodsType } from "../enums/Goods.js";
  import { Platform } from "../enums/Platform.js";
  import ReportHistoryRepository from "../repository/ReportHistoryRepository.js";
  import { Op } from "sequelize";
  import EasyPayClient from "../api/EasyPayClient.js";
  import KakaoPayClient from "../api/KakaoPayClient.js";
  import TossPaymentsClient from "../api/TossPaymentsClient.js"; 
  import { isReportPayloadReady } from "../utils/reportPayloadReady.js";

  /** 동일 주문에 알리고(LMS)·번들 티켓 발송이 중복 실행되지 않도록 */
  const smsDeliveredForShopOrders = new Set();

  /** KST 기준 YYYY-MM-DD. OS/런타임마다 en-CA가 M/D/YYYY로 나와 MySQL DATE 오류가 나는 경우를 막음. */
  function formatYmdInKst(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !d) throw new Error("formatYmdInKst: failed to derive KST date parts");
    return `${y}-${m}-${d}`;
  }

  class PaymentService {

    /* =========================================================
    * 공통
    * ========================================================= */
    async getDailySalesSummary(platform) {
      const todayKst = formatYmdInKst();
      return Number(await PaymentTransactionRepository.getDailyApprovedAmount(platform, todayKst));
    }

    async getDailySalesHistory({ platform, startDate, endDate }) {
      return await PaymentTransactionRepository.getDailySalesHistory({ platform, startDate, endDate });
    }

    async getHourlySalesHistory({ platform, date }) {
      return await PaymentTransactionRepository.getHourlySalesHistory({ platform, date });
    }

    async getMonthlySalesHistory({ platform, startDate, endDate }) {
      return await PaymentTransactionRepository.getMonthlySalesHistory({ platform, startDate, endDate });
    }

    async getSalesCountByGoods({ platform, startDateStr, endDateStr }) {
      return await PaymentTransactionRepository.getSalesCountByGoods({ platform, startDateStr, endDateStr });
    }

    async getMonthlySales(platform, year = null, month = null) {
      return Number(await PaymentTransactionRepository.getMonthlySales(platform, year, month));
    }

    /* =========================================================
    * 무통장 결제 (사용은 안하고 유지만)
    * ========================================================= */
    async registerBankTransfer(paymentDto) {
      const { reportHistoryId, userTelNo, userPw, userEmail } = paymentDto;

      if (!reportHistoryId) throw new Error("reportHistoryId is required");

      const reportHistory = await ReportHistoryService.getReportHistoryById(reportHistoryId);
      if (!reportHistory) throw new Error("ReportHistory not found");

      if (reportHistory.shopOrderNo) {
        return { shopOrderNo: reportHistory.shopOrderNo };
      }

      const shopOrderNo = generateShopOrderNo();

      await PaymentTransactionRepository.createPayment({
        userIdx: reportHistory.userIdx,
        platform: reportHistory.platform,
        shopOrderNo,
        userTelNo: userTelNo || "01000000000",
        userPw: userPw || "0000",
        amount: GoodsType[reportHistory.goodsType].price,
        currencyCode: "00",
        payMethodTypeCode: PayMethodTypeCode.BANK_TRANSFER,
        deviceType: paymentDto.deviceType || DeviceType.UNKNOWN,
        clientType: "00",
        paymentStatus: PaymentStatus.PENDING,
        shopValueJson: { user_email: userEmail }
      });

      await ReportHistoryService.updateById({ id: reportHistoryId, shopOrderNo });

      return { shopOrderNo };
    }

  async approveTossPayment(payload) {
  const { paymentKey, orderId, amount, userTelNo, userPw,goodsType } = payload;
console.log(`[LOG 4][Service_Approve] 시작 - orderId: ${orderId}, goodsType: ${goodsType}`);
  // 1. 토스 서버에 최종 승인 요청 (TossPaymentsClient 활용)
  // TossPaymentsClient.confirmPayment가 내부적으로 axios post를 호출해야 합니다.
  const result = await TossPaymentsClient.confirmPayment({
    paymentKey,
    orderId,
    amount
  });

  // 2. 결제 트랜잭션 상태 업데이트 (AUTH_DONE 단계 생략하고 바로 APPROVED 가능)
  // 이 단계에서 사용자가 입력한 tel, pw를 DB에 저장해야 나중에 결과보기가 가능합니다.
  await PaymentTransactionRepository.updateByShopOrderNo(orderId, {
    userTelNo,
    userPw,
    goodsType,
    authorizationId: paymentKey, // 토스의 paymentKey를 저장
    paymentStatus: PaymentStatus.APPROVED,
    approvalDate: new Date()
  });

const tx = await PaymentTransactionRepository.findByShopOrderNoWithReportHistory(orderId);
  
  if (tx) {
      // 리포트 히스토리에도 확실히 박아줌
      if (tx.reportHistory) {
          await ReportHistoryService.updateById({
              id: tx.reportHistory.id,
              goodsType: goodsType // 전달받은 원본 값을 직접 넣어주는 게 가장 안전함
          });
      }

      /* 리포트·알림·번들티켓: ReportGenerationCoordinator (리포트 DB 저장 직후)에서만 처리 */
  }

  return result;
}
    /* =========================================================
    * 🔵 EASY PAY
    * ========================================================= */

    async registerEasyPay(paymentDto) {
      const shopOrderNo = generateShopOrderNo();

      await PaymentTransactionRepository.createPayment({
        ...paymentDto,
        shopOrderNo,
        paymentStatus: PaymentStatus.READY
      });

      const response = await EasyPayClient.requestTransaction({
        ...paymentDto,
        shopOrderNo
      });

      return {
        shopOrderNo,
        authPageUrl: response.authPageUrl
      };
    }

    async handleCallback(shopOrderNo, authorizationId) {
      return await PaymentTransactionRepository.updateByShopOrderNo(shopOrderNo, {
        authorizationId,
        paymentStatus: PaymentStatus.AUTH_DONE
      });
    }

    async approve(shopOrderNo) {
      const tx = await PaymentTransactionRepository.findByShopOrderNo(shopOrderNo);
      if (!tx || tx.paymentStatus !== PaymentStatus.AUTH_DONE) {
        throw new Error("승인 불가 상태");
      }

      const approvalResponse = await EasyPayClient.requestApproval({
        shopOrderNo: tx.shopOrderNo,
        authorizationId: tx.authorizationId,
        amount: tx.amount,
        shopTransactionId: tx.shopOrderNo,
        approvalReqDate: new Date().toISOString().slice(0, 10).replace(/-/g, "")
      });

      await PaymentTransactionRepository.updateByShopOrderNo(shopOrderNo, {
        approvalNo: approvalResponse.approvalNo,
        pgCno: approvalResponse.pgCno,
        msgAuthValue: approvalResponse.msgAuthValue,
        approvalDate: new Date(),
        paymentStatus: approvalResponse.resCd === "0000"
          ? PaymentStatus.APPROVED
          : PaymentStatus.FAILED
      });

      return approvalResponse;
    }

    /* =========================================================
    * 🟡 KAKAO PAY
    * ========================================================= */

    async registerKakaoPay(paymentDto, req) {

      const shopOrderNo = generateShopOrderNo();
      const domain = Platform[paymentDto.platform].domain;

      await PaymentTransactionRepository.createPayment({
        ...paymentDto,
        shopOrderNo,
        paymentStatus: PaymentStatus.READY
      });

      // cid가 saju-maeul인지 unse-jeojangso인지에 따라 다르게 설정
      let cid = "CT59746939"; // saju-maeul 기본값
  
      const final_domain = domain;
      // const final_domain = "http://localhost:3000";
      const readyPayload = {
        cid: cid,
        partner_order_id: shopOrderNo,
        partner_user_id: `USER_${shopOrderNo}`,
        item_name: paymentDto.orderInfo.goodsName,
        quantity: 1,
        total_amount: paymentDto.amount,
        tax_free_amount: 0,
        approval_url: `${final_domain}/saju/payment_success?shopOrderNo=${encodeURIComponent(shopOrderNo)}`,
        cancel_url: `${final_domain}/saju/payment`,
        fail_url: `${final_domain}/saju/payment`
      };

      const kakaoRes = await KakaoPayClient.requestReady(readyPayload, domain);

      // 🔥 DB 저장 안 하고 세션에 저장
      await PaymentTransactionRepository.updateByShopOrderNo(shopOrderNo, {
    tid: kakaoRes.tid
  });

      let redirectUrl =
        paymentDto.deviceType === "mobile"
          ? kakaoRes.next_redirect_mobile_url
          : kakaoRes.next_redirect_pc_url;
      console.log(redirectUrl);

      return {
        shopOrderNo,
        authPageUrl: redirectUrl
      };
    }

    /* =========================================================
    * 기타 기능
    * ========================================================= */

    async updatePaymentStatus(shopOrderNo, status) {
      return await PaymentTransactionRepository.updateByShopOrderNo(shopOrderNo, {
        paymentStatus: status,
        approvalDate: new Date()
      });
    }

    async getPaymentTransaction(shopOrderNo) {
      return await PaymentTransactionRepository.findByShopOrderNoWithReportHistory(shopOrderNo);
    }

    async getApproveList({ limit = 10, offset = 0, platform = null }) {
      const statuses = [PaymentStatus.APPROVED, PaymentStatus.PENDING];
      const platformCode = platform ? Platform[platform]?.code : null;

      return await PaymentTransactionRepository.findAllByPaging({
        limit,
        offset,
        where: {
          paymentStatus: { [Op.in]: statuses },
          ...(platformCode && { platform: platformCode })
        }
      });
    }

    async getMyHistory({ userIdx, platform, limit = 10, offset = 0 }) {
      const platformCode = platform ? Platform[platform]?.code : null;

      return await PaymentTransactionRepository.findAllByPaging({
        limit,
        offset,
        where: {
          userIdx,
          paymentStatus: PaymentStatus.APPROVED,
          ...(platformCode && { platform: platformCode })
        }
      });
    }

    async confirmDeposit(paymentId) {
      const payment = await PaymentTransactionRepository.findById(paymentId);
      if (!payment) throw new Error("결제 정보 없음");

      if (payment.paymentStatus !== PaymentStatus.PENDING)
        throw new Error("입금 대기 상태가 아님");

      await PaymentTransactionRepository.updateById(paymentId, {
        paymentStatus: PaymentStatus.APPROVED,
        approvalDate: new Date()
      });

      return { message: "입금 확인 완료", shopOrderNo: payment.shopOrderNo };
    }

/**
 * 결제건의 리포트가 DB에 반영된 뒤 1회만 호출: 번들 무료티켓 생성 + 알리고 LMS 안내.
 * (토스 승인 직후 호출되면 성공 페이지·폴링 UX가 깨져 이 메서드를 Coordinator 끝에서만 호출합니다.)
 */
    async deliverPaidOrderSmsAndBundle(shopOrderNo, passedGoodsTypeStr) {
      if (!shopOrderNo || smsDeliveredForShopOrders.has(shopOrderNo)) return;

      const payment =
        await PaymentTransactionRepository.findByShopOrderNoWithReportHistory(shopOrderNo);
      if (!payment || payment.paymentStatus !== PaymentStatus.APPROVED) return;

      const reportHistory = payment.reportHistory;
      if (!reportHistory || !isReportPayloadReady(reportHistory.reportInfo)) {
        console.warn(`[deliverPaid] 리포트 본문 없음 · LMS 생략: ${shopOrderNo}`);
        return;
      }

      const userInfo = reportHistory.userInfo || {};
      const finalType =
        String(passedGoodsTypeStr || reportHistory?.goodsType || payment.goodsType || "").trim();

      /** 쿠폰용 goodsType: 기존 DB 관례 1=정통(CLASSIC 계열) 2=연애(ROMANTIC) */
      let ticketAddMsg = "";
      const bundleCfg = GoodsType[finalType];
      if (
        bundleCfg?.giveTicket &&
        typeof finalType === "string" &&
        finalType.includes("_BUNDLE")
      ) {
        const giftGiveCode = bundleCfg.giveTicket;
        const giftProduct = GoodsType[giftGiveCode];
        const giftTypeForCoupon = giftGiveCode === "ROMANTIC" ? "2" : "1";
        const giftTitle = giftProduct?.title || giftGiveCode;
        const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();

        try {
          const CouponsModule = await import("../orm/models/coupons.js");
          const Coupons = CouponsModule.default;
          if (Coupons) {
            await Coupons.create({
              code: ticketCode,
              isUsed: false,
              type: "BUNDLE",
              goodsType: giftTypeForCoupon,
              receivedPhone: payment.userTelNo || userInfo.tel,
            });
            console.log(`✅ [TICKET] 티켓 발급 성공 (${finalType} → ${giftGiveCode}): ${ticketCode}`);
          }
        } catch (dbErr) {
          console.error("❌ [TICKET ERROR]", dbErr.message);
        }

        ticketAddMsg = `\n\n[번들혜택] ${giftTitle} 무료 티켓이 발급되었습니다.\n티켓번호: [${ticketCode}]\n입력창에 번호를 입력하면 바로 사용 가능합니다.`;
      }

      const rawAddress = payment.userTelNo || userInfo.phone || userInfo.tel || "";
      const targetAddressStr = String(rawAddress).replace(/-/g, "");
      if (!targetAddressStr || targetAddressStr.length < 10) {
        console.warn(`[deliverPaid] 수신번호 없음 · LMS 생략: ${shopOrderNo}`);
        smsDeliveredForShopOrders.add(shopOrderNo);
        return;
      }

      const platformInfo = Platform[payment.platform] || Platform.TIGHT;
      const domain = platformInfo.domain;
      const userName = userInfo.name || "고객";
      const reportLink = `${domain}/saju/report?shopOrderNo=${shopOrderNo}`;
      const finalMsg = `[기운소] ${userName}님, 요청하신 리포트가 생성되었습니다.\n\n▶ 리포트 확인하기: ${reportLink}${ticketAddMsg}`;

      try {
        const AligoModule = await import("../api/AligoClient.js");
        const AligoClient = AligoModule.default || AligoModule;
        await AligoClient.sendMessage({
          receivers: [String(targetAddressStr)],
          message: String(finalMsg),
        });
        smsDeliveredForShopOrders.add(shopOrderNo);
      } catch (smsErr) {
        console.error("❌ [SMS ERROR] 알리고 호출 실패:", smsErr.message);
      }
    }
    async findApprovedTransactionForReview({ userTelNo, userPw, platform }) {
      const tx = await PaymentTransactionRepository.findApprovedOneByTelAndPw({
        userTelNo,
        userPw,
        platform
      });

      if (!tx) return null;

      const reportHistory = await ReportHistoryRepository.findByShopOrderNo(tx.shopOrderNo);
      return reportHistory && reportHistory.reportInfo ? tx : null;
    }
  }

  export default new PaymentService();
