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
    // 1. 타입을 STRING으로 잠시 바꿔서 테스트해보거나, ENUM 정의가 완벽한지 확인하세요.
    type: DataTypes.STRING(50), 
    allowNull: true, // ⚠️ 테스트를 위해 우선 true로 바꿉니다. (값이 안 들어가는 원인 파악용)
    field: "goods_type", // 🔥 이 줄을 추가해서 DB 컬럼명과 강제로 연결하세요.
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
