import express from "express";
import gptService, { buildRealTenGodTable, getReportStepInfo, getReportViewPath, resolveReportCode } from "../../service/GptService.js";
import { buildReaperCharts } from "../../service/reaperChartService.js";
import reportHistoryService from "../../service/ReportHistoryService.js";
import { sendReportLink } from "../../service/SmsService.js";
import PaymentService from "../../service/PaymentService.js";
import { Platform } from "../../enums/Platform.js";
import ReportHistoryService from "../../service/ReportHistoryService.js";
import paymentService from "../../service/PaymentService.js";
import { PaymentStatus } from "../../enums/Payment.js";
import KakaoPayClient from "../../api/KakaoPayClient.js";
import { getFourPillars } from "../../service/sajuCalService.js";
import { buildLoveTendencyPreview, buildRomanticPreview } from "../../service/romanticPreviewService.js";
import { buildAdultResultPreview, buildAdultCompatibilityPreview } from "../../service/adultPreviewService.js";
import reportGenerationService from "../../service/reportGenerationService.js";
import { generateShopOrderNo } from "../../utils/CommonUtils.js"; // 이 줄을 추가하세요!
import { GoodsType } from "../../enums/Goods.js";
import { buildMetaAdvancedMatching } from "../../utils/metaAdvancedMatching.js";
import { sendPurchaseEvent, shouldSkipPurchaseTracking } from "../../service/MetaCapiService.js";
import Coupons from "../../orm/models/coupons.js";
import PaymentTransactionRepository from "../../repository/PaymentTransactionRepository.js";
import ChannelCouponService, { CHANNEL_COUPON_CODE, CHANNEL_COUPON_DISCOUNT } from "../../service/ChannelCouponService.js";
const router = express.Router();
const CouponsModel = Coupons;

