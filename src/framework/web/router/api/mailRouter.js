import { Router } from "express";

import MailController from "../../controller/MailController.js";

const mailRouter = new Router();

// POST 상담신청 이메일 발송
mailRouter.post("/counseling", MailController.postCounselingMail);

export default mailRouter;