import { sequelize } from '../db/sequelize.js';
import defineUser from './User.js';
import defineProduct from './Product.js';
import defineChecklistResponse from '../products/dark-psych-love/models/ChecklistResponse.js';
import defineChatAnalysis from '../products/dark-psych-love/models/ChatAnalysis.js';
import defineReport from '../products/dark-psych-love/models/Report.js';

// 플랫폼 공통 모델
const User = defineUser(sequelize);
const Product = defineProduct(sequelize);

// 상품 전용 모델 (dark-psych-love)
const ChecklistResponse = defineChecklistResponse(sequelize);
const ChatAnalysis = defineChatAnalysis(sequelize);
const Report = defineReport(sequelize);

// ── 연관관계 ────────────────────────────────────────────────
User.hasMany(ChecklistResponse, { foreignKey: 'userId' });
ChecklistResponse.belongsTo(User, { foreignKey: 'userId' });

Product.hasMany(ChecklistResponse, { foreignKey: 'productId' });
ChecklistResponse.belongsTo(Product, { foreignKey: 'productId' });

Product.hasMany(ChatAnalysis, { foreignKey: 'productId' });
ChatAnalysis.belongsTo(Product, { foreignKey: 'productId' });
User.hasMany(ChatAnalysis, { foreignKey: 'userId' });
ChatAnalysis.belongsTo(User, { foreignKey: 'userId' });

ChecklistResponse.hasOne(Report, { foreignKey: 'checklistResponseId' });
Report.belongsTo(ChecklistResponse, { foreignKey: 'checklistResponseId' });
ChatAnalysis.hasOne(Report, { foreignKey: 'chatAnalysisId' });
Report.belongsTo(ChatAnalysis, { foreignKey: 'chatAnalysisId' });
User.hasMany(Report, { foreignKey: 'userId' });
Report.belongsTo(User, { foreignKey: 'userId' });

export const db = {
  sequelize,
  User,
  Product,
  ChecklistResponse,
  ChatAnalysis,
  Report,
};

export { sequelize, User, Product, ChecklistResponse, ChatAnalysis, Report };
