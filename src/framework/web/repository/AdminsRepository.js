import Admins from "../orm/models/admins.js";

class AdminsRepository {

  async findByPlatformAndEmail(platform, email) {
    return await Admins.findOne({
      where: { platform, email }
    });
  }

}

const adminsRepository = new AdminsRepository();
export default adminsRepository;