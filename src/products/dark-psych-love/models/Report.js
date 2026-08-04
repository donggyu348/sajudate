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
      paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      orderId: { type: DataTypes.STRING, allowNull: true },
      paymentKey: { type: DataTypes.STRING, allowNull: true },
      phone: { type: DataTypes.STRING, allowNull: true },
      // 결제 시점의 실제 결제 금액 — 나중에 가격이 바뀌어도 과거 매출 기록이 흔들리지 않도록 스냅샷으로 저장
      amount: { type: DataTypes.INTEGER, allowNull: true },
      // 결제 완료 후 1회 생성해 캐싱하는 전체 리포트 콘텐츠(REPORT_TOC 구조) — 무료 finalScores와 분리 보관
      premiumReport: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: 'dpl_reports',
      timestamps: true,
      updatedAt: false,
    }
  );
}
