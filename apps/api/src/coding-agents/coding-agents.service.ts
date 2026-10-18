import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { codingAgents, type CodingAgentRow, type Db } from "@projectzero/db";
import type { CodingAgent, CreateCodingAgent, UpdateCodingAgent } from "@projectzero/shared";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "../db/db.module";

function toCodingAgent({ userId: _userId, ...row }: CodingAgentRow): CodingAgent {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Postgres unique_violation; drizzle wraps driver errors, so check the cause too. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/** Coding-agent configurations. Every method is scoped to one user. */
@Injectable()
export class CodingAgentsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<CodingAgent[]> {
    const rows = await this.db
      .select()
      .from(codingAgents)
      .where(eq(codingAgents.userId, userId))
      .orderBy(desc(codingAgents.createdAt));
    return rows.map(toCodingAgent);
  }

  async get(userId: string, id: string): Promise<CodingAgent> {
    const [row] = await this.db
      .select()
      .from(codingAgents)
      .where(and(eq(codingAgents.id, id), eq(codingAgents.userId, userId)));
    if (!row) throw new NotFoundException(`Coding agent ${id} not found`);
    return toCodingAgent(row);
  }

  async create(userId: string, input: CreateCodingAgent): Promise<CodingAgent> {
    const [row] = await this.write(input.name, () =>
      this.db
        .insert(codingAgents)
        .values({ ...input, userId })
        .returning(),
    );
    return toCodingAgent(row!);
  }

  async update(userId: string, id: string, input: UpdateCodingAgent): Promise<CodingAgent> {
    // An empty body is a no-op; Drizzle rejects an update with nothing to set.
    if (Object.values(input).every((v) => v === undefined)) return this.get(userId, id);
    const [row] = await this.write(input.name, () =>
      this.db
        .update(codingAgents)
        .set(input)
        .where(and(eq(codingAgents.id, id), eq(codingAgents.userId, userId)))
        .returning(),
    );
    if (!row) throw new NotFoundException(`Coding agent ${id} not found`);
    return toCodingAgent(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(codingAgents)
      .where(and(eq(codingAgents.id, id), eq(codingAgents.userId, userId)))
      .returning({ id: codingAgents.id });
    if (deleted.length === 0) throw new NotFoundException(`Coding agent ${id} not found`);
  }

  /** Runs an insert/update, turning a duplicate (userId, name) into a 409. */
  private async write<T>(name: string | undefined, query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(`You already have a coding agent named "${name}"`);
      throw err;
    }
  }
}
