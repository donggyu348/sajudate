import { DataTypes } from 'sequelize';

/**
 * 카카오톡 대화 분석 결과.
 * 중요: 원문 텍스트는 절대 저장하지 않는다. 통계/태깅 결과만 보관.
 *
 * statPatterns 예 (규칙 기반 통계):
 * { messageCount, participantCounts, nightRatio, avgResponseSecByUser,
 *   apologyCount, blameKeywordCount, ... }
 *
 * llmTaggedPatterns 예 (LLM 구조화 출력):
 * { patterns: [{ type: "gaslighting", confidence: 0.7, count: 3 }, ...] }
 */
export default function defineChatAnalysis(sequelize) {
  return sequelize.define(
    'ChatAnalysis',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      productId: { type: DataTypes.INTEGER, allowNull: false },
      statPatterns: { type: DataTypes.JSON, allowNull: false },
      llmTaggedPatterns: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: 'dpl_chat_analyses',
      timestamps: true,
      updatedAt: false,
    }
  );
}
