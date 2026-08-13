import "../../loadEnv.js";
console.log("🔑 OPENAI_API_KEY =", process.env.OPENAI_API_KEY ? "(설정됨)" : undefined);

import { createServer } from "http";
import bodyParser from "body-parser";
import camelcaseKeys from "camelcase-keys";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { randomUUID } from "crypto";
import session from "express-session";
import { buildMetaAdvancedMatching } from "./utils/metaAdvancedMatching.js";
import { metaParamBuilderMiddleware } from "./middleware/metaParamBuilder.js";

import sajuRouter from "./router/tight/sajuRouter.js";
import reunionRouter from "./router/tight/reunionRouter.js";
import charmRouter from "./router/tight/charmRouter.js";
import adminRouter from "./router/tight/adminRouter.js";
import paymentRouter from "./router/api/paymentRouter.js";
import errorHandler from "../middleware/errorHandler.js";
import gptRouter from "./router/api/gptRouter.js";
import smsRouter from "./router/api/smsRouter.js";
import userRouter from "./router/tight/userRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(session({
  secret: "tight123456",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24시간
    secure: false, // HTTP/HTTPS 모두 허용 (배포 시는 HTTPS에서 true로)
  }
}));

// Meta 픽셀 ↔ Conversions API PageView 중복 제거용 (서버 페이로드에도 같은 값 사용)
app.use((req, res, next) => {
  res.locals.metaPageViewEventId = randomUUID();
  res.locals.metaAdvancedMatching = buildMetaAdvancedMatching({
    email: req.session?.user?.email,
    phone: req.session?.user?.phone,
    name: req.session?.user?.name,
    gender: req.session?.user?.gender,
  });
  next();
});

// app.js 또는 server.js 최상단에 추가
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  // 이곳에서 Sentry, Slack 등 알림 가능
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  // 서버를 안전하게 종료하거나 알림을 보내고 재시작 전략 필요
});

app.set("trust proxy", true);

// Meta fbc/fbp: Parameter Builder로 _fbc·fbclid 원본 유지 (결제 CAPI 등)
app.use(metaParamBuilderMiddleware);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.disable("x-powered-by");
app.use(
    bodyParser.json({ limit: "1mb" }),
    bodyParser.urlencoded({ limit: "1mb", extended: true }),
    (req, res, next) => {
        req.body = camelcaseKeys(req.body);
        next();
    }
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.static("public"));
app.use("/assets", express.static(path.join(__dirname, "assets")));

app.get("/", (req, res) => {
    res.redirect("/saju");
});




// 재회사주·매혹사주는 sajuRouter보다 먼저 마운트해야 /saju 하위 라우트에 먹히지 않는다
app.use("/saju/reunion", reunionRouter);
app.use("/saju/charm", charmRouter);
app.use("/saju", sajuRouter);
app.use("/admin", adminRouter);
app.use("/user", userRouter);

app.use("/api/payments", paymentRouter);
app.use("/api/gpt", gptRouter);
app.use("/api/sms", smsRouter);

app.use((req, res) => {
  res.redirect("/saju");
});

app.use(errorHandler);

export const listen = (port) => {
    httpServer.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 server start\n▸ Listening port : ${port}`);
};