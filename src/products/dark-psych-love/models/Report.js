import { DataTypes } from 'sequelize';
import { randomUUID } from 'crypto';
import { encryptField, decryptField } from '../../../lib/fieldCrypto.js';

/**
 * 최종 리포트.
 * finalScores 예: { axisScores, axisScores100, patterns } — AI 상담 대화 분석 결과(JSON)
 */
export default function defineReport(sequelize) {
  const Report = sequelize.define(
    'Report',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      // 외부 노출용 식별자 — 순차 정수 id로 URL을 만들면 다른 사람 리포트를 순차 추측으로 열람할 수 있어
      // 모든 라우트/링크는 반드시 이 값으로만 리포트를 조회한다. id는 내부 PK 용도로만 사용.
      // allowNull: true는 스키마 레벨 제약일 뿐 — beforeValidate 훅이 항상 채우므로 신규 row는 절대 비지 않는다.
      // 기존(마이그레이션 이전) row까지 NOT NULL로 강제하면 alter가 실패하므로 nullable로 둠.
      publicId: { type: DataTypes.STRING(36), allowNull: true, unique: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      finalScores: { type: DataTypes.JSON, allowNull: false },
      summaryText: { type: DataTypes.TEXT, allowNull: true },
      paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      orderId: { type: DataTypes.STRING, allowNull: true },
      paymentKey: { type: DataTypes.STRING, allowNull: true },
      // 전화번호는 DB에 평문으로 두지 않고 AES-256-GCM으로 암호화해 저장한다(FIELD_ENCRYPTION_KEY).
      // 앱 코드에서는 평소처럼 report.phone으로 평문을 읽고 쓰면 되고, 변환은 아래 getter/setter가 처리한다.
      // 암호문이 길어지므로 컬럼 길이를 넉넉히 잡는다.
      phone: {
        type: DataTypes.STRING(512),
        allowNull: true,
        get() {
          return decryptField(this.getDataValue('phone'));
        },
        set(v) {
          this.setDataValue('phone', v == null || v === '' ? v : encryptField(v));
        },
      },
      // 결제 시점의 실제 결제 금액 — 나중에 가격이 바뀌어도 과거 매출 기록이 흔들리지 않도록 스냅샷으로 저장
      amount: { type: DataTypes.INTEGER, allowNull: true },
      // 결제 완료 후 1회 생성해 캐싱하는 전체 리포트 콘텐츠(REPORT_TOC 구조) — 무료 finalScores와 분리 보관
      premiumReport: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: 'dpl_reports',
      timestamps: true,
      updatedAt: false,
      hooks: {
        beforeValidate: (report) => {
          if (!report.publicId) report.publicId = randomUUID();
        },
      },
    }
  );

  return Report;
}
