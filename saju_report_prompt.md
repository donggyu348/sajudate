# 천해랑의 은밀한 정욕합 사주 — 비주얼 노벨 리포트 구현 스펙

> 이 문서 그대로 구현할 것. 추측해서 디자인을 바꾸지 말고, 아래 토큰/데이터/동작을 1:1로 재현한다.
> 결과물은 모바일(약 332~390px 폭) 세로형 단일 화면 인터랙티브 리포트다.

---

## 0. 목표 / 콘셉트

- 무속인 캐릭터 **천해랑**이 사용자에게 "정욕합 사주"를 한 장면씩 읽어주는 **비주얼 노벨 / 웹툰 스타일** 리포트.
- 화면을 **탭하면 다음 장면으로 넘어간다**(우측 탭 = 다음, 좌측 탭 = 이전).
- 각 장면 = 큰 캐릭터 일러스트(풀샷) 위에 자막처럼 텍스트를 얹는 구조.
- 전체 톤: **거의 검정에 가까운 다크**, 포인트 컬러는 핫핑크 하나.
- 전체 26화면: 인트로 1 + PART 1~5(각 5화면) + 최종 선고 1.

---

## 1. 기술 스택

- Vite + React + TypeScript
- Tailwind CSS
- 상태관리는 `useState` 하나로 충분 (현재 인덱스). 외부 라이브러리 불필요.
- (선택) 좌우 슬라이드 전환에 `framer-motion`만 추가 가능. 없어도 됨.

폴더 구조 예시:
```
src/
  App.tsx
  components/
    SajuReport.tsx      // 메인 스테퍼 컨테이너
    PhoneFrame.tsx      // 폰 프레임 래퍼
    ProgressBar.tsx     // 상단 진행 바
    screens/
      IntroScreen.tsx
      TitleScreen.tsx
      ItemScreen.tsx    // item / add / warn 3종 variant
      VerdictScreen.tsx
  data/
    report.ts           // 아래 SCREENS 데이터
```

---

## 2. 디자인 토큰

### 색상 (정확히 이 값 사용)
| 용도 | HEX |
|---|---|
| 앱 배경 (가장 어두움) | `#040102` |
| 일러스트 패널 배경 | `#14060c` (타이틀/항목), `#10040a` (인트로/선고) |
| 일러스트 placeholder 아이콘 색 | `#36101f` (인트로 한정 `#3a1024`) |
| 포인트 핑크 (브랜드) | `#e0246f` |
| 보조 핑크 (추가 카드) | `#ff7eb3`, 보더 `#5a2038`, 배경 `#1a0810` |
| 경고 레드 | 텍스트 `#ff6b6b`, 보더 `#5a1a1a`, 배경 `#1c0707`, 본문 `#e0a0a0` |
| 본문 텍스트 | `#d9c0c9` |
| 대사(세리프) 텍스트 | `#e8c5d2` |
| 흐린 보조 텍스트 | `#6e4d59` |
| 연출 지문 텍스트 | `#6e4d59` (italic) |
| 한자 챕터 숫자 | `#2a0c1a` |
| 카드 배경 / 보더 | 배경 `#0c0509`, 보더 `#2a1019` |
| 진행 바 트랙 | `#2a0c1a`, 채움 `#e0246f` |

Tailwind는 임의값 클래스(`bg-[#040102]`)를 쓰거나 `tailwind.config`의 `theme.extend.colors`에 위 값을 등록한다.

### 폰트
- 기본(UI/본문/항목): sans-serif. 한글은 Pretendard 권장.
- **대사·캐릭터 이름·결론 = 세리프(명조)**: `Noto Serif KR` 또는 `Nanum Myeongjo`. 분위기의 핵심이므로 반드시 세리프로.

### 타이포 규칙
- 폰트 사이즈 최소 10px.
- 캐릭터 이름 타이틀 30px / 세리프 / `letter-spacing` 넓게.
- 대사 13px / 세리프 / italic / `line-height:1.7~1.9`.
- 항목 제목 11px(핑크), 본문 12px(`#d9c0c9`).
- 굵기는 400/500만 사용.

