CREATE SCHEMA IF NOT EXISTS "partition_maintenance";
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.rename_index_if_exists(
  p_schema text,
  p_old_name text,
  p_new_name text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('%I.%I', p_schema, p_old_name)) IS NOT NULL
     AND to_regclass(format('%I.%I', p_schema, p_new_name)) IS NULL THEN
    EXECUTE format(
      'ALTER INDEX %I.%I RENAME TO %I',
      p_schema,
      p_old_name,
      p_new_name
    );
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.rename_table_constraint_if_exists(
  p_table regclass,
  p_old_name text,
  p_new_name text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  table_schema text;
  table_name text;
BEGIN
  IF p_table IS NULL THEN
    RETURN;
  END IF;

  SELECT ns.nspname, cls.relname
    INTO table_schema, table_name
  FROM pg_class cls
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  WHERE cls.oid = p_table;

  IF table_schema IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    WHERE con.conrelid = p_table
      AND con.conname = p_old_name
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    WHERE con.conrelid = p_table
      AND con.conname = p_new_name
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
      table_schema,
      table_name,
      p_old_name,
      p_new_name
    );
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.ensure_default_partition(
  p_parent_table regclass
)
RETURNS TABLE (
  parent_table text,
  partition_name text,
  action text
)
LANGUAGE plpgsql
AS $$
DECLARE
  parent_schema text;
  parent_name text;
  child_name text;
BEGIN
  SELECT ns.nspname, cls.relname
    INTO parent_schema, parent_name
  FROM pg_class cls
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  WHERE cls.oid = p_parent_table;

  IF parent_name IS NULL THEN
    RAISE EXCEPTION 'partition parent % does not exist', p_parent_table;
  END IF;

  child_name := parent_name || '_default';

  IF to_regclass(format('%I.%I', parent_schema, child_name)) IS NOT NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE %I.%I PARTITION OF %I.%I DEFAULT',
    parent_schema,
    child_name,
    parent_schema,
    parent_name
  );

  RETURN QUERY
  SELECT
    parent_schema || '.' || parent_name,
    child_name,
    'created_default';
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.ensure_monthly_partition(
  p_parent_table regclass,
  p_month_start date
)
RETURNS TABLE (
  parent_table text,
  partition_name text,
  action text,
  month_start date,
  month_end date
)
LANGUAGE plpgsql
AS $$
DECLARE
  parent_schema text;
  parent_name text;
  child_name text;
  next_month date;
  from_literal text;
  to_literal text;
