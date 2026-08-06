import { randomUUID } from 'crypto';

// 관리자 화면 전용 레이아웃 — 플랫폼 헤더/탭바/푸터 없이 넓은 표 화면을 쓴다
export const ADMIN_LAYOUT = 'layouts/admin';

export function usingDefaultPw() {
  const raw = process.env.ADMIN_PASSWORD;
  return raw == null || String(raw).trim() === '';
}

// ── CSRF 방어 ────────────────────────────────────
// 세션에 토큰을 발급해두고, 관리자 화면의 모든 POST 폼은 hidden _csrf 필드로 이 토큰을 함께 제출해야
// 통과된다 — 로그인된 관리자 세션 쿠키만으로 외부 사이트가 POST를 흉내낼 수 없게 막는다.
function verifyCsrf(req, res, next) {
  const submitted = req.body?._csrf;
  if (submitted && submitted === req.session.csrfToken) return next();
  return res.status(403).send('요청이 만료되었거나 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
}

/** 관리자 라우터(결제내역·에이전트) 공통 가드 — CSRF 토큰 발급/검증 */
export function adminGuards(router) {
  router.use((req, res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = randomUUID();
    res.locals.csrfToken = req.session.csrfToken;
    next();
  });
  router.use((req, res, next) => {
    // 로그인은 세션이 막 생기는 단계라 CSRF 쿠키/세션 레이스에 자주 걸린다.
    // 비밀번호 + rate limit으로 막고, CSRF는 로그인 이후에만 강제한다.
    if (req.method === 'POST' && req.path !== '/login') return verifyCsrf(req, res, next);
    next();
  });
}

// ── 인증 ────────────────────────────────────────
export function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  // 로그인 POST는 성공했는데 다음 요청에 세션이 없으면 쿠키(Secure/프록시) 문제다.
  // 그냥 /login으로 보내면 "아무 말 없이 그대로"처럼 보여서 원인을 안내한다.
  if (req.query.authed) {
    console.error('[admin] 로그인 직후 세션 유실:', {
      sessionID: req.sessionID,
      secure: req.secure,
      protocol: req.protocol,
      'x-forwarded-proto': req.get('x-forwarded-proto') || '(없음)',
      hasCookie: Boolean(req.headers.cookie),
    });
    return res.redirect('/admin/login?err=session');
  }
  return res.redirect('/admin/login');
}
