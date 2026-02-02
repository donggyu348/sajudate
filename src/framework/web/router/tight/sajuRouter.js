import express from "express";
import gptService from "../../service/GptService.js";
import reportHistoryService from "../../service/ReportHistoryService.js";
import { sendReportLink } from "../../service/SmsService.js";
import PaymentService from "../../service/PaymentService.js";
import { Platform } from "../../enums/Platform.js";
import ReportHistoryService from "../../service/ReportHistoryService.js";
import paymentService from "../../service/PaymentService.js";
import { PaymentStatus } from "../../enums/Payment.js";
import KakaoPayClient from "../../api/KakaoPayClient.js";
import { getFourPillars } from "../../service/sajuCalService.js";
import { generateShopOrderNo } from "../../utils/CommonUtils.js"; // 이 줄을 추가하세요!
import { GoodsType } from "../../enums/Goods.js";
import db from "../../orm/sequelize.js";
const CouponsModel = db.coupons || db.default?.models?.coupons;
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
const sample = await gptService.callSample(userInfo);

    // 1. 사주 분석 결과 재계산
    const saju = getFourPillars(userInfo);

    const today = new Date();
    const todayDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    };

    // 2. 결과 페이지 렌더링
    res.render(`tight/saju/${goodsType.code.toLowerCase()}/result`, {
      userInfo: userInfo,
      saju,        // 🔥 이것만 있으면 됨
      todayDate: todayDate,
      sample,
            sampleInfo: sample   // ✅ 이 줄이 이번 에러의 정답

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

  console.log("📥 /classic/result POST 도착");
  console.log(req.body);   // ← 이게 핵심

  const userInfo = req.body;
  const ticketCode = req.query.ticket; // 프론트에서 쿼리로 넘겨준다고 가정
if (ticketCode) {
    const ticket = await CouponsModel.findOne({ where: { code: ticketCode, isUsed: false } });
    if (ticket) {
      console.log("🚀 티켓 인증 성공: 결제 건너뛰고 보고서 생성");
      
      // 1) 티켓 즉시 사용 처리
      await ticket.update({ isUsed: true });

      // 2) 리포트 내역 및 GPT 생성 (테스트 모드 로직과 유사하게 처리)
      const shopOrderNo = `TICKET-${ticketCode}-${Date.now()}`;
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: await gptService.callSample(userInfo),
        shopOrderNo,
        goodsType: GoodsType.CLASSIC
      });

      const reportInfo = await gptService.callReport(userInfo, GoodsType.CLASSIC.code);
      await reportHistoryService.updateById({ id: created.result.id, reportInfo });

      return res.redirect(`/saju/report?shopOrderNo=${shopOrderNo}`);
    }
  }
  // 🔥 [추가] 이름이 '테스트'인 경우 결제 없이 바로 리포트 생성 및 이동
  if (userInfo.name === "테스트") {
    console.log("🚀 [테스트 모드] 결제를 건너뛰고 리포트를 즉시 생성합니다.");
    try {
      const shopOrderNo = `FREE-TEST-${Date.now()}`;
      
      // 1) 리포트 내역 생성 (결제 완료 상태처럼 저장)
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: await gptService.callSample(userInfo), // 샘플 정보 생성
        shopOrderNo,
        goodsType: GoodsType.CLASSIC // 정통사주
      });

      // 2) 실제 리포트(GPT) 내용 생성
      const reportInfo = await gptService.callReport(userInfo, GoodsType.CLASSIC.code);

      // 3) 생성된 내용 DB 업데이트
      await reportHistoryService.updateById({
        id: created.result.id,
        reportInfo
      });

      // 4) 바로 리포트 결과 페이지로 리다이렉트
      return res.redirect(`/saju/report?shopOrderNo=${shopOrderNo}`);
    } catch (error) {
      console.error("테스트 모드 생성 오류:", error);
      // 에러 시 일반 흐름으로 폴백
    }
  }
  const result = await gptService.callSample(userInfo);
  const saju = getFourPillars(userInfo);

  const today = new Date();
  const todayDate = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate()
  };

  res.render("tight/saju/classic/result", {
    userInfo: req.body,
    sample: result,
    saju,
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
  const ticketCode = req.query.ticket; // 프론트에서 쿼리로 넘겨준다고 가정
  // 🎫 [추가] 티켓 번호가 있는 경우 로직
 if (ticketCode) {
    const ticket = await CouponsModel.findOne({ where: { code: ticketCode, isUsed: false } });
    if (ticket) {
      console.log("🚀 연애사주 티켓 인증 성공");
      await ticket.update({ isUsed: true });

      const shopOrderNo = `TICKET-${ticketCode}-${Date.now()}`;
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: await gptService.callSample(userInfo),
        shopOrderNo,
        goodsType: GoodsType.ROMANTIC // 👈 CLASSIC에서 ROMANTIC으로 수정 필수!
      });

      const reportInfo = await gptService.callReport(userInfo, GoodsType.ROMANTIC.code);
      await reportHistoryService.updateById({ id: created.result.id, reportInfo });

      return res.redirect(`/saju/report?shopOrderNo=${shopOrderNo}`);
    }
  }
  if (userInfo.name === "관리자") {
    console.log("🚀 [관리자 모드] 결제를 건너뛰고 리포트를 즉시 생성합니다.");
    try {
      const shopOrderNo = `FREE-ADMIN-${Date.now()}`;
      
      // 1) 리포트 내역 생성
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: await gptService.callSample(userInfo),
        shopOrderNo,
        goodsType: GoodsType.ROMANTIC // 연애사주
      });

      // 2) 실제 리포트(GPT) 내용 생성
      const reportInfo = await gptService.callReport(userInfo, GoodsType.ROMANTIC.code);

      // 3) DB 업데이트
      await reportHistoryService.updateById({
        id: created.result.id,
        reportInfo
      });

      // 4) 바로 리포트 결과 페이지로 리다이렉트
      return res.redirect(`/saju/report?shopOrderNo=${shopOrderNo}`);
    } catch (error) {
      console.error("관리자 모드 생성 오류:", error);
    }
  }
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
  try {
    const shopOrderNo = req.query.shopOrderNo;
    const reportHistory = await reportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);

    if (!reportHistory) return res.status(404).send("리포트를 찾을 수 없습니다.");

    const userInfo = reportHistory.userInfo;
    const dbGoodsType = String(reportHistory.goodsType || "").toUpperCase();

    // 🚀 [수정 핵심] 번들(BUNDLE) 포함 여부로 경로 결정
    let reportPath;
    
    if (dbGoodsType.includes("ROMANTIC")) {
      // ROMANTIC 또는 ROMANTIC_BUNDLE 모두 이 경로를 사용
      reportPath = "tight/saju/romantic/report";
    } else {
      // CLASSIC 또는 CLASSIC_BUNDLE, 혹은 그 외 모든 경우 기본 경로
      reportPath = "tight/saju/classic/report";
    }

    console.log(`📌 [REPORT] 주문번호: ${shopOrderNo}, GoodsType: ${dbGoodsType} -> 경로: ${reportPath}`);

    const saju = getFourPillars(userInfo);

    res.render(reportPath, {
      reportInfo: reportHistory.reportInfo,
      userInfo: reportHistory.userInfo,
      todayDate: {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        day: new Date().getDate()
      },
      sample: reportHistory.sampleInfo,
      sampleInfo: reportHistory.sampleInfo,
      saju 
    });
  } catch (error) {
    console.error("보고서 출력 오류:", error);
    res.status(500).send("보고서를 로드하는 중 오류가 발생했습니다.");
  }
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
        goodsType: GoodsType.ROMANTIC, // 🔥 이 한 줄

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

  // 🔹 기본 상품 코드 (ROMANTIC / CLASSIC)
  const baseGoodsCode = req.body.goodsType;

  // 🔹 GoodsType에서 꺼내기
  const goodsInfo = GoodsType[baseGoodsCode];
  const bundleInfo = GoodsType[`${baseGoodsCode}_BUNDLE`]; // ⭐ 핵심

  if (!goodsInfo) {
    console.error("❌ 잘못된 goodsType:", baseGoodsCode);
    return res.status(400).send("Invalid goodsType");
  }

  const result = await ReportHistoryService.registerReportHistory({
    userInfo,
    sampleInfo: sample,
  goodsType: goodsInfo,        // 🔥 GoodsType 객체 그대로
    platform: goodsInfo.platform
  });

  res.render("tight/saju/payment", {
    reportHistoryId: result.result.id,

    // 🔥 payment.ejs에서 쓰는 데이터들
    goodsInfo,        // 기본 상품
    bundleInfo,       // 번들 상품
    goodsTypeMap: GoodsType // 전체 가격표 (프론트 JS용)
  });
});