---

## 3. 레이아웃 구조

### 폰 프레임
- 폭 `332px`, 높이 `600px`, `border-radius: 30px`, `overflow: hidden`, 배경 `#040102`, 1px 보더 `#1a0d12`.
- 내부는 `position: relative`. 모든 화면은 `position:absolute; inset:0`로 겹쳐두고 현재 화면만 표시.

### 고정 오버레이 (화면 위에 항상 떠 있음)
1. **상단 진행 바**: `top:16px; left/right:22px; height:3px`, 트랙 `#2a0c1a`, 채움 div 너비 = `((cur+1)/total)*100%`, `transition: width .25s`.
2. **탭 영역(투명 버튼 2개)**:
   - 이전: 좌측 `width:36%`, `top:60px; bottom:56px`
   - 다음: 우측 `width:64%`, `top:60px; bottom:56px`
   - 둘 다 배경 투명, z-index 20.
3. **하단 바**: 좌측에 힌트 텍스트(`화면을 탭해서 넘기기 →` / 첫 화면 이후 `n / total`), 우측에 `19+ 엔터테인먼트`. 배경은 위쪽으로 사라지는 그라데이션 `linear-gradient(to top,#040102 60%,transparent)`.

### 각 화면 공통
- 맨 아래 레이어: 일러스트 패널(풀블리드). 지금은 placeholder로 큰 Tabler 아이콘(150~170px, 색 `#36101f`)을 중앙 배치. **실제 구현 시 이 자리에 천해랑 일러스트 이미지를 넣는다.**
- 그 위 그라데이션 오버레이: `linear-gradient(to top,#040102 30%,rgba(4,1,2,0) 64%)` (인트로/선고는 시작 지점 18~22%).
- 맨 위 텍스트 레이어: 하단 패딩 `0 22px 72px`.

---

## 4. 화면 타입 (5종)

### A. intro
- 큰 아이콘(170px) 중앙.
- 하단 가운데 정렬: `무 속 인`(10px, letter-spacing 5px, 핑크) → `천 해 랑`(30px, 세리프, 흰색) → 대사(13px, 세리프, italic, `#c89aa9`).

### B. title (각 파트 도입)
- 좌상단에 한자 챕터 숫자(46px, 세리프, `#2a0c1a`, `top:42px; left:24px`).
- 하단: 파트 라벨(10px, 핑크, letter-spacing 2px) → 연출 지문(10px, italic, `#6e4d59`) → **대사 말풍선**.
- 말풍선: 배경 `#0c0509`, 좌측만 2px 핑크 보더(`border-left`), `border-radius:0 12px 12px 0`, padding `13px 15px`. 안에 `천해랑`(10px 핑크) + 대사(13px 세리프 italic `#e8c5d2`).

### C. item (붉은 글자 = 분석 항목)
- 하단: 작은 라벨(10px, `#6e4d59`, 예: `PART 1 — 첫 번째 붉은 글자`) → 카드.
- 카드: 배경 `#0c0509`, 1px 보더 `#2a1019`, radius 14px, padding 16px. 제목(11px 핑크, 앞에 🔥 아이콘) + 본문(12px `#d9c0c9`, line-height 1.7).

### D. add (각 파트 '추가의 한 수') — item의 variant
- 카드 배경 `#1a0810`, 보더 `#5a2038`, 제목색 `#ff7eb3`.

### E. warn (PART 4 경고) — item의 variant
- 카드 배경 `#1c0707`, 보더 `#5a1a1a`, 제목색 `#ff6b6b`(앞에 ⚠ 아이콘), 본문색 `#e0a0a0`.

### F. verdict (최종 선고)
- 큰 음양 아이콘(130px).
- 하단 가운데: `⚖ 천해랑의 결론`(10px 핑크) → 강조 박스(배경 `#1a0810`, 보더 `#5a2038`, radius 14px) 안에 2줄 세리프 대사 → 꼬리말(10px `#6e4d59`).

