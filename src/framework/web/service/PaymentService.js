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
  import TossPaymentsClient from "../api/TossPaymentsClient.js"; 


  class PaymentService {

    /* =========================================================
    * 공통
    * ========================================================= */
    async getDailySalesSummary(platform) {
      const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
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

      // 4. 🔥 [중요] tx.id만 보내지 말고, 이미 알고 있는 goodsType을 직접 활용하도록 함수를 수정하거나
      // 아래와 같이 최신화된 tx 정보를 바탕으로 실행되게 합니다.
      console.log(` [DEBUG] 발송 시도 - txId: ${tx.id}, 타입: ${goodsType}`);
      
      // 비동기로 실행하되, 순서를 보장하기 위해 필요한 경우 await를 걸 수도 있습니다.
this.generateReportAndSendEmail(tx.id, goodsType).catch(err => console.error("[SMS Error]", err));  }

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

async generateReportAndSendEmail(paymentId, passedGoodsType) {
    const payment = await PaymentTransactionRepository.findByIdWithReportHistory(paymentId);
    if (!payment) throw new Error("결제정보 없음");

    if (payment.paymentStatus !== PaymentStatus.APPROVED)
        throw new Error("승인 완료 상태가 아님");

    const reportHistory = payment.reportHistory;
    let reportInfo = reportHistory.reportInfo;
    const userInfo = reportHistory.userInfo || {};
    const shopOrderNo = payment.shopOrderNo;
    const finalType = passedGoodsType || reportHistory?.goodsType || payment.goodsType;

    console.log(" [LOG 5] 최종 타입 확인:", finalType);
    const goodsType = GoodsType[finalType];
    if (!goodsType) throw new Error(`알 수 없는 상품 타입: ${finalType}`);

    // 1. GPT 리포트 생성
    if (!reportInfo) {
        const generated = await GptService.callReport(userInfo, goodsType);
        await ReportHistoryService.updateById({ id: reportHistory.id, reportInfo: generated });
        reportInfo = generated;
    }

    // 2. 번들인 경우 티켓 생성 로직
    let ticketAddMsg = "";
    if (finalType && finalType.includes('_BUNDLE')) {
        const ticketCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        let giftType = (finalType === 'CLASSIC_BUNDLE') ? '2' : '1';
        let giftName = (finalType === 'CLASSIC_BUNDLE') ? '로맨틱 연애사주' : '신년 운세사주';

        try {
            // 🔥 [수정] 모델 파일을 직접 import 하여 경로 및 대소문자 문제를 방지합니다.
            const CouponsModule = await import("../orm/models/coupons.js");
            const Coupons = CouponsModule.default; 

            if (Coupons) {
                await Coupons.create({
                    code: ticketCode,
                    isUsed: false,
                    type: 'BUNDLE',
                    goodsType: giftType, 
                    receivedPhone: payment.userTelNo || userInfo.tel
                });
                console.log(`✅ [TICKET] 티켓 발급 성공: ${ticketCode}`);
            } else {
                throw new Error("Coupons 모델 로드 실패");
            }
        } catch (dbErr) {
            console.error("❌ [TICKET ERROR] DB 저장 중 에러 (테이블명 확인 필수):", dbErr.message);
            // 티켓 생성이 실패해도 리포트 문자는 보낼 수 있도록 throw 하지 않고 진행합니다.
        }

        ticketAddMsg = `\n\n[번들혜택] ${giftName} 무료 티켓이 발급되었습니다.\n티켓번호: [${ticketCode}]\n입력창에 번호를 입력하면 바로 사용 가능합니다.`;
    }

  const rawAddress = payment.userTelNo || userInfo.phone || userInfo.tel || "";
    const targetAddressStr = String(rawAddress).replace(/-/g, ''); // 하이픈 제거

    const platformInfo = Platform[payment.platform] || Platform.TIGHT;
    const domain = platformInfo.domain;
    const userName = userInfo.name || "고객";

    const reportLink = `${domain}/saju/report?shopOrderNo=${shopOrderNo}`;
    const finalMsg = `[사주정감] ${userName}님, 요청하신 리포트가 생성되었습니다.\n\n▶ 리포트 확인하기: ${reportLink}${ticketAddMsg}`;

    try {
        const AligoModule = await import("../api/AligoClient.js");
        const AligoClient = AligoModule.default || AligoModule;
        
        // 🔥 [중요] AligoClient.js 정의에 따라 객체 형태로 인자를 전달해야 합니다.
await AligoClient.sendMessage({
            receivers: [String(targetAddressStr)], // 반드시 배열로 감싸기
            message: String(finalMsg)              // 반드시 문자열로 전달
        });
        
        console.log("✅ [SMS] 알리고 발송 성공:", targetAddressStr);
    } catch (smsErr) {
        console.error("❌ [SMS ERROR] 알리고 호출 실패:", smsErr.message);
    }

    return { message: "리포트 및 번들 티켓 발송 완료" };
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
