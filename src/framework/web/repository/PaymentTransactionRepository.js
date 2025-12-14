import PaymentTransaction from "../orm/models/paymentTransaction.js";
import ReportHistory from "../orm/models/reportHistory.js";
import { Op, fn, col, literal } from "sequelize"; // Op, fn, col import 추가
class PaymentTransactionRepository {

async getDailyApprovedAmount(platform) {
    // [핵심 수정 시작] 서버가 UTC일 때 KST '오늘' 날짜를 정확히 구합니다.
    // KST는 UTC보다 9시간 빠릅니다.
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(new Date().getTime() + kstOffset);
    // YYYY-MM-DD 형식 문자열을 생성하여 DB의 DATE() 함수와 일치시킵니다.
    const todayString = kstDate.toISOString().slice(0, 10); 
    // [핵심 수정 끝]
    
    // 기존 Op.between 대신 literal 쿼리를 사용하여 DB 레벨에서 DATE 비교를 강제합니다.
    const where = {
        paymentStatus: 'APPROVED', 
        [Op.and]: [
            // [수정 포인트] approval_date의 날짜 부분만 추출하여 오늘 KST 날짜와 비교합니다.
            literal(`DATE(approval_date) = '${todayString}'`)
        ]
    };

    if (platform) {
      where.platform = platform;
    }

    const result = await PaymentTransaction.findOne({
      attributes: [
        [fn('SUM', col('amount')), 'totalAmount']
      ],
      where,
      raw: true
    });

    return result?.totalAmount || 0;
  }
  
  /**
   * [6] 기간별 일일 매출액을 조회 (날짜별 그룹화)
   */
  async getDailySalesHistory({ platform, startDate, endDate }) {
      const where = {
          paymentStatus: 'APPROVED',
          approvalDate: {
              [Op.between]: [startDate, endDate]
          }
      };

      if (platform) {
          where.platform = platform;
      }

      return await PaymentTransaction.findAll({
          attributes: [
              // [안정화 유지] DATE_FORMAT을 사용하여 YYYY-MM-DD 형식으로 그룹화
              [fn('DATE_FORMAT', col('approval_date'), '%Y-%m-%d'), 'saleDate'], 
              [fn('SUM', col('amount')), 'totalAmount']
          ],
          where,
          group: ['saleDate'],
          order: [['saleDate', 'DESC']],
          raw: true
      });
  }





  
  /**
   * [1] 결제 등록 시 INSERT
   */
  async createPayment(data) {
    return await PaymentTransaction.create(data);
  }

  /**
   * [2] callback or 승인 이후 UPDATE
   */
  async updateByShopOrderNo(shopOrderNo, updateData) {
    return await PaymentTransaction.update(updateData, {
      where: { shopOrderNo },
    });
  }

  /**
   * [3] 조회용 SELECT
   */
  async findByShopOrderNo(shopOrderNo) {
    return await PaymentTransaction.findOne({
      where: { shopOrderNo },
    });
  }

  /**
   * [4] 페이징 목록 조회
   */
  async findAllByPaging({ limit, offset, paymentStatus, platform, userIdx }) {
    const where = {};
    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }
    if (platform) {
      where.platform = platform;
    }
    if (userIdx) {
      where.userIdx = userIdx;
    }

    return await PaymentTransaction.findAndCountAll({
      where,
      include: [
        {
          model: ReportHistory,
          as: "reportHistory",
          required: false,
          attributes: [["goods_type", "goodsType"]],
        },
      ],
      limit,
      offset,
      order: [["id", "DESC"]],
    });
  }


}

const paymentTransactionRepository = new PaymentTransactionRepository();
export default paymentTransactionRepository;