import Users from "../orm/models/users.js";

class UsersRepository {
  async findByPlatformAndEmail(platform, email) {
    return await Users.findOne({ where: { platform, email, status: 'ACTIVE' } });
  }

  async findAnyByPlatformAndEmail(platform, email) {
    return await Users.findOne({ where: { platform, email } });
  }

  async findById(id) {
    return await Users.findByPk(id);
  }

  async create({ platform, email, phone, name, gender, salt, passwordHash }) {
    return await Users.create({ platform, email, phone, name, gender, salt, passwordHash, status: 'ACTIVE' });
  }

  async updateById(id, fields) {
    await Users.update(fields, { where: { id } });
    return await this.findById(id);
  }

  async markDeletedById(id) {
    await Users.update({ status: 'DELETED' }, { where: { id } });
  }
}

export default new UsersRepository();
