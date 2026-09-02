// src/framework/web/service/TicketService.js
//
// 무료 티켓(쿠폰) 발급·조회.
//
// 티켓은 coupons 테이블을 그대로 쓴다. 사용 흐름은 이미 깔려 있다:
//   /saju/ticket 입력 → /saju/ticket/verify → /saju/{상품}/input?ticket=CODE
//   → 입력 폼이 ticket을 같이 POST → 각 상품 result 라우트가 티켓을 소비하고
//     결제를 건너뛴 채 리포트를 생성한다.
// 여기서는 그 코드를 만들어 주는 일만 한다.

import Coupons from "../orm/models/coupons.js";
import { GoodsType } from "../enums/Goods.js";
import { Platform } from "../enums/Platform.js";

/**
 * 코드에 쓰는 글자.
 * 관리자가 눈으로 읽고 손으로 옮겨 적는 값이라 헷갈리는 글자는 뺐다.
 * (0/O, 1/I/L 제외)
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * 티켓으로 발급할 수 있는 상품.
 *  - 번들 제외: 티켓은 리포트 1장 단위다.
 *  - TIGHT 플랫폼만: 여긴 월하점 관리자이고, 다른 플랫폼 상품(주장소 등)은
 *    /saju/{코드}/input 경로가 없어 티켓을 넣어도 열리지 않는다.
 */
export function getIssuableGoods() {
  return Object.values(GoodsType)
    .filter((g) => g && g.code && !g.code.endsWith("_BUNDLE"))
    .filter((g) => g.platform?.code === Platform.TIGHT.code)
    .map((g) => ({ code: g.code, title: g.title }));
}

function randomBlock(len) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * 상품코드에서 사람이 알아볼 접두어를 만든다.
 * 첫 마디만 쓴다 — CHARM → CHARM, PREMIUM_SAJU → PREMIUM.
 * 8자면 지금 상품명(CLASSIC·ROMANTIC·REUNION 등)이 잘리지 않는다.
 */
function prefixOf(goodsCode) {
  return String(goodsCode).split("_")[0].slice(0, 8).toUpperCase();
}

/** 예: CHARM-K7QM-3XB9 */
function makeCode(goodsCode) {
  return `${prefixOf(goodsCode)}-${randomBlock(4)}-${randomBlock(4)}`;
}

/**
 * 티켓 발급.
 *
 * 코드는 무작위라 아주 드물게 겹칠 수 있다. unique 제약에 걸리면 다시 뽑는다.
 *
 * @param {string} goodsType  GoodsType 코드 (예: "CHARM")
 * @param {number} count      발급 장수
 * @param {string} memo       메모 — coupons.receivedPhone 칸을 재사용한다
 *                            (누구에게 줬는지 적어두는 용도)
 * @returns {Promise<{ goodsType:string, title:string, codes:string[] }>}
 */
export async function issueTickets({ goodsType, count = 1, memo = "" }) {
  const goods = GoodsType[goodsType];
  if (!goods) throw new Error(`알 수 없는 상품 코드입니다: ${goodsType}`);
  if (goods.code.endsWith("_BUNDLE")) {
    throw new Error("번들 상품은 티켓으로 발급할 수 없습니다.");
  }

  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100);   // 1~100장
  const codes = [];

  for (let i = 0; i < n; i++) {
    let saved = null;

    // 코드 충돌 시 재시도 (사실상 1회에 끝난다)
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      const code = makeCode(goods.code);
      try {
        saved = await Coupons.create({
          code,
          isUsed: false,
          type: "ADMIN",              // 관리자가 손으로 뽑은 티켓
          goodsType: goods.code,
          receivedPhone: memo || null,
        });
      } catch (e) {
        const dup = e?.name === "SequelizeUniqueConstraintError";
        if (!dup) throw e;
      }
    }

    if (!saved) throw new Error("티켓 코드 생성에 반복 실패했습니다. 다시 시도해 주세요.");
    codes.push(saved.code);
  }

  return { goodsType: goods.code, title: goods.title, codes };
}

/**
 * 발급 내역 조회.
 * @param {string} goodsType  비우면 전체
 * @param {string} used       "used" | "unused" | 그 외(전체)
 */
