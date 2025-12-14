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

      const TEST_PHONE_NUMBER = "01033336666"; 
      const TEST_AMOUNT = 10; // 테스트 금액 (100원)

      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /mobile/i.test(userAgent);
      const deviceType = isMobile ? DeviceType.MOBILE : DeviceType.PC;

      const repostHistory = await ReportHistoryService.getReportHistoryById(req.body.reportHistoryId)

      const userTelNo = req.body.userTelNo; // 사용자 전화번호 추출
      let finalAmount = GoodsType[repostHistory.goodsType].price;

      if (userTelNo === TEST_PHONE_NUMBER) {
        console.log(`[TEST MODE] Setting payment amount to ${TEST_AMOUNT} for phone number: ${userTelNo}`);
        finalAmount = TEST_AMOUNT;
      }

      const redirectUrl = Platform[repostHistory.platform].domain + "/api/payments/callback";

      const userId = req.session?.user?.id || null;

      const payload = {
        ...req.body,
        ...(userId ? { userId } : {}),
        amount: finalAmount,
        payMethodTypeCode: "CARD",
        deviceType: deviceType,
        clientTypeCode: "00",
        currency: "00",
        returnUrl: redirectUrl,
        platform: repostHistory.platform,
        orderInfo: {
          goodsName: GoodsType[repostHistory.goodsType].code
        }
      };

      const result = await PaymentService.registerPayment(payload);

      await ReportHistoryService.updateById({
        id: req.body.reportHistoryId,
        shopOrderNo: result.shopOrderNo,
      })

      return res.status(200).json({
        code: 200,
        message: "거래등록 성공",
        data: {
          authPageUrl: result.authPageUrl
        }
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "거래등록 실패",
        error: error.message,
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
      const { shopOrderNo, authorizationId } = req.body;
      await PaymentService.handleCallback(shopOrderNo, authorizationId);

      await PaymentService.approvePayment(shopOrderNo);

      return res.redirect(303, `/saju/payment_success?shopOrderNo=${encodeURIComponent(shopOrderNo)}`);

    } catch (error) {
      return res.status(500).json({
        code: 500,
        message: "인증 완료 처리 실패",
        error: error.message,
      });
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