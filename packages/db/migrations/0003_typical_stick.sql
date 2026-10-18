CREATE TABLE "coding_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"identity" text NOT NULL,
	"persona" jsonb DEFAULT '{"avatar":"🤖","role":"","git":{"name":"ProjectZero Agent","email":"agent@projectzero.local"}}'::jsonb NOT NULL,
	"model" jsonb NOT NULL,
	"sandbox" jsonb NOT NULL,
	"tools" jsonb NOT NULL,
	"mcp_servers" jsonb NOT NULL,
	"skills" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coding_agents_userId_name_unique" UNIQUE("user_id","name"),
	CONSTRAINT "coding_agents_identity_check" CHECK ("coding_agents"."identity" in ('assistant', 'autonomous'))
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ciphertext" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_userId_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "coding_agents" ADD CONSTRAINT "coding_agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coding_agents_user_id_created_at_index" ON "coding_agents" USING btree ("user_id","created_at");