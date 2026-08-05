import { createApp } from './app.js';
import { sequelize } from './models/index.js';
import { assertDbConnection } from './db/sequelize.js';

const PORT = Number(process.env.PORT || 3000);

// 운영 환경에서 기본값(dev-secret/admin)으로 뜨면 세션 위조·관리자 무단 접근으로 바로 이어지므로
// 프로덕션에서는 이 값들이 실제로 설정돼 있지 않으면 아예 기동을 막는다.
function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!process.env.FIELD_ENCRYPTION_KEY) missing.push('FIELD_ENCRYPTION_KEY');
  if (missing.length) {
    console.error(`[server] 운영 환경(NODE_ENV=production)에서 ${missing.join(', ')} 값이 설정되지 않았습니다.`);
    console.error('  → .env에 강한 랜덤 값을 채운 뒤 다시 실행하세요. (예: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")');
    process.exit(1);
  }
}

async function start() {
  assertProductionSecrets();
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
