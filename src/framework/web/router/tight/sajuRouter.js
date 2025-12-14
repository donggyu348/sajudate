import express from "express";
import gptService from "../../service/GptService.js";
import reportHistoryService from "../../service/ReportHistoryService.js";
import { GoodsType } from "../../enums/Goods.js";
import { sendReportLink } from "../../service/SmsService.js";
import PaymentService from "../../service/PaymentService.js";
import { Platform } from "../../enums/Platform.js";
import ReportHistoryService from "../../service/ReportHistoryService.js";
import paymentService from "../../service/PaymentService.js";
import { PaymentStatus } from "../../enums/Payment.js";

const router = express.Router();
//미리보기 렌더링
// [추가 시작: 이 블록을 파일 상단에 추가하세요]
// URL 쿼리 파라미터에서 사용자 정보를 추출하고 유효성 검사를 수행하는 함수
const processGetResult = async (req, res, goodsType) => {
  const encodedUserInfo = req.query.userInfo;
  if (!encodedUserInfo) {
    // 공유된 URL에 데이터가 없는 경우 입력 페이지로 리디렉션
    return res.redirect(`/saju/${goodsType.code.toLowerCase()}/input`);
  }

  try {
    const userInfoJson = decodeURIComponent(encodedUserInfo);
    const userInfo = JSON.parse(userInfoJson);

    // 1. 사주 분석 결과 재계산
    const result = await gptService.callSample(userInfo, goodsType);

    const today = new Date();
    const todayDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    };

    // 2. 결과 페이지 렌더링
    res.render(`tight/saju/${goodsType.code.toLowerCase()}/result`, {
      userInfo: userInfo,
      sample: result,
      sampleInfo: result,
      todayDate: todayDate
    });
  } catch (error) {
    console.error(`Error processing ${goodsType.code} GET result:`, error);
    // 오류 발생 시 입력 페이지로 폴백 (original romantic fallback logic)
    return res.redirect(`/saju/${goodsType.code.toLowerCase()}/input`);
  }
};


router.get("/", (req, res) => {
  res.render("tight/saju/main");
});

/* 정통 사주 인트로 */
router.get("/classic/intro", (req, res) => {
  res.render("tight/saju/classic/intro");
});
/* 정통 사주 입력 */
router.get("/classic/input", (req, res) => {
  res.render("tight/saju/classic/input");
});


router.post("/classic/result", async (req, res) => {

  const userInfo = req.body;
  const result = await gptService.callSample(userInfo);

  const today = new Date();
  const todayDate = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate()
  };

  res.render("tight/saju/classic/result", {
    userInfo: req.body,
    sample: result,
    todayDate: todayDate
  });
});

/* 연애 사주 인트로 */
router.get("/romantic/intro", (req, res) => {
  res.render("tight/saju/romantic/intro");
});
/* 연애 사주 입력 */
router.get("/romantic/input", (req, res) => {
  res.render("tight/saju/romantic/input");
});
// [대체 및 추가 시작: 기존 router.post("/romantic/result", ...) 블록을 대체하세요]

// POST: 사용자 입력 데이터(req.body)를 받아 GET 요청으로 리디렉션
router.post("/romantic/result", async (req, res) => {
  const userInfo = req.body;
  
  try {
    // 사용자 정보를 JSON 문자열로 변환 후 URL 인코딩
    const encodedUserInfo = encodeURIComponent(JSON.stringify(userInfo));

    // GET URL로 리디렉션 (이 URL이 공유 가능한 링크가 됩니다)
    return res.redirect(`/saju/romantic/result?userInfo=${encodedUserInfo}`);
  } catch (e) {
    console.error(e);
    // 리디렉션 실패 시 원래의 에러 처리 로직을 따름
    res.redirect("/saju");
  }
});

// GET: 공유된 링크 (GET 요청)를 처리하고 페이지 렌더링
router.get("/romantic/result", async (req, res) => {
    return processGetResult(req, res, GoodsType.ROMANTIC);
});



