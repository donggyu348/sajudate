import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectSessionSequelize from 'connect-session-sequelize';
import expressLayouts from 'express-ejs-layouts';
import morgan from 'morgan';

import homeRouter from './routes/home.js';
import adminRouter from './routes/admin.js';
import agentAdminRouter from './routes/agent-admin.js';
import { sequelize } from './db/sequelize.js';
import { mountProductModules } from './products/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Nginx 등 리버스 프록시 뒤에서 동작 — X-Forwarded-Proto를 신뢰해야 req.protocol이 https로 잡히고
  // (결제 successUrl/failUrl이 https로 생성됨) secure 쿠키도 정상 전송된다.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // 뷰 엔진
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layouts/base');

  // 미들웨어
  // 이 도메인에서 예전에 서비스하던 사이트의 경로를 봇/캐시가 계속 긁어 404 로그가 쌓인다.
  // 우리 코드에는 없는 경로이므로, 그런 404만 로그에서 빼서 진짜 오류가 묻히지 않게 한다.
  const STALE_PATHS = /^\/(meta\.json|sitemap\.xml|ads\.txt|saju|\.well-known\/|assets\/images\/)/;
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      morgan('dev', {
        skip: (req, res) => res.statusCode === 404 && STALE_PATHS.test(req.path),
      })
    );
  }
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // 세션 저장소는 MySQL(Sequelize) 사용 — 기본 MemoryStore는 서버 재시작/멀티프로세스에서
  // 진행 중인 진단 세션이 통째로 날아가고 메모리 누수도 있어 운영에 쓸 수 없다.
  const SequelizeStore = connectSessionSequelize(session.Store);
  const sessionStore = new SequelizeStore({ db: sequelize, tableName: 'sessions' });
  sessionStore.sync();

  app.use(
    session({
      name: 'haedap.sid',
      secret: process.env.SESSION_SECRET || 'dev-secret',
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      // Nginx/Apache 뒤에서 X-Forwarded-Proto를 보고 secure 쿠키를 결정한다.
      // secure:true 고정이면 HTTP로 들어올 때 브라우저가 쿠키를 버려 로그인이 즉시 풀린다.
      proxy: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
        maxAge: 1000 * 60 * 60 * 6,
        path: '/',
      },
    })
  );

  // 리포트 주소에 박히는 publicId(UUID). 링크만으로 열리는 구조라 추측 불가능해야 해서 쓰는 값이지만,
  // 그대로 GA4에 보내면 리포트 1건이 곧 페이지 1개가 되어 조회수가 전부 1로 흩어진다.
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  // 뷰 전역 변수
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    // 분석 도구에 보낼 경로 — 실제 주소는 그대로 두고 UUID 자리만 자리표시자로 바꾼다.
    // 예: /report/15daa9f6-... → /report/:reportId (리포트 전체가 한 페이지로 집계됨)
    res.locals.gaPath = req.path.replace(UUID_RE, ':reportId');
    next();
  });

  // 관리자 — 결제내역(/admin)과 AI 에이전트 관리(/agent-admin)는 별도 페이지로 분리
  app.use('/admin', adminRouter);
  app.use('/agent-admin', agentAdminRouter);

  // 상품 전용 모듈이 /products/:slug 를 먼저 가로챈다.
  mountProductModules(app);

  // 플랫폼 공통 라우트 (홈, 일반 상품 상세)
  app.use('/', homeRouter);

  // 404
  app.use((req, res) => {
    res.status(404).render('platform/404', { title: '페이지를 찾을 수 없음', activeTab: null });
  });

  // 에러 핸들러
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || 500;
    res.status(status).render('platform/error', {
      title: '오류',
      activeTab: null,
      message:
        process.env.NODE_ENV === 'production' ? '문제가 발생했습니다.' : err.message,
    });
  });

  return app;
}
