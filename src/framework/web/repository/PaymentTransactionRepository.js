
// src/framework/web/repository/PaymentTransactionRepository.js
import PaymentTransaction from "../orm/models/paymentTransaction.js";
import ReportHistory from "../orm/models/reportHistory.js"; // ReportHistory 모델 import
import { Op, fn, col, literal } from "sequelize"; // ✅ 추가: Op, fn, col import
import { PaymentStatus } from "../enums/Payment.js"; // ✅ 추가: PaymentStatus import
class PaymentTransactionRepository {
  
  /**
   * ✅ [NEW] 날짜별 매출 히스토리 조회 (site-7 통합)
   */
  async getDailySalesHistory({ platform, startDate, endDate }) {
      const where = {
          paymentStatus: PaymentStatus.APPROVED,
          approvalDate: {
              [Op.between]: [startDate, endDate]
          }
      };

      if (platform) {
          where.platform = platform;
      }

      return await PaymentTransaction.findAll({
          attributes: [
              [fn('DATE', col('approval_date')), 'saleDate'],
              [fn('SUM', col('amount')), 'totalAmount']
          ],
          where,
          group: [fn('DATE', col('approval_date'))],
          order: [[fn('DATE', col('approval_date')), 'DESC']],
          raw: true
      });
  }

  /**
   * 시간별 매출 (특정 일자 0~23시)
   */
  async getHourlySalesHistory({ platform, date }) {
    const sequelize = PaymentTransaction.sequelize;
    const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
    const rows = await sequelize.query(
      `SELECT HOUR(approval_date) AS hour, COALESCE(SUM(amount), 0) AS totalAmount
       FROM PAYMENT_TRANSACTION
       WHERE payment_status = 'APPROVED'
         AND DATE(approval_date) = :dateStr
         ${platform ? 'AND platform = :platform' : ''}
       GROUP BY HOUR(approval_date)
       ORDER BY hour`,
      {
        replacements: { dateStr, ...(platform && { platform }) },
        type: sequelize.QueryTypes.SELECT
      }
    );
    const byHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, totalAmount: 0 }));
    (rows || []).forEach((r) => {
      byHour[Number(r.hour)] = { hour: Number(r.hour), totalAmount: Number(r.totalAmount) };
    });
    return byHour;
  }

  /**
   * 월별 매출 (기간 내 년-월별 집계)
   */
  async getMonthlySalesHistory({ platform, startDate, endDate }) {
    const sequelize = PaymentTransaction.sequelize;
    const rows = await sequelize.query(
      `SELECT DATE_FORMAT(approval_date, '%Y-%m') AS yearMonth, COALESCE(SUM(amount), 0) AS totalAmount
       FROM PAYMENT_TRANSACTION
       WHERE payment_status = 'APPROVED'
         AND approval_date BETWEEN :startDate AND :endDate
         ${platform ? 'AND platform = :platform' : ''}
       GROUP BY DATE_FORMAT(approval_date, '%Y-%m')
       ORDER BY yearMonth`,
      {
        replacements: { startDate, endDate, ...(platform && { platform }) },
        type: sequelize.QueryTypes.SELECT
      }
    );
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * 상품별 판매 건수 (기간 선택, ReportHistory.goods_type 기준)
   */
  async getSalesCountByGoods({ platform, startDate, endDate }) {
    const sequelize = PaymentTransaction.sequelize;
    const hasRange = startDate && endDate;
    const replacements = { platform: platform || null };
    if (hasRange) {
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    }
    const whereClause = hasRange
      ? 'AND pt.approval_date BETWEEN :startDate AND :endDate'
      : '';
    const rows = await sequelize.query(
      `SELECT COALESCE(rh.goods_type, '미분류') AS goodsCode, COUNT(*) AS count
       FROM PAYMENT_TRANSACTION pt
       LEFT JOIN REPORT_HISTORY rh ON pt.shop_order_no = rh.shop_order_no
       WHERE pt.payment_status = 'APPROVED'
         AND (:platform IS NULL OR pt.platform = :platform)
         ${whereClause}
       GROUP BY COALESCE(rh.goods_type, '미분류')
       ORDER BY count DESC`,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }
    );
    return Array.isArray(rows) ? rows : [];
  }

// src/framework/web/repository/PaymentTransactionRepository.js

