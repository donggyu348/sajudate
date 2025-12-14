import express from "express";
import { sendReportLink } from "../../service/SmsService.js";

const router = express.Router();

router.post("/send", async (req, res) => {
  const { receiver } = req.body;
  try {
    const result = await sendReportLink(receiver, 'ORD-20250730014446-ELRL9Y', 'CLASSIC', 'https://unse-jeojangso.kr');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
export default router;
