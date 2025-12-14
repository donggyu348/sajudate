import {sendMail} from "../../../service/EmailService.js";

export default class PostCounselingMailUseCase {

    /**
     * 상담문의 메일 발송
     * @param dto
     * @returns {Promise<void>}
     */
    async execute(dto) {
        try {
            // 상담문의는 발신이메일로 받게 고정
            const to = "runner.partners@gmail.com";
            const subject = "Runner Partners 상담문의";
            // NOTE : 메일발송 async 처리
            sendMail({type: "MAT01", to, subject, data: {dto}});
        } catch (error) {
            console.log(error);
        }
    }
}