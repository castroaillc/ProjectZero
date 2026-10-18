import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  type ExecutionContext,
  type PipeTransform,
} from "@nestjs/common";
import { member, type Db } from "@projectzero/db";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { and, eq } from "drizzle-orm";
import { DB } from "../db/db.module";

/** Who is calling and in which organization. Every org-scoped service method takes one. */
export interface OrgContext {
  organizationId: string;
  userId: string;
  role: string;
  /** Owners and admins manage shared credentials and the GitHub App. */
  isAdmin: boolean;
}

type SessionWithOrg = UserSession & { session: { activeOrganizationId?: string | null } };

/** Resolves the session's active organization and checks the caller is still a member. */
@Injectable()
export class ActiveOrgPipe implements PipeTransform<
  SessionWithOrg | undefined,
  Promise<OrgContext>
> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async transform(session: SessionWithOrg | undefined): Promise<OrgContext> {
    const organizationId = session?.session.activeOrganizationId;
    if (!session || !organizationId)
      throw new ForbiddenException("No active organization. Choose one to continue.");
    const userId = session.user.id;
    const [row] = await this.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
    if (!row) throw new ForbiddenException("You're not a member of the active organization.");
    return { organizationId, userId, role: row.role, isAdmin: isAdminRole(row.role) };
  }
}

export function isAdminRole(role: string): boolean {
  return role.split(",").some((r) => r.trim() === "owner" || r.trim() === "admin");
}

/** Throws unless the caller is an owner or admin of the active organization. */
export function requireAdmin(org: OrgContext, action: string): void {
  if (!org.isAdmin)
    throw new ForbiddenException(`Only organization owners and admins can ${action}.`);
}

const RequestSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().session,
);

/** Injects the caller's {@link OrgContext} for the session's active organization (403 if none). */
export const ActiveOrg = () => RequestSession(undefined, ActiveOrgPipe);
