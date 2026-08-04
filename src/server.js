import { createApp } from './app.js';
import { sequelize } from './models/index.js';
import { assertDbConnection } from './db/sequelize.js';

const PORT = Number(process.env.PORT || 3000);

async function start() {
  try {
    await assertDbConnection();
    // alter:true는 MySQL에서 매 재시작마다 UNIQUE 컬럼에 중복 인덱스를 추가하는 문제가 있어 비활성화.
    // 스키마 변경(컬럼 추가 등)은 새 테이블만 자동 생성되며, 기존 테이블 alter는 수동으로 처리.
    await sequelize.sync();
    console.log('[db] connected & synced');
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    console.error('  → .env 의 DB 설정과 MySQL 구동 여부를 확인하세요.');
    process.exit(1);
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}`);
  });
}

start();
