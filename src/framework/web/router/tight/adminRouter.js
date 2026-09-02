import express from "express";
import adminsService from "../../service/AdminsService.js";
import TicketService from "../../service/TicketService.js";
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

/* ─────────────────────────── 무료 티켓 발급 ───────────────────────────
 * 발급된 코드는 /saju/ticket 에서 입력하면 곧바로 해당 상품 입력창으로 이어지고,
 * 결제 없이 리포트가 생성된다(각 상품 result 라우트가 티켓을 소비).
 * 관리자 로그인 없이는 접근할 수 없다.
 * ------------------------------------------------------------------ */

router.get("/ticket", isAuthenticated, (req, res) => {
  return res.render("tight/admin/ticket", {
    goodsList: TicketService.getIssuableGoods(),
  });
});

router.post("/ticket/issue", isAuthenticated, async (req, res) => {
  try {
    const { goodsType, count, memo } = req.body;
    const result = await TicketService.issueTickets({ goodsType, count, memo });
    return res.status(200).json({ code: 200, message: "티켓 발급 완료", data: result });
  } catch (err) {
    console.error("❌ 티켓 발급 실패:", err);
    return res.status(400).json({ code: 400, message: err.message });
  }
});

router.get("/ticket/list", isAuthenticated, async (req, res) => {
  try {
    const { goodsType = "", used = "", page = 1 } = req.query;
    const limit = 20;
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
    const data = await TicketService.listTickets({ goodsType, used, limit, offset });
    return res.status(200).json({ code: 200, data });
  } catch (err) {
    console.error("❌ 티켓 목록 조회 실패:", err);
    return res.status(500).json({ code: 500, message: err.message });
  }
});

router.post("/ticket/delete", isAuthenticated, async (req, res) => {
  try {
    await TicketService.deleteTicket(req.body.code);
    return res.status(200).json({ code: 200, message: "삭제 완료" });
  } catch (err) {
    return res.status(400).json({ code: 400, message: err.message });
  }
});

export default router;
