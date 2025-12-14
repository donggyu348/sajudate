import { DataTypes } from "sequelize";
import sequelize from "../sequelize.js";
import { Platform } from "../../enums/Platform.js";

const Users = sequelize.define("Users", {
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
    type: DataTypes.STRING(80),
    allowNull: false,
    comment: "이메일",
  },
  // 휴대폰번호 추가
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: "휴대폰번호",
  },
  // 이름 추가
  name: {
    type: DataTypes.STRING(40),
    allowNull: false,
    comment: "이름",
  },
  // 성별 추가
  gender: {
    type: DataTypes.ENUM('MALE', 'FEMALE'),
    allowNull: false,
    comment: "성별",
  },
  salt: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: "비밀번호 솔트(HEX)",
  },
  passwordHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: "비밀번호 해시(SHA-256, HEX)",
  },
  // 소프트 삭제용 상태 컬럼
  status: {
    type: DataTypes.ENUM('ACTIVE', 'DELETED'),
    allowNull: false,
    defaultValue: 'ACTIVE',
    comment: "계정 상태",
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
  tableName: 'USERS',
  underscored: true,
  createdAt: 'createdDtm',
  updatedAt: 'updatedDtm',
  indexes: [
    { unique: true, fields: ['platform', 'email'] }
  ]
});

export default Users;
