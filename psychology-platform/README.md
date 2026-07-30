# 심리 상품 플랫폼 (psychology-platform)

심리 관련 여러 상품을 담는 플랫폼. 첫 번째 상품은 **다크심리학 연애 진단**.

스택: Express + EJS + Tailwind CSS + Sequelize + MySQL

## 구조

```
src/
  app.js                     Express 앱 조립
  server.js                  진입점 (DB 연결 + 리슨)
  db/sequelize.js            Sequelize 연결
  models/                    플랫폼 공통 모델 (User, Product) + 레지스트리
  routes/home.js             메인 페이지 / 일반 상품 상세
  products/
    registry.js              상품 모듈 등록 (/products/:slug 마운트)
    dark-psych-love/
      router.js              상품 전용 라우트 (인트로→체크리스트→결과→업로드→리포트)
      models/                상품 전용 모델 (ChecklistResponse, ChatAnalysis, Report)
      logic/                 채점·파서·통계·LLM·리포트 로직
  views/
    layouts/base.ejs         모바일 우선 앱 셸 + 하단 탭바
    platform/                홈, 파셜(헤더/탭바/드로어), 404/error
    products/dark-psych-love/ 상품 화면들
  seed/seed.js               초기 상품 시드
```

**새 상품 추가 절차**: (1) `products/<slug>/router.js` 작성 → (2) `products/registry.js` 등록 →
(3) `Product` 테이블에 시드. 각 상품은 `/products/:slug` 하위에서 독립적으로 라우트/뷰/모델을 소유.

## 실행

```bash
cd psychology-platform
npm install
cp .env.example .env   # DB 접속정보 입력
```

MySQL 에 `.env` 의 `DB_NAME` 데이터베이스를 먼저 생성한 뒤:

```bash
npm run seed    # 초기 상품 시드 (테이블 자동 생성)
npm run dev     # Tailwind watch + 서버 (http://localhost:3000)
```

CSS만 별도 빌드: `npm run build:css`

## 다크심리학 연애 진단 플로우

1. `/products/dark-psych-love` — 상품 소개
2. 체크리스트 20문항 (관찰자 시점, 4축: 나르시시즘·마키아벨리즘·사이코패시·사디즘, 5점 척도)
3. 1차 결과 — 축별 점수 요약
4. (선택) 카카오톡 `.txt` 업로드 → 규칙 기반 통계 + 후보 구간 LLM 태깅
   - **원문은 서버에 저장하지 않음.** 분석 직후 파기, 통계/태깅 결과만 보관
   - iOS / Android / Windows 내보내기 포맷 자동 인식
5. 최종 리포트 — 레이더 차트 + 패턴 통계(인용문 없음) + 종합 소견 + 안전 안내

## LLM 태깅

`LLM_API_KEY` 미설정 시 LLM 호출을 건너뛰고 규칙 기반 통계만으로 리포트를 생성한다.
실제 연결은 `src/products/dark-psych-love/logic/llmClient.js` 의 fetch 블록만 채우면 된다.
프롬프트/출력 스키마는 `logic/llmPrompt.js` 참고.

## 확인 필요 (배포 전)

- 상품 배너/카드 이미지는 직접 업로드 예정 (`Product.thumbnailUrl`, 현재 placeholder)
- `logic/safety.js` 의 상담 기관 연락처/링크 최신 여부 검증 후 `verified: true` 로 전환
