/**
 * API 응답형식 통일용
 * @param code
 * @param message
 * @param info
 * @param data
 * @returns {{result: {code, message, info}, data}}
 */
export const makeResponse = (code, message, info, data) => {
  return { result: { code, message, info }, data };
};

export const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }
  return req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;
};

export const generateShopOrderNo = () => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}