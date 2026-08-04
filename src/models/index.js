import { sequelize } from '../db/sequelize.js';
import defineUser from './User.js';
import defineProduct from './Product.js';
import defineAgent from './Agent.js';
import defineReport from '../products/dark-psych-love/models/Report.js';

// 플랫폼 공통 모델
const User = defineUser(sequelize);
const Product = defineProduct(sequelize);
const Agent = defineAgent(sequelize);

// 상품 전용 모델 (dark-psych-love)
const Report = defineReport(sequelize);

// ── 연관관계 ────────────────────────────────────────────────
User.hasMany(Report, { foreignKey: 'userId' });
Report.belongsTo(User, { foreignKey: 'userId' });

export const db = {
  sequelize,
  User,
  Product,
  Agent,
  Report,
};

export { sequelize, User, Product, Agent, Report };
