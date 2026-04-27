CREATE TABLE IF NOT EXISTS "blackjack_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stake_amount" numeric(14, 2) NOT NULL,
	"total_stake" numeric(14, 2) NOT NULL,
	"payout_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"player_cards" jsonb NOT NULL,
	"dealer_cards" jsonb NOT NULL,
	"deck" jsonb NOT NULL,
	"next_card_index" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blackjack_games" ADD CONSTRAINT "blackjack_games_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blackjack_games_user_status_idx" ON "blackjack_games" ("user_id","status","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blackjack_games_user_created_idx" ON "blackjack_games" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blackjack_games_status_created_idx" ON "blackjack_games" ("status","created_at");
