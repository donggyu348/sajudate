/**
 * coupons 테이블을 Coupons 모델(src/framework/web/orm/models/coupons.js)에 맞춥니다.
 *
 * 구 스키마: id, code, type, is_used, received_phone
 * 모델 기대: id, code, type, isUsed, receivedPhone, goodsType, createdAt, updatedAt
 *
 * 이 불일치 때문에 번들 무료티켓 발급과 카카오 채널 쿠폰 기록이 모두 실패한다.
 * 이미 맞춰진 컬럼은 건너뛰므로 여러 번 실행해도 안전하다.
 *
 * 사용법:
 *   node --import ./src/loadEnv.js src/fix-coupons-columns.js
 */
import sequelize from "./framework/web/orm/sequelize.js";

async function columnNames() {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupons'`
  );
  return rows.map((r) => r.COLUMN_NAME);
}

async function run() {
  try {
    if (sequelize.getDialect() !== "mysql") {
      console.log("이 스크립트는 MySQL 전용입니다.");
      return;
    }

    let cols = await columnNames();
    if (cols.length === 0) {
      console.log("coupons 테이블이 없습니다. initDB로 먼저 생성하세요.");
      return;
    }
    console.log("현재 컬럼:", cols.join(", "));

    // 1) is_used → isUsed
    if (cols.includes("is_used") && !cols.includes("isUsed")) {
      await sequelize.query(
        "ALTER TABLE coupons CHANGE COLUMN `is_used` `isUsed` TINYINT(1) NOT NULL DEFAULT 0"
      );
      console.log("is_used → isUsed 로 변경했습니다.");
    } else if (!cols.includes("isUsed")) {
      await sequelize.query("ALTER TABLE coupons ADD COLUMN `isUsed` TINYINT(1) NOT NULL DEFAULT 0");
      console.log("isUsed 컬럼을 추가했습니다.");
    }

    // 2) received_phone → receivedPhone
    if (cols.includes("received_phone") && !cols.includes("receivedPhone")) {
      await sequelize.query(
        "ALTER TABLE coupons CHANGE COLUMN `received_phone` `receivedPhone` VARCHAR(255) NULL"
      );
      console.log("received_phone → receivedPhone 로 변경했습니다.");
    } else if (!cols.includes("receivedPhone")) {
      await sequelize.query("ALTER TABLE coupons ADD COLUMN `receivedPhone` VARCHAR(255) NULL");
      console.log("receivedPhone 컬럼을 추가했습니다.");
    }

    // 3) goodsType (번들 티켓 종류 / 채널 쿠폰 상태 저장)
    if (!cols.includes("goodsType")) {
      await sequelize.query("ALTER TABLE coupons ADD COLUMN `goodsType` VARCHAR(255) NULL");
      console.log("goodsType 컬럼을 추가했습니다.");
    }

    // 4) timestamps (모델이 timestamps: true)
    if (!cols.includes("createdAt")) {
      await sequelize.query(
        "ALTER TABLE coupons ADD COLUMN `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
      );
      console.log("createdAt 컬럼을 추가했습니다.");
    }
    if (!cols.includes("updatedAt")) {
      await sequelize.query(
        "ALTER TABLE coupons ADD COLUMN `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
      );
      console.log("updatedAt 컬럼을 추가했습니다.");
    }

    cols = await columnNames();
    console.log("완료. 최종 컬럼:", cols.join(", "));
  } catch (err) {
    console.error("에러:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