async function ensurePrepaidPayment(shopOrderNo, goodsType, userInfo = {}) {
  await PaymentTransactionRepository.createPrepaidPayment({
    shopOrderNo,
    platform: goodsType.platform.code,
    userTelNo: userInfo.phone || userInfo.tel || userInfo.userTelNo,
    userPw: userInfo.pw || userInfo.userPw,
  });
}
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

    const loveTendencyPreview = buildLoveTendencyPreview(userInfo, saju);
    const romanticPreview = buildRomanticPreview(userInfo, saju);

    // ADULT 전용: 파트너 사주 + 미리보기 텍스트
    let adultPreview = null;
    let partnerSaju = null;
    let partnerTenGodTable = null;
    if (goodsType.code === 'ADULT' || goodsType.code === 'ADULT_BUNDLE') {
      const partnerInfo = {
        name: userInfo.partnerName || '상대방',
        gender: userInfo.partnerGender || '',
        birthDate: userInfo.partnerBirthdate || userInfo.partnerBirthDate || '',
        birthTime: userInfo.partnerBirthTime || '',
      };
      if (partnerInfo.birthDate) {
        try {
          partnerSaju = getFourPillars(partnerInfo);
          const realPartnerTable = buildRealTenGodTable(partnerInfo);
          partnerTenGodTable = {
            ...realPartnerTable,
            data: realPartnerTable.data.map((row, i) => {
              const pillarKeys = ["hour", "day", "month", "year"];
              const p = partnerSaju[pillarKeys[i]];
              return [row[0], p.gan ?? row[1], p.ji ?? row[2], row[3], row[4], row[5], row[6]];
            }),
          };
        } catch(e) {}
      }
      const compat = buildAdultCompatibilityPreview(userInfo, saju, partnerInfo, partnerSaju);
      adultPreview = buildAdultResultPreview(userInfo, partnerInfo, saju, partnerSaju, compat);
    }

    const myTenGodTable = (goodsType.code === 'ADULT' || goodsType.code === 'ADULT_BUNDLE')
      ? (sample?.tenGodTable || buildRealTenGodTable(userInfo))
      : null;

    // 2. 결과 페이지 렌더링
    res.render(`tight/saju/${goodsType.code.toLowerCase()}/result`, {
      userInfo: userInfo,
      saju,
      partnerSaju,
      myTenGodTable,
      partnerTenGodTable,
      todayDate: todayDate,
      sample,
      sampleInfo: sample,
      loveTendencyPreview,
      romanticPreview,
      adultPreview,
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
const ticketCode = req.query.ticket || req.body.ticketCode || req.body.ticket;
if (ticketCode) {
    const ticket = await CouponsModel.findOne({ where: { code: ticketCode, isUsed: false } });
    if (ticket) {
      console.log("🚀 티켓 인증 성공: 대기 페이지로 먼저 이동합니다.");
      await ticket.update({ isUsed: true });
      const shopOrderNo = `TICKET-${ticketCode}-${Date.now()}`;

      await ensurePrepaidPayment(shopOrderNo, GoodsType.CLASSIC, userInfo);

      // [A] 리포트 내역 먼저 생성 (GPT 안 기다림)
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: {}, // 일단 빈 값으로 생성
        shopOrderNo,
        goodsType: GoodsType.CLASSIC
      });

      // [B] 백그라운드에서 GPT 생성 시작 (await를 제거함)
      gptService.callReport(userInfo, GoodsType.CLASSIC.code)
        .then(async (reportInfo) => {
          // 완료되면 DB만 업데이트
          await reportHistoryService.updateById({ id: created.result.id, reportInfo });
          console.log(`✅ [${shopOrderNo}] GPT 리포트 생성 완료`);
        })
        .catch(err => console.error("GPT 백그라운드 생성 에러:", err));

      // [C] 사용자는 즉시 대기 페이지로 보냄 (프록시 에러 방지)
      return res.redirect(`/saju/waiting?shopOrderNo=${shopOrderNo}`);
    }
  }
  // 🔥 [추가] 이름이 '테스트'인 경우 결제 없이 바로 리포트 생성 및 이동
  if (userInfo.name === "테스트") {
    console.log("🚀 [테스트 모드] 결제를 건너뛰고 리포트를 즉시 생성합니다.");
    try {
      const shopOrderNo = `FREE-TEST-${Date.now()}`;
      
      await ensurePrepaidPayment(shopOrderNo, GoodsType.CLASSIC, userInfo);

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

/* 저승사자 사주(생사부) 인트로 = 입력까지 한 화면 */
router.get("/reaper/intro", (req, res) => {
  res.render("tight/saju/reaper/intro");
});

// intro(기본 신원 입력) → input(퍼널 분석용 질문 단계) → result
router.post("/reaper/input", async (req, res) => {
  try {
    // intro에서 넘어온 기본 입력값을 그대로 넘긴다.
    return res.render("tight/saju/reaper/input", {
      userInfo: req.body,
      queryTicket: req.query.ticket || "",
    });
  } catch (e) {
    console.error("reaper input render error:", e);
    return res.redirect("/saju/reaper/intro");
  }
});

// input(질문) → loading(저승사자 스타일) → result
router.post("/reaper/loading", async (req, res) => {
  try {
    return res.render("tight/saju/reaper/loading", {
      userInfo: req.body,
      queryTicket: req.query.ticket || "",
    });
  } catch (e) {
    console.error("reaper loading render error:", e);
    return res.redirect("/saju/reaper/intro");
  }
});

/* 저승사자 사주 결과 (엔진은 임시로 정통사주 파이프라인 재사용) */
router.post("/reaper/result", async (req, res) => {
  const userInfo = req.body;
  const ticketCode = req.query.ticket || req.body.ticketCode || req.body.ticket;

  // 번들 티켓으로 진입한 경우: 결제 없이 리포트 생성 후 대기 페이지로
  if (ticketCode) {
    const ticket = await CouponsModel.findOne({ where: { code: ticketCode, isUsed: false } });
    if (ticket) {
      await ticket.update({ isUsed: true });
      const shopOrderNo = `TICKET-${ticketCode}-${Date.now()}`;
      await ensurePrepaidPayment(shopOrderNo, GoodsType.REAPER, userInfo);
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: {},
        shopOrderNo,
        goodsType: GoodsType.REAPER,
      });
      gptService.callReport(userInfo, GoodsType.REAPER.code)
        .then(async (reportInfo) => {
          await reportHistoryService.updateById({ id: created.result.id, reportInfo });
        })
        .catch((err) => console.error("GPT 백그라운드 생성 에러:", err));
      return res.redirect(`/saju/waiting?shopOrderNo=${shopOrderNo}`);
    }
  }

  // 치트키: 결제 없이 즉시 리포트 생성
  if (userInfo.name === "테스트" || userInfo.name === "관리자") {
    try {
      const shopOrderNo = `FREE-REAPER-${Date.now()}`;
      await ensurePrepaidPayment(shopOrderNo, GoodsType.REAPER, userInfo);
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: await gptService.callSample(userInfo),
        shopOrderNo,
        goodsType: GoodsType.REAPER,
      });
      const reportInfo = await gptService.callReport(userInfo, GoodsType.REAPER.code);
      await reportHistoryService.updateById({ id: created.result.id, reportInfo });
      return res.redirect(`/saju/report?shopOrderNo=${shopOrderNo}`);
    } catch (error) {
      console.error("저승사자 테스트/관리자 모드 오류:", error);
    }
  }

  // 일반 흐름: 저승사자 전용 result 뷰 렌더
  try {
    const result = await gptService.callSample(userInfo);
    const saju = getFourPillars(userInfo);
    const today = new Date();
    return res.render("tight/saju/reaper/result", {
      userInfo,
      sample: result,
      saju,
      reaperCharts: buildReaperCharts(userInfo),
      todayDate: {
        year: today.getFullYear(),
        month: today.getMonth() + 1,
        day: today.getDate(),
      },
    });
  } catch (e) {
    console.error("저승사자 result 오류:", e);
    return res.redirect("/saju/reaper/intro");
  }
});