아이콘은 Tabler Icons(outline) 사용. 매핑은 아래 데이터의 `ic` 필드 참고.

---

## 5. 화면 데이터 (그대로 사용)

`src/data/report.ts`:

```ts
export type Screen =
  | { t: 'intro'; ic: string; sub: string; name: string; q: string }
  | { t: 'title'; hj: string; ic: string; pl: string; dir: string; dlg: string }
  | { t: 'item' | 'add' | 'warn'; sl: string; ic: string; hd: string; bd: string }
  | { t: 'verdict'; ic: string; pl: string; v1: string; v2: string; tail: string };

export const SCREENS: Screen[] = [
  { t:'intro', ic:'IconSpy', sub:'무 속 인', name:'천 해 랑',
    q:'"들어오자마자 사주에 불길이 확 번지네…<br/>네 본능이 진짜 원하는 게 뭔지,<br/>내가 하나씩 까발려 줄게."' },

  // PART 1
  { t:'title', hj:'壹', ic:'IconMoodWink', pl:'PART 1 · 내재된 본능과 성향',
    dir:'붉은 부채로 입술을 가린 채 천천히 웃는다.',
    dlg:'"겉으론 얌전한 척하느라 고생 좀 했겠어. 밑바닥에 숨겨진 붉은 글자들… 하나씩 보여줄게."' },
  { t:'item', sl:'PART 1 — 첫 번째 붉은 글자', ic:'IconFlame', hd:'정욕합이 들어맞는 사람',
    bd:'네 일지의 글자를 도발해 잠재된 성적 판타지를 깨우는 상대의 오행과 살(殺)을 짚어줄게.' },
  { t:'item', sl:'PART 1 — 두 번째 붉은 글자', ic:'IconEyeClosed', hd:'너도 몰랐던 숨겨진 욕망',
    bd:'무의식 속 지장간(支藏干)에 억눌려 있던 지배·피지배 욕구를 끄집어내 줄게.' },
  { t:'item', sl:'PART 1 — 세 번째 붉은 글자', ic:'IconRope', hd:'SM 성향 분석',
    bd:'관성(官星)과 식상(食傷)의 구성으로 본능적 포지션을 본다. 리드하는 쪽인가, 묶이는 쪽인가.' },
  { t:'add', sl:'PART 1 — 추가의 한 수', ic:'IconEye', hd:'시선이 오래 머무는 이유',
    bd:'상대의 특정 신체 부위나 분위기에 네 도화살이 강하게 반응하는 메커니즘을 규명해 줄게.' },

  // PART 2
  { t:'title', hj:'貳', ic:'IconMoodSmirk', pl:'PART 2 · 시각과 이성의 마비',
    dir:'엽전을 굴리며 네 옷차림을 위아래로 훑는다.',
    dlg:'"이성이 \'아니\'라고 해도 몸이 먼저 반응하는 비주얼이 있지? 네 사주가 굶주린 색(色)을 상대가 입고 나와서 그래."' },
  { t:'item', sl:'PART 2 — 첫 번째 붉은 글자', ic:'IconShirt', hd:'너에게 먹히는 스타일링',
    bd:'네 오행의 조후를 무너뜨리며 시각적 흥분을 유도하는 상대의 색상과 착장.' },
  { t:'item', sl:'PART 2 — 두 번째 붉은 글자', ic:'IconBolt', hd:'첫눈에 꽂히는 상대',
    bd:'마주치자마자 뇌정지를 일으키는 외모적 특징과 홍염살 분위기.' },
  { t:'item', sl:'PART 2 — 세 번째 붉은 글자', ic:'IconHandFinger', hd:'본능을 자극하는 행동',
    bd:'소매를 걷거나 낮게 속삭이거나… 네 격국을 뒤흔드는 결정적 찰나의 제스처.' },
  { t:'add', sl:'PART 2 — 추가의 한 수', ic:'IconMagnet', hd:'절대 피할 수 없는 끌림',
    bd:'사주 원국 전체가 자석처럼 서로를 밀어 넣는 천충지충(天衝地衝) 혹은 육합(六合)의 인력.' },

  // PART 3
  { t:'title', hj:'參', ic:'IconBell', pl:'PART 3 · 살과 살이 맞닿을 때',
    dir:'방울을 딸랑 흔든 뒤 손가락으로 테이블을 톡톡. 목소리가 낮아진다.',
    dlg:'"손끝만 살짝 스쳤는데 목덜미까지 소름이 쫙 돋는 기분… 이 손가락 사이로 전류가 흐르는 거야."' },
  { t:'item', sl:'PART 3 — 첫 번째 붉은 글자', ic:'IconBolt', hd:'손만 닿아도 전류가 흐르는 정욕합',
    bd:'서로의 일지가 합(合)을 이뤄 몸의 궁합이 폭발하는 화학적 시너지.' },
  { t:'item', sl:'PART 3 — 두 번째 붉은 글자', ic:'IconTarget', hd:'서로가 굴복하는 지점',
    bd:'상대의 원진살이 네 약점을 파고들어 이성을 무너뜨리는 치명적인 터치 포인트.' },
  { t:'item', sl:'PART 3 — 세 번째 붉은 글자', ic:'IconCrown', hd:'둘만의 주도권',
    bd:'음양(陰陽)의 강약에 따라 결정되는, 침대 위 밤의 권력자 판별.' },
  { t:'add', sl:'PART 3 — 추가의 한 수', ic:'IconWind', hd:'한 번 스치면 잊히지 않는 이유',
    bd:'살을 섞은 후에도 뇌리에 가시지 않는 지독한 향취와 잔상의 정체.' },

  // PART 4
  { t:'title', hj:'肆', ic:'IconFlame', pl:'PART 4 · 시공간의 왜곡',
    dir:'촛불을 바라보며 불꽃 주변을 감싸듯 손가락을 움직인다.',
    dlg:'"물에도 물때가 있듯이, 살이 오르는 시기가 따로 있어. 네 감각을 몇 배는 예민하게 만들 은밀한 공간도."' },
  { t:'item', sl:'PART 4 — 첫 번째 붉은 글자', ic:'IconCalendarHeart', hd:'발정 시기 분석',
    bd:'대운과 세운에서 도화운과 재성·관성이 겹치며 성적 에너지가 정점에 달하는 시기 예측.' },
  { t:'item', sl:'PART 4 — 두 번째 붉은 글자', ic:'IconMapPin', hd:'스파크 튀는 장소 스팟',
    bd:'네 사주에 부족한 오행을 채워 해방감을 주는 공간(물가, 어두운 밀실, 높은 곳 등) 추천.' },
  { t:'item', sl:'PART 4 — 세 번째 붉은 글자', ic:'IconClockHour9', hd:'둘이 만나면 강해지는 시간대',
    bd:'야자시(夜子時)나 묘시(卯時) 등 두 사람의 합이 극대화되는 야릇한 골든 타임.' },
  { t:'warn', sl:'PART 4 — 천해랑의 경고', ic:'IconAlertTriangle', hd:'천해랑의 위험 경고',
    bd:'"이때는 진짜 조심해." 이성을 잃고 쾌락에만 폭주해 사고 칠 수 있는 위험천만한 순간.' },

  // PART 5
  { t:'title', hj:'伍', ic:'IconMoodSmirk', pl:'PART 5 · 치명적인 흔적과 결론',
    dir:'몸을 불쑥 숙여 거리를 좁히고, 손끝으로 턱을 살짝 치켜올리는 시선.',
    dlg:'"결국 넌 상대를 네 몸으로 중독시키게 될 거야. 이 관계가 끝나도 네 살 냄새를 평생 못 잊을걸."' },
  { t:'item', sl:'PART 5 — 첫 번째 붉은 글자', ic:'IconFlame', hd:'당신의 성적 필살기',
    bd:'타인을 매료시키는 네 사주 속 가장 강력한 나체도화 혹은 괴강(魁罡)의 매력.' },
  { t:'item', sl:'PART 5 — 두 번째 붉은 글자', ic:'IconArrowsShuffle', hd:'당신의 바람기 분석',
    bd:'일지 편재·편관의 동태로 보는, 새로운 육체적 자극에 흔들리는 지수.' },
  { t:'item', sl:'PART 5 — 세 번째 붉은 글자', ic:'IconHeartBroken', hd:'헤어져도 못 잊는 이유',
    bd:'영혼에 새겨진 흉터처럼, 상대의 지지에 남겨진 네 글자의 파괴력.' },
  { t:'verdict', ic:'IconYinYang', pl:'천해랑의 결론',
    v1:'신이 맺어준 운명적 결합인가,', v2:'서로의 몸만 탐하는 치명적 중독인가.',
    tail:'— 두 사람의 정욕합, 최종 선고 —' },
];
```

