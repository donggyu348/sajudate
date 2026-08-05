import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectSessionSequelize from 'connect-session-sequelize';
import expressLayouts from 'express-ejs-layouts';
import morgan from 'morgan';

import homeRouter from './routes/home.js';
import adminRouter from './routes/admin.js';
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
      secret: process.env.SESSION_SECRET || 'dev-secret',
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // 운영은 HTTPS 전제 — 쿠키가 평문 HTTP로 새어나가지 않도록 secure 플래그를 켠다.
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 6,
      },
    })
  );

  // 뷰 전역 변수
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
  });

  // 관리자
  app.use('/admin', adminRouter);

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