/* 자미두수(紫微斗數) 인트로 — 롱스크롤 소개 랜딩 (하단 고정 CTA → 입력 페이지) */
router.get("/ziwei/intro", (req, res) => {
  res.render("tight/saju/ziwei/intro");
});

/* 자미두수 정보 입력 페이지 (랜딩의 '자미두수 시작하기' 진입점) */
router.get("/ziwei/input", (req, res) => {
  res.render("tight/saju/ziwei/input");
});

// TODO: loading/result 단계는 reaper 패턴을 참고해 별도로 구현 필요
// (ziweiCalService.getZiweiChart, GoodsType.ZIWEI, GPT 리포트 프롬프트 등 백엔드 연동 포함)
router.post("/ziwei/input", async (req, res) => {
  try {
    return res.render("tight/saju/ziwei/intro", {
      userInfo: req.body,
      submitted: true,
    });
  } catch (e) {
    console.error("ziwei input render error:", e);
    return res.redirect("/saju/ziwei/intro");
  }
});

/* 연애 사주 인트로 */
router.get("/romantic/intro", (req, res) => {
  res.render("tight/saju/romantic/intro");
});

/* 29금 사주 인트로 */
router.get("/adult/intro", (req, res) => {
  res.render("tight/saju/adult/intro");
});

/* 29금 사주 입력 */
router.get("/adult/input", (req, res) => {
  res.render("tight/saju/adult/input");
});

/* 연애 사주 입력 */
router.get("/romantic/input", (req, res) => {
  res.render("tight/saju/romantic/input");
});
// [대체 및 추가 시작: 기존 router.post("/romantic/result", ...) 블록을 대체하세요]

