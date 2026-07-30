import express from "express";
import adminsService from "../../service/AdminsService.js";
import isAuthenticated from "../../../middleware/authentication.js";
import { Platform } from "../../enums/Platform.js";
import { GoodsType } from "../../enums/Goods.js";

const router = express.Router();

// 상품코드 → 상품명 매핑 (관리자 화면 표시용)
const goodsTitles = Object.values(GoodsType).reduce((acc, g) => {
  if (g && g.code) acc[g.code] = g.title || g.code;
  return acc;
}, {});

router.get("/login", (req, res) => {
  res.render("tight/admin/login");
});

router.post("/login", async (req, res) => {

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "아이디와 비밀번호는 필수입니다." });
  }

  const result = await adminsService.login(Platform.TIGHT.code, email, password)
  if (result) {
    req.session.admin = { id: email }
    return res.status(200).json({ message: "로그인 성공" });
  } else {
    return res.status(400).json({ error: "유효한 계정이 아닙니다." });
  }

});

router.get("/payment", isAuthenticated, (req, res) => {
  return res.render("tight/admin/payment", { goodsTitles });
});


export default router;
