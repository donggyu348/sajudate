import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import expressLayouts from 'express-ejs-layouts';
import morgan from 'morgan';

import homeRouter from './routes/home.js';
import adminRouter from './routes/admin.js';
import { mountProductModules } from './products/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // 뷰 엔진
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layouts/base');

  // 미들웨어
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 6 },
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
