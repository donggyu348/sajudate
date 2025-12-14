
/* 사주입력 폼 */
// const submitSajuForm = () => {
//
//   const data = {
//     name: $("input[name=\"name\"]").val(),
//     gender: $(".gender-btn.active").val(),
//     birthType: $(".birth-type-btn.active").val(),
//     birthYear: $("select[name=\"birthYear\"]").val(),
//     birthMonth: $("select[name=\"birthMonth\"]").val(),
//     birthDay: $("select[name=\"birthDay\"]").val(),
//     birthTime: $("select[name=\"birthTime\"]").val(),
//     relationshipStatus: $("select[name=\"relationshipStatus\"]").val(),
//     relationshipPeriod: $("select[name=\"relationshipPeriod\"]").val(),
//     question: $("textarea").val()
//   };
//
//   if (
//     !data.name ||
//     !data.gender ||
//     !data.birthType ||
//     !data.birthYear || data.birthYear === "출생년" ||
//     !data.birthMonth || data.birthMonth === "출생월" ||
//     !data.birthDay || data.birthDay === "출생일" ||
//     !data.birthTime
//   ) {
//     alert("필수 항목을 모두 입력해주세요.");
//     return false;
//   }
//
//   fbq('track', 'CompleteRegistration');
//   $("#sajuForm").submit();
//
// };

/* 거래 등록 API 호출 */
const requestRegisterPayment = (data) => {

  return $.post("/api/payments/register", data)
    .done((response) => {
      console.log("거래등록 성공", response);

      // fbq('track', 'InitiatePayment');
      window.open(response.data.authPageUrl, "_blank");
    })
    .fail((error) => {
      console.error("거래등록 실패", error);
    });
}

/* 인증 콜백 API 호출 */
// const data = {
//   shopOrderNo: "ORD-20250709-ABC123",     // 서버에서 생성된 주문번호
//   authorizationId: "21032609005210816913" // 결제창 인증 완료 후 받은 ID
// };
const sendPaymentCallback = (data) => {
  return $.post("/api/payments/callback", data)
    .done((response) => {
      console.log("콜백 처리 성공", response);
    })
    .fail((error) => {
      console.error("콜백 처리 실패", error);
    });
}