router.get("/payment_success", async (req, res) => {
  try {
    const { shopOrderNo, pg_token } = req.query;
    if (!shopOrderNo) return res.status(400).send("주문번호가 없습니다.");

    let paymentInfo = await PaymentService.getPaymentTransaction(shopOrderNo);
    const reportHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);

    if (!paymentInfo || !reportHistory) {
      return res.status(404).send("결제 정보를 찾을 수 없습니다.");
    }

    // 1. [보완] goodsType이 비어있을 경우 paymentInfo에서 가져오는 안전장치
    // 로그에 "GoodsType 정의 누락:" 뒤에 아무것도 안 찍히는 현상을 방지합니다.
    const targetGoodsType = reportHistory.goodsType || paymentInfo.goodsType;
    const goodsConfig = GoodsType[targetGoodsType];

    if (!goodsConfig) {
        console.error("❌ GoodsType 정의 누락. 입력값:", targetGoodsType);
        return res.status(500).send(`상품 정보(Type: ${targetGoodsType})를 찾을 수 없습니다.`);
    }

    /**
     * ② 결제 승인 로직 (기존 유지)
     */
    if (paymentInfo.paymentStatus === PaymentStatus.APPROVED) {
        console.log(`[${shopOrderNo}] 이미 승인 완료된 주문입니다.`);
    } 
    else if (pg_token && paymentInfo.paymentStatus === PaymentStatus.READY) {
      const tid = paymentInfo.tid || (req.session?.kakaoPay?.tid);
      if (!tid) {
        console.error(`[${shopOrderNo}] TID를 찾을 수 없어 승인 요청을 중단합니다.`);
      } else {
        try {
          await KakaoPayClient.requestApprove({
            cid: "CT59746939",
            tid: tid,
            partner_order_id: shopOrderNo,
            partner_user_id: `USER_${shopOrderNo}`,
            pg_token 
          });
          await PaymentService.updatePaymentStatus(shopOrderNo, PaymentStatus.APPROVED);
        } catch (kakaoError) {
          if (kakaoError.message.includes("-702")) {
            await PaymentService.updatePaymentStatus(shopOrderNo, PaymentStatus.APPROVED);
          } else {
            throw kakaoError;
          }
        }
      }
    }

    /**
     * ③ 결과 확인 및 GPT 호출
     */
   if (reportHistory.reportInfo) {
      return res.redirect("/saju/report?shopOrderNo=" + shopOrderNo);
    }

    // 비동기 GPT 호출 (기존 유지)
    (async () => {
      try {
        const goodsTypeObject = GoodsType[reportHistory.goodsType];
        console.log(`[SERVER_START] 결제 승인 즉시 GPT 호출: ${shopOrderNo}`);
        const response = await gptService.callReport(reportHistory.userInfo, goodsTypeObject);
        await reportHistoryService.updateById({
          id: reportHistory.id,
          reportInfo: response
        });
        console.log(`[SERVER_SUCCESS] GPT 생성 완료: ${shopOrderNo}`);
      } catch (err) {
        console.error("[SERVER_ERROR] 즉시 실행 GPT 오류:", err);
      }
    })();

let fileDir = 'tight';

    // 2. 만약 DB에 platform 정보가 있고 그 값이 'JUJANGSO'라면 경로를 바꿉니다.
    // .toUpperCase()와 .trim()을 사용하여 데이터 오차를 방지합니다.
    if (reportHistory && reportHistory.platform) {
        const platformCheck = String(reportHistory.platform).trim().toUpperCase();
        if (platformCheck === 'JUJANGSO') {
            fileDir = 'jujangso';
        }
    }

    // 3. 경로를 직접 조립합니다. (이제 절대 undefined가 될 수 없습니다)
    const renderPath = `${fileDir}/saju/payment_success`;
    
    console.log(`🚀 [DEBUG] 최종 렌더링 경로: ${renderPath}`);

    // 4. 렌더링 실행
    return res.render(renderPath, {
      shopOrderNo: String(shopOrderNo || ""),
      goodsPrice: goodsConfig ? goodsConfig.price : 0,
      goodsType: String(targetGoodsType || "")
    });

  } catch (error) {
    console.error("payment_success 최종 오류:", error);
    return res.status(500).send("결제 처리 중 문제가 발생했습니다.");
  }
});
// 결제 실패 페이지
router.get("/payment_fail", (req, res) => {
    const { shopOrderNo, message } = req.query;
    console.warn(`[/payment_fail] Accessed for shopOrderNo: ${shopOrderNo}, Message: ${message}`);
    res.status(400).render("tight/saju/payment_fail", { // payment_fail.ejs 파일 필요
        shopOrderNo: shopOrderNo || 'N/A',
        errorMessage: message || '알 수 없는 오류'
    });
});

