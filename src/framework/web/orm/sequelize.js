import { Sequelize, DataTypes } from "sequelize";
import config from "./config.js";

// 1. 개별 모델 파일들을 임포트합니다.
import usersModel from "./models/users.js";
import adminsModel from "./models/admins.js";
import reportHistoryModel from "./models/reportHistory.js";
import paymentTransactionModel from "./models/paymentTransaction.js";
import couponsModel from "./models/coupons.js";

const env = "product";
const dbConf = config[env];

if (!dbConf || !dbConf.dialect) {
  throw new Error(`Invalid DB config for environment: ${env}`);
}

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

// 2. 모델들을 Sequelize 인스턴스에 연결하여 초기화합니다.
const users = usersModel(sequelize, DataTypes);
const admins = adminsModel(sequelize, DataTypes);
const reportHistory = reportHistoryModel(sequelize, DataTypes);
const paymentTransaction = paymentTransactionModel(sequelize, DataTypes);
const coupons = couponsModel(sequelize, DataTypes);

// 3. sajuRouter.js 등에서 사용할 수 있도록 모델들을 내보냅니다.
export {
  users,
  admins,
  reportHistory,
  paymentTransaction,
  coupons
};

export default sequelize;