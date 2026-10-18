import { ChatOllama } from "@langchain/ollama";

export interface AgentModelOptions {
  /** Ollama model tag; must support tool calling. */
  model?: string;
  /** Ollama server URL. */
  baseUrl?: string;
}

export const DEFAULT_AGENT_MODEL = "gpt-oss:20b";

/** The chat model the agent runs on: a local Ollama model. */
export function createAgentModel({ model, baseUrl }: AgentModelOptions = {}) {
  return new ChatOllama({
    model: model || DEFAULT_AGENT_MODEL,
    baseUrl: baseUrl || "http://localhost:11434",
    temperature: 0,
  });
}
