import express from "express";
import reportGenerationService from "../../service/reportGenerationService.js";
import paymentService from "../../service/PaymentService.js";

const router = express.Router();

router.post("/report", async (req, res) => {
  try {
    const shopOrderNo = req.body.shopOrderNo;
    console.log(`[GPT_LOG] 보고서 생성 요청: ${shopOrderNo}`);

    await paymentService.getPaymentTransaction(shopOrderNo);

    reportGenerationService
      .generateReportForOrder(shopOrderNo)
      .then(() => console.log(`[GPT_LOG] GPT 응답 성공: ${shopOrderNo}`))
      .catch((err) => console.error(`[GPT_LOG] 비동기 GPT 호출 중 치명적 오류:`, err));

    res.json({ message: "GPT 처리 중", shopOrderNo });
  } catch (err) {
    console.error("GPT 호출 실패:", err);
    res.status(500).json({ error: "GPT 호출 실패", detail: err.message });
  }
});

export default router;
