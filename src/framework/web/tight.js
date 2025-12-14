import "dotenv/config";
import { createServer } from "http";
import bodyParser from "body-parser";
import camelcaseKeys from "camelcase-keys";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import session from "express-session";

import sajuRouter from "./router/tight/sajuRouter.js";
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
app.set("trust proxy", true);

app.use((req, res, next) => {
  // 프록시 뒤 HTTPS 감지
  const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");

  if (proto !== "https") {
    return res.redirect(301, "https://www.sajudate.store" + req.originalUrl);
  }

  next();
});

app.use(session({
  secret: "tight123456",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24시간
    secure: false, // HTTP/HTTPS 모두 허용 (배포 시는 HTTPS에서 true로)
  }
}));

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