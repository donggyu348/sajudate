import sequelize from "./framework/web/orm/sequelize.js";
import "./framework/web/orm/models/paymentTransaction.js";
import "./framework/web/orm/models/reportHistory.js";
import "./framework/web/orm/models/smsHistory.js";
import "./framework/web/orm/models/admins.js";
import "./framework/web/orm/models/users.js";

const alter = String(process.env.DB_ALTER || '').toLowerCase() === 'true';

sequelize.sync({ alter }).then(() => {
  console.log(process.env.NODE_ENV);
  console.log(`테이블 동기화 완료 (alter=${alter})`);
  process.exit();
});