export async function listTickets({ goodsType = "", used = "", limit = 20, offset = 0 } = {}) {
  const where = {
    // 채널 쿠폰 등 시스템이 만든 행은 섞이지 않게 관리자 발급분만 본다
    type: "ADMIN",
  };
  if (goodsType) where.goodsType = goodsType;
  if (used === "used") where.isUsed = true;
  if (used === "unused") where.isUsed = false;

  const { count, rows } = await Coupons.findAndCountAll({
    where,
    limit: Math.min(parseInt(limit, 10) || 20, 100),
    offset: parseInt(offset, 10) || 0,
    order: [["id", "DESC"]],
  });

  return {
    count,
    rows: rows.map((r) => ({
      id: r.id,
      code: r.code,
      goodsType: r.goodsType,
      goodsTitle: GoodsType[r.goodsType]?.title || r.goodsType,
      isUsed: !!r.isUsed,
      memo: r.receivedPhone || "",
      createdAt: r.createdAt,
    })),
  };
}

/**
 * 티켓을 소비하고 결제 없이 리포트 생성을 시작한다.
 *
 * sajuRouter의 classic/reaper/romantic/adult 라우트에 같은 흐름이 네 번 복사돼 있는데,
 * 새로 붙는 상품(재회·매혹)은 이 함수를 쓴다.
 *
 * 리포트 생성(GPT)은 오래 걸리므로 기다리지 않는다. 사용자는 곧바로 대기 페이지로 보내고,
 * 완료되면 백그라운드에서 DB만 갱신한다.
 *
 * @returns {Promise<string|null>} 성공하면 shopOrderNo, 티켓이 유효하지 않으면 null
 */
export async function redeemTicket({ ticketCode, userInfo, goodsType }) {
  if (!ticketCode) return null;

  const goods = GoodsType[goodsType];
  if (!goods) throw new Error(`알 수 없는 상품 코드입니다: ${goodsType}`);

  // 이미 쓴 티켓·없는 티켓은 조용히 넘긴다(호출부가 결제 흐름으로 이어가면 된다)
  const ticket = await Coupons.findOne({ where: { code: ticketCode, isUsed: false } });
  if (!ticket) return null;

  // 다른 상품 티켓으로 이 상품을 받아가지 못하게 막는다.
  // 번들 티켓이면 본 리포트 상품과 비교한다.
  const ticketGoods = GoodsType[String(ticket.goodsType || "").toUpperCase()];
  const allowed = ticketGoods?.reportCode || ticketGoods?.code || null;
  if (allowed && allowed !== goods.code) {
    console.warn(`[ticket] ${ticketCode}는 ${allowed} 티켓인데 ${goods.code}에서 쓰려 함 — 거부`);
    return null;
  }

  // 동시에 두 번 눌러도 한 번만 쓰이도록, 아직 안 쓴 상태일 때만 갱신한다
  const [updated] = await Coupons.update(
    { isUsed: true },
    { where: { code: ticketCode, isUsed: false } }
  );
  if (!updated) return null;   // 그 사이 다른 요청이 먼저 썼다

  const shopOrderNo = `TICKET-${ticketCode}-${Date.now()}`;

  const [{ default: PaymentTransactionRepository }, { default: reportHistoryService }, { default: gptService }] =
    await Promise.all([
      import("../repository/PaymentTransactionRepository.js"),
      import("./ReportHistoryService.js"),
      import("./GptService.js"),
    ]);

  await PaymentTransactionRepository.createPrepaidPayment({
    shopOrderNo,
    platform: goods.platform.code,
    userTelNo: userInfo.phone || userInfo.tel || userInfo.userTelNo,
    userPw: userInfo.pw || userInfo.userPw,
  });

  const created = await reportHistoryService.registerReportHistory({
    userInfo,
    sampleInfo: {},
    shopOrderNo,
    goodsType: goods,
  });

  // GPT는 기다리지 않는다 — 사용자는 대기 페이지에서 폴링한다
  gptService
    .callReport(userInfo, goods.code)
    .then(async (reportInfo) => {
      await reportHistoryService.updateById({ id: created.result.id, reportInfo });
      console.log(`✅ [${shopOrderNo}] 티켓 리포트 생성 완료`);
    })
    .catch((err) => console.error(`❌ [${shopOrderNo}] 티켓 리포트 생성 실패:`, err));

  return shopOrderNo;
}

/** 아직 안 쓴 티켓만 지운다 (이미 쓴 건 기록으로 남겨야 하므로 막는다) */
export async function deleteTicket(code) {
  const removed = await Coupons.destroy({
    where: { code, isUsed: false, type: "ADMIN" },
  });
  if (!removed) throw new Error("이미 사용됐거나 존재하지 않는 티켓입니다.");
  return true;
}

export default { getIssuableGoods, issueTickets, listTickets, redeemTicket, deleteTicket };
