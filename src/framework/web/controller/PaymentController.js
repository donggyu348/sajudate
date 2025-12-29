import PaymentService from "../service/PaymentService.js";
import ReportHistoryService from "../service/ReportHistoryService.js";
import { DeviceType } from "../enums/Payment.js";
import { Platform } from "../enums/Platform.js";
import { GoodsType } from "../enums/Goods.js";
import StatusCode from "../enums/StatusCode.js"; // StatusCode import 추가
const PaymentController = {
  /**
   * [1] 결제 등록 처리
   * - shopOrderNo 생성
   * - DB insert
   * - 이지페이 거래등록 API 호출
   * - authPageUrl 응답
   */

  
 
  async getDailySales(req, res) {  /* 하루 매출액 조회*/
    try {
      const platform = req.query.platform;
      if (!platform) {
        return res.status(400).json({ code: 400, message: "platform parameter is required." });
      }

      const totalAmount = await PaymentService.getDailySalesSummary(platform);

      return res.status(StatusCode.SUCCESS).json({
        code: 200,
        message: "일일 매출 조회 성공",
        data: {
          totalAmount
        }
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "일일 매출 조회 실패",
        error: error.message
      });
    }
  },

  async getSalesHistory(req, res) {
    try {
      const platform = req.query.platform;
      if (!platform) {
        return res.status(400).json({ code: 400, message: "platform parameter is required." });
      }
      
      let startDate = req.query.startDate;
      let endDate = req.query.endDate;
      
      if (!endDate) {
          endDate = new Date(); // 오늘
      } else {
          endDate = new Date(endDate);
      }
      
      if (!startDate) {
          // 기본값: 30일 전
          startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - 30);
      } else {
          startDate = new Date(startDate);
      }
      
      // 쿼리를 위해 시간 정규화 (시작일 00:00:00, 종료일 23:59:59)
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      const history = await PaymentService.getDailySalesHistory({ platform, startDate, endDate });

      return res.status(StatusCode.SUCCESS).json({
        code: 200,
        message: "일일 매출 기록 조회 성공",
        data: history
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "일일 매출 기록 조회 실패",
        error: error.message
      });
    }
  },
 async register(req, res) {
    try {
      const TEST_PHONE_NUMBER = [
        "01055989742",   "01058389701"
      ];
      const TEST_AMOUNT = 1;

      const { payMethod, reportHistoryId, userTelNo } = req.body;

      if (!payMethod) return res.status(400).json({ code: 400, message: "payMethod is required" });
      if (!reportHistoryId) return res.status(400).json({ code: 400, message: "reportHistoryId is required" });

      const reportHistory = await ReportHistoryService.getReportHistoryById(reportHistoryId);
      if (!reportHistory) return res.status(404).json({ code: 404, message: "ReportHistory not found" });

      const userAgent = req.headers["user-agent"] || "";
      const isMobile = /mobile/i.test(userAgent);
      const deviceType = isMobile ? DeviceType.MOBILE : DeviceType.PC;

      let finalAmount = GoodsType[reportHistory.goodsType].price;
      if (TEST_PHONE_NUMBER.includes(userTelNo)) {
        console.log(`[TEST MODE] ${userTelNo} → 금액 ${TEST_AMOUNT}원`);
        finalAmount = TEST_AMOUNT;
      }

      const platformInfo = Platform[reportHistory.platform];
      const redirectUrl = platformInfo.domain + "/api/payments/callback";

      const userId = req.session?.user?.id || null;

      const basePayload = {
        ...req.body,
        ...(userId ? { userId } : {}),
        amount: finalAmount,
        payMethodTypeCode: "11",
        deviceType,
        clientTypeCode: "00",
        currency: "00",
        returnUrl: redirectUrl,
        platform: reportHistory.platform,
        orderInfo: { goodsName: GoodsType[reportHistory.goodsType].code }
      };

      let result;

      /* -----------------------------------------------------
       * 🔵 EasyPay
       * ----------------------------------------------------- */

      if (payMethod === "EASYPAY") {
        result = await PaymentService.registerEasyPay(basePayload);

        await ReportHistoryService.updateById({
          id: reportHistoryId,
          shopOrderNo: result.shopOrderNo
        });

        return res.status(200).json({
          code: 200,
          message: "이지페이 거래등록 성공",
          data: { authPageUrl: result.authPageUrl }
        });
      }

      /* -----------------------------------------------------
       * 🟡 KakaoPay (세션 기반)
       * ----------------------------------------------------- */

      if (payMethod === "KAKAOPAY") {
        result = await PaymentService.registerKakaoPay(basePayload, req);

        await ReportHistoryService.updateById({
          id: reportHistoryId,
          shopOrderNo: result.shopOrderNo
        });

        return res.status(200).json({
          code: 200,
          message: "카카오페이 거래등록 성공",
          data: { authPageUrl: result.authPageUrl }
        });
      }

      return res.status(400).json({ code: 400, message: "Invalid payMethod" });

    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "거래등록 실패",
        error: error.message
      });
    }

  },
  /**
   * [2] 인증 완료 콜백 처리
   * - authorizationId 수신
   * - shopOrderNo로 DB update (AUTH_DONE)
   */
 async callback(req, res) {
  try {
    // 🔥 EasyPay 실제 파라미터 매핑
    const shopOrderNo =
      req.body.shopOrderNo ||
      req.body.partnerOrderId;

    const authorizationId =
      req.body.authorizationId ||
      req.body.tid ||
      req.body.payTid ||
      req.body.transactionId;

    const resCd = req.body.resCd;
    const resMsg = req.body.resMsg;
    console.log(`[Payment][Callback] shopOrderNo: ${shopOrderNo}, authorizationId: ${authorizationId}, resCd: ${resCd}, resMsg: ${resMsg}`);

    // 🔥 인증 처리
    await PaymentService.handleCallback(shopOrderNo, authorizationId);

    // 🔥 승인 처리(되는 사이트와 동일)
    const approveResponse = await PaymentService.approvePayment(shopOrderNo);
    console.log(`[Payment][Callback] Approval Response:`, approveResponse);

    if (approveResponse.resCd !== "0000") {
      await PaymentService.updatePaymentStatus(
        shopOrderNo,
        PaymentStatus.FAILED,
        approveResponse.resMsg
      );
      return res.redirect('/saju?error=approve_failed&resMsg=' + encodeURIComponent(approveResponse.resMsg));
    }

    return res.redirect(
      303,
      `/saju/payment_success?shopOrderNo=${encodeURIComponent(shopOrderNo)}`
    );
  } catch (error) {
    console.error("callback 오류:", error);
    return res.status(500).send("콜백 처리 중 오류가 발생했습니다.");
  }
},


  /**
   * [3] 승인 처리
   * - shopOrderNo 기준으로 승인 API 호출
   * - DB update (APPROVED or FAILED)
   */
  async approve(req, res) {
    try {
      const { shopOrderNo } = req.body;
      const result = await PaymentService.approvePayment(shopOrderNo);
      return res.status(200).json({
        code: 200,
        message: "승인 처리 완료",
        data: result,
      });
    } catch (error) {
      return res.status(500).json({
        code: 500,
        message: "승인 처리 실패",
        error: error.message,
      });
    }
  },

  async getApproveList(req, res) {
    try {
      const { page, platform } = req.query;
      const limit = req.query.limit || 10;
      const offset = (page && page > 1) ? (page - 1) * limit : 0;

      const payments = await PaymentService.getApproveList({
        limit: limit,
        offset:offset,
        platform
      });

      return res.status(200).json({
        code: 200,
        message: "결제 목록 조회 성공",
        data: payments
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "결제 목록 조회 실패",
        error: error.message
      });
    }
  },

  async getMyHistory(req, res) {
    try {
      const userIdx = req.session?.user?.id || null;
      if (!userIdx) {
        return res.status(401).json({ code: 401, message: "로그인이 필요합니다." });
      }

      const platform = req.query.platform;
      if (!platform) {
        return res.status(400).json({ code: 400, message: "platform 파라미터가 필요합니다." });
      }

      const limit = Math.min(parseInt(req.query.limit || 10, 10), 50);
      const offset = parseInt(req.query.offset || 0, 10);

      const { count, rows } = await PaymentService.getMyHistory({ userIdx, platform, limit, offset });

      const nextOffset = offset + rows.length;
      const hasMore = nextOffset < count;

      return res.status(200).json({
        code: 200,
        message: "구매내역 조회 성공",
        data: {
          total: count,
          items: rows,
          nextOffset,
          hasMore
        }
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "구매내역 조회 실패",
        error: error.message
      });
    }
  }

};

export default PaymentController;