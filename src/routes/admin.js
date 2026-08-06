import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Report } from '../models/index.js';
import { adminGuards, requireAdmin, usingDefaultPw, ADMIN_LAYOUT } from './admin-auth.js';
import { confirmTossPayment, REPORT_UNLOCK_PRICE } from '../products/dark-psych-love/logic/payments.js';
import { sendReportLinkSms, isSmsEnabled, isValidKoreanPhone, isSmsSuccess } from '../products/dark-psych-love/logic/sms.js';

const router = Router();

function adminPassword() {
  // 기동 후 .env를 바꿔도(또는 앞뒤 공백이 있어도) 비교가 어긋나지 않게 요청 시점에 읽는다
  const raw = process.env.ADMIN_PASSWORD;
  if (raw == null || String(raw).trim() === '') return 'admin';
  return String(raw).trim();
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

adminGuards(router);

// ── 로그인 ───────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/admin');

  let error = null;
  if (req.query.err === 'session') {
    error =
      '비밀번호는 맞지만 로그인 상태가 유지되지 않습니다. https:// 도메인으로 접속했는지, 브라우저 쿠키 차단 여부를 확인해 주세요.';
  }

  // CSRF 토큰을 심은 세션이 쿠키로 내려가기 전에 응답이 나가면 POST에서 토큰 불일치가 난다
  req.session.save((err) => {
    if (err) console.error('[admin] 로그인 세션 저장 실패:', err.message);
    res.render('admin/login', {
      layout: ADMIN_LAYOUT,
      showNav: false,
      title: '관리자 로그인',
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
          layout: ADMIN_LAYOUT,
          showNav: false,
          title: '관리자 로그인',
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
      return res.redirect(303, '/admin?authed=1');
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
    layout: ADMIN_LAYOUT,
    showNav: false,
    title: '관리자 로그인',
    error: `비밀번호가 올바르지 않습니다.${hint}`,
    usingDefaultPw: usingDefaultPw(),
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ── 결제내역 (관리자 첫 화면) ─────────────────────
const PER_PAGE = 20;

function ymd(d) {
  const dt = new Date(d);
  return dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0');
}

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const allPaid = await Report.findAll({
      where: { paid: true },
      order: [['createdAt', 'DESC']],
    });

    const now = new Date();
    const isSameDay = (d) => new Date(d).toDateString() === now.toDateString();
    const isSameMonth = (d) => {
      const dt = new Date(d);
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    };
    // 최근 30일 경계 — 이보다 오래된 결제는 날짜별 표에서 제외한다
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    let totalRevenue = 0;
    let todayRevenue = 0;
    let monthRevenue = 0;
    const byDate = new Map();
    for (const p of allPaid) {
      const amount = p.amount || 0;
      totalRevenue += amount;
      if (isSameDay(p.createdAt)) todayRevenue += amount;
      if (isSameMonth(p.createdAt)) monthRevenue += amount;
      if (new Date(p.createdAt) >= since) {
        const key = ymd(p.createdAt);
        const row = byDate.get(key) || { date: key, amount: 0, count: 0 };
        row.amount += amount;
        row.count += 1;
        byDate.set(key, row);
      }
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const totalPages = Math.max(1, Math.ceil(allPaid.length / PER_PAGE));

    res.render('admin/payments', {
      layout: ADMIN_LAYOUT,
      title: '결제내역',
      usingDefaultPw: usingDefaultPw(),
      payments: allPaid.slice((page - 1) * PER_PAGE, page * PER_PAGE),
      dailySales: [...byDate.values()],
      totalRevenue,
      todayRevenue,
      monthRevenue,
      totalCount: allPaid.length,
      page,
      totalPages,
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
    if (!report) return res.redirect('/admin?notice=' + encodeURIComponent('리포트를 찾을 수 없습니다.'));

    if (!isSmsEnabled()) {
      return res.redirect('/admin?notice=' + encodeURIComponent('알리고 키(ALIGO_API_KEY/USER_ID/SENDER)가 설정되지 않았습니다.'));
    }
    if (!isValidKoreanPhone(report.phone)) {
      return res.redirect('/admin?notice=' + encodeURIComponent(`리포트 #${report.id}에 저장된 전화번호가 없습니다.`));
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
    res.redirect('/admin?notice=' + encodeURIComponent(notice));
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
      layout: ADMIN_LAYOUT,
      title: '미결제 리포트',
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
      layout: ADMIN_LAYOUT,
      title: '미결제 리포트',
      usingDefaultPw: usingDefaultPw(),
      reports,
      error: err.message || '결제 확인에 실패했습니다.',
    });
  }
});

// 예전 북마크 호환
router.get('/sales', requireAdmin, (req, res) => res.redirect('/admin'));
router.get('/agents', requireAdmin, (req, res) => res.redirect('/agent-admin'));

export default router;
