// 랜딩·로딩 화면에 노출하는 시딩 후기 문구.
// 실사용자 후기가 쌓이기 전까지 쓰는 고정 문구이며, 매 요청마다 랜덤으로 골라 보여준다.
export const REVIEWS = [
  { nick: 'j***', days: 2, text: '설마설마 했는데 진짜였음' },
  { nick: 'ㅅㅇ**', days: 5, text: '처음엔 반신반의했는데... 결과 보고 한동안 아무 말도 못했어요.' },
  { nick: 'min***', days: 1, text: '야 이거 진짜 소름돋는다 캡처해서 친구한테 바로 보냄ㅋㅋ' },
  { nick: 'ㅇㅇ***', days: 8, text: '그동안 제가 이상한 건 줄 알았는데, 패턴으로 딱 정리해서 보여주니까 아니더라고요.' },
  { nick: 'hy**', days: 3, text: '정확해서 무섭다 진짜' },
  { nick: 'ㅈㅎ**', days: 12, text: '친구가 자꾸 걱정하길래 홧김에 해봤습니다. 근데 이거 안 웃기게 됐어요.' },
  { nick: 'yes***', days: 4, text: '3분 걸려서 넣었는데 결과는 하루 종일 생각남' },
  { nick: 'ㅁㄴ**', days: 6, text: '이걸 왜 이제 알았지 싶었어요' },
  { nick: 'so***', days: 9, text: '데이터로 보여주니까 할 말이 없더라구요' },
  { nick: 'ㅎㅈ***', days: 2, text: '언니가 추천해줘서 해봤는데 저도 추천하게 됨' },
  { nick: 'kim***', days: 7, text: '감지된 패턴 개수 보고... 이렇게 많았나 싶었어요' },
  { nick: 'ㅇㅈ**', days: 14, text: '결과지 보다가 눈물 날 뻔했어요' },
  { nick: 'da***', days: 1, text: '무료로 살짝 보고 반신반의하다가 바로 결제함. 정확도 실화?' },
  { nick: 'ㅅㅎ***', days: 10, text: '혼자 끙끙 앓다가 넣어본 건데, 뭔가 좀 후련하네요.' },
  { nick: 'nay**', days: 3, text: '캡처해서 단톡방에 공유함, 다들 말이 없어짐' },
  { nick: 'ㅂㅇ**', days: 5, text: '별 기대 안 하고 했는데 결과 받고 좀 멍해졌어요' },
  { nick: 'lee***', days: 11, text: '내 촉이 틀리지 않았다는 걸 데이터로 받아버림' },
  { nick: 'ㅊㅇ**', days: 6, text: '"그냥 넘길까" 하다가 카톡 넣어봤는데 넘길 일이 아니었더라구요' },
  { nick: 'sun***', days: 4, text: '친구가 억지로 시켜서 했는데, 결과 보고 저도 조용해짐' },
  { nick: 'ㅇㅎ***', days: 13, text: '위로해주는 앱인 줄 알았는데 근거를 보여줘서 오히려 마음이 정리됐어요' },
];

// 중복 없이 n개를 랜덤으로 뽑는다.
export function pickReviews(n = 6) {
  const pool = REVIEWS.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
