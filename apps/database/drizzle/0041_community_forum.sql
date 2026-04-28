CREATE TABLE IF NOT EXISTS "community_threads" (
  "id" serial PRIMARY KEY NOT NULL,
  "author_user_id" integer NOT NULL,
  "title" varchar(160) NOT NULL,
  "status" varchar(16) DEFAULT 'visible' NOT NULL,
  "is_locked" boolean DEFAULT false NOT NULL,
  "post_count" integer DEFAULT 0 NOT NULL,
  "last_post_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "hidden_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "thread_id" integer NOT NULL,
  "author_user_id" integer NOT NULL,
  "body" text NOT NULL,
  "status" varchar(16) DEFAULT 'visible' NOT NULL,
  "hidden_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_moderation_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_id" integer,
  "target_type" varchar(16) NOT NULL,
  "target_id" integer NOT NULL,
  "thread_id" integer,
  "post_id" integer,
  "action" varchar(32) NOT NULL,
  "reason" varchar(500),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_threads" ADD CONSTRAINT "community_threads_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_thread_id_community_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."community_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_moderation_actions" ADD CONSTRAINT "community_moderation_actions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_moderation_actions" ADD CONSTRAINT "community_moderation_actions_thread_id_community_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."community_threads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_moderation_actions" ADD CONSTRAINT "community_moderation_actions_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_threads_author_created_idx" ON "community_threads" ("author_user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_threads_status_last_post_idx" ON "community_threads" ("status","last_post_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_posts_thread_created_idx" ON "community_posts" ("thread_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_posts_thread_status_created_idx" ON "community_posts" ("thread_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_posts_author_created_idx" ON "community_posts" ("author_user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_moderation_target_created_idx" ON "community_moderation_actions" ("target_type","target_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_moderation_thread_created_idx" ON "community_moderation_actions" ("thread_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_moderation_post_created_idx" ON "community_moderation_actions" ("post_id","created_at");
