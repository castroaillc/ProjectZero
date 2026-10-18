import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

/**
 * Deterministic chat model for tests: replies with the scripted messages in order (tool calls
 * included) and records what it was sent. Not for production use.
 */
export class ScriptedChatModel extends BaseChatModel {
  readonly calls: BaseMessage[][] = [];
  private readonly script: AIMessage[];

  constructor(script: (AIMessage | string)[] = []) {
    super({});
    this.script = [];
    this.enqueue(...script);
  }

  /** Appends replies to the script. */
  enqueue(...replies: (AIMessage | string)[]): void {
    this.script.push(...replies.map((m) => (typeof m === "string" ? new AIMessage(m) : m)));
  }

  _llmType() {
    return "scripted";
  }

  override bindTools() {
    return this as never;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.calls.push(messages);
    const message = this.script.shift();
    if (!message) throw new Error("ScriptedChatModel ran out of scripted replies");
    return {
      generations: [{ message, text: typeof message.content === "string" ? message.content : "" }],
    };
  }
}

/** Shorthand for a scripted assistant turn that calls one tool. */
export function toolCall(
  name: string,
  args: Record<string, unknown>,
  id = `call_${name}`,
): AIMessage {
  return new AIMessage({ content: "", tool_calls: [{ id, name, args, type: "tool_call" }] });
}
