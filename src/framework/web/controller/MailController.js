import PostCounselingMailDto from "../domain/mail/dto/req/PostCounselingMailDto.js";
import statusCode from "../enums/StatusCode.js";
import errorCode from "../enums/ErrorCode.js";
import {getClientIp, makeResponse} from "../utils/CommonUtils.js";
import PostCounselingMailUseCase from "../domain/mail/useCase/PostCounselingMailUseCase.js";
import geoip from "geoip-lite";

const MailController = {
    // POST 상담신청 이메일 발송
    postCounselingMail: async (req, res) => {
        try {
            // IP 주소 획득
            const ip = getClientIp(req);
            // IP 지리위치 정보 조회
            const geo = geoip.lookup(ip);
            // 한국 IP 일때만 메일 발송
            if (geo && geo.country === 'KR') {
                console.log(`[MailController] postCounselingMail - IP: ${ip}, Country: ${geo.country}`);
                console.log(req.headers);
                console.log(req.body);
                console.log(geo);
                console.log(`[MailController] postCounselingMail end`);
                const dto = new PostCounselingMailDto({
                    companyName: req.body.companyName,
                    userName: req.body.userName,
                    position: req.body.position,
                    phoneNum: req.body.phoneNum,
                    email: req.body.email,
                    content: req.body.content
                });
                // 상담신청 이메일 발송
                await new PostCounselingMailUseCase().execute(dto);
            }
            return res.status(statusCode.SUCCESS).send(makeResponse(statusCode.SUCCESS, "success", "성공", {}));
        } catch (error) {
            console.log(error);
            return res.status(statusCode.ERROR).send(makeResponse(errorCode.INTERNAL_SERVER_ERROR.code, "fail", errorCode.INTERNAL_SERVER_ERROR.info, error));
        }
    },
}

export default MailController;