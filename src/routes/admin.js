import { Router } from 'express';
import { randomUUID } from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { Agent, Report } from '../models/index.js';
import { confirmTossPayment, REPORT_UNLOCK_PRICE } from '../products/dark-psych-love/logic/payments.js';

const router = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const USING_DEFAULT_PW = !process.env.ADMIN_PASSWORD;

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
  if (req.method === 'POST') return verifyCsrf(req, res, next);
  next();
});

// ── 인증 ────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.redirect('/admin/login');
}

router.get('/login', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin/agents');
  res.render('admin/login', {
    title: '관리자 로그인',
    activeTab: null,
    error: null,
    usingDefaultPw: USING_DEFAULT_PW,
  });
});

router.post('/login', loginLimiter, (req, res) => {
  if ((req.body?.password || '') === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin/agents');
  }
  res.status(401).render('admin/login', {
    title: '관리자 로그인',
    activeTab: null,
    error: '비밀번호가 올바르지 않습니다.',
    usingDefaultPw: USING_DEFAULT_PW,
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
      usingDefaultPw: USING_DEFAULT_PW,
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
      usingDefaultPw: USING_DEFAULT_PW,
      payments,
      totalRevenue,
      todayRevenue,
      monthRevenue,
      totalCount: payments.length,
    });
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
      usingDefaultPw: USING_DEFAULT_PW,
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
      usingDefaultPw: USING_DEFAULT_PW,
      reports,
      error: err.message || '결제 확인에 실패했습니다.',
    });
  }
});

export default router;
