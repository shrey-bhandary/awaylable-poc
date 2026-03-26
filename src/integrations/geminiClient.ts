export type GeminiClientConfig = {
  apiKey?: string;
  model: string;
  onLog?: (entry: { component: string; action: string; status: "ok" | "error"; details?: Record<string, unknown> }) => void;
};

export class GeminiClient {
  constructor(private readonly config: GeminiClientConfig) {}

  async generateReply(systemPrompt: string, userText: string): Promise<string> {
    if (!this.config.apiKey) {
      this.config.onLog?.({
        component: "gemini",
        action: "generateReply",
        status: "error",
        details: { reason: "missing_api_key" }
      });
      return [
        "(fallback: no GEMINI_API_KEY)",
        "I can help with your query based on available Awaylable policy context.",
        `You said: ${userText}`
      ].join(" ");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userText }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 256
      }
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.config.onLog?.({
        component: "gemini",
        action: "generateReply",
        status: "error",
        details: { statusCode: response.status }
      });
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      this.config.onLog?.({
        component: "gemini",
        action: "generateReply",
        status: "error",
        details: { reason: "empty_response" }
      });
      throw new Error("Gemini API returned no text content");
    }

    this.config.onLog?.({
      component: "gemini",
      action: "generateReply",
      status: "ok",
      details: { model: this.config.model }
    });

    return text;
  }
}
