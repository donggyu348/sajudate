import { Sequelize, DataTypes } from "sequelize";
import config from "./config.js";

// 모델 파일들을 직접 가져옵니다.
import usersModel from "./models/users.js";
import adminsModel from "./models/admins.js";
import reportHistoryModel from "./models/reportHistory.js";
import paymentTransactionModel from "./models/paymentTransaction.js";
import couponsModel from "./models/coupons.js";

const env = "product";
const dbConf = config[env];

const sequelize = new Sequelize(
  dbConf.database,
  dbConf.username,
  dbConf.password,
  {
    host: dbConf.host,
    port: dbConf.port,
    dialect: dbConf.dialect,
    timezone: dbConf.timezone,
    logging: dbConf.logging
  }
);

/**
 * 🔥 핵심: 각 모델 파일이 함수 형태라고 가정하고 sequelize와 DataTypes를 주입합니다.
 * 만약 모델 파일이 함수가 아니라면, 아래처럼 직접 정의를 실행해줍니다.
 */

// 1. 모델들을 초기화하여 변수에 할당합니다.
const users = usersModel(sequelize, DataTypes);
const admins = adminsModel(sequelize, DataTypes);
const reportHistory = reportHistoryModel(sequelize, DataTypes);
const paymentTransaction = paymentTransactionModel(sequelize, DataTypes);
const coupons = couponsModel(sequelize, DataTypes);

// 2. 다른 파일(sajuRouter.js 등)에서 쓸 수 있도록 이름별로 내보냅니다.
export {
  users,
  admins,
  reportHistory,
  paymentTransaction,
  coupons
};

export default sequelize;