import { DataTypes } from "sequelize";
import sequelize from "../sequelize.js";
import { SmsStatus } from "../../enums/Sms.js";
import { Platform } from "../../enums/Platform.js";

const SmsHistory = sequelize.define("SmsHistory", {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  status: {
    type: DataTypes.ENUM(...Object.values(SmsStatus).map((v) => v.toUpperCase())),
    allowNull: false,
    comment: "발송 상태값 (예: SUCCESS, FAILED 등)",
  },
  platform: {
    type: DataTypes.ENUM(...Object.values(Platform).map((v) => v.code.toUpperCase())),
    allowNull: false,
    comment: "플랫폼",
  },
  shopOrderNo: {
    type: DataTypes.STRING(40),
    allowNull: false,
    comment: "상점 주문번호",
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: "수신자 전화번호",
  },
  requestJson: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "요청 데이터(JSON 형태)",
  },
  responseJson: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "응답 데이터(JSON 형태)",
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
  tableName: 'SMS_HISTORY',
  underscored: true,
  createdAt: 'createdDtm',
  updatedAt: 'updatedDtm',
});

export default SmsHistory;