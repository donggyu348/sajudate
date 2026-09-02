import { Sequelize } from "sequelize";

import config from "./config.js";

const env = process.env.NODE_ENV === "product" ? "product" : "local";
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
    logging: dbConf.logging,

    /*
     * 커넥션 풀.
     *
     * 설정이 없으면 Sequelize 기본값(max 5, idle 10초)으로 도는데,
     * RDS는 유휴 커넥션을 wait_timeout이 지나면 끊는다. 풀은 그 사실을 모른 채
     * 죽은 커넥션을 그대로 쥐고 있다가 다음 쿼리에서 터진다.
     * 관리자 페이지처럼 가끔 들어가는 화면에서 목록이 잘려 보이던 원인이다.
     *
     * evict/idle을 wait_timeout보다 훨씬 짧게 잡아 죽기 전에 우리가 먼저 버린다.
     */
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,   // 커넥션을 못 얻으면 30초 뒤 실패 (무한 대기 방지)
      idle: 10000,      // 10초 놀면 반납
      evict: 5000,      // 5초마다 유휴 커넥션 청소
    },

    dialectOptions: {
      connectTimeout: 20000,
      // TCP keepalive — 중간 장비가 조용한 연결을 끊는 것을 막는다
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    },

    /*
     * 끊어진 커넥션을 잡았을 때의 재시도.
     * 아래 오류들은 "연결이 죽었다"는 뜻일 뿐 쿼리 자체는 멀쩡하므로,
     * 새 커넥션으로 다시 시도하면 그냥 성공한다.
     */
    retry: {
      max: 3,
      match: [
        /ETIMEDOUT/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /EPIPE/,
        /EHOSTUNREACH/,
        /PROTOCOL_CONNECTION_LOST/,
        /Connection lost/i,
        /read ECONNRESET/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeConnectionTimedOutError/,
      ],
    },
  }
);

export default sequelize;
