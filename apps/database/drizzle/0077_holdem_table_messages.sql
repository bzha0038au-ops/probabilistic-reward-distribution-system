CREATE TABLE IF NOT EXISTS "holdem_table_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_id" integer NOT NULL REFERENCES "holdem_tables"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "seat_index" integer NOT NULL,
  "kind" varchar(16) NOT NULL,
  "text" varchar(180),
  "emoji" varchar(16),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "holdem_table_messages_kind_payload_check" CHECK (
    (
      "kind" = 'chat'
      AND "text" IS NOT NULL
      AND "emoji" IS NULL
    )
    OR (
      "kind" = 'emoji'
      AND "text" IS NULL
      AND "emoji" IS NOT NULL
    )
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_table_messages_table_created_idx"
  ON "holdem_table_messages" ("table_id", "created_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holdem_table_messages_user_created_idx"
  ON "holdem_table_messages" ("user_id", "created_at");
