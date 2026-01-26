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
console.log(`[GPT_LOG] 보고서 생성 시작: ${shopOrderNo}`); // 로그 추가
    const paymentTransaction = await paymentService.getPaymentTransaction(shopOrderNo);

    // if (paymentTransaction.paymentStatus != PaymentStatus.APPROVED) {
    //   console.error("승인되지 않은 결제건 요청:", shopOrderNo);
    //   res.status(500).json({ error: "승인되지 않은 결제건 요청", detail: shopOrderNo });
    // }

    const reportHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
    const goodsType = GoodsType[reportHistory.goodsType];

(async () => {
      try {
        const response = await GptService.callReport(reportHistory.userInfo, goodsType);
        console.log(`[GPT_LOG] GPT 응답 성공: ${shopOrderNo}`);
        await ReportHistoryService.updateById({
          id: reportHistory.id,
          reportInfo: response
        });
        console.log(`[GPT_LOG] DB 업데이트 완료: ${shopOrderNo}`);
      } catch (err) {
        console.error(`[GPT_LOG] 비동기 GPT 호출 중 치명적 오류:`, err);
      }
    })();
    res.json({ message: "GPT 처리 중", shopOrderNo });
  } catch (err) {
    console.error("GPT 호출 실패:", err);
    res.status(500).json({ error: "GPT 호출 실패", detail: err.message });
  }
});
export default router;
