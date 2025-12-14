export default function errorHandler(err, req, res, next) {
  console.error("[GLOBAL ERROR]", {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    body: req.body,
  });

  res.status(500).json({
    code: "INTERNAL_SERVER_ERROR",
    message: "서버 오류가 발생했습니다.",
  });
}