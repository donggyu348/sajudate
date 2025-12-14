import { Sequelize } from "sequelize";

import config from "./config.js";

// const env = process.env.NODE_ENV || "local";
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

export default sequelize;
