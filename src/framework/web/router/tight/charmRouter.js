import express from "express";
import { GoodsType } from "../../enums/Goods.js";
import { buildCharmAnalysis } from "../../service/charmSajuService.js";
import { redeemTicket } from "../../service/TicketService.js";

/*
 * 매혹사주 — 재회사주(reunionRouter)와 같은 규약으로 별도 라우터로 분리한다.
 * 마운트: framework/web/tight.js 의 app.use("/saju/charm", charmRouter)
 *
 * 퍼널: /intro → /story → /input → POST /result → GET /result?userInfo=... → /saju/payment
 * (POST → GET 리다이렉트로 공유 가능한 링크를 만드는 것은 reunion/romantic/adult와 동일)
 *
 * intro는 등장인물만 보여주는 표지, story가 영상 두 편으로 스토리를 끌고 간다.
 * 재회사주와 달리 입력은 **본인 한 사람뿐**이다.
 */
const router = express.Router();

router.get("/", (req, res) => res.redirect("/saju/charm/intro"));

router.get("/intro", (req, res) => {
  res.render("tight/saju/charm/intro");
});

router.get("/story", (req, res) => {
  res.render("tight/saju/charm/story");
});

router.get("/input", (req, res) => {
  res.render("tight/saju/charm/input");
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
        goodsType: GoodsType.CHARM.code,
      });
      // 티켓이 유효하지 않으면 아래 일반 결제 흐름으로 이어간다
      if (shopOrderNo) return res.redirect(`/saju/waiting?shopOrderNo=${shopOrderNo}`);
    }

    const encodedUserInfo = encodeURIComponent(JSON.stringify(userInfo));
    return res.redirect(`/saju/charm/result?userInfo=${encodedUserInfo}`);
  } catch (e) {
    console.error("❌ 매혹사주 POST /result 실패:", e);
    return res.redirect("/saju/charm/input");
  }
});

router.get("/result", (req, res) => {
  const encodedUserInfo = req.query.userInfo;
  if (!encodedUserInfo) return res.redirect("/saju/charm/input");

  try {
    const userInfo = JSON.parse(decodeURIComponent(encodedUserInfo));
    const charm = buildCharmAnalysis(userInfo);

    return res.render("tight/saju/charm/result", {
      userInfo,
      charm,
      goodsInfo: GoodsType.CHARM,
    });
  } catch (error) {
    console.error("❌ 매혹사주 결과 계산 실패:", error);
    return res.redirect("/saju/charm/input");
  }
});

export default router;
