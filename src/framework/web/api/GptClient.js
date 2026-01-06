const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

class GptClient {
  async callChatGpt(messages, model = 'gpt-4.1-mini') {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY가 없습니다.');
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: messages.map(m => ({
          role: m.role,
          content: [{ type: "text", text: m.content }]
        })),
        max_output_tokens: 5000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 호출 실패: ${errorText}`);
    }

    const data = await response.json();
    return data.output_text ?? '';
  }
}

export default new GptClient();
