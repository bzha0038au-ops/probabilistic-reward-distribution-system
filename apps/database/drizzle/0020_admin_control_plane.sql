ALTER TABLE "payment_providers"
  ADD COLUMN "priority" integer NOT NULL DEFAULT 100,
  ADD COLUMN "is_circuit_broken" boolean NOT NULL DEFAULT false,
  ADD COLUMN "circuit_broken_at" timestamp with time zone,
  ADD COLUMN "circuit_break_reason" varchar(255);

CREATE TABLE "config_change_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "change_type" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "target_type" varchar(64) NOT NULL,
  "target_id" integer,
  "change_payload" jsonb NOT NULL,
  "reason" text,
  "requires_second_confirmation" boolean NOT NULL DEFAULT false,
  "requires_mfa" boolean NOT NULL DEFAULT false,
  "created_by_admin_id" integer NOT NULL,
  "submitted_by_admin_id" integer,
  "approved_by_admin_id" integer,
  "published_by_admin_id" integer,
  "rejected_by_admin_id" integer,
  "submitted_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "config_change_requests"
  ADD CONSTRAINT "config_change_requests_created_by_admin_id_admins_id_fk"
    FOREIGN KEY ("created_by_admin_id")
    REFERENCES "admins"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,
  ADD CONSTRAINT "config_change_requests_submitted_by_admin_id_admins_id_fk"
    FOREIGN KEY ("submitted_by_admin_id")
    REFERENCES "admins"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,
  ADD CONSTRAINT "config_change_requests_approved_by_admin_id_admins_id_fk"
    FOREIGN KEY ("approved_by_admin_id")
    REFERENCES "admins"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,
  ADD CONSTRAINT "config_change_requests_published_by_admin_id_admins_id_fk"
    FOREIGN KEY ("published_by_admin_id")
    REFERENCES "admins"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,
  ADD CONSTRAINT "config_change_requests_rejected_by_admin_id_admins_id_fk"
    FOREIGN KEY ("rejected_by_admin_id")
    REFERENCES "admins"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

CREATE INDEX "config_change_requests_status_idx"
  ON "config_change_requests" ("status");
CREATE INDEX "config_change_requests_target_idx"
  ON "config_change_requests" ("target_type", "target_id");
CREATE INDEX "config_change_requests_created_by_idx"
  ON "config_change_requests" ("created_by_admin_id");
CREATE INDEX "config_change_requests_created_at_idx"
  ON "config_change_requests" ("created_at");
