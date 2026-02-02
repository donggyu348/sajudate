// src/framework/web/orm/models/coupons.js
import { DataTypes } from "sequelize";
import sequelize from "../sequelize.js"; // 상단에서 인스턴스를 직접 가져옵니다.

const Coupons = sequelize.define('coupons', {
    code: { type: DataTypes.STRING, unique: true, allowNull: false },
    isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
    type: { type: DataTypes.STRING, defaultValue: 'FREE' },
    receivedPhone: { type: DataTypes.STRING },
    goodsType: { type: DataTypes.STRING } // 아까 추가한 컬럼
}, {
    tableName: 'coupons',
    timestamps: true
});

export default Coupons;