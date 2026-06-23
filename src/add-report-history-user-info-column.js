/**
 * REPORT_HISTORY.user_info JSON 컬럼이 없을 때 추가합니다.
 *
 * 사용법:
 *   node src/add-report-history-user-info-column.js
 */
import sequelize from "./framework/web/orm/sequelize.js";

async function run() {
  try {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'REPORT_HISTORY' AND COLUMN_NAME = 'user_info'`
    );

    if (cols && cols.length > 0) {
      console.log("REPORT_HISTORY.user_info 컬럼이 이미 존재합니다.");
      return;
    }

    await sequelize.query(
      `ALTER TABLE REPORT_HISTORY ADD COLUMN user_info JSON NULL COMMENT '사용자 입력 정보' AFTER goods_type`
    );
    console.log("REPORT_HISTORY.user_info 컬럼을 추가했습니다.");
  } catch (err) {
    console.error("에러:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
