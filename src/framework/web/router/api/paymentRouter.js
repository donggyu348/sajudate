import express from "express";
import PaymentController from "../../controller/PaymentController.js";

const router = express.Router();

// 거래 등록 API
router.post("/register", PaymentController.register);

// 결제 인증 콜백 처리 API
router.post("/callback", PaymentController.callback);

router.post("/list", PaymentController.getApproveList);

router.get("/daily-summary", PaymentController.getDailySales);

router.get("/sales-history", PaymentController.getSalesHistory);
export default router;
