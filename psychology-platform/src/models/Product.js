import { DataTypes } from 'sequelize';

export default function defineProduct(sequelize) {
  return sequelize.define(
    'Product',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      // 라우팅 키 (예: "dark-psych-love")
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      // 세로형 배너/카드 썸네일 (4:5). 직접 업로드 예정 → nullable
      thumbnailUrl: { type: DataTypes.STRING(500), allowNull: true },
      // 카테고리 탭 동적 생성 기준 (예: "연애진단", "체크리스트", "리포트")
      category: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '기타' },
      // 메인 배너 캐러셀 노출 여부
      isFeatured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // 배너/카드 헤드/서브 카피 (동적 카피)
      headline: { type: DataTypes.STRING(200), allowNull: true },
      subcopy: { type: DataTypes.STRING(300), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'products',
      timestamps: true,
      updatedAt: false,
      indexes: [{ fields: ['category'] }, { fields: ['isActive', 'sortOrder'] }],
    }
  );
}
