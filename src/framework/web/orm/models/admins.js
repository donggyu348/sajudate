import { DataTypes } from "sequelize";
import sequelize from "../sequelize.js";
import { Platform } from "../../enums/Platform.js";

const Admins = sequelize.define("Admins", {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  platform: {
    type: DataTypes.ENUM(...Object.values(Platform).map((v) => v.code.toUpperCase())),
    allowNull: false,
    comment: "플랫폼",
  },
  email: {
    type: DataTypes.STRING(40),
    allowNull: false,
    comment: "이메일",
  },
  password: {
    type: DataTypes.STRING(40),
    allowNull: false,
    comment: "패스워드",
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
  tableName: 'ADMINS',
  underscored: true,
  createdAt: 'createdDtm',
  updatedAt: 'updatedDtm',
});

export default Admins;