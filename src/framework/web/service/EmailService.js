import * as nodemailer from "nodemailer";

/**
 * 이메일 발송 함수
 * @param type
 * @param to
 * @param subject
 * @param data
 * @param attachments
 */
export const sendMail = async ({type, to, subject, data = {}}) => {
    let result = true;
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.GMAIL_ID,
                pass: process.env.GMAIL_PW
            }
        });

        const html = getMailTemplate({type, data});

        const mailOptions = {
            from: "runner.partners@gmail.com",
            to,
            subject,
            html,
        };

        const res = await transporter.sendMail(mailOptions);
        if (!res.response.includes("OK")) {
            result = false;
        }
    } catch (error) {
        console.log(error);
        result = false;
    }
    return result;
};

/**
 * 메일 템플릿
 * @param type
 * @param data
 * @returns {string}
 */
export const getMailTemplate = ({type, data}) => {
    let mailContent = "";
    // 상담문의
    if (type === "MAT01") {
        mailContent = counselingMailContent(data.dto);
    }
    return commonMailTemplate(mailContent);
};

/**
 * 이메일 공통 템플릿
 * @param html 본문 내용
 */
function commonMailTemplate(html) {
    return `<div style="padding:30px 30px 24px 30px;">
        <div style="margin: 24px auto;">
           ${html}
        </div>

        <!-- 하단 footer -->
        <table style="width:100%; margin-top:24px;padding-top:24px; border-top: 1px solid #E6E6E6;">
            <tr>
                <td>
                    <div style="
                        font-family: 'Pretendard';
                        font-style: normal;
                        font-weight: 500;
                        font-size: 12px;
                        line-height: 150%;
                        color: #969696;
                        ">
                        <div>러너파트너스</div>
                        <div>사업자번호 : 381-32-01549 | 대표자명 : 조다은 | 주소 : 서울특별시 강남구 역삼로 512, 5층 619호</div>
                    </div>
                </td>
                <td>
                    <div style="
                                    font-family: 'Pretendard';
                                    font-style: normal;
                                    font-weight: 400;
                                    font-size: 10px;
                                    line-height: 150%;
                                    text-align: right;
                                    color: #0F0F0F;
                                    margin-top: 12px;
                                    ">
                        Ⓒ All rights reserved by runner-partners.
                    </div>
                </td>
            </tr>
        </table>
    </div>
`;
}

/**
 * 상담신청
 * @param dto
 * @returns {string}
 */
function counselingMailContent(dto) {
    return `<div style="margin: 48px auto;">
                <div>기업명 : ${dto.companyName}</div>
                <div>담당자명 : ${dto.userName}</div>
                <div>직책 : ${dto.position}</div>
                <div>연락처 : ${dto.phoneNum}</div>
                <div>이메일 : ${dto.email}</div>
                <div>문의내용 : 
                    <br/>
                    ${dto.content}
                </div>
            </div>`;
}