async getDailyApprovedAmount(platform) {
  // [수정] 자바스크립트 Date 객체를 생성해서 비교하는 대신, 
  // DB의 DATE(approval_date) 함수와 현재 날짜(CURDATE)를 직접 비교합니다.
  const where = {
    paymentStatus: PaymentStatus.APPROVED, // 승인된 건만
  };

  if (platform) {
    where.platform = platform;
  }

  const result = await PaymentTransaction.findOne({
    attributes: [
      [fn('SUM', col('amount')), 'totalAmount']
    ],
    where: {
      ...where,
      // [핵심 포인트] 서버 시간대와 상관없이 DB의 오늘 날짜와 레코드의 날짜를 직접 비교
      [Op.and]: [
        literal("DATE(approval_date) = CURDATE()")
      ]
    },
    raw: true
  });

  // 결과가 null이면 0을 반환하고, 숫자로 형변환하여 리턴
  return Number(result?.totalAmount || 0);
}

  /**
   * 한달 매출 조회 (현재 월 기준)
   */
  async getMonthlySales(platform, year = null, month = null) {
    const where = {
      paymentStatus: PaymentStatus.APPROVED, // 승인된 건만
    };

    if (platform) {
      where.platform = platform;
    }

    // year와 month가 제공되지 않으면 현재 월 사용
    if (!year || !month) {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1; // getMonth()는 0부터 시작하므로 +1
    }

    const result = await PaymentTransaction.findOne({
      attributes: [
        [fn('SUM', col('amount')), 'totalAmount']
      ],
      where: {
        ...where,
        // 현재 월의 첫날부터 마지막 날까지
        [Op.and]: [
          literal(`YEAR(approval_date) = ${year}`),
          literal(`MONTH(approval_date) = ${month}`)
        ]
      },
      raw: true
    });

    // 결과가 null이면 0을 반환하고, 숫자로 형변환하여 리턴
    return Number(result?.totalAmount || 0);
  }

  /**
   * 결제 등록 시 INSERT
   */
  async createPayment(data) {
    return await PaymentTransaction.create(data);
  }

  /**
   * shopOrderNo로 UPDATE
   */
  async updateByShopOrderNo(shopOrderNo, updateData) {
    const [affectedRows] = await PaymentTransaction.update(updateData, {
      where: { shopOrderNo },
    });
      console.log(
    "[updateByShopOrderNo]",
    "shopOrderNo =", shopOrderNo,
    "updateData =", updateData,
    "affectedRows =", affectedRows
  );
    return affectedRows > 0;
  }

  /**
   * ✅ ID로 UPDATE (추가됨)
   */
  async updateById(id, updateData) {
      console.log(`[Repo] Updating PaymentTransaction ID ${id} with data:`, updateData);
      const [affectedRows] = await PaymentTransaction.update(updateData, {
        where: { id: id },
        returning: false // Do not return the updated object directly for safety
      });
      console.log(`[Repo] PaymentTransaction update result (affected rows): ${affectedRows}`);

      // Return the updated object by fetching it again if update was successful
      if (affectedRows > 0) {
          return await this.findByIdWithReportHistory(id); // Return joined data
      }
      return null; // Return null if update failed
  }

  /**
   * shopOrderNo로 SELECT (단일 건)
   */
async findByShopOrderNo(shopOrderNo) {
    // shopValueJson을 포함하도록 attributes 추가 (이메일 추출 위해)
    return await PaymentTransaction.findOne({
      where: { shopOrderNo },
      // attributes: {
      //   // [수정]: 필요한 모든 필드를 명시적으로 포함합니다.
      //   include: ['shopValueJson', 'payMethodTypeCode', 'paymentStatus', 'authorizationId', 'amount']
      // },
      raw: true // 결과를 Plain Object로 받기
    });
  }
  


  /**
   * ✅ ID로 SELECT (단일 건, 추가됨)
   */
  async findById(id) {
      return await PaymentTransaction.findByPk(id); // Use findByPk for primary key lookup
  }

  /**
   * ✅ shopOrderNo로 SELECT (ReportHistory 포함, 추가됨)
   */
  async findByShopOrderNoWithReportHistory(shopOrderNo) {
      return await PaymentTransaction.findOne({
          where: { shopOrderNo },
          include: [{
              model: ReportHistory,
              as: 'reportHistory', // Must match 'as' in model definition
              required: false // LEFT JOIN
          }]
      });
  }

   /**
   * ✅ ID로 SELECT (ReportHistory 포함, 추가됨)
   */
  async findByIdWithReportHistory(id) {
      return await PaymentTransaction.findOne({
          where: { id: id },
          include: [{
              model: ReportHistory,
              as: 'reportHistory',
              required: false
          }]
      });
  }


  /**
   * ✅ 페이징 목록 조회 (where 절 직접 받도록 수정)
   */
  async findAllByPaging({ limit, offset, where }) { // Receive where object directly
    console.log("[Repo] findAllByPaging called with:", { limit, offset, where });
    return await PaymentTransaction.findAndCountAll({
      where: where || {}, // Use the provided where clause
      include: [
        {
          model: ReportHistory,
          as: "reportHistory", // Ensure this alias matches the association in PaymentTransaction model
          required: false, // LEFT JOIN is usually preferred for listing
          // Select only necessary attributes from ReportHistory
          attributes: ['id', 'goodsType', 'userInfo', 'reportInfo']
        },
      ],
      limit: limit,
      offset: offset,
      order: [["id", "DESC"]], // Order by latest payment transaction
      distinct: true // Recommended when using include and limit
    });
  }

  async findApprovedOneByTelAndPw({ userTelNo, userPw, platform }) { 
    return await PaymentTransaction.findOne({
      where: { 
        userTelNo, 
        userPw, 
        platform,
        paymentStatus: PaymentStatus.APPROVED 
      },
      attributes: ['shopOrderNo', 'createdDtm'], // 주문번호와 생성일시만 필요
      order: [["createdDtm", "DESC"]], 
      raw: true 
    });
  }

}

const paymentTransactionRepository = new PaymentTransactionRepository();
export default paymentTransactionRepository;