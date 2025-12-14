import { DataTypes } from "sequelize";
import sequelize from "../sequelize.js";
import { PayMethodTypeCode, DeviceType, ClientType, PaymentStatus } from "../../enums/Payment.js";
import { Platform } from "../../enums/Platform.js";
import ReportHistory from "./reportHistory.js";

const PaymentTransaction = sequelize.define("PaymentTransaction", {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userIdx: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    comment: "사용자 ID",
  },
  platform: {
    type: DataTypes.ENUM(...Object.values(Platform).map((v) => v.code.toUpperCase())),
    allowNull: false,
    comment: "플랫폼",
  },
  shopOrderNo: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true,
    comment: "상점 주문번호 (가맹점 고유값)",
  },
  userTelNo: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: "사용자 전화번호",
  },
  userPw: {
    type: DataTypes.STRING(4),
    allowNull: false,
    comment: "사용자 비밀번호",
  },
  transactionId: {
    type: DataTypes.STRING(60),
    allowNull: true,
    unique: false,
    comment: "가맹점 거래 ID",
  },
  authorizationId: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: "결제창에서 받은 인증 거래번호",
  },
  amount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: "결제 금액",
  },
  currencyCode: {
    type: DataTypes.STRING(2),
    allowNull: false,
    defaultValue: "00",
    comment: "통화 코드 (00=원화)",
  },
  payMethodTypeCode: {
    type: DataTypes.ENUM(...Object.values(PayMethodTypeCode).map((v) => v.toUpperCase())),
    allowNull: false,
    comment: "결제 수단 ENUM",
  },
  deviceType: {
    type: DataTypes.ENUM(...Object.values(DeviceType).map((v) => v.toUpperCase())),
    allowNull: false,
    comment: "디바이스 ENUM",
  },
  clientType: {
    type: DataTypes.ENUM(...Object.values(ClientType).map((v) => v.toUpperCase())),
    allowNull: false,
    defaultValue: ClientType.INTEGRATED.toUpperCase(),
    comment: "결제창 유형 ENUM",
  },
  paymentStatus: {
    type: DataTypes.ENUM(...Object.values(PaymentStatus).map((v) => v.toUpperCase())),
    allowNull: false,
    defaultValue: PaymentStatus.READY.toUpperCase(),
    comment: "결제 상태",
  },
  statusCode: {
    type: DataTypes.STRING(10),
    comment: "승인 응답 코드",
  },
  statusMessage: {
    type: DataTypes.STRING(100),
    comment: "거래 상태 메시지",
  },
  pgCno: {
    type: DataTypes.STRING(20),
    comment: "PG 승인 거래번호",
  },
  approvalNo: {
    type: DataTypes.STRING(50),
    comment: "승인번호",
  },
  approvalDate: {
    type: DataTypes.DATE,
    comment: "승인 일시",
  },
  msgAuthValue: {
    type: DataTypes.STRING(200),
    comment: "응답 검증용 HMAC 값",
  },
  escrowUsed: {
    type: DataTypes.STRING(1),
    comment: "에스크로 사용 여부",
  },
  paymentInfoJson: {
    type: DataTypes.JSON,
    comment: "결제수단 상세 응답(JSON)",
  },
  shopValueJson: {
    type: DataTypes.JSON,
    comment: "shopValue1~7 등 가맹점 커스텀 필드(JSON)",
  },
  createdDtm: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: "생성 시각",
  },
  updatedDtm: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: "수정 시각",
  },
}, {
  tableName: "PAYMENT_TRANSACTION",
  underscored: true,
  createdAt: "createdDtm",
  updatedAt: "updatedDtm",
});

PaymentTransaction.hasOne(ReportHistory, {
  sourceKey: "shopOrderNo",
  foreignKey: "shopOrderNo",
  as: "reportHistory"
});

ReportHistory.belongsTo(PaymentTransaction, {
  targetKey: "shopOrderNo",
  foreignKey: "shopOrderNo",
  as: "paymentTransaction"
});

export default PaymentTransaction;