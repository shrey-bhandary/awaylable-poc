import { formatKnowledgeContext, retrieveKnowledge } from "./knowledgeBase.js";
import { GeminiClient } from "../integrations/geminiClient.js";

export type AdkAgentInput = {
  callerId: string;
  utterance: string;
};

export type AdkAgentOutput = {
  answer: string;
  knowledgeContext: string;
};

export class AdkVoiceAgent {
  constructor(private readonly gemini: GeminiClient) {}

  async respond(input: AdkAgentInput): Promise<AdkAgentOutput> {
    const articles = retrieveKnowledge(input.utterance);
    const kbContext = formatKnowledgeContext(articles);

    const systemPrompt = [
      "You are Awaylable's voice support agent.",
      "Rules:",
      "1) Be concise and phone-friendly.",
      "2) Do not invent policy; stay grounded in the provided knowledge.",
      "3) If missing data, ask a short follow-up question.",
      "Knowledge Base:",
      kbContext
    ].join("\n");

    const userPrompt = `Caller ${input.callerId} says: ${input.utterance}`;
    const answer = await this.gemini.generateReply(systemPrompt, userPrompt);

    return {
      answer,
      knowledgeContext: kbContext
    };
  }
}
