import { DataTypes } from 'sequelize';

export default function defineUser(sequelize) {
  return sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email: { type: DataTypes.STRING(255), allowNull: true, unique: true },
    },
    {
      tableName: 'users',
      timestamps: true,
      updatedAt: false, // createdAt만 사용
    }
  );
}
