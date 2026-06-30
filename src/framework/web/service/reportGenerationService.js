import GptService from "./GptService.js";
import ReportHistoryService from "./ReportHistoryService.js";
import { GoodsType } from "../enums/Goods.js";

/** shopOrderNo 단위 중복 GPT 호출 방지 */
const activeJobs = new Map();

/**
 * 주문번호 기준 보고서 생성 (이미 완료·진행 중이면 재호출하지 않음)
 */
async function generateReportForOrder(shopOrderNo) {
  if (!shopOrderNo) {
    throw new Error("shopOrderNo가 필요합니다.");
  }

  if (activeJobs.has(shopOrderNo)) {
    console.log(`[ReportGen] 이미 생성 중 — 동일 작업 대기: ${shopOrderNo}`);
    return activeJobs.get(shopOrderNo);
  }

  const job = (async () => {
    try {
      const reportHistory = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
      if (!reportHistory) {
        throw new Error(`ReportHistory not found: ${shopOrderNo}`);
      }

      if (reportHistory.reportInfo) {
        console.log(`[ReportGen] 이미 저장됨 — 스킵: ${shopOrderNo}`);
        return reportHistory.reportInfo;
      }

      const goodsType = GoodsType[reportHistory.goodsType];
      if (!goodsType) {
        throw new Error(`알 수 없는 goodsType: ${reportHistory.goodsType}`);
      }

      console.log(`[ReportGen] GPT 생성 시작: ${shopOrderNo}`);
      const response = await GptService.callReport(reportHistory.userInfo, goodsType);

      await ReportHistoryService.updateById({
        id: reportHistory.id,
        reportInfo: response,
      });

      console.log(`[ReportGen] DB 저장 완료: ${shopOrderNo}`);
      return response;
    } finally {
      activeJobs.delete(shopOrderNo);
    }
  })();

  activeJobs.set(shopOrderNo, job);
  return job;
}

function isGenerating(shopOrderNo) {
  return activeJobs.has(shopOrderNo);
}

export default {
  generateReportForOrder,
  isGenerating,
};
