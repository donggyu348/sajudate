/**
 * Meta Conversions API Parameter Builder (서버).
 * _fbc / fbclid 값을 수정·재조합하지 않고 SDK가 쿠키·fbc/fbp를 처리합니다.
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/parameter-builder-feature-library
 */

import { ParamBuilder } from "capi-param-builder-nodejs";

function getRegisteredDomains() {
  const raw = process.env.META_PARAM_BUILDER_DOMAINS;
  if (!raw) return null;
  const domains = raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  return domains.length ? domains : null;
}

/** 쿠키 값은 decode하지 않음 (_fbc 대소문자·fbclid 원본 유지). */
export function parseRequestCookies(req) {
  const raw = req.headers?.cookie;
  if (!raw) return {};
  const cookies = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return cookies;
}

function toQueryParams(query) {
  if (!query || typeof query !== "object") return {};
  const params = {};
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    params[key] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return params;
}

function applyCookiesToResponse(res, builder) {
  const cookiesToSet = builder.getCookiesToSet();
  for (const cookie of cookiesToSet) {
    const segments = [
      `${cookie.name}=${cookie.value}`,
      `Max-Age=${cookie.maxAge}`,
      "Path=/",
    ];
    if (cookie.domain) segments.push(`Domain=${cookie.domain}`);
    res.append("Set-Cookie", segments.join("; "));
  }
}

/**
 * 요청마다 ParamBuilder로 fbc/fbp를 수집하고, 권장 _fbc/_fbp 쿠키를 설정합니다.
 * req.metaCapi = { fbc, fbp, clientIpAddress } — MetaCapiService에서 사용.
 */
export function metaParamBuilderMiddleware(req, res, next) {
  try {
    const host = req.headers.host || "";
    if (!host) {
      req.metaCapi = {};
      return next();
    }

    const domains = getRegisteredDomains();
    const builder = domains ? new ParamBuilder(domains) : new ParamBuilder();

    const requestCookies = parseRequestCookies(req);
    const params = toQueryParams(req.query);

    builder.processRequest(
      host,
      params,
      requestCookies,
      req.headers.referer || null,
      req.headers["x-forwarded-for"] || null,
      req.socket?.remoteAddress || null
    );

    applyCookiesToResponse(res, builder);

    const fbc = builder.getFbc();
    const fbp = builder.getFbp();
    const clientIpAddress = builder.getClientIpAddress();

    req.metaCapi = { fbc, fbp, clientIpAddress };

    if (req.session) {
      if (fbc) req.session.metaFbc = fbc;
      if (fbp) req.session.metaFbp = fbp;
    }
  } catch (err) {
    console.warn("[Meta ParamBuilder]", err?.message || err);
    req.metaCapi = req.metaCapi || {};
  }
  next();
}
