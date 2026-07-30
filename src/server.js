import { createApp } from './app.js';
import { sequelize } from './models/index.js';
import { assertDbConnection } from './db/sequelize.js';

const PORT = Number(process.env.PORT || 3000);

async function start() {
  try {
    await assertDbConnection();
    // 개발 편의를 위한 자동 동기화 (운영은 마이그레이션 권장)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
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
