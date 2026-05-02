const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

class GptClient {
  // 프로세스 전체에서 GPT 호출을 직렬화(동시 호출로 TPM 폭주 방지)
  // 결제/리포트는 챕터 단위로 연쇄 호출되므로, 큐잉이 가장 효과적입니다.
  static _queue = Promise.resolve();
  static _lastCallAt = 0;

  static async _enqueue(fn) {
    const run = async () => fn();
    // 이전 작업이 실패해도 큐는 이어지도록 catch로 흡수
    const next = GptClient._queue.then(run, run);
    GptClient._queue = next.catch(() => {});
    return next;
  }

  /**
   * ChatGPT 프롬프트 호출 함수
   * 최대 3회까지 재시도 (기본 1회 + 실패시 2회)
   */
  /**
   * @param {{ maxTokens?: number }} [options] — maxTokens 미지정 시 OPENAI_MAX_TOKENS 또는 1700
   */
  async callChatGpt(messages, model = 'gpt-4o', options = {}) {
    return await GptClient._enqueue(async () => {
      const openAiApiKey = process.env.OPENAI_API_KEY;
      if (!openAiApiKey) {
        throw new Error('환경변수 OPENAI_API_KEY가 설정되지 않았습니다. .env에 설정 후 서버를 재시작하세요.');
      }

      const MAX_RETRIES = 3; // 최초 1회 + 추가 3회 = 총 4회 (429 연속 시 여유)
      let attempt = 0;
      let lastError;

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // 에러 메시지에 포함된 "Please try again in 13.742s" 같은 값을 파싱
      const parseRetryAfterMsFromMessage = (msg) => {
        const s = String(msg || "");
        // fetch 응답에 붙인 헤더 백업 (OpenAI가 Retry-After를 줄 때 우선)
        const hdr = s.match(/\|\|retry-after:\s*(\d+(?:\.\d+)?)/);
        if (hdr) {
          const sec = Number(hdr[1]);
          if (Number.isFinite(sec)) return Math.ceil((sec + 1) * 1000);
        }
        const m = s.match(/try again in\s+(\d+(?:\.\d+)?)s/i);
        if (!m) return null;
        const sec = Number(m[1]);
        if (!Number.isFinite(sec)) return null;
        // 버퍼를 조금 더 둬서 같은 분당 제한에 다시 걸리는 걸 줄임
        return Math.ceil((sec + 1.5) * 1000);
      };

      // 429가 지속되면 더 가벼운 모델로 폴백해 호출 성공률을 올립니다.
      // (리포트 길이는 템플릿/후처리에서 보장하고, GPT는 "구조화된 JSON"을 안정적으로 받는 것이 우선)
      let currentModel = model;
      const fetchTimeoutMs = Number(process.env.OPENAI_FETCH_TIMEOUT_MS || 180000);
      const maxTokens =
        typeof options?.maxTokens === "number" && Number.isFinite(options.maxTokens)
          ? Math.min(Math.max(options.maxTokens, 256), 8192)
          : Number(process.env.OPENAI_MAX_TOKENS || 1700);

      while (attempt <= MAX_RETRIES) {
        try {
          // 호출 간 최소 간격: 분당 토큰 한도에 덜 걸리게
          const now = Date.now();
          // 리포트는 챕터당 1회 호출이라 기본값을 너무 짧게 두면 TPM에 자주 걸립니다.
          const minGapMs = Number(process.env.OPENAI_MIN_GAP_MS || 700);
          const since = now - (GptClient._lastCallAt || 0);
          if (since < minGapMs) await sleep(minGapMs - since);

          const controller =
            typeof AbortSignal !== "undefined" && AbortSignal.timeout
              ? AbortSignal.timeout(fetchTimeoutMs)
              : undefined;

          console.log(`[GPT] chat.completions 요청 시작 model=${currentModel} (타임아웃 ${fetchTimeoutMs}ms)`);

          const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            signal: controller,
            headers: {
              'Authorization': `Bearer ${openAiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: currentModel,
              messages,
              temperature: 0.7,
              // 리포트 등에서 options.maxTokens로 필요 시 확장 (티어별 TPM 고려).
              max_tokens: maxTokens,
              response_format: { type: "json_object" } // 모델 수준에서 JSON 출력 강제
            }),
          });

          GptClient._lastCallAt = Date.now();

          if (!response.ok) {
            const retryAfterHeader = response.headers.get('retry-after');
            const errorText = await response.text();
            // 인증 오류는 재시도해도 해결되지 않으므로 즉시 실패 처리합니다.
            if (response.status === 401) {
              throw new Error(`OpenAI API 호출 실패(401): ${errorText}`);
            }
            // 429(레이트리밋)은 안내된 시간만큼 기다린 후 재시도해야 합니다.
            if (response.status === 429) {
              const hdr = retryAfterHeader ? ` ||retry-after:${retryAfterHeader}` : '';
              throw new Error(`OpenAI API 호출 실패(429): ${errorText}${hdr}`);
            }
            throw new Error(`OpenAI API 호출 실패: ${errorText}`);
          }

          const data = await response.json();
          return data.choices?.[0]?.message?.content ?? '';

        } catch (err) {
          lastError = err;
          const isAbort =
            err?.name === "AbortError" ||
            err?.cause?.name === "TimeoutError" ||
            err?.message?.includes?.("aborted");
          if (isAbort) {
            console.error(`[GPT ERROR] 시도 ${attempt + 1}회 실패: OpenAI 요청 타임아웃(${fetchTimeoutMs}ms) 또는 연결 중단`);
          } else {
            console.error(`[GPT ERROR] 시도 ${attempt + 1}회 실패:`, err.message);
          }

          // 인증 실패(401)는 재시도 의미가 없음
          if (String(err.message || "").includes("OpenAI API 호출 실패(401)")) {
            throw lastError;
          }

          // 레이트 리밋(429)은 응답 메시지의 대기 시간을 존중
          if (String(err.message || "").includes("OpenAI API 호출 실패(429)")) {
            const waitMs = parseRetryAfterMsFromMessage(err.message) ?? (15000 + attempt * 5000);
            // 마지막 시도라면 바로 throw
            if (attempt === MAX_RETRIES) {
              console.error("[GPT ERROR] 최대 재시도 횟수 초과");
              throw lastError;
            }

            // 첫 429 이후에는 모델을 한 단계 낮춰(조직별 TPM 분리 기대) 성공률을 올림
            if (attempt === 0 && currentModel === 'gpt-4o') {
              currentModel = 'gpt-4o-mini';
              console.warn(`[GPT WARN] 429 발생. 모델을 ${currentModel}로 폴백합니다.`);
            }

            console.warn(`[GPT WARN] 레이트리밋 감지. ${Math.ceil(waitMs / 1000)}초 대기 후 재시도합니다.`);
            await sleep(waitMs);
            attempt++;
            continue;
          }

          // 마지막 시도라면 바로 throw
          if (attempt === MAX_RETRIES) {
            console.error("[GPT ERROR] 최대 재시도 횟수 초과");
            throw lastError;
          }

          // 일반 오류 재시도 전 약간의 대기
          await sleep(200 + attempt * 150);
        }

        attempt++;
      }

      throw lastError; // 논리적으로 여기까지 올 일은 거의 없음
    });
  }
}

export default new GptClient();
