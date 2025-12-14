import reportHistoryRepository from "../repository/ReportHistoryRepository.js";
import { GoodsType } from "../enums/Goods.js";

class ReportHistoryService {


  async registerReportHistory(data) {
    data.goodsType = data.goodsType || GoodsType.PREMIUM_SAJU;
    data.platform = data.goodsType.platform.code;


    data.goodsType = data.goodsType.code;
    const result = await reportHistoryRepository.createReportHistory({
      ...data,
    });
    return {
      result
    };
  }

  async updateById(data) {
    const result = await reportHistoryRepository.updateById(data.id, {
      ...data,
    });
    return {
      result
    };
  }

  async getReportHistoryByShopOrderNo(shopOrderNo) {
    return await reportHistoryRepository.findByShopOrderNo(shopOrderNo);
  }

  async getReportHistoryById(id) {
    return await reportHistoryRepository.findById(id);
  }


}

export default new ReportHistoryService();
