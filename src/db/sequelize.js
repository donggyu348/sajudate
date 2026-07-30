import { Sequelize } from 'sequelize';

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_NAME = 'psychology_platform',
  DB_USER = 'root',
  DB_PASSWORD = '',
  NODE_ENV = 'development',
} = process.env;

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: Number(DB_PORT),
  dialect: 'mysql',
  logging: NODE_ENV === 'development' ? console.log : false,
  define: {
    underscored: false,
    freezeTableName: false,
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

export async function assertDbConnection() {
  await sequelize.authenticate();
}
