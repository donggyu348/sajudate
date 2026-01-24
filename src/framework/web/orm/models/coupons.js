// src/framework/web/orm/models/coupons.js

export default (sequelize, DataTypes) => {
    return sequelize.define('coupons', {
        code: { type: DataTypes.STRING, unique: true, allowNull: false }, // 쿠폰 코드
        isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },        // 사용 여부
        type: { type: DataTypes.STRING, defaultValue: 'FREE' },         // 쿠폰 종류
        receivedPhone: { type: DataTypes.STRING }                       // 발급받은 번호
    });
};