BEGIN
  SELECT ns.nspname, cls.relname
    INTO parent_schema, parent_name
  FROM pg_class cls
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  WHERE cls.oid = p_parent_table;

  IF parent_name IS NULL THEN
    RAISE EXCEPTION 'partition parent % does not exist', p_parent_table;
  END IF;

  child_name := format('%s_p%s', parent_name, to_char(p_month_start, 'YYYYMM'));

  IF to_regclass(format('%I.%I', parent_schema, child_name)) IS NOT NULL THEN
    RETURN;
  END IF;

  next_month := (p_month_start + INTERVAL '1 month')::date;
  from_literal := to_char(p_month_start, 'YYYY-MM-DD') || ' 00:00:00+00';
  to_literal := to_char(next_month, 'YYYY-MM-DD') || ' 00:00:00+00';

  EXECUTE format(
    'CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
    parent_schema,
    child_name,
    parent_schema,
    parent_name,
    from_literal,
    to_literal
  );

  RETURN QUERY
  SELECT
    parent_schema || '.' || parent_name,
    child_name,
    'created',
    p_month_start,
    next_month;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.ensure_partition_range(
  p_parent_table regclass,
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cursor_month date;
  final_month date;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL THEN
    RETURN;
  END IF;

  cursor_month := date_trunc('month', timezone('UTC', p_range_start))::date;
  final_month := date_trunc('month', timezone('UTC', p_range_end))::date;

  WHILE cursor_month <= final_month LOOP
    PERFORM partition_maintenance.ensure_monthly_partition(
      p_parent_table,
      cursor_month
    );
    cursor_month := (cursor_month + INTERVAL '1 month')::date;
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.enforce_round_event_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.round_type || ':' || NEW.round_entity_id::text),
    NEW.event_index
  );

  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.round_events existing
      WHERE existing.round_type = NEW.round_type
        AND existing.round_entity_id = NEW.round_entity_id
        AND existing.event_index = NEW.event_index
        AND NOT (
          existing.id = OLD.id
          AND existing.created_at = OLD.created_at
        )
    ) THEN
      RAISE EXCEPTION
        'duplicate round event for % / % / event %',
        NEW.round_type,
        NEW.round_entity_id,
        NEW.event_index
        USING ERRCODE = '23505',
              CONSTRAINT = 'round_events_round_event_unique_idx';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.round_events existing
      WHERE existing.round_type = NEW.round_type
        AND existing.round_entity_id = NEW.round_entity_id
        AND existing.event_index = NEW.event_index
    ) THEN
      RAISE EXCEPTION
        'duplicate round event for % / % / event %',
        NEW.round_type,
        NEW.round_entity_id,
        NEW.event_index
        USING ERRCODE = '23505',
              CONSTRAINT = 'round_events_round_event_unique_idx';
    END IF;
  END IF;

  IF NEW.table_round_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(NEW.table_round_id, NEW.event_index);

    IF TG_OP = 'UPDATE' THEN
      IF EXISTS (
        SELECT 1
        FROM public.round_events existing
        WHERE existing.table_round_id = NEW.table_round_id
          AND existing.event_index = NEW.event_index
          AND NOT (
            existing.id = OLD.id
            AND existing.created_at = OLD.created_at
          )
      ) THEN
        RAISE EXCEPTION
          'duplicate table round event for round % / event %',
          NEW.table_round_id,
          NEW.event_index
          USING ERRCODE = '23505',
                CONSTRAINT = 'round_events_table_round_event_unique_idx';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.round_events existing
        WHERE existing.table_round_id = NEW.table_round_id
          AND existing.event_index = NEW.event_index
      ) THEN
        RAISE EXCEPTION
          'duplicate table round event for round % / event %',
          NEW.table_round_id,
          NEW.event_index
          USING ERRCODE = '23505',
                CONSTRAINT = 'round_events_table_round_event_unique_idx';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.enforce_saas_usage_event_reference_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_type IS NULL OR NEW.reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.event_type || ':' || NEW.reference_type),
    NEW.reference_id
  );

  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.saas_usage_events existing
      WHERE existing.event_type = NEW.event_type
        AND existing.reference_type = NEW.reference_type
        AND existing.reference_id = NEW.reference_id
        AND NOT (
          existing.id = OLD.id
          AND existing.created_at = OLD.created_at
        )
    ) THEN
      RAISE EXCEPTION
        'duplicate saas usage event reference for % / % / %',
        NEW.event_type,
        NEW.reference_type,
        NEW.reference_id
        USING ERRCODE = '23505',
              CONSTRAINT = 'saas_usage_events_event_reference_unique';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.saas_usage_events existing
      WHERE existing.event_type = NEW.event_type
        AND existing.reference_type = NEW.reference_type
        AND existing.reference_id = NEW.reference_id
    ) THEN
      RAISE EXCEPTION
        'duplicate saas usage event reference for % / % / %',
        NEW.event_type,
        NEW.reference_type,
        NEW.reference_id
        USING ERRCODE = '23505',
              CONSTRAINT = 'saas_usage_events_event_reference_unique';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.ensure_reward_system_time_partitions(
  p_future_months integer DEFAULT 3,
  p_months_back integer DEFAULT 1
)
RETURNS TABLE (
  parent_table text,
  partition_name text,
  action text,
  month_start date,
  month_end date
)
LANGUAGE plpgsql
AS $$
DECLARE
  parent_name text;
  offset_month integer;
  base_month date := date_trunc('month', timezone('UTC', now()))::date;
