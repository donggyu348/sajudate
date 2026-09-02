import express from "express";
import { GoodsType } from "../../enums/Goods.js";
import { buildReunionAnalysis } from "../../service/reunionSajuService.js";
import { redeemTicket } from "../../service/TicketService.js";

/*
 * 재회사주 — sajuRouter.js가 이미 1,000줄을 넘어 별도 라우터로 분리한다.
 * 마운트: framework/web/tight.js 의 app.use("/saju/reunion", reunionRouter)
 *
 * 퍼널: /intro → /input → POST /result → GET /result?userInfo=... → /saju/payment
 * (POST → GET 리다이렉트로 공유 가능한 링크를 만드는 것은 romantic/adult와 동일한 규약)
 */
const router = express.Router();

router.get("/", (req, res) => res.redirect("/saju/reunion/intro"));

router.get("/intro", (req, res) => {
  res.render("tight/saju/reunion/intro");
});

router.get("/input", (req, res) => {
  res.render("tight/saju/reunion/input");
});

router.post("/result", async (req, res) => {
  try {
    const userInfo = req.body;

    // 무료 티켓이 붙어 있으면 결제를 건너뛰고 바로 리포트를 만든다
    const ticketCode = req.query.ticket || userInfo.ticket || userInfo.ticketCode;
    if (ticketCode) {
      const shopOrderNo = await redeemTicket({
        ticketCode,
        userInfo,
        goodsType: GoodsType.REUNION.code,
      });
      // 티켓이 유효하지 않으면 아래 일반 결제 흐름으로 이어간다
      if (shopOrderNo) return res.redirect(`/saju/waiting?shopOrderNo=${shopOrderNo}`);
    }

    const encodedUserInfo = encodeURIComponent(JSON.stringify(userInfo));
    return res.redirect(`/saju/reunion/result?userInfo=${encodedUserInfo}`);
  } catch (e) {
    console.error("❌ 재회사주 POST /result 실패:", e);
    return res.redirect("/saju/reunion/input");
  }
});

router.get("/result", (req, res) => {
  const encodedUserInfo = req.query.userInfo;
  if (!encodedUserInfo) return res.redirect("/saju/reunion/input");

  try {
    const userInfo = JSON.parse(decodeURIComponent(encodedUserInfo));
    const reunion = buildReunionAnalysis(userInfo);

    return res.render("tight/saju/reunion/result", {
      userInfo,
      reunion,
      goodsInfo: GoodsType.REUNION,
    });
  } catch (error) {
    console.error("❌ 재회사주 결과 계산 실패:", error);
    return res.redirect("/saju/reunion/input");
  }
});

export default router;