> 아이콘은 `@tabler/icons-react`의 동명 컴포넌트로 매핑한다. (예: `IconSpy`, `IconFlame`, `IconMoodWink`, `IconEyeClosed`, `IconRope`, `IconEye`, `IconMoodSmirk`, `IconShirt`, `IconBolt`, `IconHandFinger`, `IconMagnet`, `IconBell`, `IconTarget`, `IconCrown`, `IconWind`, `IconCalendarHeart`, `IconMapPin`, `IconClockHour9`, `IconAlertTriangle`, `IconArrowsShuffle`, `IconHeartBroken`, `IconYinYang`, `IconGavel`.) 매핑 객체를 만들어 `ic` 문자열 → 컴포넌트로 변환.

---

## 6. 동작 명세

- `const [cur, setCur] = useState(0)`.
- 우측 탭 → `setCur(c => Math.min(c+1, SCREENS.length-1))`.
- 좌측 탭 → `setCur(c => Math.max(c-1, 0))`.
- 진행 바 채움 너비 = `${Math.round(((cur+1)/SCREENS.length)*100)}%`.
- 하단 힌트: `cur===0 ? '화면을 탭해서 넘기기 →' : `${cur+1} / ${SCREENS.length}``.
- 첫 진입 시 0번(인트로) 표시.
- (선택) 화면 전환 시 좌→우 슬라이드 + 페이드. framer-motion `AnimatePresence`로 `key={cur}` 슬라이드. 없으면 단순 교체.
- 대사/`q` 안의 `<br/>`는 줄바꿈으로 렌더(`dangerouslySetInnerHTML` 대신 문자열을 `split('<br/>')` 후 `<br/>` JSX로 매핑하는 방식 권장).

