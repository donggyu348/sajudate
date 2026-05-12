function normalizeMetaPhone(raw, country = "kr") {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("82")) return digits;
  if (digits.startsWith("0")) return `82${digits.slice(1)}`;
  if (String(country).toLowerCase() === "kr") return `82${digits}`;
  return digits;
}

function normalizeMetaBirthDate(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 8) return digits;
  if (digits.length === 6) {
    const year = Number(digits.slice(0, 2));
    const century = year >= 30 ? "19" : "20";
    return `${century}${digits}`;
  }
  return null;
}

function normalizeMetaGender(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (["m", "male", "man", "남", "남자"].includes(value)) return "m";
  if (["f", "female", "woman", "여", "여자"].includes(value)) return "f";
  return null;
}

export function buildMetaAdvancedMatching({
  email,
  phone,
  userTelNo,
  name,
  gender,
  birthDate,
  country = "kr",
} = {}) {
  const data = {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) data.em = normalizedEmail;

  const normalizedPhone = normalizeMetaPhone(userTelNo || phone, country);
  if (normalizedPhone) data.ph = normalizedPhone;

  const normalizedGender = normalizeMetaGender(gender);
  if (normalizedGender) data.ge = normalizedGender;

  const normalizedBirthDate = normalizeMetaBirthDate(birthDate);
  if (normalizedBirthDate) data.db = normalizedBirthDate;

  const normalizedName = String(name || "").trim();
  if (normalizedName) data.fn = normalizedName;

  const normalizedCountry = String(country || "kr").trim().toLowerCase().slice(0, 2);
  if (normalizedCountry) data.country = normalizedCountry;

  return data;
}
