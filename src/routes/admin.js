import { Router } from 'express';
import { Agent, Report } from '../models/index.js';

const router = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const USING_DEFAULT_PW = !process.env.ADMIN_PASSWORD;

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

router.post('/login', (req, res) => {
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

export default router;