router.get("/report", async (req, res) => {

  const shopOrderNo = req.query.shopOrderNo;

  const reportHistory = await reportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);

  const today = new Date();
  const todayDate = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate()
  };

  let reportPath;
  if (reportHistory.goodsType == GoodsType.CLASSIC.code) {
    reportPath = "tight/saju/classic/report";

  } else if (reportHistory.goodsType == GoodsType.ROMANTIC.code) {
    reportPath = "tight/saju/romantic/report";
  }

  res.render(reportPath,
    {
      reportInfo: reportHistory.reportInfo,
      userInfo: reportHistory.userInfo,
      todayDate: todayDate,
       sample: reportHistory.sampleInfo,        // sample 로도 접근 가능
  sampleInfo: reportHistory.sampleInfo, 

    }
  );
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
    const reportInfo = await gptService.callReport(userInfo, GoodsType.ROMANTIC.code);

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
router.get("/review", (req, res) => {
  res.render("tight/saju/review");
});

router.post("/payment", async (req, res) => {

  const userInfo = JSON.parse(req.body.userInfo);
  const sample = JSON.parse(req.body.sample);
  const goodsType = GoodsType[req.body.goodsType];
  const userIdx = req.session?.user?.id || null;

  const result = await reportHistoryService.registerReportHistory({
    userInfo: userInfo,
    sampleInfo: sample,
    goodsType: goodsType,
    ...(userIdx ? { userIdx } : {})
  });

  res.render("tight/saju/payment", {
    reportHistoryId: result.result.id,
    goodsInfo: goodsType
  });
});

router.get("/payment_success", async (req, res) => {
  try {
    const { shopOrderNo } = req.query;
    if (!shopOrderNo) {
      return res.status(400).send("shopOrderNo is required");
    }

    const paymentInfo = await paymentService.getPaymentTransaction(shopOrderNo);
    if (!paymentInfo || paymentInfo.paymentStatus != PaymentStatus.APPROVED) {
      return res.status(404).send("invalid Payment");
    }

    const repostHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
    if (!repostHistory) {
      return res.status(404).send("Report history not found");
    }

    if (repostHistory.reportInfo) {
      return res.redirect("/saju/report?shopOrderNo=" + shopOrderNo);
    }

    const fileDir = Platform[repostHistory.platform].fileDir;
    const goodsPrice = GoodsType[repostHistory.goodsType].price;
    const goodsTypeRaw = repostHistory.goodsType; // 상품 타입 코드(CLASSIC, ROMANTIC)를 가져옴

    // 기존과 동일한 템플릿 렌더링 (단, URL은 /saju/payment_success 로 노출됨)
    return res.render(`${fileDir}/saju/payment_success`, {
      shopOrderNo,
      goodsPrice,
      goodsType: goodsTypeRaw // goodsType 변수를 추가하여 EJS로 전달
    });
  } catch (error) {
    return res.status(500).send("Failed to render success page");
  }
});
router.post("/report/check", (req, res) => {
  const shopOrderNo = req.body.shopOrderNo;

  reportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo)
    .then(async reportHistory => {
      if (!reportHistory.reportInfo) {

        res.status(200).json({
          code: 200,
          status: "PENDING", // 명시적 상태
          message: "리포트 생성 중",
          data: null
        });
      } else {

        const paymentTransaction = await PaymentService.getPaymentTransaction(shopOrderNo);

        let domain = "https://unse-jeojangso.kr";
        if (paymentTransaction.platform === Platform.JUJANGSO.code) {
          domain = "https://saju-maeul.kr";
        }

        await sendReportLink(paymentTransaction.userTelNo, shopOrderNo, reportHistory.goodsType, domain);

        res.status(200).json({
          code: 200,
          status: "DONE", // 완료 상태
          message: "리포트 생성 완료",
          data: reportHistory.reportInfo
        });
      }
    })
    .catch(err => {
      console.error("Error fetching reportHistory:", err);
      res.status(500).json({
        code: 500,
        status: "ERROR",
        message: "서버 오류가 발생했습니다.",
        data: null
      });
    });

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
      platform: Platform.TIGHT.code,
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

router.post("/report/:pageNum", (req, res) => {
  const pageNum = req.params.pageNum;
  const { userInfo, reportInfo, sampleInfo } = req.body;

  res.render(`tight/saju/report/${pageNum}`, {
    userInfo, reportInfo, sampleInfo
  });
});
router.get("/history", (req, res) => {
  res.render("tight/saju/history");
});

router.get("/terms", (req, res) => {
  res.render("tight/saju/terms");
});

router.get("/privacy", (req, res) => {
  res.render("tight/saju/privacy");
});

export default router;
