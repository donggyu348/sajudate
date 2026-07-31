import { DataTypes } from 'sequelize';

/**
 * AI 에이전트(상담 봇) 설정.
 * 관리자 UI에서 코드 없이 생성/수정하며, 채팅에서 이 설정을 불러 Claude를 호출한다.
 */
export default function defineAgent(sequelize) {
  return sequelize.define(
    'Agent',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      // 라우팅 키 (예: "relationship-counselor")
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(300), allowNull: true },
      // 봇의 인격·규칙 (핵심)
      systemPrompt: { type: DataTypes.TEXT, allowNull: false },
      // 첫 인사말 (채팅 최초 말풍선)
      greeting: { type: DataTypes.TEXT, allowNull: true },
      // 빈 값이면 서버 기본(LLM_MODEL 또는 claude-opus-5) 사용
      model: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      maxTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1600 },
      // 'low' | 'medium' | 'high'
      effort: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'low' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'agents',
      timestamps: true,
      indexes: [{ fields: ['isActive', 'sortOrder'] }],
    }
  );
}
