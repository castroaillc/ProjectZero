CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"account_id" bigint NOT NULL,
	"repository_selection" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"suspended_at" timestamp,
	"installed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coding_agents" DROP CONSTRAINT "coding_agents_userId_name_unique";--> statement-breakpoint
ALTER TABLE "credentials" DROP CONSTRAINT "credentials_userId_name_unique";--> statement-breakpoint
ALTER TABLE "coding_agents" DROP CONSTRAINT "coding_agents_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "coding_agents_user_id_created_at_index";--> statement-breakpoint
ALTER TABLE "credentials" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "coding_agents" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "coding_agents" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "organization_id" text;--> statement-breakpoint
-- Backfill: every existing user gets the personal workspace that new users get at sign-up, and
-- their agents, credentials and sessions move into it. Credentials stay personal (user_id kept).
INSERT INTO "organization" ("id", "name", "slug", "metadata", "created_at")
SELECT 'org_' || "id", "name" || '''s workspace', 'personal-' || lower("id"), '{"personal":true}', now()
FROM "user";--> statement-breakpoint
INSERT INTO "member" ("id", "organization_id", "user_id", "role", "created_at")
SELECT 'mem_' || "id", 'org_' || "id", "id", 'owner', now() FROM "user";--> statement-breakpoint
UPDATE "coding_agents" SET "organization_id" = 'org_' || "user_id", "created_by" = "user_id";--> statement-breakpoint
UPDATE "credentials" SET "organization_id" = 'org_' || "user_id";--> statement-breakpoint
UPDATE "session" SET "active_organization_id" = 'org_' || "user_id";--> statement-breakpoint
ALTER TABLE "coding_agents" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_installed_by_user_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "github_installations_organization_id_index" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "coding_agents" ADD CONSTRAINT "coding_agents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_agents" ADD CONSTRAINT "coding_agents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coding_agents_organization_id_created_at_index" ON "coding_agents" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "coding_agents" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "coding_agents" ADD CONSTRAINT "coding_agents_organizationId_name_unique" UNIQUE("organization_id","name");--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_organizationId_userId_name_unique" UNIQUE NULLS NOT DISTINCT("organization_id","user_id","name");