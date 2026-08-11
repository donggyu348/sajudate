import express from "express";
import { GoodsType } from "../../enums/Goods.js";
import { buildReunionAnalysis } from "../../service/reunionSajuService.js";

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

router.post("/result", (req, res) => {
  try {
    const encodedUserInfo = encodeURIComponent(JSON.stringify(req.body));
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
