/**
 * 이지페이 결제수단 코드 ENUM
 */
export const PayMethodTypeCode = Object.freeze({
  CARD: "11",               // 신용카드
  VIRTUAL_ACCOUNT: "21",    // 가상계좌
  MOBILE: "31",             // 휴대폰 결제
  TRANSFER: "22",           // 계좌이체
  SPAY: "23"                // 간편결제
});

/**
 * 결제 요청 디바이스 타입
 */
export const DeviceType = Object.freeze({
  PC: "pc",         // 데스크탑 브라우저
  MOBILE: "mobile"  // 모바일 브라우저 또는 앱 WebView
});

/**
 * 결제창 구분 코드
 */
export const ClientType = Object.freeze({
  INTEGRATED: "00"  // 통합형 (기본값)
});

/**
 * 결제 상태 ENUM
 */
export const PaymentStatus = Object.freeze({
  READY: "READY",           // 거래등록 완료 (결제 전)
  AUTH_DONE: "AUTH_DONE",   // 인증 완료 (결제창에서 돌아옴)
  APPROVED: "APPROVED",     // 결제 승인 완료
  FAILED: "FAILED",         // 결제 실패
  CANCELLED: "CANCELLED"    // 결제 취소
});