import express from "express";
import { ensureReportForShopOrder } from "../../service/ReportGenerationCoordinator.js";
import ReportHistoryService from "../../service/ReportHistoryService.js";
import paymentService from "../../service/PaymentService.js";
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
    if (!reportHistory) {
      return res.status(404).json({ error: "reportHistory 없음", detail: shopOrderNo });
    }
    if (reportHistory.reportInfo) {
      return res.json({ message: "이미 생성 완료", shopOrderNo });
    }
    const typeCode = reportHistory.goodsType || paymentTransaction?.goodsType;
    const goodsType = GoodsType[typeCode];
    if (!goodsType) {
      console.error(`[GPT_LOG] 상품 타입 매핑 실패: code=${typeCode}, shopOrderNo=${shopOrderNo}`);
      return res.status(500).json({ error: "알 수 없는 상품 타입", detail: String(typeCode) });
    }

    (async () => {
      try {
        await ensureReportForShopOrder({
          shopOrderNo,
          userInfo: reportHistory.userInfo,
          goodsType,
        });
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
