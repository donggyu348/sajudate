import { DataTypes } from "sequelize";
import sequelize from "../sequelize.js";
import { GoodsType } from "../../enums/Goods.js";
import { Platform } from "../../enums/Platform.js";

const ReportHistory = sequelize.define("ReportHistory", {
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
    allowNull: true,
    unique: false,
    comment: "상점 주문번호 (가맹점 고유값)",
  },
  goodsType: {
    type: DataTypes.ENUM(...Object.values(GoodsType).map((v) => v.code.toUpperCase())),
    allowNull: false,
    comment: "상품타입",
  },
  userInfo: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "사용자 입력 정보 (이름, 생년월일 등)",
  },
  sampleInfo: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "샘플 정보 (이름, 생년월일 등)",
  },
  reportInfo: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "보고서 정보 (이름, 생년월일 등)",
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
  tableName: "REPORT_HISTORY",
  underscored: true,
  createdAt: "createdDtm",
  updatedAt: "updatedDtm",
});

export default ReportHistory;
