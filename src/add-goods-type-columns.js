/**
 * 29금 사주(ADULT), 번들(ADULT_BUNDLE) 등 새 상품 코드를 DB에 저장할 수 있도록
 * goods_type 컬럼을 추가/수정합니다.
 *
 * - REPORT_HISTORY: goods_type 이 ENUM이면 VARCHAR(50)으로 변경 (모든 상품 코드 허용)
 * - PAYMENT_TRANSACTION: goods_type 컬럼이 없으면 VARCHAR(50)으로 추가
 *
 * 사용법:
 *   node -r dotenv/config src/add-goods-type-columns.js
 * (로컬 DB: DOTENV_CONFIG_PATH=.env.local node -r dotenv/config src/add-goods-type-columns.js)
 */
import sequelize from "./framework/web/orm/sequelize.js";

async function run() {
  try {
    const dialect = sequelize.getDialect();
    if (dialect !== "mysql") {
      console.log("이 스크립트는 MySQL 전용입니다. dialect:", dialect);
      process.exit(0);
      return;
    }

    // 1) REPORT_HISTORY.goods_type → VARCHAR(50) 으로 통일 (ENUM이면 값 제한 없이 저장 가능하게)
    const [rhCols] = await sequelize.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'REPORT_HISTORY' AND COLUMN_NAME = 'goods_type'`
    );
    if (rhCols && rhCols.length > 0) {
      const col = rhCols[0];
      if (col.DATA_TYPE === "enum" || (col.COLUMN_TYPE && col.COLUMN_TYPE.toUpperCase().startsWith("ENUM"))) {
        await sequelize.query(
          `ALTER TABLE REPORT_HISTORY MODIFY COLUMN goods_type VARCHAR(50) NULL COMMENT '상품타입'`
        );
        console.log("REPORT_HISTORY.goods_type 을 VARCHAR(50)으로 변경했습니다. (ADULT, ADULT_BUNDLE 등 저장 가능)");
      } else {
        console.log("REPORT_HISTORY.goods_type 은 이미 VARCHAR 계열입니다. 변경 없음.");
      }
    } else {
      await sequelize.query(
        `ALTER TABLE REPORT_HISTORY ADD COLUMN goods_type VARCHAR(50) NULL COMMENT '상품타입'`
      );
      console.log("REPORT_HISTORY.goods_type 컬럼을 추가했습니다.");
    }

    // 2) PAYMENT_TRANSACTION.goods_type 없으면 추가
    const [ptCols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PAYMENT_TRANSACTION' AND COLUMN_NAME = 'goods_type'`
    );
    if (!ptCols || ptCols.length === 0) {
      await sequelize.query(
        `ALTER TABLE PAYMENT_TRANSACTION ADD COLUMN goods_type VARCHAR(50) NULL COMMENT '상품타입'`
      );
      console.log("PAYMENT_TRANSACTION.goods_type 컬럼을 추가했습니다.");
    } else {
      const [ptType] = await sequelize.query(
        `SELECT DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PAYMENT_TRANSACTION' AND COLUMN_NAME = 'goods_type'`
      );
      const col = ptType && ptType[0];
      if (col && (col.DATA_TYPE === "enum" || (col.COLUMN_TYPE && col.COLUMN_TYPE.toUpperCase().startsWith("ENUM")))) {
        await sequelize.query(
          `ALTER TABLE PAYMENT_TRANSACTION MODIFY COLUMN goods_type VARCHAR(50) NULL COMMENT '상품타입'`
        );
        console.log("PAYMENT_TRANSACTION.goods_type 을 VARCHAR(50)으로 변경했습니다.");
      } else {
        console.log("PAYMENT_TRANSACTION.goods_type 은 이미 존재하며 VARCHAR 계열입니다. 변경 없음.");
      }
    }

    console.log("상품 타입(29금/번들) DB 반영 완료.");
  } catch (err) {
    console.error("에러:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
