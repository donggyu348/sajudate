import SmsHistory from "../orm/models/smsHistory.js";

class SmsHistoryRepository {

  async createSmsHistory(data) {
    return SmsHistory.create(data);
  }

}

const smsHistoryRepository = new SmsHistoryRepository();
export default smsHistoryRepository;