// POST: 사용자 입력 데이터(req.body)를 받아 GET 요청으로 리디렉션
router.post("/romantic/result", async (req, res) => {
  const userInfo = req.body;
const ticketCode = req.query.ticket || req.body.ticketCode || req.body.ticket;  // 🎫 [추가] 티켓 번호가 있는 경우 로직
if (ticketCode) {
    const ticket = await CouponsModel.findOne({ where: { code: ticketCode, isUsed: false } });
    if (ticket) {
      console.log("🚀 티켓 인증 성공: 대기 페이지로 먼저 이동합니다.");
      await ticket.update({ isUsed: true });
      const shopOrderNo = `TICKET-${ticketCode}-${Date.now()}`;

      await ensurePrepaidPayment(shopOrderNo, GoodsType.ROMANTIC, userInfo);

      // [A] 리포트 내역 먼저 생성 (GPT 안 기다림)
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: {}, // 일단 빈 값으로 생성
        shopOrderNo,
        goodsType: GoodsType.ROMANTIC
      });

      // [B] 백그라운드에서 GPT 생성 시작 (await를 제거함)
      gptService.callReport(userInfo, GoodsType.ROMANTIC.code)
        .then(async (reportInfo) => {
          // 완료되면 DB만 업데이트
          await reportHistoryService.updateById({ id: created.result.id, reportInfo });
          console.log(`✅ [${shopOrderNo}] GPT 리포트 생성 완료`);
        })
        .catch(err => console.error("GPT 백그라운드 생성 에러:", err));

      // [C] 사용자는 즉시 대기 페이지로 보냄 (프록시 에러 방지)
      return res.redirect(`/saju/waiting?shopOrderNo=${shopOrderNo}`);
    }
  }
  if (userInfo.name === "관리자") {
    console.log("🚀 [관리자 모드] 결제를 건너뛰고 리포트를 즉시 생성합니다.");
    try {
      const shopOrderNo = `FREE-ADMIN-${Date.now()}`;
      
      await ensurePrepaidPayment(shopOrderNo, GoodsType.ROMANTIC, userInfo);

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

/* ---------- 29금 사주 결과 ---------- */
router.post("/adult/result", async (req, res) => {
  const userInfo = req.body;
  const ticketCode = req.query.ticket || req.body.ticketCode || req.body.ticket;

  if (ticketCode) {
    const ticket = await CouponsModel.findOne({ where: { code: ticketCode, isUsed: false } });
    if (ticket) {
      await ticket.update({ isUsed: true });
      const shopOrderNo = `TICKET-${ticketCode}-${Date.now()}`;
      await ensurePrepaidPayment(shopOrderNo, GoodsType.ADULT, userInfo);
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: {},
        shopOrderNo,
        goodsType: GoodsType.ADULT,
      });
      gptService.callReport(userInfo, GoodsType.ADULT.code)
        .then(async (reportInfo) => {
          await reportHistoryService.updateById({ id: created.result.id, reportInfo });
        })
        .catch((err) => console.error("GPT 백그라운드 생성 에러:", err));
      return res.redirect(`/saju/waiting?shopOrderNo=${shopOrderNo}`);
    }
  }

  if (userInfo.name === "테스트" || userInfo.name === "관리자") {
    try {
      const shopOrderNo = `FREE-ADULT-${Date.now()}`;
      await ensurePrepaidPayment(shopOrderNo, GoodsType.ADULT, userInfo);
      const created = await reportHistoryService.registerReportHistory({
        userInfo,
        sampleInfo: await gptService.callSample(userInfo),
        shopOrderNo,
        goodsType: GoodsType.ADULT,
      });
      const reportInfo = await gptService.callReport(userInfo, GoodsType.ADULT.code);
      await reportHistoryService.updateById({ id: created.result.id, reportInfo });
      return res.redirect(`/saju/report?shopOrderNo=${shopOrderNo}`);
    } catch (error) {
      console.error("29금 테스트/관리자 모드 생성 오류:", error);
    }
  }

  try {
    const encodedUserInfo = encodeURIComponent(JSON.stringify(userInfo));
    return res.redirect(`/saju/adult/result?userInfo=${encodedUserInfo}`);
  } catch (e) {
    console.error(e);
    res.redirect("/saju");
  }
});

router.get("/adult/result", async (req, res) => {
  return processGetResult(req, res, GoodsType.ADULT);
});



