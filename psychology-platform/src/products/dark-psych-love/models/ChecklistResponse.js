import { DataTypes } from 'sequelize';

/**
 * 체크리스트 응답.
 * axisScores 예:
 * { narcissism: 3.2, machiavellianism: 4.1, psychopathy: 2.0, sadism: 1.5 }
 * (4축 0~5 척도 평균)
 */
export default function defineChecklistResponse(sequelize) {
  return sequelize.define(
    'ChecklistResponse',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      productId: { type: DataTypes.INTEGER, allowNull: false },
      axisScores: { type: DataTypes.JSON, allowNull: false },
      // 원문 문항 응답 배열 (재현/디버깅용, 개인 식별정보 아님)
      rawAnswers: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: 'dpl_checklist_responses',
      timestamps: true,
      updatedAt: false,
    }
  );
}
