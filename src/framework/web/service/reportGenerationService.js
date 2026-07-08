import GptService, { getReportStepInfo } from "./GptService.js";
import ReportHistoryService from "./ReportHistoryService.js";
import { GoodsType } from "../enums/Goods.js";

/** shopOrderNo 단위 중복 GPT 호출 방지 */
const activeJobs = new Map();

/** shopOrderNo 단위 실시간 생성 진행률 (로딩 화면 표시용) */
const reportProgress = new Map();

function setProgress(shopOrderNo, data) {
  reportProgress.set(shopOrderNo, { ...data, updatedAt: Date.now() });
}

/** 로딩 화면 폴링용 진행률 조회 */
function getReportProgress(shopOrderNo) {
  return reportProgress.get(shopOrderNo) || null;
}

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

      const stepInfo = getReportStepInfo(goodsType);
      setProgress(shopOrderNo, { status: "pending", done: 0, total: stepInfo.total, current: 0, label: "명부를 펼치는 중", labels: stepInfo.labels });

      console.log(`[ReportGen] GPT 생성 시작: ${shopOrderNo}`);
      const response = await GptService.callReport(reportHistory.userInfo, goodsType, (p) => {
        setProgress(shopOrderNo, {
          status: "pending",
          done: p.done || 0,
          current: p.current || 0,
          total: p.total || stepInfo.total,
          label: p.label || "작성 중",
          labels: stepInfo.labels,
        });
      });

      await ReportHistoryService.updateById({
        id: reportHistory.id,
        reportInfo: response,
      });

      setProgress(shopOrderNo, { status: "done", done: stepInfo.total, current: stepInfo.total, total: stepInfo.total, label: "완성", labels: stepInfo.labels });
      console.log(`[ReportGen] DB 저장 완료: ${shopOrderNo}`);
      return response;
    } catch (err) {
      setProgress(shopOrderNo, { status: "error", done: 0, total: 0, current: 0, label: "생성 지연 — 재시도 중", labels: [] });
      throw err;
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
  getReportProgress,
};
