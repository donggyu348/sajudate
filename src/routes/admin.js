import { Router } from 'express';
import { randomUUID } from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { Agent, Report } from '../models/index.js';
import { confirmTossPayment, REPORT_UNLOCK_PRICE } from '../products/dark-psych-love/logic/payments.js';
import { sendReportLinkSms, isSmsEnabled, isValidKoreanPhone, isSmsSuccess } from '../products/dark-psych-love/logic/sms.js';

const router = Router();

function adminPassword() {
  // 기동 후 .env를 바꿔도(또는 앞뒤 공백이 있어도) 비교가 어긋나지 않게 요청 시점에 읽는다
  const raw = process.env.ADMIN_PASSWORD;
  if (raw == null || String(raw).trim() === '') return 'admin';
  return String(raw).trim();
}

function usingDefaultPw() {
  const raw = process.env.ADMIN_PASSWORD;
  return raw == null || String(raw).trim() === '';
}

// 무차별 대입 방어 — IP당 15분에 10회로 제한 (정상적인 로그인 실패 재시도는 넉넉히 허용하되,
// 자동화된 비밀번호 대입 공격은 막는다).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
});

// ── CSRF 방어 ────────────────────────────────────
// 세션에 토큰을 발급해두고, admin의 모든 POST 폼은 hidden _csrf 필드로 이 토큰을 함께 제출해야
// 통과된다 — 로그인된 관리자 세션 쿠키만으로 외부 사이트가 POST를 흉내낼 수 없게 막는다.
router.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = randomUUID();
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

