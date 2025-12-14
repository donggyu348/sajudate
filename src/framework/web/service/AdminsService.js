import AdminsRepository from "../repository/AdminsRepository.js";
import { Platform } from "../enums/Platform.js";

class AdminsService {

  async login(platform, email, password) {
    if (!email || !password) {
      throw new Error("email password 필수입니다.");
    }

    const admin = await AdminsRepository.findByPlatformAndEmail(platform, email);
    console.log(admin);

    return admin.password == password;
  }
}

export default new AdminsService();