BEGIN
  FOREACH parent_name IN ARRAY ARRAY[
    'ledger_entries',
    'saas_usage_events',
    'round_events',
    'admin_actions'
  ] LOOP
    FOR offset_month IN -GREATEST(p_months_back, 0)..GREATEST(p_future_months, 0) LOOP
      RETURN QUERY
      SELECT *
      FROM partition_maintenance.ensure_monthly_partition(
        to_regclass('public.' || parent_name),
        (base_month + make_interval(months => offset_month))::date
      );
    END LOOP;
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION partition_maintenance.archive_reward_system_time_partitions(
  p_archive_after_months integer DEFAULT 18,
  p_archive_schema text DEFAULT 'partition_archive'
)
RETURNS TABLE (
  parent_table text,
  partition_name text,
  action text,
  month_start date,
  month_end date
)
LANGUAGE plpgsql
AS $$
DECLARE
  parent_name text;
  cutoff_month date := (
    date_trunc('month', timezone('UTC', now()))::date
    - make_interval(months => GREATEST(p_archive_after_months, 1) - 1)
  )::date;
  child record;
  partition_month date;
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_archive_schema);

  FOREACH parent_name IN ARRAY ARRAY[
    'ledger_entries',
    'saas_usage_events',
    'round_events',
    'admin_actions'
  ] LOOP
    FOR child IN
      SELECT child_ns.nspname AS child_schema, child_cls.relname AS child_name
      FROM pg_inherits inh
      JOIN pg_class parent_cls ON parent_cls.oid = inh.inhparent
      JOIN pg_class child_cls ON child_cls.oid = inh.inhrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child_cls.relnamespace
      WHERE parent_cls.oid = to_regclass('public.' || parent_name)
        AND child_ns.nspname = 'public'
        AND child_cls.relname ~ ('^' || parent_name || '_p[0-9]{6}$')
      ORDER BY child_cls.relname
    LOOP
      partition_month := to_date(substring(child.child_name FROM '([0-9]{6})$'), 'YYYYMM');

      IF partition_month < cutoff_month THEN
        EXECUTE format(
          'ALTER TABLE public.%I DETACH PARTITION public.%I',
          parent_name,
          child.child_name
        );
        EXECUTE format(
          'ALTER TABLE public.%I SET SCHEMA %I',
          child.child_name,
          p_archive_schema
        );

        RETURN QUERY
        SELECT
          'public.' || parent_name,
          child.child_name,
          'archived',
          partition_month,
          (partition_month + INTERVAL '1 month')::date;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  source_count bigint := 0;
  target_count bigint := 0;
  min_created_at timestamptz;
  max_created_at timestamptz;
  max_id integer;