function verifyCsrf(req, res, next) {
  const submitted = req.body?._csrf;
  if (submitted && submitted === req.session.csrfToken) return next();
  return res.status(403).send('요청이 만료되었거나 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
}
router.use((req, res, next) => {
  // 로그인은 세션이 막 생기는 단계라 CSRF 쿠키/세션 레이스에 자주 걸린다.
  // 비밀번호 + rate limit으로 막고, CSRF는 로그인 이후에만 강제한다.
  if (req.method === 'POST' && req.path !== '/login') return verifyCsrf(req, res, next);
  next();
});

// ── 인증 ────────────────────────────────────────
function requireAdmin(req, res, next) {
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

router.get('/login', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin/agents');

  let error = null;
  if (req.query.err === 'session') {
    error =
      '비밀번호는 맞지만 로그인 상태가 유지되지 않습니다. https:// 도메인으로 접속했는지, 브라우저 쿠키 차단 여부를 확인해 주세요.';
  }

  // CSRF 토큰을 심은 세션이 쿠키로 내려가기 전에 응답이 나가면 POST에서 토큰 불일치가 난다
  req.session.save((err) => {
    if (err) console.error('[admin] 로그인 세션 저장 실패:', err.message);
    res.render('admin/login', {
      title: '관리자 로그인',
      activeTab: null,
      error,
      usingDefaultPw: usingDefaultPw(),
    });
  });
});

router.post('/login', loginLimiter, (req, res) => {
  const submitted = String(req.body?.password || '').trim();
  const expected = adminPassword();
  if (submitted === expected) {
    req.session.isAdmin = true;
    // MySQL 세션 스토어는 저장이 비동기라, 리다이렉트보다 먼저 커밋해야
    // 다음 요청에서 isAdmin이 비어 다시 로그인 화면으로 튕기지 않는다.
    return req.session.save((err) => {
      if (err) {
        console.error('[admin] 로그인 세션 저장 실패:', err.message);
        return res.status(500).render('admin/login', {
          title: '관리자 로그인',
          activeTab: null,
          error: '로그인 처리 중 오류가 발생했습니다. 다시 시도해 주세요.',
          usingDefaultPw: usingDefaultPw(),
        });
      }
      console.log('[admin] 로그인 성공:', {
        sessionID: req.sessionID,
        secure: req.secure,
        protocol: req.protocol,
        'x-forwarded-proto': req.get('x-forwarded-proto') || '(없음)',
      });
      // 303: POST 이후 GET으로 바꿔 세션 쿠키가 다음 요청에 실리면 바로 확인 가능
      return res.redirect(303, '/admin/agents?authed=1');
    });
  }
  // 비밀번호 본문은 로그에 남기지 않고, 길이만 남겨 .env와 입력이 어긋난 경우를 바로 가린다
  console.warn(
    `[admin] 로그인 실패 — 입력 ${submitted.length}자 / .env 설정 ${expected.length}자` +
      (usingDefaultPw() ? ' (기본값 admin 사용 중)' : '')
  );
  const hint =
    submitted.length !== expected.length
      ? ` 입력은 ${submitted.length}자인데 설정된 비밀번호는 ${expected.length}자입니다. .env의 ADMIN_PASSWORD를 확인하세요.`
      : '';
  res.status(401).render('admin/login', {
    title: '관리자 로그인',
    activeTab: null,
    error: `비밀번호가 올바르지 않습니다.${hint}`,
    usingDefaultPw: usingDefaultPw(),
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ── 에이전트 CRUD ────────────────────────────────
function slugify(input, fallbackName) {
  let s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) {
    // 이름이 비ASCII(예: 한글)라 slug가 비면 랜덤 폴백
    s = 'agent-' + Date.now().toString(36);
  }
  return s.slice(0, 120);
}

function parseForm(body) {
  return {
    name: String(body.name || '').trim(),
    slug: String(body.slug || '').trim(),
    description: String(body.description || '').trim() || null,
    systemPrompt: String(body.systemPrompt || '').trim(),
    greeting: String(body.greeting || '').trim() || null,
    model: String(body.model || '').trim(),
    maxTokens: Number(body.maxTokens) > 0 ? Math.min(Number(body.maxTokens), 8000) : 1600,
    effort: ['low', 'medium', 'high'].includes(body.effort) ? body.effort : 'low',
    isActive: body.isActive === 'on' || body.isActive === 'true' || body.isActive === true,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
  };
}

router.get('/', requireAdmin, (req, res) => res.redirect('/admin/agents'));

router.get('/agents', requireAdmin, async (req, res, next) => {
  try {
    const agents = await Agent.findAll({
      order: [
        ['sortOrder', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    res.render('admin/agents-list', {
      title: '에이전트 관리',
      activeTab: null,
      agents,
      usingDefaultPw: usingDefaultPw(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/agents/new', requireAdmin, (req, res) => {
  res.render('admin/agent-form', {
    title: '새 에이전트',
    activeTab: null,
    agent: null,
    error: null,
  });
});

router.post('/agents', requireAdmin, async (req, res, next) => {
  try {
    const data = parseForm(req.body);
    data.slug = slugify(data.slug || data.name, data.name);
    if (!data.name || !data.systemPrompt) {
      return res.status(400).render('admin/agent-form', {
        title: '새 에이전트',
        activeTab: null,
        agent: data,
        error: '이름과 시스템 프롬프트는 필수입니다.',
      });
    }
    // slug 중복 방지
    const exists = await Agent.findOne({ where: { slug: data.slug } });
    if (exists) data.slug = data.slug + '-' + Date.now().toString(36);
    await Agent.create(data);
    res.redirect('/admin/agents');
  } catch (err) {
    next(err);
  }
});

router.get('/agents/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) return res.redirect('/admin/agents');
    res.render('admin/agent-form', {
      title: '에이전트 수정',
      activeTab: null,
      agent,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/agents/:id', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) return res.redirect('/admin/agents');
    const data = parseForm(req.body);
    data.slug = slugify(data.slug || data.name, data.name);
    if (!data.name || !data.systemPrompt) {
      return res.status(400).render('admin/agent-form', {
        title: '에이전트 수정',
        activeTab: null,
        agent: { ...agent.toJSON(), ...data, id: agent.id },
        error: '이름과 시스템 프롬프트는 필수입니다.',
      });
    }
    const dup = await Agent.findOne({ where: { slug: data.slug } });
    if (dup && dup.id !== agent.id) data.slug = data.slug + '-' + Date.now().toString(36);
    await agent.update(data);
    res.redirect('/admin/agents');
  } catch (err) {
    next(err);
  }
});

router.post('/agents/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (agent) await agent.update({ isActive: !agent.isActive });
    res.redirect('/admin/agents');
  } catch (err) {
    next(err);
  }
});

router.post('/agents/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (agent) await agent.destroy();
    res.redirect('/admin/agents');
  } catch (err) {
    next(err);
  }
});

// ── 매출 ─────────────────────────────────────────
router.get('/sales', requireAdmin, async (req, res, next) => {
  try {
    const payments = await Report.findAll({
      where: { paid: true },
      order: [['createdAt', 'DESC']],
    });

    const now = new Date();
    const isSameDay = (d) => d.toDateString() === now.toDateString();
    const isSameMonth = (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();

    let totalRevenue = 0;
    let todayRevenue = 0;
    let monthRevenue = 0;
    for (const p of payments) {
      const amount = p.amount || 0;
      totalRevenue += amount;
      if (isSameDay(p.createdAt)) todayRevenue += amount;
      if (isSameMonth(p.createdAt)) monthRevenue += amount;
    }

    res.render('admin/sales', {
      title: '매출',
      activeTab: null,
      usingDefaultPw: usingDefaultPw(),
      payments,
      totalRevenue,
      todayRevenue,
      monthRevenue,
      totalCount: payments.length,
      smsEnabled: isSmsEnabled(),
      notice: req.query.notice ? String(req.query.notice) : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 결과지 문자 재발송.
 * 결제는 됐는데 문자가 안 갔을 때 복구용이고, 알리고 응답을 그대로 화면에 보여줘
 * "키 문제인지 / 번호 문제인지 / 발신번호 미등록인지"를 바로 가릴 수 있게 한다.
 */
router.post('/reports/:id/resend-sms', requireAdmin, async (req, res, next) => {
  try {
    const report = await Report.findByPk(req.params.id);
    if (!report) return res.redirect('/admin/sales?notice=' + encodeURIComponent('리포트를 찾을 수 없습니다.'));

    if (!isSmsEnabled()) {
      return res.redirect('/admin/sales?notice=' + encodeURIComponent('알리고 키(ALIGO_API_KEY/USER_ID/SENDER)가 설정되지 않았습니다.'));
    }
    if (!isValidKoreanPhone(report.phone)) {
      return res.redirect('/admin/sales?notice=' + encodeURIComponent(`리포트 #${report.id}에 저장된 전화번호가 없습니다.`));
    }

    const origin = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const reportUrl = `${origin}/products/dark-psych-love/report/${report.publicId}`;
    const data = await sendReportLinkSms({ phone: report.phone, reportUrl });

    const ok = isSmsSuccess(data);
    if (ok && !report.smsSentAt) {
      report.smsSentAt = new Date();
      await report.save();
    }
    const notice = ok
      ? `리포트 #${report.id} 문자를 발송했습니다.`
      : data == null
        ? '알리고 키가 설정되지 않아 발송하지 못했습니다.'
        : `발송 실패 — ${data?.message || '알 수 없는 오류'} (code: ${data?.result_code ?? '-'})`;
    res.redirect('/admin/sales?notice=' + encodeURIComponent(notice));
  } catch (err) {
    next(err);
  }
});

// ── 결제 수동 확인 (토스 승인은 됐는데 successUrl 리다이렉트가 유실된 경우 복구용) ──
router.get('/reports/unpaid', requireAdmin, async (req, res, next) => {
  try {
    const reports = await Report.findAll({
      where: { paid: false },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    res.render('admin/reports-unpaid', {
      title: '미결제 리포트',
      activeTab: null,
      usingDefaultPw: usingDefaultPw(),
      reports,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reports/:id/mark-paid', requireAdmin, async (req, res, next) => {
  try {
    const report = await Report.findByPk(req.params.id);
    const { paymentKey, orderId } = req.body || {};
    if (!report) return res.redirect('/admin/reports/unpaid');
    if (!report.paid && paymentKey && orderId) {
      // 토스 확인 API로 실제 승인된 결제인지 검증 후에만 잠금 해제 — 관리자가 아무 값이나
      // 입력해도 잠금이 풀리지 않도록, confirm 성공 시에만 paid 처리한다.
      await confirmTossPayment({ paymentKey: String(paymentKey), orderId: String(orderId) });
      report.paid = true;
      report.orderId = String(orderId);
      report.paymentKey = String(paymentKey);
      report.amount = REPORT_UNLOCK_PRICE;
      await report.save();
    }
    res.redirect('/admin/reports/unpaid');
  } catch (err) {
    const reports = await Report.findAll({ where: { paid: false }, order: [['createdAt', 'DESC']], limit: 100 });
    res.status(400).render('admin/reports-unpaid', {
      title: '미결제 리포트',
      activeTab: null,
      usingDefaultPw: usingDefaultPw(),
      reports,
      error: err.message || '결제 확인에 실패했습니다.',
    });
  }
});

export default router;
