import GptService from "./GptService.js";
import ReportHistoryService from "./ReportHistoryService.js";

/** shopOrderNo → 진행 중인 Promise (동일 주문 중복 GPT 호출 방지) */
const inflight = new Map();

/**
 * 동일 shopOrderNo에 대해 GPT 리포트 생성은 한 번만 실행합니다.
 * 결제 승인 콜백 + payment_success + /api/gpt/report 가 겹칠 때 큐에 같은 작업이 여러 번 쌓이던 문제를 막습니다.
 */
export async function ensureReportForShopOrder({ shopOrderNo, userInfo, goodsType }) {
  if (!shopOrderNo) throw new Error("shopOrderNo 없음");

  if (inflight.has(shopOrderNo)) {
    console.log(`[REPORT_COORD] 같은 주문 생성 작업 대기(join): ${shopOrderNo}`);
    return inflight.get(shopOrderNo);
  }

  const task = (async () => {
    console.log(`[REPORT_COORD] GPT 리포트 생성 시작: ${shopOrderNo}`);
    const row = await ReportHistoryService.getReportHistoryByShopOrderNo(shopOrderNo);
    if (!row) throw new Error("reportHistory 없음");
    if (row.reportInfo) {
      console.log(`[REPORT_COORD] 이미 report_info 존재, 스킵: ${shopOrderNo}`);
      return row.reportInfo;
    }

    const generated = await GptService.callReport(userInfo, goodsType);
    await ReportHistoryService.updateById({ id: row.id, reportInfo: generated });
    console.log(`[REPORT_COORD] GPT 리포트 DB 저장 완료: ${shopOrderNo}`);
    return generated;
  })().finally(() => {
    inflight.delete(shopOrderNo);
  });

  inflight.set(shopOrderNo, task);
  return task;
}
