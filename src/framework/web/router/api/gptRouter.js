import express from "express";
import GptService from "../../service/GptService.js";
import ReportHistoryService from "../../service/ReportHistoryService.js";
import paymentService from "../../service/PaymentService.js";
import { PaymentStatus } from "../../enums/Payment.js";
import { GoodsType } from "../../enums/Goods.js";

const router = express.Router();

router.post("/report", async (req, res) => {
  try {

    const shopOrderNo = req.body.shopOrderNo;

    const paymentTransaction = await paymentService.getPaymentTransaction(shopOrderNo);

    // if (paymentTransaction.paymentStatus != PaymentStatus.APPROVED) {
    //   console.error("승인되지 않은 결제건 요청:", shopOrderNo);
    //   res.status(500).json({ error: "승인되지 않은 결제건 요청", detail: shopOrderNo });
    // }

    const reportHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
    const goodsType = GoodsType[reportHistory.goodsType];

    GptService.callReport(reportHistory.userInfo, goodsType)
      .then(async (response) => {
        console.log('비동기 GPT 호출 성공:');
        await ReportHistoryService.updateById({
          id: reportHistory.id,
          reportInfo: response
        });
      })
      .catch((err) => {
        console.error("비동기 GPT 호출 실패:", err);
      });

    res.json({ message: "GPT 처리 중", shopOrderNo });
  } catch (err) {
    console.error("GPT 호출 실패:", err);
    res.status(500).json({ error: "GPT 호출 실패", detail: err.message });
  }
});
export default router;
