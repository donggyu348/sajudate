const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** OpenAI rate_limit 응답에서 권장 대기 시간(ms) 추출 */
export function parseRateLimitWaitMs(message) {
  const text = String(message || '');
  const match = text.match(/try again in ([\d.]+)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 800;
  }
  if (/rate_limit_exceeded/i.test(text)) {
    return 15000;
  }
  return 1500;
}

export function isRateLimitError(message) {
  return /rate_limit_exceeded/i.test(String(message || ''));
}

class GptClient {
  /**
   * ChatGPT 프롬프트 호출 함수
   * rate limit 시 API 권장 대기 후 재시도 (최대 6회)
   */
  async callChatGpt(messages, model = 'gpt-4o', maxTokens = 4096) {
    if (!OPENAI_API_KEY) {
      throw new Error('환경변수 OPENAI_API_KEY가 설정되지 않았습니다. .env에 설정 후 서버를 재시작하세요.');
    }

    const MAX_RETRIES = 5;
    let attempt = 0;
    let lastError;

    while (attempt <= MAX_RETRIES) {
      try {
        const response = await fetch(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API 호출 실패: ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? '';

      } catch (err) {
        lastError = err;
        console.error(`[GPT ERROR] 시도 ${attempt + 1}회 실패:`, err.message);

        if (attempt === MAX_RETRIES) {
          console.error("[GPT ERROR] 최대 재시도 횟수 초과");
          throw lastError;
        }

        const waitMs = parseRateLimitWaitMs(err.message);
        if (isRateLimitError(err.message)) {
          console.log(`[GPT] rate limit — ${waitMs}ms 후 재시도`);
        }
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      attempt++;
    }

    throw lastError;
  }
}

export default new GptClient();
