import PaymentService from "../service/PaymentService.js";
import ReportHistoryService from "../service/ReportHistoryService.js";
import { DeviceType } from "../enums/Payment.js";
import { Platform } from "../enums/Platform.js";
import { GoodsType } from "../enums/Goods.js";
import StatusCode from "../enums/StatusCode.js"; // StatusCode import 추가
// PaymentController.js 상단에 추가
import PaymentTransactionRepository from "../repository/PaymentTransactionRepository.js";
import { PaymentStatus } from "../enums/Payment.js";
import GptService from "../service/GptService.js"; // 치트키 로직에서 사용하므로 필요
import ChannelCouponService from "../service/ChannelCouponService.js";
const PaymentController = {

  /**
   * [0] 카카오톡 채널 추가 쿠폰 발급
   * - 결제 페이지 팝업에서 채널 추가에 성공하면 호출된다.
   * - 이 시점엔 전화번호를 모르므로 세션에만 기록하고, 실제 중복 차단은 register에서 전화번호로 한다.
   */
  async issueChannelCoupon(req, res) {
    try {
      const result = ChannelCouponService.issue(req.session);
      return res.status(StatusCode.SUCCESS).json({
        code: 200,
        message: "채널 추가 쿠폰 발급 성공",
        data: result
      });
    } catch (error) {
      console.error("[ChannelCoupon] 발급 실패:", error);
      return res.status(500).json({
        code: 500,
        message: "채널 추가 쿠폰 발급 실패",
        error: error.message
      });
    }
  },
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

  async getSalesHistoryHourly(req, res) {
    try {
      const platform = req.query.platform;
      const date = req.query.date;
      if (!platform || !date) {
        return res.status(400).json({ code: 400, message: "platform, date 파라미터가 필요합니다." });
      }
      const data = await PaymentService.getHourlySalesHistory({ platform, date });
      return res.status(StatusCode.SUCCESS).json({
        code: 200,
        message: "시간별 매출 조회 성공",
        data
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "시간별 매출 조회 실패",
        error: error.message
      });
    }
  },

  async getSalesHistoryMonthly(req, res) {
    try {
      const platform = req.query.platform;
      let startDate = req.query.startDate;
      let endDate = req.query.endDate;
      if (!platform || !startDate || !endDate) {
        return res.status(400).json({ code: 400, message: "platform, startDate, endDate 파라미터가 필요합니다." });
      }
      startDate = new Date(startDate);
      endDate = new Date(endDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      const data = await PaymentService.getMonthlySalesHistory({ platform, startDate, endDate });
      return res.status(StatusCode.SUCCESS).json({
        code: 200,
        message: "월별 매출 조회 성공",
        data
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "월별 매출 조회 실패",
        error: error.message
      });
    }
  },

  async getSalesCountByGoods(req, res) {
    try {
      const platform = req.query.platform;
      if (!platform) {
        return res.status(400).json({ code: 400, message: "platform 파라미터가 필요합니다." });
      }
      // 날짜는 YYYY-MM-DD 문자열로 전달받아 그대로 사용 (KST 기준 일자 비교로 오늘 매출과 일치)
      const startDateStr = req.query.startDate || null;
      const endDateStr = req.query.endDate || null;
      const data = await PaymentService.getSalesCountByGoods({ platform, startDateStr, endDateStr });
      return res.status(StatusCode.SUCCESS).json({
        code: 200,
        message: "상품별 판매 수 조회 성공",
        data
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "상품별 판매 수 조회 실패",
        error: error.message
      });
    }
  },

  async getMonthlySales(req, res) {
    try {
      const platform = req.query.platform;
      if (!platform) {
        return res.status(400).json({ code: 400, message: "platform parameter is required." });
      }

      const year = req.query.year ? parseInt(req.query.year) : null;
      const month = req.query.month ? parseInt(req.query.month) : null;

      const totalAmount = await PaymentService.getMonthlySales(platform, year, month);

      return res.status(StatusCode.SUCCESS).json({
        code: 200,
        message: "한달 매출 조회 성공",
        data: {
          totalAmount,
          year: year || new Date().getFullYear(),
          month: month || new Date().getMonth() + 1
        }
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        code: 500,
        message: "한달 매출 조회 실패",
        error: error.message
      });
    }
  },

 async register(req, res) {
    try {
      const TEST_PHONE_NUMBER = [
        "01055989742",   "01058389701" , "01033336666"
      ];
      const TEST_AMOUNT = 1;

      const { payMethod, reportHistoryId, userTelNo } = req.body;
      if (!payMethod) return res.status(400).json({ code: 400, message: "payMethod is required" });
      if (!reportHistoryId) return res.status(400).json({ code: 400, message: "reportHistoryId is required" });

      const reportHistory = await ReportHistoryService.getReportHistoryById(reportHistoryId);
      if (!reportHistory) return res.status(404).json({ code: 404, message: "ReportHistory not found" });
      const goodsType = req.body.goodsType || reportHistory.goodsType;
      console.log(`[LOG 1][register] 수신 데이터 - goodsType: ${goodsType}, reportHistoryId: ${reportHistoryId}`);


      /* -----------------------------------------------------
         * 🔥 [추가] 치트키 체크: 이름이 "테스트"이면 결제 패스
         * ----------------------------------------------------- */
        if (reportHistory.userInfo.name === "테스트") {
            console.log("🚀 치트키 감지: '테스트' 이름 입력됨. 결제 생략 및 즉시 생성.");

            const shopOrderNo = `FREE-${Date.now()}`;
            
            // 2) 즉시 GPT 보고서 생성 (GptService 임포트 필요)
            const reportInfo = await GptService.callReport(
                reportHistory.userInfo, 
                reportHistory.goodsType
            );

            // 3) DB 업데이트
            await ReportHistoryService.updateById({
                id: reportHistoryId,
                shopOrderNo: shopOrderNo,
                reportInfo: reportInfo
            });

            // 4) 결제창 대신 바로 결과 페이지 URL 반환
            return res.status(200).json({
                code: 200,
                message: "테스트 모드 성공",
                data: { authPageUrl: `/saju/report?shopOrderNo=${shopOrderNo}` }
            });
        }
        /* ----------------------------------------------------- */

      const userAgent = req.headers["user-agent"] || "";
      const isMobile = /mobile/i.test(userAgent);
      const deviceType = isMobile ? DeviceType.MOBILE : DeviceType.PC;

// 프론트에서 넘겨준 goodsType이 있으면 그것을 쓰고, 없으면 DB 값을 씁니다.
const currentGoodsType = req.body.goodsType || reportHistory.goodsType;
let finalAmount = GoodsType[currentGoodsType].price;      if (TEST_PHONE_NUMBER.includes(userTelNo)) {
        console.log(`[TEST MODE] ${userTelNo} → 금액 ${TEST_AMOUNT}원`);
        finalAmount = TEST_AMOUNT;
      } else {
        // 카카오톡 채널 추가 쿠폰(-4,000원). 화면 표기 금액과 실제 승인 금액을 맞추기 위해 서버에서도 차감한다.
        try {
          const channelDiscount = await ChannelCouponService.consume({
            session: req.session,
            userTelNo
          });
          if (channelDiscount > 0) {
            finalAmount = Math.max(1000, finalAmount - channelDiscount);
            console.log(`[ChannelCoupon] ${userTelNo} → -${channelDiscount}원 적용 (최종 ${finalAmount}원)`);
          }
        } catch (couponErr) {
          // 쿠폰 처리 실패가 결제 자체를 막지 않도록 정가로 진행한다.
          console.error("[ChannelCoupon] 적용 실패:", couponErr.message);
        }
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
 * 🟢 TossPayments (추가 필요)
 * ----------------------------------------------------- */
// PaymentController.js의 register 함수 내 적절한 위치에 추가
// src/framework/web/controller/PaymentController.js 의 register 함수 내부

/* -----------------------------------------------------
 * 🟢 TossPayments 분기 추가
 * ----------------------------------------------------- */
if (payMethod === "TOSS") {
  // 1. 주문번호 생성 (finalAmount는 이미 위에서 100원으로 계산됨)
  const shopOrderNo = `TOSS-${Date.now()}`; 
console.log(`[LOG 2][TOSS_REGISTER] DB 저장 시도 - shopOrderNo: ${shopOrderNo}, goodsType: ${goodsType}`);  // 2. DB에 결제 대기 데이터 생성
  await PaymentTransactionRepository.createPayment({
    ...basePayload,
    shopOrderNo,
    userTelNo: req.body.userTelNo, // 👈 추가: 문자 발송을 위한 번호 저장
        userPw: req.body.userPw,  
    amount: finalAmount,
    goodsType: goodsType, // 👈 여기서 유실되는지 확인 // 100원이 적용된 금액
    goods_type: goodsType,   // 🔥 추가: DB 컬럼명과 직접 매핑
    paymentStatus: PaymentStatus.READY // 결제 준비 상태
  });

  // 3. 보고서 히스토리에 주문번호 업데이트
  await ReportHistoryService.updateById({
    id: reportHistoryId,
    shopOrderNo: shopOrderNo,
goodsType: goodsType,
goods_type: goodsType    // 🔥 추가: DB 컬럼명과 직접 매핑
  });

  // 4. 성공 응답 (프론트엔드로 100원과 주문번호를 보냄)
  return res.status(200).json({
    code: 200,
    message: "토스 거래등록 성공",
    data: { 
      shopOrderNo, 
      amount: finalAmount 
    }
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


  // PaymentController.js 파일의 PaymentController 객체 안에 추가
async callbackToss(req, res) {
  try {
    // 1. 토스가 리다이렉트 시 보내주는 파라미터 + 프론트에서 붙인 tel, pw
    const { paymentKey, orderId, amount, tel, pw, goodsType } = req.query;
console.log(`[LOG 3][callbackToss] 수신 쿼리 - orderId: ${orderId}, goodsType: ${goodsType}`);    // 2. 서비스의 승인 로직 호출
if (!goodsType) {
            console.error(`[CRITICAL] 토스 콜백에서 goodsType이 누락되었습니다! (orderId: ${orderId})`);
        }
    await PaymentService.approveTossPayment({
      paymentKey,
      orderId,
      amount: Number(amount),
      userTelNo: tel,
      userPw: pw,
      goodsType: goodsType // 👈 서비스로 전달
    });

    // 3. 승인 성공 시 결과 페이지로 리다이렉트 (기존 성공 페이지 활용)
    return res.redirect(
      303,
      `/saju/payment_success?shopOrderNo=${encodeURIComponent(orderId)}`
    );
  } catch (error) {
    console.error("[Toss Callback Error]", error);
    // 실패 시 에러 메시지와 함께 결제 페이지로 리턴
    return res.redirect('/saju/payment?error=approve_failed&msg=' + encodeURIComponent(error.message));
  }
},
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
// src/framework/web/controller/PaymentController.js 내부에 추가
async verifyTicket(req, res) {
    try {
        const { ticketCode } = req.body;
        // 사용되지 않은 티켓 조회
        const { coupons: Coupons } = await import("../orm/sequelize.js");
        const ticket = await Coupons.findOne({ where: { code: ticketCode, isUsed: false } });

        if (!ticket) {
            return res.status(400).json({ code: 400, message: "유효하지 않거나 이미 사용된 티켓입니다." });
        }

        return res.status(200).json({
            code: 200,
            data: { 
                goodsType: ticket.goodsType, 
                ticketCode: ticket.code 
            }
        });
    } catch (error) {
        console.error("티켓 검증 오류:", error);
        return res.status(500).json({ code: 500, message: "티켓 인증 중 서버 오류가 발생했습니다." });
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