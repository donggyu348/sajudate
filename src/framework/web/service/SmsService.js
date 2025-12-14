import AligoClient from "../api/AligoClient.js";
import smsHistoryRepository from "../repository/SmsHistoryRepository.js";
import { SmsStatus } from "../enums/Sms.js";
import { GoodsType } from "../enums/Goods.js";

/**
 * 단순 SMS 발송 서비스
 * @param {string} receiver - 수신자 전화번호
 * @param {string} message - 문자 내용
 * @returns {Promise<Object>}
 */
export async function sendReportLink(receiver, shopOrderNo, goodsType, domain) {
  if (!receiver || !shopOrderNo) {
    throw new Error("receiver와 shopOrderNo 필수입니다.");
  }

  const message = `프리미엄 사주를 결제해주셔서 감사합니다.\n아래 링크에서 리포트를 확인하세요.\n ${domain}/saju/report?shopOrderNo=${shopOrderNo}`;

  const reqData = {
    receivers: [receiver],
    message,
    msgType: "LMS"
  };

  const result = await AligoClient.sendMessage(reqData);

  let status = SmsStatus.FAILED;
  if (result?.message == 'success') {
    status = SmsStatus.SUCCESS;
  }

  const goodsInfo = GoodsType[goodsType];

  console.log('#1');
  console.log(goodsType);
  console.log(goodsInfo);
  console.log(goodsInfo.platform);

  await smsHistoryRepository.createSmsHistory({
    status: status,
    phoneNumber: receiver,
    shopOrderNo: shopOrderNo,
    platform: goodsInfo.platform,
    requestJson: reqData,
    responseJson: result
  });

  return result;
}