// src/framework/web/service/PaymentService.js

import GptService from "./GptService.js";
import UsersRepository from "../repository/UsersRepository.js";
import PaymentTransactionRepository from "../repository/PaymentTransactionRepository.js";
import ReportHistoryService from "./ReportHistoryService.js";
import { generateShopOrderNo } from "../utils/CommonUtils.js";
import { PaymentStatus, PayMethodTypeCode, DeviceType } from "../enums/Payment.js";
import { GoodsType } from "../enums/Goods.js";
import { Platform } from "../enums/Platform.js";
import { sendReportLink } from "./SmsService.js";
import ReportHistoryRepository from "../repository/ReportHistoryRepository.js";
import { Op } from "sequelize";
import EasyPayClient from "../api/EasyPayClient.js";
import KakaoPayClient from "../api/KakaoPayClient.js";

class PaymentService {

  /* =========================================================
   * 공통
   * ========================================================= */
  async getDailySalesSummary(platform) {
    return Number(await PaymentTransactionRepository.getDailyApprovedAmount(platform));
  }

  async getDailySalesHistory({ platform, startDate, endDate }) {
    return await PaymentTransactionRepository.getDailySalesHistory({ platform, startDate, endDate });
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
    req.session.kakaoPay = {
      shopOrderNo,
      tid: kakaoRes.tid
    };

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

  async generateReportAndSendEmail(paymentId) {
    const payment = await PaymentTransactionRepository.findByIdWithReportHistory(paymentId);
    if (!payment) throw new Error("결제정보 없음");

    if (payment.paymentStatus !== PaymentStatus.APPROVED)
      throw new Error("승인 완료 상태가 아님");

    const reportHistory = payment.reportHistory;
    let reportInfo = reportHistory.reportInfo;

    const goodsType = GoodsType[reportHistory.goodsType];
    const userInfo = reportHistory.userInfo || {};
    const shopOrderNo = payment.shopOrderNo;

    if (!reportInfo) {
      const generated = await GptService.callReport(userInfo, goodsType);
      await ReportHistoryService.updateById({ id: reportHistory.id, reportInfo: generated });
      reportInfo = generated;
    }

    let targetAddress = payment.userTelNo || userInfo.phone;
    if (!targetAddress) throw new Error("발송할 연락처 없음");

    const platformInfo = Platform[payment.platform];
    await sendReportLink(targetAddress, shopOrderNo, reportHistory.goodsType, platformInfo.domain, userInfo.name || "고객");

    return { message: "결과 문자 발송됨" };
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
