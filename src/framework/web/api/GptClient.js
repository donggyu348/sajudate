const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

class GptClient {
  /**
   * ChatGPT 프롬프트 호출 함수
   * @param {Array} messages - [{ role: "system" | "user" | "assistant", content: string }]
   * @param {string} model - 예: "gpt-4" 또는 "gpt-3.5-turbo"
   * @returns {Promise<string>} - 응답 메시지 반환
   */
  async callChatGpt(messages, model = 'gpt-4o') {
    if (!OPENAI_API_KEY) {
      throw new Error('환경변수 OPENAI_API_KEY가 설정되지 않았습니다. .env에 설정 후 서버를 재시작하세요.');
    }

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
  }
}

export default new GptClient();