router.get("/report", async (req, res) => {
  try {
    const shopOrderNo = req.query.shopOrderNo;
    const reportHistory = await reportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);

    if (!reportHistory) return res.status(404).send("리포트를 찾을 수 없습니다.");

    // 번들 상품은 reportCode(본 리포트) 기준으로 뷰 결정 — substring includes 사용 금지
    const gType = String(reportHistory.goodsType || "").toUpperCase();
    const reportCode = resolveReportCode(gType);
    const reportPath = getReportViewPath(gType);

    console.log(`📌 [DEBUG] 최종 경로 결정: ${reportPath} (goodsType: ${gType}, reportCode: ${reportCode})`);

    const saju = getFourPillars(reportHistory.userInfo);
    const reaperCharts = reportCode === "REAPER"
      ? buildReaperCharts(reportHistory.userInfo)
      : null;

    return res.render(reportPath, {
      reportInfo: reportHistory.reportInfo,
      userInfo: reportHistory.userInfo,
      reaperCharts,
      todayDate: {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        day: new Date().getDate()
      },
      sample: reportHistory.sampleInfo,
      sampleInfo: reportHistory.sampleInfo,
      saju,
    });
  } catch (error) {
    console.error("보고서 렌더링 에러:", error);
    res.status(500).send("보고서 로딩 중 오류가 발생했습니다.");
  }
});

