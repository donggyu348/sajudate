import sharp from 'sharp';
import { getCounselorClient } from './counselor.js';
import { safeJsonParse } from './jsonUtil.js';

// Claude 비전은 한 변이 8000px를 넘는 이미지를 거부한다. '캡처 길게'로 만든
// 세로로 아주 긴 스크롤 캡처를 대비해, 넘치면 세로로 잘라 여러 장으로 나눈다.
const MAX_DIM = 7900;

// 캡처 판독은 상담봇 기본 모델(비용 절감용 Haiku)과 분리 — Haiku는 작은 글자 OCR을
// 이상하게 읽는 문제가 있었고, Opus는 정확하지만 비용이 너무 큼. Sonnet 5가 비용/정확도 균형점.
const VISION_MODEL = process.env.KAKAO_VISION_MODEL || 'claude-sonnet-5';

/**
 * 업로드된 이미지 하나를 Claude 비전이 받을 수 있는 크기의 이미지 1장 이상으로 변환.
 * LLM 호출 없이 순수 이미지 처리만 하므로 빠르다 — 업로드 직후 '분석 중' 화면으로
 * 즉시 넘어갈 수 있도록, 무거운 비전 판독(transcribeKakaoImages)과 분리해 둔다.
 * @param {{ buffer: Buffer, mimetype: string }} file
 * @returns {Promise<{ buffer: Buffer, mimetype: string }[]>}
 */
export async function prepareImageForVision(file) {
  const meta = await sharp(file.buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  if (width <= MAX_DIM && height <= MAX_DIM) {
    return [file];
  }

  // 세로로 긴 스크롤 캡처: 가로 폭은 그대로 두고 세로만 MAX_DIM 이하 조각으로 분할
  if (width <= MAX_DIM && height > MAX_DIM) {
    const parts = [];
    let top = 0;
    while (top < height) {
      const h = Math.min(MAX_DIM, height - top);
      const buffer = await sharp(file.buffer)
        .extract({ left: 0, top, width, height: h })
        .jpeg({ quality: 90 })
        .toBuffer();
      parts.push({ buffer, mimetype: 'image/jpeg' });
      top += h;
    }
    return parts;
  }

  // 그 외(가로도 큰 경우 등)는 비율 유지한 채 안전하게 축소
  const buffer = await sharp(file.buffer)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside' })
    .jpeg({ quality: 90 })
    .toBuffer();
  return [{ buffer, mimetype: 'image/jpeg' }];
}

/**
 * 이미 prepareImageForVision을 거친 이미지들을 Claude 비전으로 읽어
 * chatStats.js가 기대하는 { messages } 구조로 반환한다. (LLM 호출 포함 — 느림)
 * 각 메시지에는 '분석 중' 화면에서 실제 캡처 이미지 위에 라벨을 겹쳐 보여줄 수 있도록
 * imageIndex(전달한 preparedImages 배열 기준)와 positionPercent(그 이미지 안에서 세로 위치, 0~100)를 함께 담는다.
 *
 * 날짜/시간은 캡처 이미지만으로는 신뢰도 있게 복원하기 어려워 항상 null로 둔다
 * (chatStats.js는 at이 null이어도 안전하게 동작하도록 되어 있음).
 *
 * @param {{ buffer: Buffer, mimetype: string }[]} preparedImages - prepareImageForVision을 거친 이미지들
 * @returns {Promise<{ messages: (import('./chatStats.js').KakaoMessage & { imageIndex: number, positionPercent: number })[] }>}
 */
export async function transcribeKakaoImages(preparedImages) {
  const client = getCounselorClient();
  if (!client || !preparedImages || preparedImages.length === 0) return { messages: [] };

  const systemPrompt = `당신은 카카오톡 대화 캡처 이미지에서 대화 내용을 그대로 옮겨 적는 보조입니다.
제공된 이미지들은 하나의 대화방을 캡처한 것으로, 이미지 순서(0부터 시작하는 번호) = 시간 순서이며 각 이미지 안에서는 위에서 아래 순서로 읽으세요.

규칙:
1. 화면 오른쪽에 정렬된 말풍선은 발신자를 "나"로, 왼쪽 말풍선은 화면에 보이는 이름을 그대로 sender로 적으세요. 이름이 안 보이면 "상대"로 적으세요.
2. 말풍선 텍스트를 요약하거나 판단하지 말고 원문 그대로, 글자 하나하나 정확하게 옮기세요.
3. 글자가 작거나 흐릿해서 확신이 안 서면 화면을 확대해 다시 보듯 신중하게 판독하세요. 절대 비슷한 모양의 다른 단어로 대충 지어내지 말고, 정말 읽을 수 없는 말풍선은 통째로 생략하세요. 부정확하게 옮기느니 생략하는 편이 낫습니다.
4. 시스템 메시지(입장/퇴장, 날짜 구분선 등)는 제외하세요.
5. 각 메시지마다 imageIndex(그 말풍선이 있는 이미지 번호, 0부터 시작)와 positionPercent(그 이미지 안에서 세로로 몇 % 지점에 있는지, 0=맨 위 100=맨 아래인 정수)를 함께 적으세요. 정확한 픽셀 좌표가 아니라 대략적인 위치면 됩니다.
6. 반드시 아래 JSON 형태로만 응답하세요. 다른 텍스트나 마크다운은 절대 포함하지 마세요.

JSON 형식: {"messages": [{"sender": "나", "text": "...", "imageIndex": 0, "positionPercent": 42}]}`;

  const imageBlocks = preparedImages.map((img) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.mimetype,
      data: img.buffer.toString('base64'),
    },
  }));

  const message = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: '위 이미지들에 담긴 대화를 순서대로 옮겨 적어 주세요.' }],
      },
    ],
  });

  const text = message?.content?.find((b) => b.type === 'text')?.text || '';
  const parsed = safeJsonParse(text);
  const rawMessages = Array.isArray(parsed?.messages) ? parsed.messages : [];

  const messages = rawMessages
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => {
      const imageIndex = Number.isInteger(m.imageIndex) ? Math.min(Math.max(m.imageIndex, 0), preparedImages.length - 1) : 0;
      const positionPercent = Number.isFinite(m.positionPercent) ? Math.min(Math.max(m.positionPercent, 0), 100) : 50;
      return {
        at: null,
        sender: typeof m.sender === 'string' && m.sender.trim() ? m.sender.trim() : '상대',
        text: m.text.trim(),
        imageIndex,
        positionPercent,
      };
    });

  return { messages };
}
