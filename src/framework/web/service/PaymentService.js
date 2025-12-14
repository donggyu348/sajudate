import PaymentTransactionRepository from "../repository/PaymentTransactionRepository.js";
import EasyPayClient from "../api/EasyPayClient.js";
import { generateShopOrderNo } from "../utils/CommonUtils.js";
import { PaymentStatus } from "../enums/Payment.js";


class PaymentService {
  /**
   * [1] 거래등록 처리
   * - DB 저장
   * - 이지페이 거래등록 API 호출
   * - authPageUrl 반환
   */
/**
   * 오늘 승인된 결제의 총 매출을 조회
   */
  async getDailySalesSummary(platform) {
    const total = await PaymentTransactionRepository.getDailyApprovedAmount(platform);
    return Number(total);
  }

  async getDailySalesHistory({ platform, startDate, endDate }) {
    return await PaymentTransactionRepository.getDailySalesHistory({ platform, startDate, endDate });
  }


  async registerPayment(paymentDto) {
    const shopOrderNo = generateShopOrderNo();
    

    // DB 저장
    await PaymentTransactionRepository.createPayment({
      ...paymentDto,
      paymentStatus: PaymentStatus.READY,
      shopOrderNo,
    });

    // 이지페이 거래등록 API 호출
    const response = await EasyPayClient.requestTransaction({
      ...paymentDto,
      shopOrderNo,
    });

    return {
      shopOrderNo,
      authPageUrl: response.authPageUrl
    };
  }

  /**
   * [2] 인증 완료 콜백 처리
   * - DB update (AUTH_DONE)
   */
  async handleCallback(shopOrderNo, authorizationId) {
    await PaymentTransactionRepository.updateByShopOrderNo(shopOrderNo, {
      authorizationId,
      paymentStatus: PaymentStatus.AUTH_DONE
    });
  }

  /**
   * [3] 승인 처리
   * - shopOrderNo 기준 조회
   * - 이지페이 승인 API 호출
   * - 승인 결과에 따라 DB 업데이트
   */
  async approvePayment(shopOrderNo) {
    const tx = await PaymentTransactionRepository.findByShopOrderNo(shopOrderNo);
    if (!tx || tx.paymentStatus !== PaymentStatus.AUTH_DONE) {
      console.error("승인 처리 실패: 승인 가능한 상태가 아닙니다.", shopOrderNo);
      throw new Error("승인 가능한 상태가 아닙니다.");
    }

    // 이지페이 승인 API 호출
    const approvalResponse = await EasyPayClient.requestApproval({
      shopTransactionId: tx.shopOrderNo,
      authorizationId: tx.authorizationId,
      shopOrderNo: tx.shopOrderNo,
      approvalReqDate: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
    });

    await PaymentTransactionRepository.updateByShopOrderNo(shopOrderNo, {
      pgCno: approvalResponse.pgCno,
      approvalNo: approvalResponse.approvalNo,
      approvalDate: new Date(),
      msgAuthValue: approvalResponse.msgAuthValue,
      paymentStatus: approvalResponse.resCd === "0000" ? PaymentStatus.APPROVED : PaymentStatus.FAILED
    });

    return approvalResponse;
  }


  async getPaymentTransaction(shopOrderNo) {
    const transaction = await PaymentTransactionRepository.findByShopOrderNo(shopOrderNo);
    if (!transaction) {
      console.error("해당 주문번호의 거래가 존재하지 않습니다.", shopOrderNo);
      throw new Error("해당 주문번호의 거래가 존재하지 않습니다.");
    }
    return transaction;
  }

  async getApproveList({ limit = 10, offset = 0 , platform = null }) {
    return await PaymentTransactionRepository.findAllByPaging({
      limit,
      offset,
      paymentStatus: PaymentStatus.APPROVED,
      platform
    });
  }

  async getMyHistory({ userIdx, platform, limit = 10, offset = 0 }) {
    return await PaymentTransactionRepository.findAllByPaging({
      limit,
      offset,
      platform,
      userIdx,
      paymentStatus: PaymentStatus.APPROVED
    });
  }

}

export default new PaymentService();
