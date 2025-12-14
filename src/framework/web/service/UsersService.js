import crypto from "node:crypto";
import UsersRepository from "../repository/UsersRepository.js";

function genSalt(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).trim());
}

function validateName(name) {
  const n = String(name || "").trim();
  return n.length >= 2 && n.length <= 30;
}

function validatePassword(pw) {
  return String(pw || "").length >= 8;
}

function normalizeGender(g) {
  if (!g) return null;
  const v = String(g).trim().toUpperCase();
  if (v === 'MALE' || v === 'M' || v === '남성' || v === '남') return 'MALE';
  if (v === 'FEMALE' || v === 'F' || v === '여성' || v === '여') return 'FEMALE';
  return null;
}

function normalizePhone(p) {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  return d || null;
}

class UsersService {
  async register({ platform, email, phone, name, gender, password }) {
    if (!platform || !email || !phone || !name || !gender || !password) {
      throw new Error("platform, email, phone, name, gender, password는 필수입니다.");
    }
    if (!validateEmail(email)) throw new Error("이메일 형식이 올바르지 않습니다.");
    if (!validateName(name)) throw new Error("이름은 2~30자로 입력해주세요.");
    if (!validatePassword(password)) throw new Error("비밀번호는 8자 이상이어야 합니다.");

    const normGender = normalizeGender(gender);
    const normPhone = normalizePhone(phone);
    if (!normGender) throw new Error("성별 값이 올바르지 않습니다. (MALE/FEMALE)");
    if (!normPhone || normPhone.length < 10 || normPhone.length > 11) throw new Error("휴대폰번호 형식이 올바르지 않습니다.");

    // 상태와 무관하게 동일 이메일 존재 여부 확인
    const existsAny = await UsersRepository.findAnyByPlatformAndEmail(platform, email);
    const salt = genSalt();
    const passwordHash = hashPassword(password, salt);

    if (existsAny) {
      if (existsAny.status === 'ACTIVE') {
        throw new Error("이미 가입된 이메일입니다.");
      } else {
        throw new Error("사용할 수 없는 이메일입니다.");
      }
    }

    try {
      const user = await UsersRepository.create({ platform, email: String(email).trim(), phone: normPhone, name: String(name).trim(), gender: normGender, salt, passwordHash });
      return { id: user.id, email: user.email, phone: user.phone, name: user.name, gender: user.gender };
    } catch (e) {
      if (e && (e.name === 'SequelizeUniqueConstraintError' || e.code === 'ER_DUP_ENTRY')) {
        throw new Error("이미 가입된 이메일입니다.");
      }
      throw e;
    }
  }

  async login({ platform, email, password }) {
    const user = await UsersRepository.findByPlatformAndEmail(platform, email);
    if (!user) return null; // ACTIVE만 조회됨
    const passwordHash = hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) return null;
    return { id: user.id, email: user.email, phone: user.phone, name: user.name, gender: user.gender };
  }

  async delete({ userId, password }) {
    const user = await UsersRepository.findById(userId);
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");
    const passwordHash = hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) throw new Error("비밀번호가 일치하지 않습니다.");
    await UsersRepository.markDeletedById(userId);
    return true;
  }
}

export default new UsersService();
