import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { credentials, type CredentialRow, type Db } from "@projectzero/db";
import type {
  CreateCredential,
  Credential,
  CredentialScope,
  UpdateCredential,
} from "@projectzero/shared";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { DB } from "../db/db.module";
import { isUniqueViolation } from "../db/errors";
import { requireAdmin, type OrgContext } from "../orgs/active-org";
import { CredentialCipher, hintFor, type SealedFor } from "./credential-cipher";

export const CREDENTIAL_CIPHER = Symbol("CREDENTIAL_CIPHER");

function scopeOf(row: Pick<CredentialRow, "userId">): CredentialScope {
  return row.userId === null ? "shared" : "personal";
}

function toCredential(row: CredentialRow): Credential {
  return {
    id: row.id,
    scope: scopeOf(row),
    name: row.name,
    description: row.description,
    hint: row.hint,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** What a sealed value is bound to; see {@link CredentialCipher}. */
function sealedFor(row: Pick<CredentialRow, "organizationId" | "userId" | "name">): SealedFor {
  return { organizationId: row.organizationId, userId: row.userId, name: row.name };
}

/**
 * Encrypted secrets held by an organization: shared ones (admins manage; autonomous agents use)
 * and each member's personal ones (only they see them; assistant agents use them). Values go in
 * but never come back out over the API.
 */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CREDENTIAL_CIPHER) private readonly cipher: CredentialCipher,
  ) {}

  /** The organization's shared credentials plus the caller's personal ones. */
  async list(org: OrgContext): Promise<Credential[]> {
    const rows = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.organizationId, org.organizationId), this.visibleTo(org)))
      .orderBy(asc(credentials.name));
    return rows.map(toCredential);
  }

  async create(org: OrgContext, { scope, name, value, description }: CreateCredential) {
    if (scope === "shared") requireAdmin(org, "add shared credentials");
    const owner = {
      organizationId: org.organizationId,
      userId: scope === "shared" ? null : org.userId,
      name,
    };
    try {
      const [row] = await this.db
        .insert(credentials)
        .values({
          ...owner,
          description,
          ciphertext: this.cipher.seal(value, owner),
          hint: hintFor(value),
        })
        .returning();
      return toCredential(row!);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          scope === "shared"
            ? `This organization already has a shared credential named ${name}`
            : `You already have a personal credential named ${name}`,
        );
      throw err;
    }
  }

  async update(org: OrgContext, id: string, input: UpdateCredential): Promise<Credential> {
    const current = await this.editable(org, id);
    if (input.value === undefined && input.description === undefined) return toCredential(current);
    const [row] = await this.db
      .update(credentials)
      .set({
        description: input.description,
        ...(input.value !== undefined && {
          ciphertext: this.cipher.seal(input.value, sealedFor(current)),
          hint: hintFor(input.value),
        }),
      })
      .where(eq(credentials.id, current.id))
      .returning();
    return toCredential(row!);
  }

  async remove(org: OrgContext, id: string): Promise<void> {
    const current = await this.editable(org, id);
    await this.db.delete(credentials).where(eq(credentials.id, current.id));
  }

  /**
   * Decrypts credentials for a run. Autonomous agents read the organization's shared
   * credentials; assistants read the personal credentials of the member they're working for.
   * Missing names are left out; the caller decides whether that's fatal.
   */
  async resolve(
    organizationId: string,
    source: { shared: true } | { userId: string },
    names: string[],
  ): Promise<Record<string, string>> {
    if (names.length === 0) return {};
    const rows = await this.db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.organizationId, organizationId),
          "userId" in source ? eq(credentials.userId, source.userId) : isNull(credentials.userId),
        ),
      );
    return Object.fromEntries(
      rows
        .filter((row) => names.includes(row.name))
        .map((row) => [row.name, this.cipher.open(row.ciphertext, sealedFor(row))]),
    );
  }

  /** Shared credentials and the caller's own personal ones. */
  private visibleTo(org: OrgContext) {
    return or(isNull(credentials.userId), eq(credentials.userId, org.userId));
  }

  /** A credential the caller may change: their own, or a shared one if they're an admin. */
  private async editable(org: OrgContext, id: string): Promise<CredentialRow> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.id, id),
          eq(credentials.organizationId, org.organizationId),
          this.visibleTo(org),
        ),
      );
    if (!row) throw new NotFoundException(`Credential ${id} not found`);
    if (scopeOf(row) === "shared" && !org.isAdmin)
      throw new ForbiddenException(
        "Only organization owners and admins can change shared credentials.",
      );
    return row;
  }
}
