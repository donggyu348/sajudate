import sequelize from "./framework/web/orm/sequelize.js";
import "./framework/web/orm/models/paymentTransaction.js";
import "./framework/web/orm/models/reportHistory.js";
import "./framework/web/orm/models/smsHistory.js";
import "./framework/web/orm/models/admins.js";
import "./framework/web/orm/models/users.js";
import "./framework/web/orm/models/coupons.js";

const alter = String(process.env.DB_ALTER || '').toLowerCase() === 'true';

async function ensureTidColumn() {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PAYMENT_TRANSACTION' AND COLUMN_NAME = 'tid'`
  );
  if (rows?.length > 0) return;
  await sequelize.query(
    "ALTER TABLE PAYMENT_TRANSACTION ADD COLUMN tid VARCHAR(255) NULL COMMENT 'PG 거래 ID (카카오페이 등)' AFTER shop_value_json"
  );
  console.log("PAYMENT_TRANSACTION.tid 컬럼을 추가했습니다.");
}

sequelize.sync({ alter }).then(async () => {
  await ensureTidColumn();
  console.log(process.env.NODE_ENV);
  console.log(`테이블 동기화 완료 (alter=${alter})`);
  await sequelize.close();
  process.exit();
}).catch(async (err) => {
  console.error("initDB 실패:", err);
  await sequelize.close();
  process.exit(1);
});