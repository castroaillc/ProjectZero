import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { credentials, type CredentialRow, type Db } from "@projectzero/db";
import type { CreateCredential, Credential, UpdateCredential } from "@projectzero/shared";
import { and, asc, eq } from "drizzle-orm";
import { DB } from "../db/db.module";
import { isUniqueViolation } from "../db/errors";
import { CredentialCipher, hintFor } from "./credential-cipher";

export const CREDENTIAL_CIPHER = Symbol("CREDENTIAL_CIPHER");

function toCredential({ id, name, description, hint, createdAt, updatedAt }: CredentialRow) {
  return {
    id,
    name,
    description,
    hint,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  } satisfies Credential;
}

/** Each user's encrypted secrets. Values go in but never come back out over the API. */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CREDENTIAL_CIPHER) private readonly cipher: CredentialCipher,
  ) {}

  async list(userId: string): Promise<Credential[]> {
    const rows = await this.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .orderBy(asc(credentials.name));
    return rows.map(toCredential);
  }

  /** Names of the user's credentials, for checking what an agent's config refers to. */
  async names(userId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ name: credentials.name })
      .from(credentials)
      .where(eq(credentials.userId, userId));
    return new Set(rows.map((r) => r.name));
  }

  async create(userId: string, { name, value, description }: CreateCredential) {
    try {
      const [row] = await this.db
        .insert(credentials)
        .values({
          userId,
          name,
          description,
          ciphertext: this.cipher.seal(value, { userId, name }),
          hint: hintFor(value),
        })
        .returning();
      return toCredential(row!);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(`You already have a credential named ${name}`);
      throw err;
    }
  }

  async update(userId: string, id: string, input: UpdateCredential): Promise<Credential> {
    const current = await this.row(userId, id);
    if (input.value === undefined && input.description === undefined) return toCredential(current);
    const [row] = await this.db
      .update(credentials)
      .set({
        description: input.description,
        ...(input.value !== undefined && {
          ciphertext: this.cipher.seal(input.value, { userId, name: current.name }),
          hint: hintFor(input.value),
        }),
      })
      .where(and(eq(credentials.id, id), eq(credentials.userId, userId)))
      .returning();
    if (!row) throw new NotFoundException(`Credential ${id} not found`);
    return toCredential(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.userId, userId)))
      .returning({ id: credentials.id });
    if (deleted.length === 0) throw new NotFoundException(`Credential ${id} not found`);
  }

  private async row(userId: string, id: string): Promise<CredentialRow> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.userId, userId)));
    if (!row) throw new NotFoundException(`Credential ${id} not found`);
    return row;
  }
}