router.post("/skip-payment", async (req, res) => {
  try {
    const userInfo = JSON.parse(req.body.userInfo);
    const sample = JSON.parse(req.body.sample);
    const userIdx = req.session?.user?.id || null;
    const goodsTypeCode = req.body.goodsType || "ROMANTIC";
    const goodsType = GoodsType[goodsTypeCode] || GoodsType.ROMANTIC;

    const shopOrderNo = `TEST-${Date.now()}`;

    await ensurePrepaidPayment(shopOrderNo, goodsType, userInfo);

    const created = await ReportHistoryService.registerReportHistory({
      userInfo,
      sampleInfo: sample,
      shopOrderNo,
      goodsType,
      ...(userIdx ? { userIdx } : {})
    });

    const reportHistoryId = created?.result?.id;
    if (!reportHistoryId) {
      console.error("❌ ERROR: reportHistory 생성 실패 (id 없음)");
      return res.status(500).send("리포트 생성 실패");
    }

    const reportInfo = await gptService.callReport(userInfo, goodsType.code);

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
router.get("/zodiac", (req, res) => {
  res.render("tight/saju/zodiac");
});

router.get("/review", (req, res) => {
  res.render("tight/saju/review");
});
/** 이용 후기 목록 (메인에서 '후기 더 보기'로 이동) */
router.get("/reviews", (req, res) => {
  res.render("tight/saju/reviews");
});
router.get("/api/check-ticket-report", async (req, res) => {
    const { shopOrderNo } = req.query;
    try {
        const report = await reportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
        // ticket으로 생성된 경우 reportInfo가 채워졌는지만 확인
        if (report && report.reportInfo) {
            return res.json({ status: "DONE" });
        }
        return res.json({ status: "WAITING" });
    } catch (err) {
        return res.json({ status: "ERROR" });
    }
});

/* 2. 티켓 전용 대기 페이지 라우터 */
router.get("/waiting", (req, res) => {
    const { shopOrderNo } = req.query;
    res.render("tight/saju/waiting", { shopOrderNo });
});
router.post("/payment", async (req, res) => {
  try {
    const userInfo = JSON.parse(req.body.userInfo);
    const sample = JSON.parse(req.body.sample);

    const baseGoodsCode = req.body.goodsType;
    const goodsInfo = GoodsType[baseGoodsCode];

    if (!goodsInfo) {
      console.error("❌ 잘못된 goodsType:", baseGoodsCode);
      return res.status(400).send("Invalid goodsType");
    }

    const result = await ReportHistoryService.registerReportHistory({
      userInfo,
      sampleInfo: sample,
      goodsType: goodsInfo,
      platform: goodsInfo.platform
    });

    // PRG(Post/Redirect/Get): 새로고침해도 결제창에 그대로 머무르도록 GET으로 리다이렉트한다.
    return res.redirect(`/saju/payment?historyId=${result.result.id}`);
  } catch (err) {
    console.error("❌ /payment 처리 실패:", err);
    res.status(500).send("결제 페이지로 이동할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
});

/* 결제창 GET — 새로고침/뒤로가기/직접진입 대응 (reportHistoryId 기반 재렌더) */
/* 채널 추가 팝업 배경 — 상품별 키아트. 없는 상품은 어두운 배경만 사용한다. */
const CHANNEL_POPUP_IMAGES = {
  REAPER: "/assets/images/tight/reaper/scenes/closing.png",
  ROMANTIC: "/assets/images/tight/romantic/landing/hero.png",
  ADULT: "/assets/images/tight/products/product_adult.png",
  CLASSIC: "/assets/images/tight/classic/index_banner.png"
};

function buildBundlesForBase(baseGoodsCode) {
  return Object.values(GoodsType)
    .filter((g) => g && typeof g.code === "string" && g.code.endsWith("_BUNDLE") && g.reportCode === baseGoodsCode && !g.hideInBundleList)
    .map((g) => {
      // 단일(giveTicket) / 다중(giveTickets) 모두 지원
      const giftCodes = Array.isArray(g.giveTickets)
        ? g.giveTickets
        : (g.giveTicket ? [g.giveTicket] : []);
      const giftTitles = giftCodes.map((c) => (GoodsType[c] && (GoodsType[c].shortTitle || GoodsType[c].title)) || "무료 사주");
      const partnerTitle = giftTitles.length ? giftTitles.join(" + ") : "무료 사주";
      return { ...g, partnerTitle, benefit: `${partnerTitle} 무료 티켓` };
    });
}

router.get("/payment", async (req, res) => {
  try {
    const historyId = req.query.historyId;
    if (!historyId) return res.redirect("/saju");

    const reportHistory = await ReportHistoryService.getReportHistoryById(historyId);
    if (!reportHistory) return res.redirect("/saju");

    // 저장된 goodsType이 번들 코드면 reportCode(본 상품)로 환원해 기본 상품/번들 목록을 재구성한다.
    const rawCode = String(reportHistory.goodsType || "");
    const baseGoodsCode = (GoodsType[rawCode] && GoodsType[rawCode].reportCode) ? GoodsType[rawCode].reportCode : rawCode;
    const goodsInfo = GoodsType[baseGoodsCode];
    if (!goodsInfo) return res.redirect("/saju");

    return res.render("tight/saju/payment", {
      reportHistoryId: reportHistory.id,
      goodsInfo,
      bundles: buildBundlesForBase(baseGoodsCode),
      goodsTypeMap: GoodsType,
      // 카카오톡 채널 추가 팝업 (채널 ID는 .env 로 분리)
      // KAKAO_JS_KEY는 비즈 앱 전환 후 SDK(followChannel) 방식으로 되돌릴 때 쓰므로 .env에 그대로 둔다.
      kakaoChannelPublicId: process.env.KAKAO_CHANNEL_PUBLIC_ID || "",
      channelPopupImage: CHANNEL_POPUP_IMAGES[baseGoodsCode] || "",
      channelCouponCode: CHANNEL_COUPON_CODE,
      channelCouponDiscount: CHANNEL_COUPON_DISCOUNT,
      // 이미 쿠폰을 받았다면 새로고침(또는 서버 재시작으로 세션이 날아간 뒤)에도 할인 표기를 유지한다.
      channelCouponIssued: await ChannelCouponService.isIssuedFor({
        session: req.session,
        reportHistoryId: reportHistory.id
      })
    });
  } catch (err) {
    console.error("❌ /payment GET 처리 실패:", err);
    return res.redirect("/saju");
  }
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
     * ③ 결과 확인 및 GPT 호출 (중복 방지 — /api/gpt/report 와 동일 서비스)
     */
   if (reportHistory.reportInfo) {
      return res.redirect("/saju/report?shopOrderNo=" + shopOrderNo);
    }

    reportGenerationService
      .generateReportForOrder(shopOrderNo)
      .then(() => console.log(`[SERVER_SUCCESS] GPT 생성 완료: ${shopOrderNo}`))
      .catch((err) => console.error("[SERVER_ERROR] 즉시 실행 GPT 오류:", err));

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

    const finalPayment = await PaymentService.getPaymentTransaction(shopOrderNo);

    const metaAdvancedMatching = buildMetaAdvancedMatching({
      userTelNo: finalPayment?.userTelNo,
    });

    // 쿠폰·번들 할인이 반영된 실결제액. 정가로 보내면 테스트 결제(1원)도 정가로 찍힌다.
    const paidAmount = Number(finalPayment?.amount) || (goodsConfig ? goodsConfig.price : 0);
    const skipPurchaseTracking = shouldSkipPurchaseTracking({
      value: paidAmount,
      name: reportHistory.userInfo?.name,
    });

    // [전환 추적] 브라우저 픽셀(payment_success.ejs)과 같은 event_id(shopOrderNo)로 서버 이벤트도 보낸다.
    // 광고 차단/이탈로 픽셀이 못 뜬 구매를 메우고, 둘 다 도착하면 Meta가 event_id로 중복 제거한다.
    // 렌더링을 막지 않도록 await 하지 않는다.
    if (skipPurchaseTracking) {
      console.log(`[Meta CAPI Purchase] 테스트 결제로 판단해 전송 생략 (${shopOrderNo}, ${paidAmount}원)`);
    } else {
      sendPurchaseEvent({
        req,
        shopOrderNo,
        value: paidAmount,
        advancedMatching: metaAdvancedMatching,
      });
    }

    // 로딩 화면 진행 단계(장) 라벨
    const stepInfo = getReportStepInfo(goodsConfig);

    // 4. 렌더링 실행
    return res.render(renderPath, {
      shopOrderNo: String(shopOrderNo || ""),
      goodsPrice: paidAmount,
      goodsType: String(targetGoodsType || ""),
      stepLabels: stepInfo.labels,
      stepTotal: stepInfo.total,
      metaAdvancedMatching,
      // 테스트 결제는 브라우저 픽셀도 함께 막아야 한다. 서버만 막으면 픽셀이 그대로 찍힌다.
      trackPurchase: !skipPurchaseTracking,
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

/* 리포트 생성 실시간 진행률 (로딩 화면 폴링용) */
router.post("/report/progress", async (req, res) => {
  const shopOrderNo = req.body.shopOrderNo;
  try {
    const reportHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
    if (reportHistory && reportHistory.reportInfo) {
      return res.json({ status: "DONE", done: 1, total: 1, current: 1, percent: 100, label: "완성", labels: [] });
    }
    const p = reportGenerationService.getReportProgress(shopOrderNo);
    if (!p) {
      return res.json({ status: "PENDING", done: 0, total: 0, current: 0, percent: 3, label: "명부를 펼치는 중", labels: [] });
    }
    const total = p.total || 0;
    const done = p.done || 0;
    // 진행 중인 장은 절반쯤 반영해 바가 자연스럽게 차오르게 한다.
    const eff = p.status === "done" ? total : Math.min(total, done + 0.5);
    const percent = total ? Math.max(3, Math.min(99, Math.round((eff / total) * 100))) : 5;
    return res.json({
      status: p.status === "done" ? "DONE" : (p.status === "error" ? "ERROR" : "PENDING"),
      done, total, current: p.current || 0,
      percent: p.status === "done" ? 100 : percent,
      label: p.label || "작성 중",
      labels: Array.isArray(p.labels) ? p.labels : [],
    });
  } catch (e) {
    return res.json({ status: "PENDING", done: 0, total: 0, current: 0, percent: 3, label: "준비 중", labels: [] });
  }
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

        let domain = "http://wolhajeom.shop";
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
const ticket = await Coupons.findOne({ where: { code: code, isUsed: false } });
    if (!ticket) {
      return res.send("<script>alert('유효하지 않거나 이미 사용된 티켓입니다.'); history.back();</script>");
    }

    // PaymentService에서 설정한 giftType 대조
    // '1' = 정통(Classic), '2' = 연애(Romantic), '3' = 29금(Adult), '4' = 저승사자(Reaper)
    let targetPath = "";
    if (ticket.goodsType === '1') {
      targetPath = "/saju/classic/input";
    } else if (ticket.goodsType === '2') {
      targetPath = "/saju/romantic/input";
    } else if (ticket.goodsType === '3' || String(ticket.goodsType).toUpperCase() === 'ADULT') {
      targetPath = "/saju/adult/input";
    } else if (ticket.goodsType === '4' || String(ticket.goodsType).toUpperCase() === 'REAPER') {
      targetPath = "/saju/reaper/intro";
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
