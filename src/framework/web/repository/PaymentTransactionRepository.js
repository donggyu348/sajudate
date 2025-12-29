
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
          group: ['saleDate'],
          order: [['saleDate', 'DESC']],
          raw: true
      });
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