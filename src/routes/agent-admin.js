import { Router } from 'express';
import { Agent } from '../models/index.js';
import { adminGuards, requireAdmin, usingDefaultPw, ADMIN_LAYOUT } from './admin-auth.js';

// AI 에이전트 관리 — 결제내역(/admin)과 섞이면 화면이 복잡해져 별도 페이지로 분리했다.
// 로그인/세션은 /admin과 동일한 관리자 세션을 그대로 쓴다.
const router = Router();

adminGuards(router);

function slugify(input) {
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

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const agents = await Agent.findAll({
      order: [
        ['sortOrder', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    res.render('agent-admin/list', {
      layout: ADMIN_LAYOUT,
      title: 'AI 에이전트 관리',
      agents,
      usingDefaultPw: usingDefaultPw(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/new', requireAdmin, (req, res) => {
  res.render('agent-admin/form', {
    layout: ADMIN_LAYOUT,
    title: '새 에이전트',
    agent: null,
    error: null,
  });
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = parseForm(req.body);
    data.slug = slugify(data.slug || data.name);
    if (!data.name || !data.systemPrompt) {
      return res.status(400).render('agent-admin/form', {
        layout: ADMIN_LAYOUT,
        title: '새 에이전트',
        agent: data,
        error: '이름과 시스템 프롬프트는 필수입니다.',
      });
    }
    // slug 중복 방지
    const exists = await Agent.findOne({ where: { slug: data.slug } });
    if (exists) data.slug = data.slug + '-' + Date.now().toString(36);
    await Agent.create(data);
    res.redirect('/agent-admin');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) return res.redirect('/agent-admin');
    res.render('agent-admin/form', {
      layout: ADMIN_LAYOUT,
      title: '에이전트 수정',
      agent,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) return res.redirect('/agent-admin');
    const data = parseForm(req.body);
    data.slug = slugify(data.slug || data.name);
    if (!data.name || !data.systemPrompt) {
      return res.status(400).render('agent-admin/form', {
        layout: ADMIN_LAYOUT,
        title: '에이전트 수정',
        agent: { ...agent.toJSON(), ...data, id: agent.id },
        error: '이름과 시스템 프롬프트는 필수입니다.',
      });
    }
    const dup = await Agent.findOne({ where: { slug: data.slug } });
    if (dup && dup.id !== agent.id) data.slug = data.slug + '-' + Date.now().toString(36);
    await agent.update(data);
    res.redirect('/agent-admin');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (agent) await agent.update({ isActive: !agent.isActive });
    res.redirect('/agent-admin');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (agent) await agent.destroy();
    res.redirect('/agent-admin');
  } catch (err) {
    next(err);
  }
});

export default router;
