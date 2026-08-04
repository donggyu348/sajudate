import { DataTypes } from 'sequelize';

/**
 * 최종 리포트.
 * finalScores 예: { axisScores, axisScores100, patterns } — AI 상담 대화 분석 결과(JSON)
 */
export default function defineReport(sequelize) {
  return sequelize.define(
    'Report',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      finalScores: { type: DataTypes.JSON, allowNull: false },
      summaryText: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'dpl_reports',
      timestamps: true,
      updatedAt: false,
    }
  );
}
