import ReportHistory from "../orm/models/reportHistory.js";

class ReportHistoryRepository {

  async createReportHistory(data) {
    return await ReportHistory.create(data);
  }

async updateByShopOrderNo(shopOrderNo, updateData) {
    if (updateData.goodsType && !updateData.goods_type) {
      updateData.goods_type = updateData.goodsType;
    }
    return await ReportHistory.update(updateData, {
      where: { shopOrderNo },
    });
  }

async updateById(id, updateData) {
    if (updateData.goodsType && !updateData.goods_type) {
      updateData.goods_type = updateData.goodsType;
    }

    console.log(`[Repo] ReportHistory 업데이트 시도 ID: ${id}, 데이터:`, updateData);

    const [affectedRows] = await ReportHistory.update(updateData, {
      where: { id },
    });

    console.log(`[Repo] 업데이트 결과 (영향받은 행): ${affectedRows}`);

    if (affectedRows > 0) {
      return await this.findById(id);
    }
    return null;
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