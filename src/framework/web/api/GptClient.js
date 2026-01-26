const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

class GptClient {
  /**
   * ChatGPT 프롬프트 호출 함수
   * 최대 3회까지 재시도 (기본 1회 + 실패시 2회)
   */
  async callChatGpt(messages, model = 'gpt-4o-mini') {
    if (!OPENAI_API_KEY) {
      throw new Error('환경변수 OPENAI_API_KEY가 설정되지 않았습니다. .env에 설정 후 서버를 재시작하세요.');
    }

    const MAX_RETRIES = 2; // 최초 1회 + 추가 2회 = 총 3회
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
            temperature: 0.8,
            max_tokens: 5000
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

        // 마지막 시도라면 바로 throw
        if (attempt === MAX_RETRIES) {
          console.error("[GPT ERROR] 최대 재시도 횟수 초과");
          throw lastError;
        }

        // 재시도 전 약간의 대기 (100~300ms)
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      attempt++;
    }

    throw lastError; // 논리적으로 여기까지 올 일은 거의 없음
  }
}

export default new GptClient();
