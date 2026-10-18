import {
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { streamAgentRun, threadState, type TodoAgent } from "@projectzero/agent";
import { agentThreads, type AgentThreadRow, type Db } from "@projectzero/db";
import type { AgentEvent, AgentThread, AgentThreadState, RunAgent } from "@projectzero/shared";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "../db/db.module";
import { CHECKPOINTER, TODO_AGENT } from "./agent.providers";

const DEFAULT_TITLE = "New conversation";

function toThread(row: AgentThreadRow): AgentThread {
  return { id: row.id, title: row.title, createdAt: row.createdAt.toISOString() };
}

/** Agent threads (ownership in agent_threads, history in LangGraph checkpoints) and runs. */
@Injectable()
export class AgentService implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TODO_AGENT) private readonly agent: TodoAgent,
    @Inject(CHECKPOINTER) private readonly checkpointer: PostgresSaver,
  ) {}

  async onApplicationBootstrap() {
    await this.checkpointer.setup();
  }

  async onApplicationShutdown() {
    await this.checkpointer.end();
  }

  async createThread(userId: string, title?: string): Promise<AgentThread> {
    const [row] = await this.db
      .insert(agentThreads)
      .values({ userId, title: title ?? DEFAULT_TITLE })
      .returning();
    return toThread(row!);
  }

  async listThreads(userId: string): Promise<AgentThread[]> {
    const rows = await this.db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.userId, userId))
      .orderBy(desc(agentThreads.createdAt));
    return rows.map(toThread);
  }

  /** Throws 404 unless the thread exists and belongs to the user. */
  async ownedThread(userId: string, id: string): Promise<AgentThreadRow> {
    const [row] = await this.db
      .select()
      .from(agentThreads)
      .where(and(eq(agentThreads.id, id), eq(agentThreads.userId, userId)));
    if (!row) throw new NotFoundException(`Thread ${id} not found`);
    return row;
  }

  async getState(userId: string, id: string): Promise<AgentThreadState> {
    await this.ownedThread(userId, id);
    return threadState(this.agent, { threadId: id, userId });
  }

  async deleteThread(userId: string, id: string): Promise<void> {
    await this.ownedThread(userId, id);
    await this.checkpointer.deleteThread(id);
    await this.db.delete(agentThreads).where(eq(agentThreads.id, id));
  }

  /** Starts or resumes a run; the caller must have checked ownership with ownedThread(). */
  async *run(
    thread: AgentThreadRow,
    input: RunAgent,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    const run = { threadId: thread.id, userId: thread.userId, signal };
    if (input.resume) {
      yield* streamAgentRun(this.agent, { resume: input.resume }, run);
      return;
    }
    const message = input.message ?? "";
    if (thread.title === DEFAULT_TITLE) {
      const title = message.length > 60 ? `${message.slice(0, 57)}…` : message;
      await this.db.update(agentThreads).set({ title }).where(eq(agentThreads.id, thread.id));
    }
    yield* streamAgentRun(this.agent, { message }, run);
  }
}