BEGIN
  IF to_regclass('public.ledger_entries') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class cls
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'ledger_entries'
      AND cls.relkind = 'p'
  ) THEN
    PERFORM partition_maintenance.ensure_default_partition('public.ledger_entries'::regclass);
    RETURN;
  END IF;

  IF to_regclass('public.ledger_entries_legacy') IS NULL THEN
    ALTER TABLE public.ledger_entries RENAME TO ledger_entries_legacy;
  END IF;

  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.ledger_entries_legacy'),
    'ledger_entries_pkey',
    'ledger_entries_legacy_pkey'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.ledger_entries_legacy'),
    'ledger_entries_user_id_users_id_fk',
    'ledger_entries_legacy_user_id_users_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.ledger_entries_legacy'),
    'ledger_entries_house_account_id_house_account_id_fk',
    'ledger_entries_legacy_house_account_id_house_account_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.ledger_entries_legacy'),
    'ledger_entries_mutation_event_fk',
    'ledger_entries_legacy_mutation_event_fk'
  );

  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'ledger_entries_user_created_idx',
    'ledger_entries_user_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'ledger_entries_house_created_idx',
    'ledger_entries_house_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'ledger_entries_type_created_idx',
    'ledger_entries_type_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'ledger_entries_type_user_idx',
    'ledger_entries_type_user_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'ledger_entries_mutation_event_idx',
    'ledger_entries_mutation_event_idx_legacy'
  );

  IF to_regclass('public.ledger_entries_legacy') IS NOT NULL THEN
    ALTER TABLE public.ledger_entries_legacy
      ALTER COLUMN id DROP DEFAULT;
  END IF;

  IF to_regclass('public.ledger_entries_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE public.ledger_entries_id_seq OWNED BY NONE;
  END IF;

  CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id integer NOT NULL DEFAULT nextval('ledger_entries_id_seq'::regclass),
    user_id integer,
    house_account_id integer,
    type varchar(64) NOT NULL,
    amount numeric(14, 2) NOT NULL,
    balance_before numeric(14, 2) NOT NULL,
    balance_after numeric(14, 2) NOT NULL,
    reference_type varchar(64),
    reference_id integer,
    ledger_mutation_event_id integer,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
  ) PARTITION BY RANGE (created_at);

  BEGIN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_entries_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_entries_house_account_id_house_account_id_fk
      FOREIGN KEY (house_account_id) REFERENCES public.house_account(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_entries_mutation_event_fk
      FOREIGN KEY (ledger_mutation_event_id) REFERENCES public.ledger_mutation_events(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  CREATE INDEX IF NOT EXISTS ledger_entries_id_idx
    ON public.ledger_entries (id);
  CREATE INDEX IF NOT EXISTS ledger_entries_user_created_idx
    ON public.ledger_entries (user_id, created_at, id);
  CREATE INDEX IF NOT EXISTS ledger_entries_house_created_idx
    ON public.ledger_entries (house_account_id, created_at, id);
  CREATE INDEX IF NOT EXISTS ledger_entries_type_created_idx
    ON public.ledger_entries (type, created_at, id);
  CREATE INDEX IF NOT EXISTS ledger_entries_type_user_idx
    ON public.ledger_entries (type, user_id);
  CREATE INDEX IF NOT EXISTS ledger_entries_mutation_event_idx
    ON public.ledger_entries (ledger_mutation_event_id);

  PERFORM partition_maintenance.ensure_default_partition('public.ledger_entries'::regclass);

  IF to_regclass('public.ledger_entries_legacy') IS NOT NULL THEN
    SELECT count(*), min(created_at), max(created_at)
      INTO source_count, min_created_at, max_created_at
    FROM public.ledger_entries_legacy;

    PERFORM partition_maintenance.ensure_partition_range(
      'public.ledger_entries'::regclass,
      min_created_at,
      max_created_at
    );

    INSERT INTO public.ledger_entries (
      id,
      user_id,
      house_account_id,
      type,
      amount,
      balance_before,
      balance_after,
      reference_type,
      reference_id,
      ledger_mutation_event_id,
      metadata,
      created_at
    )
    SELECT
      id,
      user_id,
      house_account_id,
      type,
      amount,
      balance_before,
      balance_after,
      reference_type,
      reference_id,
      ledger_mutation_event_id,
      metadata,
      created_at
    FROM public.ledger_entries_legacy
    ORDER BY created_at, id;

    SELECT count(*)
      INTO target_count
    FROM public.ledger_entries;

    IF target_count <> source_count THEN
      RAISE EXCEPTION
        'ledger_entries partition migration row count mismatch: source %, target %',
        source_count,
        target_count;
    END IF;

    DROP TABLE public.ledger_entries_legacy;
  END IF;

  IF to_regclass('public.ledger_entries_id_seq') IS NOT NULL THEN
    SELECT max(id)
      INTO max_id
    FROM public.ledger_entries;

    IF max_id IS NULL THEN
      PERFORM setval('public.ledger_entries_id_seq', 1, false);
    ELSE
      PERFORM setval('public.ledger_entries_id_seq', max_id, true);
    END IF;

    ALTER SEQUENCE public.ledger_entries_id_seq
      OWNED BY public.ledger_entries.id;
  END IF;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  source_count bigint := 0;
  target_count bigint := 0;
  min_created_at timestamptz;
  max_created_at timestamptz;
  max_id integer;
BEGIN
  IF to_regclass('public.admin_actions') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class cls
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'admin_actions'
      AND cls.relkind = 'p'
  ) THEN
    PERFORM partition_maintenance.ensure_default_partition('public.admin_actions'::regclass);
    RETURN;
  END IF;

  IF to_regclass('public.admin_actions_legacy') IS NULL THEN
    ALTER TABLE public.admin_actions RENAME TO admin_actions_legacy;
  END IF;

  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.admin_actions_legacy'),
    'admin_actions_pkey',
    'admin_actions_legacy_pkey'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.admin_actions_legacy'),
    'admin_actions_admin_id_admins_id_fk',
    'admin_actions_legacy_admin_id_admins_id_fk'
  );

  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'admin_actions_admin_idx',
    'admin_actions_admin_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'admin_actions_admin_created_idx',
    'admin_actions_admin_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'admin_actions_action_idx',
    'admin_actions_action_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'admin_actions_session_idx',
    'admin_actions_session_idx_legacy'
  );

  IF to_regclass('public.admin_actions_legacy') IS NOT NULL THEN
    ALTER TABLE public.admin_actions_legacy
      ALTER COLUMN id DROP DEFAULT;
  END IF;

  IF to_regclass('public.admin_actions_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE public.admin_actions_id_seq OWNED BY NONE;
  END IF;

  CREATE TABLE IF NOT EXISTS public.admin_actions (
    id integer NOT NULL DEFAULT nextval('admin_actions_id_seq'::regclass),
    admin_id integer,
    action varchar(80) NOT NULL,
    target_type varchar(64),
    target_id integer,
    ip varchar(64),
    session_id varchar(255),
    user_agent varchar(255),
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
  ) PARTITION BY RANGE (created_at);

  BEGIN
    ALTER TABLE public.admin_actions
      ADD CONSTRAINT admin_actions_admin_id_admins_id_fk
      FOREIGN KEY (admin_id) REFERENCES public.admins(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  CREATE INDEX IF NOT EXISTS admin_actions_id_idx
    ON public.admin_actions (id);
  CREATE INDEX IF NOT EXISTS admin_actions_admin_idx
    ON public.admin_actions (admin_id);
  CREATE INDEX IF NOT EXISTS admin_actions_admin_created_idx
    ON public.admin_actions (admin_id, created_at);
  CREATE INDEX IF NOT EXISTS admin_actions_action_idx
    ON public.admin_actions (action);
  CREATE INDEX IF NOT EXISTS admin_actions_session_idx
    ON public.admin_actions (session_id);

  PERFORM partition_maintenance.ensure_default_partition('public.admin_actions'::regclass);

  IF to_regclass('public.admin_actions_legacy') IS NOT NULL THEN
    SELECT count(*), min(created_at), max(created_at)
      INTO source_count, min_created_at, max_created_at
    FROM public.admin_actions_legacy;

    PERFORM partition_maintenance.ensure_partition_range(
      'public.admin_actions'::regclass,
      min_created_at,
      max_created_at
    );

    INSERT INTO public.admin_actions (
      id,
      admin_id,
      action,
      target_type,
      target_id,
      ip,
      session_id,
      user_agent,
      metadata,
      created_at
    )
    SELECT
      id,
      admin_id,
      action,
      target_type,
      target_id,
      ip,
      session_id,
      user_agent,
      metadata,
      created_at
    FROM public.admin_actions_legacy
    ORDER BY created_at, id;

    SELECT count(*)
      INTO target_count
    FROM public.admin_actions;

    IF target_count <> source_count THEN
      RAISE EXCEPTION
        'admin_actions partition migration row count mismatch: source %, target %',
        source_count,
        target_count;
    END IF;

    DROP TABLE public.admin_actions_legacy;
  END IF;

  IF to_regclass('public.admin_actions_id_seq') IS NOT NULL THEN
    SELECT max(id)
      INTO max_id
    FROM public.admin_actions;

    IF max_id IS NULL THEN
      PERFORM setval('public.admin_actions_id_seq', 1, false);
    ELSE
      PERFORM setval('public.admin_actions_id_seq', max_id, true);
    END IF;

    ALTER SEQUENCE public.admin_actions_id_seq
      OWNED BY public.admin_actions.id;
  END IF;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  source_count bigint := 0;
  target_count bigint := 0;
  min_created_at timestamptz;
  max_created_at timestamptz;
  max_id integer;
BEGIN
  IF to_regclass('public.round_events') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class cls
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'round_events'
      AND cls.relkind = 'p'
  ) THEN
    PERFORM partition_maintenance.ensure_default_partition('public.round_events'::regclass);
    RETURN;
  END IF;

  IF to_regclass('public.round_events_legacy') IS NULL THEN
    ALTER TABLE public.round_events RENAME TO round_events_legacy;
  END IF;

  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.round_events_legacy'),
    'round_events_pkey',
    'round_events_legacy_pkey'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.round_events_legacy'),
    'round_events_user_id_users_id_fk',
    'round_events_legacy_user_id_users_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.round_events_legacy'),
    'round_events_table_id_tables_id_fk',
    'round_events_legacy_table_id_tables_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.round_events_legacy'),
    'round_events_seat_id_seats_id_fk',
    'round_events_legacy_seat_id_seats_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.round_events_legacy'),
    'round_events_table_round_id_rounds_id_fk',
    'round_events_legacy_table_round_id_rounds_id_fk'
  );

  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'round_events_round_event_unique_idx',
    'round_events_round_event_unique_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'round_events_round_lookup_idx',
    'round_events_round_lookup_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'round_events_user_created_idx',
    'round_events_user_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'round_events_table_round_event_unique_idx',
    'round_events_table_round_event_unique_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'round_events_table_round_lookup_idx',
    'round_events_table_round_lookup_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'round_events_table_phase_created_idx',
    'round_events_table_phase_created_idx_legacy'
  );

  IF to_regclass('public.round_events_legacy') IS NOT NULL THEN
    ALTER TABLE public.round_events_legacy
      ALTER COLUMN id DROP DEFAULT;
  END IF;

  IF to_regclass('public.round_events_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE public.round_events_id_seq OWNED BY NONE;
  END IF;

  CREATE TABLE IF NOT EXISTS public.round_events (
    id integer NOT NULL DEFAULT nextval('round_events_id_seq'::regclass),
    round_type varchar(32) NOT NULL,
    round_entity_id integer NOT NULL,
    user_id integer,
    table_id integer,
    seat_id integer,
    table_round_id integer,
    phase varchar(64),
    event_index integer NOT NULL,
    event_type varchar(64) NOT NULL,
    actor varchar(16) NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
  ) PARTITION BY RANGE (created_at);

  BEGIN
    ALTER TABLE public.round_events
      ADD CONSTRAINT round_events_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.round_events
      ADD CONSTRAINT round_events_table_id_tables_id_fk
      FOREIGN KEY (table_id) REFERENCES public.tables(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.round_events
      ADD CONSTRAINT round_events_seat_id_seats_id_fk
      FOREIGN KEY (seat_id) REFERENCES public.seats(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.round_events
      ADD CONSTRAINT round_events_table_round_id_rounds_id_fk
      FOREIGN KEY (table_round_id) REFERENCES public.rounds(id)
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  CREATE INDEX IF NOT EXISTS round_events_id_idx
    ON public.round_events (id);
  CREATE INDEX IF NOT EXISTS round_events_round_lookup_idx
    ON public.round_events (round_type, round_entity_id, event_index);
  CREATE INDEX IF NOT EXISTS round_events_user_created_idx
    ON public.round_events (user_id, created_at, id);
  CREATE INDEX IF NOT EXISTS round_events_table_round_lookup_idx
    ON public.round_events (table_round_id, event_index);
  CREATE INDEX IF NOT EXISTS round_events_table_phase_created_idx
    ON public.round_events (table_id, phase, created_at);

  PERFORM partition_maintenance.ensure_default_partition('public.round_events'::regclass);

  IF to_regclass('public.round_events_legacy') IS NOT NULL THEN
    SELECT count(*), min(created_at), max(created_at)
      INTO source_count, min_created_at, max_created_at
    FROM public.round_events_legacy;

    PERFORM partition_maintenance.ensure_partition_range(
      'public.round_events'::regclass,
      min_created_at,
      max_created_at
    );

    INSERT INTO public.round_events (
      id,
      round_type,
      round_entity_id,
      user_id,
      table_id,
      seat_id,
      table_round_id,
      phase,
      event_index,
      event_type,
      actor,
      payload,
      created_at
    )
    SELECT
      id,
      round_type,
      round_entity_id,
      user_id,
      table_id,
      seat_id,
      table_round_id,
      phase,
      event_index,
      event_type,
      actor,
      payload,
      created_at
    FROM public.round_events_legacy
    ORDER BY created_at, id;

    SELECT count(*)
      INTO target_count
    FROM public.round_events;

    IF target_count <> source_count THEN
      RAISE EXCEPTION
        'round_events partition migration row count mismatch: source %, target %',
        source_count,
        target_count;
    END IF;

    DROP TABLE public.round_events_legacy;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.round_events'::regclass
      AND tgname = 'round_events_uniqueness_guard'
      AND NOT tgisinternal
  ) THEN
    DROP TRIGGER round_events_uniqueness_guard ON public.round_events;
  END IF;
  CREATE TRIGGER round_events_uniqueness_guard
    BEFORE INSERT OR UPDATE OF round_type, round_entity_id, table_round_id, event_index
    ON public.round_events
    FOR EACH ROW
    EXECUTE FUNCTION partition_maintenance.enforce_round_event_uniqueness();

  IF to_regclass('public.round_events_id_seq') IS NOT NULL THEN
    SELECT max(id)
      INTO max_id
    FROM public.round_events;

    IF max_id IS NULL THEN
      PERFORM setval('public.round_events_id_seq', 1, false);
    ELSE
      PERFORM setval('public.round_events_id_seq', max_id, true);
    END IF;

    ALTER SEQUENCE public.round_events_id_seq
      OWNED BY public.round_events.id;
  END IF;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  source_count bigint := 0;
  target_count bigint := 0;
  min_created_at timestamptz;
  max_created_at timestamptz;
  max_id integer;
BEGIN
  IF to_regclass('public.saas_usage_events') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class cls
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'saas_usage_events'
      AND cls.relkind = 'p'
  ) THEN
    PERFORM partition_maintenance.ensure_default_partition('public.saas_usage_events'::regclass);
    RETURN;
  END IF;

  IF to_regclass('public.saas_usage_events_legacy') IS NULL THEN
    ALTER TABLE public.saas_usage_events RENAME TO saas_usage_events_legacy;
  END IF;

  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.saas_usage_events_legacy'),
    'saas_usage_events_pkey',
    'saas_usage_events_legacy_pkey'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.saas_usage_events_legacy'),
    'saas_usage_events_tenant_id_saas_tenants_id_fk',
    'saas_usage_events_legacy_tenant_id_saas_tenants_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.saas_usage_events_legacy'),
    'saas_usage_events_project_id_saas_projects_id_fk',
    'saas_usage_events_legacy_project_id_saas_projects_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.saas_usage_events_legacy'),
    'saas_usage_events_api_key_id_saas_api_keys_id_fk',
    'saas_usage_events_legacy_api_key_id_saas_api_keys_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.saas_usage_events_legacy'),
    'saas_usage_events_billing_run_id_saas_billing_runs_id_fk',
    'saas_usage_events_legacy_billing_run_id_saas_billing_runs_id_fk'
  );
  PERFORM partition_maintenance.rename_table_constraint_if_exists(
    to_regclass('public.saas_usage_events_legacy'),
    'saas_usage_events_player_id_saas_players_id_fk',
    'saas_usage_events_legacy_player_id_saas_players_id_fk'
  );

  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'saas_usage_events_tenant_created_idx',
    'saas_usage_events_tenant_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'saas_usage_events_project_created_idx',
    'saas_usage_events_project_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'saas_usage_events_billing_run_idx',
    'saas_usage_events_billing_run_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'saas_usage_events_billing_run_decision_idx',
    'saas_usage_events_billing_run_decision_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'saas_usage_events_event_reference_unique',
    'saas_usage_events_event_reference_unique_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'saas_usage_events_api_key_created_idx',
    'saas_usage_events_api_key_created_idx_legacy'
  );
  PERFORM partition_maintenance.rename_index_if_exists(
    'public',
    'saas_usage_events_player_created_idx',
    'saas_usage_events_player_created_idx_legacy'
  );

  IF to_regclass('public.saas_usage_events_legacy') IS NOT NULL THEN
    ALTER TABLE public.saas_usage_events_legacy
      ALTER COLUMN id DROP DEFAULT;
  END IF;

  IF to_regclass('public.saas_usage_events_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE public.saas_usage_events_id_seq OWNED BY NONE;
  END IF;

  CREATE TABLE IF NOT EXISTS public.saas_usage_events (
    id integer NOT NULL DEFAULT nextval('saas_usage_events_id_seq'::regclass),
    tenant_id integer NOT NULL,
    project_id integer NOT NULL,
    api_key_id integer NOT NULL,
    billing_run_id integer,
    player_id integer,
    environment varchar(16) NOT NULL,
    event_type varchar(64) NOT NULL,
    decision_type varchar(32),
    reference_type varchar(64),
    reference_id integer,
    units integer NOT NULL DEFAULT 1,
    amount numeric(14, 4) NOT NULL DEFAULT '0',
    currency varchar(16) NOT NULL DEFAULT 'USD',
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
  ) PARTITION BY RANGE (created_at);

  BEGIN
    ALTER TABLE public.saas_usage_events
      ADD CONSTRAINT saas_usage_events_tenant_id_saas_tenants_id_fk
      FOREIGN KEY (tenant_id) REFERENCES public.saas_tenants(id)
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.saas_usage_events
      ADD CONSTRAINT saas_usage_events_project_id_saas_projects_id_fk
      FOREIGN KEY (project_id) REFERENCES public.saas_projects(id)
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.saas_usage_events
      ADD CONSTRAINT saas_usage_events_api_key_id_saas_api_keys_id_fk
      FOREIGN KEY (api_key_id) REFERENCES public.saas_api_keys(id)
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.saas_usage_events
      ADD CONSTRAINT saas_usage_events_billing_run_id_saas_billing_runs_id_fk
      FOREIGN KEY (billing_run_id) REFERENCES public.saas_billing_runs(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  BEGIN
    ALTER TABLE public.saas_usage_events
      ADD CONSTRAINT saas_usage_events_player_id_saas_players_id_fk
      FOREIGN KEY (player_id) REFERENCES public.saas_players(id)
      ON DELETE set null ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  CREATE INDEX IF NOT EXISTS saas_usage_events_id_idx
    ON public.saas_usage_events (id);
  CREATE INDEX IF NOT EXISTS saas_usage_events_tenant_created_idx
    ON public.saas_usage_events (tenant_id, created_at, id);
  CREATE INDEX IF NOT EXISTS saas_usage_events_project_created_idx
    ON public.saas_usage_events (project_id, created_at, id);
  CREATE INDEX IF NOT EXISTS saas_usage_events_billing_run_idx
    ON public.saas_usage_events (billing_run_id);
  CREATE INDEX IF NOT EXISTS saas_usage_events_billing_run_decision_idx
    ON public.saas_usage_events (billing_run_id, decision_type);
  CREATE INDEX IF NOT EXISTS saas_usage_events_event_reference_idx
    ON public.saas_usage_events (event_type, reference_type, reference_id);
  CREATE INDEX IF NOT EXISTS saas_usage_events_api_key_created_idx
    ON public.saas_usage_events (api_key_id, created_at, id);
  CREATE INDEX IF NOT EXISTS saas_usage_events_player_created_idx
    ON public.saas_usage_events (player_id, created_at, id);

  PERFORM partition_maintenance.ensure_default_partition('public.saas_usage_events'::regclass);

  IF to_regclass('public.saas_usage_events_legacy') IS NOT NULL THEN
    SELECT count(*), min(created_at), max(created_at)
      INTO source_count, min_created_at, max_created_at
    FROM public.saas_usage_events_legacy;

    PERFORM partition_maintenance.ensure_partition_range(
      'public.saas_usage_events'::regclass,
      min_created_at,
      max_created_at
    );

    INSERT INTO public.saas_usage_events (
      id,
      tenant_id,
      project_id,
      api_key_id,
      billing_run_id,
      player_id,
      environment,
      event_type,
      decision_type,
      reference_type,
      reference_id,
      units,
      amount,
      currency,
      metadata,
      created_at
    )
    SELECT
      id,
      tenant_id,
      project_id,
      api_key_id,
      billing_run_id,
      player_id,
      environment,
      event_type,
      decision_type,
      reference_type,
      reference_id,
      units,
      amount,
      currency,
      metadata,
      created_at
    FROM public.saas_usage_events_legacy
    ORDER BY created_at, id;

    SELECT count(*)
      INTO target_count
    FROM public.saas_usage_events;

    IF target_count <> source_count THEN
      RAISE EXCEPTION
        'saas_usage_events partition migration row count mismatch: source %, target %',
        source_count,
        target_count;
    END IF;

    DROP TABLE public.saas_usage_events_legacy;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.saas_usage_events'::regclass
      AND tgname = 'saas_usage_events_reference_guard'
      AND NOT tgisinternal
  ) THEN
    DROP TRIGGER saas_usage_events_reference_guard ON public.saas_usage_events;
  END IF;
  CREATE TRIGGER saas_usage_events_reference_guard
    BEFORE INSERT OR UPDATE OF event_type, reference_type, reference_id
    ON public.saas_usage_events
    FOR EACH ROW
    EXECUTE FUNCTION partition_maintenance.enforce_saas_usage_event_reference_uniqueness();

  IF to_regclass('public.saas_usage_events_id_seq') IS NOT NULL THEN
    SELECT max(id)
      INTO max_id
    FROM public.saas_usage_events;

    IF max_id IS NULL THEN
      PERFORM setval('public.saas_usage_events_id_seq', 1, false);
    ELSE
      PERFORM setval('public.saas_usage_events_id_seq', max_id, true);
    END IF;

    ALTER SEQUENCE public.saas_usage_events_id_seq
      OWNED BY public.saas_usage_events.id;
  END IF;
END;
$$;
--> statement-breakpoint

SELECT *
FROM partition_maintenance.ensure_reward_system_time_partitions(3, 1);
