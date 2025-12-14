import express from "express";
import UsersService from "../../service/UsersService.js";
import { Platform } from "../../enums/Platform.js";
import PaymentController from "../../controller/PaymentController.js";

const router = express.Router();

// 현재 세션 사용자 조회
router.get("/me", (req, res) => {
  const user = req.session.user || null;
  return res.status(200).json({ user });
});

// 로그인 페이지
router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/saju");
  res.render("jujangso/saju/user/login");
});

// 회원가입 페이지
router.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/saju");
  res.render("jujangso/saju/user/register");
});

// 로그인 처리
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호는 필수입니다." });
  }
  const u = await UsersService.login({ platform: Platform.JUJANGSO.code, email, password });
  if (!u) return res.status(400).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  req.session.user = u;
  return res.status(200).json({ message: "로그인 성공" });
});

router.post("/register", async (req, res) => {
  const { email, name, gender, phone, password, termsAgree } = req.body;
  if (!email || !name || !gender || !phone || !password) {
    return res.status(400).json({ error: "이메일, 이름, 성별, 휴대폰번호, 비밀번호는 필수입니다." });
  }
  if (termsAgree !== 'Y') {
    return res.status(400).json({ error: "약관 동의가 필요합니다." });
  }
  try {
    req.session.user = await UsersService.register({ platform: Platform.JUJANGSO.code, email, name, gender, phone, password });
    return res.status(201).json({ message: "회원가입 성공" });
  } catch (e) {
    return res.status(400).json({ error: e.message || "회원가입 실패" });
  }
});

// 회원탈퇴 페이지
router.get("/delete", (req, res) => {
  if (!req.session.user) return res.redirect("/user/login");
  return res.render("jujangso/saju/user/delete");
});

// 로그아웃
router.post("/logout", (req, res) => {
  req.session.user = null;
  return res.status(200).json({ message: "로그아웃 되었습니다." });
});

// 회원탈퇴
router.post("/delete", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "비밀번호는 필수입니다." });
  try {
    await UsersService.delete({ userId: req.session.user.id, password });
    req.session.user = null;
    return res.status(200).json({ message: "회원탈퇴가 완료되었습니다." });
  } catch (e) {
    return res.status(400).json({ error: e.message || "회원탈퇴 실패" });
  }
});

// 본인 구매내역 조회 (JUJANGSO)
router.get("/payment/history", (req, res) => {
  req.query.platform = Platform.JUJANGSO.code;
  return PaymentController.getMyHistory(req, res);
});

export default router;
