import { DataTypes } from 'sequelize';
import { randomUUID } from 'crypto';

/**
 * 상담 세션 로그.
 *
 * 개선 루프가 없으면 이 제품은 좋아지지 않는다. 세션마다 남기는 것:
 * 체크리스트 응답 전체 / 매칭된 규칙 전부 + 최종 선택 / 턴별 사용자 발화 길이 /
 * "그럼 어떻게 해야 되나요" 발생 여부와 턴 / 페이월 도달 여부와 이탈 지점.
 *
 * 핵심 지표 2개
 *  1) userMsgLengths 추세 — 길어지면 신뢰 형성 중, 짧아지면 실패한 대화
 *  2) howToTurn 발생률 — 결제 전환율의 상한선
 */
export default function defineCounselSession(sequelize) {
  return sequelize.define(
    'CounselSession',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      publicId: { type: DataTypes.STRING(36), allowNull: true, unique: true },

      // 체크리스트 Q1. 썸이 아니면 상담을 열지 않고 대기 신청만 받는다.
      stage: { type: DataTypes.STRING(16), allowNull: false },
      // 썸이 아닌 단계에서 받은 출시 알림용 이메일
      waitlistEmail: { type: DataTypes.STRING(255), allowNull: true },

      intake: { type: DataTypes.JSON, allowNull: true },
      signals: { type: DataTypes.JSON, allowNull: true },
      // 매칭된 규칙 전부 — 한 번도 안 걸리는 규칙은 삭제하고 자주 걸리는 규칙은 세분화한다
      matchedRules: { type: DataTypes.JSON, allowNull: true },
      // 최종 채택된 규칙 1개
      activeRule: { type: DataTypes.STRING(8), allowNull: true },

      // 턴별 사용자 메시지 '길이'만 남긴다 (대화 원문은 저장하지 않는다)
      userMsgLengths: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      turnCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      // "그래서 어떻게 해야 되나요" 류가 나온 턴 번호. 안 나왔으면 null
      howToTurn: { type: DataTypes.INTEGER, allowNull: true },
      paywalled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // 안전 규칙으로 중단된 경우 그 규칙 id (A1/A2/A3)
      safetyStop: { type: DataTypes.STRING(8), allowNull: true },
      // 마지막으로 도달한 지점 — 이탈 분석용 (checklist/counsel/paywall/report/paid/safety)
      lastStage: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'checklist' },

      // 상담 종료 후 1회 생성해 캐싱하는 리포트(SECTIONS 구조).
      // 결제 전에도 만들어 두고 화면에서 뒷부분을 가린다 — 결제 직후 기다림 없이 바로 열린다.
      report: { type: DataTypes.JSON, allowNull: true },
      paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      orderId: { type: DataTypes.STRING(128), allowNull: true },
      paymentKey: { type: DataTypes.STRING(128), allowNull: true },
      // 결제 시점의 실제 승인 금액 스냅샷 — 나중에 가격이 바뀌어도 과거 매출이 흔들리지 않는다
      amount: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'lc_sessions',
      timestamps: true,
      hooks: {
        beforeValidate: (row) => {
          if (!row.publicId) row.publicId = randomUUID();
        },
      },
    }
  );
}