---

## 7. 주의사항

- 폰 프레임 바깥(웹 페이지 배경)은 임의로 디자인하지 말고 중앙 정렬만. 우선은 프레임 안만 정확히.
- 일러스트는 지금 Tabler 아이콘 placeholder. `src/assets/illustrations/`에 이미지가 들어오면 화면 타입별로 `<img>`로 교체할 수 있게, 일러스트 영역을 별도 컴포넌트(`<Illustration screen={s} />`)로 분리해 둘 것.
- 19세 이상 엔터테인먼트 콘텐츠. 하단 `19+` 표기 유지.
- 반응형: 우선 332px 고정으로 정확히 구현 후, 가능하면 모바일 풀스크린(`100dvh`)으로도 늘어나게 프레임 폭/높이를 `min()` 처리.

---

## 8. 완료 기준 (체크리스트)

- [ ] 26개 화면이 순서대로 탭 전환된다.
- [ ] 5개 화면 타입(intro/title/item/add/warn/verdict) 디자인이 위 토큰과 일치한다.
- [ ] 상단 진행 바가 비율대로 찬다.
- [ ] 좌/우 탭 영역이 동작한다.
- [ ] 대사·이름·결론은 세리프, 나머지는 sans.
- [ ] 일러스트 영역이 컴포넌트로 분리돼 이미지 교체가 쉽다.
