/**
 * DB 저장용 필드 단위 암호화 (AES-256-GCM).
 * 전화번호처럼 평문으로 남으면 DB 유출 시 그대로 새어나가는 PII에 사용한다.
 *
 * 키는 .env의 FIELD_ENCRYPTION_KEY (32바이트 hex = 64자).
 *   생성: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * 키가 없으면 암호화 없이 평문으로 동작한다 — 개발 환경에서 키 없이도 돌아가게 하기 위함이고,
 * 운영에서는 server.js가 키 존재를 강제한다.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';

function getKey() {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex) return null;
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY는 32바이트 hex(64자)여야 합니다.');
  }
  return key;
}

export function isFieldEncryptionEnabled() {
  return Boolean(process.env.FIELD_ENCRYPTION_KEY);
}

/** 평문 → "enc:v1:<iv>:<authTag>:<ciphertext>" (키 없으면 평문 그대로) */
export function encryptField(plain) {
  if (plain == null || plain === '') return plain;
  const key = getKey();
  if (!key) return String(plain);

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

/** 암호문 → 평문. 접두사가 없으면(키 도입 전에 저장된 기존 값) 그대로 반환한다. */
export function decryptField(stored) {
  if (stored == null || stored === '') return stored;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return s;

  const key = getKey();
  if (!key) return null; // 암호문인데 키가 없으면 복호화 불가

  const [ivHex, tagHex, ctHex] = s.slice(PREFIX.length).split(':');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null; // 키가 바뀌었거나 값이 손상된 경우
  }
}
