-- ============================================================
-- 29금 사주(ADULT), 29금 번들(ADULT_BUNDLE) 상품 DB 반영
-- MySQL에서 실행 (스키마는 필요 시 USE your_database; 로 지정)
-- ============================================================

-- 1) REPORT_HISTORY.goods_type 이 ENUM이면 VARCHAR로 변경 (ADULT, ADULT_BUNDLE 저장 가능)
ALTER TABLE REPORT_HISTORY
  MODIFY COLUMN goods_type VARCHAR(50) NULL COMMENT '상품타입';

-- 2) PAYMENT_TRANSACTION
--    goods_type 이 없으면 → 아래 (A)만 실행, 있으면 → (B)만 실행
-- (A) 컬럼 없을 때 추가:
-- ALTER TABLE PAYMENT_TRANSACTION ADD COLUMN goods_type VARCHAR(50) NULL COMMENT '상품타입';
-- (B) 컬럼 있을 때 VARCHAR로 통일:
ALTER TABLE PAYMENT_TRANSACTION MODIFY COLUMN goods_type VARCHAR(50) NULL COMMENT '상품타입';


-- ============================================================
-- [선택] 상품 마스터 테이블(GOODS 등)에 29금/번들 행 추가
-- 테이블·컬럼명이 다르면 맞춰서 수정 후 실행
-- ============================================================

-- 29금 사주 (단품)
-- INSERT INTO GOODS (code, title, price, original_price, discount_price, platform, give_ticket) VALUES
-- ('ADULT', '29금 사주', 34900, 49000, 14100, 'TIGHT', NULL);

-- 29금 사주 + 연애사주 번들 (연애사주 무료 티켓 증정)
-- INSERT INTO GOODS (code, title, price, original_price, discount_price, platform, give_ticket) VALUES
-- ('ADULT_BUNDLE', '29금 사주 + 연애사주', 49800, 67700, 17900, 'TIGHT', 'ROMANTIC');

-- 한 번에 넣기:
-- INSERT INTO GOODS (code, title, price, original_price, discount_price, platform, give_ticket) VALUES
-- ('ADULT', '29금 사주', 34900, 49000, 14100, 'TIGHT', NULL),
-- ('ADULT_BUNDLE', '29금 사주 + 연애사주', 49800, 67700, 17900, 'TIGHT', 'ROMANTIC');
