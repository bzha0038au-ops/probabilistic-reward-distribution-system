CREATE INDEX IF NOT EXISTS "saas_draw_records_project_player_env_created_idx"
  ON "saas_draw_records" ("project_id", "player_id", "environment", "created_at");

CREATE INDEX IF NOT EXISTS "saas_draw_records_project_env_agent_created_idx"
  ON "saas_draw_records" ("project_id", "environment", "agent_id", "created_at");

CREATE INDEX IF NOT EXISTS "saas_draw_records_project_env_group_created_idx"
  ON "saas_draw_records" ("project_id", "environment", "group_id", "created_at");

CREATE INDEX IF NOT EXISTS "saas_draw_records_project_player_env_idempotency_idx"
  ON "saas_draw_records" (
    "project_id",
    "player_id",
    "environment",
    ((coalesce("metadata", '{}'::jsonb) #>> '{rewardRequest,idempotencyKey}')),
    "id"
  )
  WHERE (coalesce("metadata", '{}'::jsonb) #>> '{rewardRequest,idempotencyKey}') IS NOT NULL;
