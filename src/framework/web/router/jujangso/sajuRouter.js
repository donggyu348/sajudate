  import express from "express";
  import GptService from "../../service/GptService.js";
  import ReportHistoryService from "../../service/ReportHistoryService.js";
  import PaymentService from "../../service/PaymentService.js";
  import { Platform } from "../../enums/Platform.js";
  import { sendReportLink } from "../../service/SmsService.js";
  import { GoodsType } from "../../enums/Goods.js";
  import { isReportPayloadReady } from "../../utils/reportPayloadReady.js";
  import { PaymentStatus } from "../../enums/Payment.js";
  import { sendPurchaseEventOnce } from "../../api/MetaConversionsApi.js";

  const router = express.Router();

  router.get("/", (req, res) => {
    res.render("jujangso/saju/main");
  });

  router.post("/result", async (req, res) => {

    const userInfo = req.body;
    const result = await GptService.callSample_jujangso(userInfo);

    res.render("jujangso/saju/result", {
      userInfo: req.body,
      sample: result
    });
  });

  router.get("/review", (req, res) => {
    res.render("jujangso/saju/review");
  });

  router.post("/review/check", async (req, res) => {
    const { userTelNo, userPw } = req.body;
    
    if (!userTelNo || !userPw) {
      return res.status(400).json({ message: "연락처와 비밀번호는 필수입니다." });
    }

    try {
      // PaymentService.getApproveList를 사용하여 승인된 결제 내역을 조회합니다.
      // NOTE: 이 방법은 결제 내역이 많을 경우 성능상 문제가 될 수 있으며,
      // PaymentTransactionRepository에 userTelNo와 userPw로 직접 조회하는 
      // 전용 메소드를 추가하는 것이 최적입니다. (현재 파일 수정 범위 외)
      const { rows: payments } = await PaymentService.getApproveList({
        platform: Platform.JUJANGSO.code,
        limit: 1000, 
        offset: 0,
        // userTelNo와 userPw로 직접 DB 필터링을 할 수 없으므로,
        // 여기서는 목록을 가져와 메모리에서 필터링하는 방식(차선책)을 사용합니다.
        // 이상적으로는 Repository 계층에서 구현되어야 합니다.
      });
      
      // 메모리에서 일치하는 결제 정보 찾기
      const matchingPayment = payments.find(p => p.userTelNo === userTelNo && p.userPw === userPw);

      if (matchingPayment) {
        return res.status(200).json({
          message: "결제 정보 확인 성공",
          shopOrderNo: matchingPayment.shopOrderNo
        });
      } else {
        return res.status(404).json({
          message: "일치하는 결제 정보를 찾을 수 없습니다. 연락처와 비밀번호를 다시 확인해주세요.",
          shopOrderNo: null
        });
      }

    } catch (err) {
      console.error("Error checking review credentials:", err);
      res.status(500).json({
        message: "서버 오류로 결제 정보를 확인할 수 없습니다."
      });
    }
  });


  router.post("/payment", async (req, res) => {

    const userInfo = JSON.parse(req.body.userInfo);
    const sample = JSON.parse(req.body.sample);
    const userIdx = req.session?.user?.id || null;

    const result = await ReportHistoryService.registerReportHistory({
      userInfo: userInfo,
      sampleInfo: sample,
      ...(userIdx ? { userIdx } : {})
    });

    res.render("jujangso/saju/payment", {
      reportHistoryId: result.result.id
    });
  });

  router.post("/skip-payment", async (req, res) => {
    try {
      const userInfo = JSON.parse(req.body.userInfo);
      const sample = JSON.parse(req.body.sample);
      const userIdx = req.session?.user?.id || null;

      // 1) 테스트용 shopOrderNo 생성
      const shopOrderNo = `TEST-${Date.now()}`;

      // 2) 우선 reportHistory row 생성 (reportInfo 비어있음)
      const created = await ReportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: sample,
        shopOrderNo,
        ...(userIdx ? { userIdx } : {})
      });

      const reportHistoryId = created?.result?.id;
      if (!reportHistoryId) {
        console.error("❌ ERROR: reportHistory 생성 실패 (id 없음)");
        return res.status(500).send("리포트 생성 실패");
      }

      // 3) GPT를 동기적으로 호출 → 기다림
      const reportInfo = await GptService.callReport(userInfo, GoodsType.PREMIUM_SAJU);

      // 4) GPT 결과를 DB에 업데이트
      await ReportHistoryService.updateById({
        id: reportHistoryId,
        reportInfo
      });

      console.log("✅ TEST 모드: reportInfo 생성 완료 → 바로 리포트 페이지로 이동");

      // 5) report 페이지로 이동
      return res.redirect(`/saju/report?shopOrderNo=${shopOrderNo}`);

    } catch (error) {
      console.error("❌ /skip-payment 오류:", error);
      return res.status(500).send("리포트 생성 중 오류 발생");
    }
  });


  router.get("/payment_success", async (req, res) => {
    try {
      const { shopOrderNo } = req.query;
      if (!shopOrderNo) {
        return res.status(400).send("shopOrderNo is required");
      }

      const paymentInfo = await PaymentService.getPaymentTransaction(shopOrderNo);
      if (!paymentInfo || paymentInfo.paymentStatus !== PaymentStatus.APPROVED) {
        return res.status(404).send("invalid Payment");
      }

      const repostHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
      if (!repostHistory) {
        return res.status(404).send("Report history not found");
      }

      // 결제 직후에는 payment_success를 거치도록 함 (리포트가 이미 있어도 동일)

      const fileDir = Platform[repostHistory.platform].fileDir;
      const goodsPrice = GoodsType[repostHistory.goodsType].price;
      const goodsTypeRaw = repostHistory.goodsType; // ✅ goodsType 추가

      const metaPurchaseEventId = `purchase_${shopOrderNo}`;
      void sendPurchaseEventOnce({
        shopOrderNo,
        eventId: metaPurchaseEventId,
        value: goodsPrice,
        currency: "KRW",
        req,
      }).catch((e) => console.warn("[Meta CAPI] 비동기 전송:", e.message));

      const defaultMetaPixelByBrand =
        fileDir === "jujangso" ? "1392936281822728" : "1234559481840697";

      // 기존과 동일한 템플릿 렌더링 (단, URL은 /saju/payment_success 로 노출됨)
      return res.render(`${fileDir}/saju/payment_success`, {
        shopOrderNo,
        goodsPrice,
        goodsType: goodsTypeRaw, // ✅ goodsType 전달
        metaPurchaseEventId,
        metaPixelId:
          process.env.META_PIXEL_ID?.trim() || defaultMetaPixelByBrand,
      });
    } catch (error) {
      return res.status(500).send("Failed to render success page");
    }
  });

  router.get("/report", async (req, res) => {

    const shopOrderNo = req.query.shopOrderNo;

    const reportHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);

    res.render("jujangso/saju/report/main",
      {
        reportInfo: reportHistory.reportInfo,
        userInfo: reportHistory.userInfo,
        sampleInfo: reportHistory. sampleInfo,
      }
    );
  });


  router.post("/report/check", (req, res) => {
    const shopOrderNo = req.body.shopOrderNo;

    ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo)
      .then(async (reportHistory) => {
        if (!reportHistory || !isReportPayloadReady(reportHistory.reportInfo)) {
          return res.status(200).json({
            code: 200,
            status: "PENDING",
            message: "리포트 생성 중",
            data: null,
          });
        }

        try {
          const paymentTransaction =
            await PaymentService.getPaymentTransaction(shopOrderNo);
          const domain =
            paymentTransaction &&
            Platform[paymentTransaction.platform] &&
            Platform[paymentTransaction.platform].domain;

          if (paymentTransaction?.userTelNo && domain) {
            await sendReportLink(
              paymentTransaction.userTelNo,
              shopOrderNo,
              reportHistory.goodsType,
              domain
            );
          }
        } catch (smsErr) {
          console.error("[jujangso report/check] SMS 오류:", smsErr.message);
        }

        return res.status(200).json({
          code: 200,
          status: "DONE",
          message: "리포트 생성 완료",
          data: reportHistory.reportInfo,
        });
      })
      .catch((err) => {
        console.error("Error fetching reportHistory:", err);
        res.status(500).json({
          code: 500,
          status: "ERROR",
          message: "서버 오류가 발생했습니다.",
          data: null,
        });
      });
  });

  router.post("/report/:pageNum", (req, res) => {
    try {
      console.log("🔥 /report/:pageNum 호출됨");
      console.log("pageNum:", req.params.pageNum);
      console.log("body:", req.body);

      const pageNum = req.params.pageNum;
      const { userInfo, reportInfo, sampleInfo } = req.body;

      // 경로 로그 확인
      console.log("🗂️ Trying to render:", `jujangso/saju/report/${pageNum}`);

      res.render(`jujangso/saju/report/${pageNum}`, {
        userInfo,
        reportInfo,
        sampleInfo
      });

    } catch (err) {
      console.error("❌ ERROR IN /report/:pageNum");
      console.error(err.stack);
      return res.status(500).send("페이지 렌더링 오류");
    }
  });

  router.get("/history", (req, res) => {
    res.render("jujangso/saju/history");
  });

  router.get("/terms", (req, res) => {
    res.render("jujangso/saju/terms");
  });

  router.get("/privacy", (req, res) => {
    res.render("jujangso/saju/privacy");
  });

  export default router;
