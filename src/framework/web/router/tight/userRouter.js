import express from "express";
import { Platform } from "../../enums/Platform.js";
import PaymentController from "../../controller/PaymentController.js";

const router = express.Router();

// 본인 구매내역 조회 (TIGHT)
router.get("/payment/history", (req, res) => {
  req.query.platform = Platform.TIGHT.code;
  return PaymentController.getMyHistory(req, res);
});

export default router;

