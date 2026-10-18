import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { codingAgents, type CodingAgentRow, type Db } from "@projectzero/db";
import {
  findAgentTemplate,
  requiredCredentials,
  type CodingAgent,
  type CreateCodingAgent,
  type UpdateCodingAgent,
} from "@projectzero/shared";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "../db/db.module";
import { isUniqueViolation } from "../db/errors";
import type { OrgContext } from "../orgs/active-org";

function toCodingAgent({
  organizationId: _org,
  createdBy: _createdBy,
  ...row
}: CodingAgentRow): CodingAgent {
  return {
    ...row,
    requiredCredentials: requiredCredentials(row),
    templateId: row.templateId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Coding-agent configurations. Every method is scoped to the caller's active organization. */
@Injectable()
export class CodingAgentsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(org: OrgContext): Promise<CodingAgent[]> {
    const rows = await this.db
      .select()
      .from(codingAgents)
      .where(eq(codingAgents.organizationId, org.organizationId))
      .orderBy(desc(codingAgents.createdAt));
    return rows.map(toCodingAgent);
  }

  async get(org: OrgContext, id: string): Promise<CodingAgent> {
    const [row] = await this.db
      .select()
      .from(codingAgents)
      .where(and(eq(codingAgents.id, id), eq(codingAgents.organizationId, org.organizationId)));
    if (!row) throw new NotFoundException(`Coding agent ${id} not found`);
    return toCodingAgent(row);
  }

  async create(org: OrgContext, input: CreateCodingAgent): Promise<CodingAgent> {
    if (input.templateId && !findAgentTemplate(input.templateId))
      throw new BadRequestException(`Unknown agent template "${input.templateId}"`);
    const [row] = await this.write(input.name, () =>
      this.db
        .insert(codingAgents)
        .values({ ...input, organizationId: org.organizationId, createdBy: org.userId })
        .returning(),
    );
    return toCodingAgent(row!);
  }

  async update(org: OrgContext, id: string, input: UpdateCodingAgent): Promise<CodingAgent> {
    // An empty body is a no-op; Drizzle rejects an update with nothing to set.
    if (Object.values(input).every((v) => v === undefined)) return this.get(org, id);
    if (input.identity !== undefined) {
      const current = await this.get(org, id);
      if (input.identity !== current.identity)
        throw new BadRequestException(
          `An agent's identity can't change after it's created (this one is ${current.identity}).`,
        );
    }
    const [row] = await this.write(input.name, () =>
      this.db
        .update(codingAgents)
        .set(input)
        .where(and(eq(codingAgents.id, id), eq(codingAgents.organizationId, org.organizationId)))
        .returning(),
    );
    if (!row) throw new NotFoundException(`Coding agent ${id} not found`);
    return toCodingAgent(row);
  }

  async remove(org: OrgContext, id: string): Promise<void> {
    const deleted = await this.db
      .delete(codingAgents)
      .where(and(eq(codingAgents.id, id), eq(codingAgents.organizationId, org.organizationId)))
      .returning({ id: codingAgents.id });
    if (deleted.length === 0) throw new NotFoundException(`Coding agent ${id} not found`);
  }

  /** Runs an insert/update, turning a duplicate (organizationId, name) into a 409. */
  private async write<T>(name: string | undefined, query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(`This organization already has a coding agent named "${name}"`);
      throw err;
    }
  }
}
