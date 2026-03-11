/**
 * PAYMENT_TRANSACTION 테이블에 tid 컬럼이 없으면 추가합니다.
 * 결제 콜백(카카오/토스) 후 리포트 페이지로 갈 때 "Unknown column 'tid'" 에러 방지용.
 *
 * 사용법: node -r dotenv/config src/add-tid-column.js
 * (로컬 DB 사용 시 DOTENV_CONFIG_PATH=.env.local 권장)
 */
import sequelize from "./framework/web/orm/sequelize.js";

async function addTidColumn() {
  try {
    const [rows] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PAYMENT_TRANSACTION' AND COLUMN_NAME = 'tid'`
    );
    if (rows && rows.length > 0) {
      console.log("tid 컬럼이 이미 존재합니다.");
      process.exit(0);
      return;
    }
    await sequelize.query(
      "ALTER TABLE PAYMENT_TRANSACTION ADD COLUMN tid VARCHAR(255) NULL COMMENT 'PG 거래 ID (카카오페이 등)' AFTER shop_value_json"
    );
    console.log("PAYMENT_TRANSACTION.tid 컬럼을 추가했습니다.");
  } catch (err) {
    console.error("에러:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

addTidColumn();