router.post("/report/check", (req, res) => {
  const shopOrderNo = req.body.shopOrderNo;

  ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo)
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

        let domain = "http://sajudate.store";
        if (paymentTransaction.platform === Platform.JUJANGSO.code) {
          domain = "https://saju-maeul.kr";
        }

        console.log("5번 goodstype", reportHistory.goodsType);
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
router.get("/ticket", (req, res) => {
    try {
        // tight/saju/ticket.ejs 파일을 찾아서 보여줍니다.
        res.render("tight/common/ticket");
    } catch (error) {
        console.error("티켓 페이지 렌더링 에러:", error);
        res.status(500).send("페이지를 로드할 수 없습니다.");
    }
});
/* 티켓 코드 검증 및 리다이렉트 */
router.get("/ticket/verify", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("티켓 코드를 입력해주세요.");

  try {
    const ticket = await CouponsModel.findOne({ where: { code, isUsed: false } });
    if (!ticket) {
      return res.send("<script>alert('유효하지 않거나 이미 사용된 티켓입니다.'); history.back();</script>");
    }

    // PaymentService에서 설정한 giftType 대조
    // '1' = 정통 사주(Classic), '2' = 로맨틱 연애사주(Romantic)
    let targetPath = "";
    if (ticket.goodsType === '1') {
      targetPath = "/saju/classic/input";
    } else if (ticket.goodsType === '2') {
      targetPath = "/saju/romantic/input";
    } else {
      targetPath = "/saju/classic/input"; // 기본값
    }

    // 티켓 번호를 쿼리스트링에 담아 해당 입력창으로 리다이렉트
    return res.redirect(`${targetPath}?ticket=${code}`);
  } catch (error) {
    console.error("티켓 검증 오류:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
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
