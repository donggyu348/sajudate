import { Sequelize, DataTypes } from "sequelize";
import config from "./config.js";

const env = "product";
const dbConf = config[env];

// 1. 먼저 DB 연결 인스턴스(sequelize)를 생성합니다.
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

// 2. 인스턴스 생성 후에 모델 파일들을 '동적'으로 불러옵니다. (순서 보장)
// 이 부분이 top-level import와 달리 실행 시점에 로드되므로 에러를 피할 수 있습니다.
import usersModel from "./models/users.js";
import adminsModel from "./models/admins.js";
import reportHistoryModel from "./models/reportHistory.js";
import paymentTransactionModel from "./models/paymentTransaction.js";
import couponsModel from "./models/coupons.js";

// 3. 모델 초기화
export const users = usersModel(sequelize, DataTypes);
export const admins = adminsModel(sequelize, DataTypes);
export const reportHistory = reportHistoryModel(sequelize, DataTypes);
export const paymentTransaction = paymentTransactionModel(sequelize, DataTypes);
export const coupons = couponsModel(sequelize, DataTypes);

export default sequelize;