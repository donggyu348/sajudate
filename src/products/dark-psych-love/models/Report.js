import { DataTypes } from 'sequelize';

/**
 * 최종 리포트.
 * finalScores 예: 체크리스트 4축 + 대화분석 가중 반영한 최종 점수(JSON)
 */
export default function defineReport(sequelize) {
  return sequelize.define(
    'Report',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      checklistResponseId: { type: DataTypes.INTEGER, allowNull: false },
      chatAnalysisId: { type: DataTypes.INTEGER, allowNull: true },
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
