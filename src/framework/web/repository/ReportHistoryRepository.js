import ReportHistory from "../orm/models/reportHistory.js";

class ReportHistoryRepository {

  async createReportHistory(data) {
    return await ReportHistory.create(data);
  }

  async updateByShopOrderNo(shopOrderNo, updateData) {
    return await ReportHistory.update(updateData, {
      where: { shopOrderNo },
    });
  }

  async updateById(id, updateData) {
    return await ReportHistory.update(updateData, {
      where: { id },
    });
  }

  async findByShopOrderNo(shopOrderNo) {
    return await ReportHistory.findOne({
      where: { shopOrderNo },
    }).then(result => result?.get({ plain: true }));
  }

  async findById(id) {
    return await ReportHistory.findOne({
      where: { id },
    }).then(result => result?.get({ plain: true }));
  }
}

const reportHistoryRepository = new ReportHistoryRepository();
export default reportHistoryRepository;