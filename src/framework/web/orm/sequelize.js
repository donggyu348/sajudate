import { Sequelize, DataTypes } from "sequelize";
import config from "./config.js";
import usersModel from "./models/users.js"; // 추가
import couponsModel from "./models/coupons.js"; // 추가

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

// 문제가 되는 모델들을 여기서 초기화해서 내보냅니다.
export const users = usersModel(sequelize, DataTypes);
export const coupons = couponsModel(sequelize, DataTypes);

export default sequelize;