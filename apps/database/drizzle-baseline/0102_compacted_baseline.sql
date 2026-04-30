--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3 (Homebrew)
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: partition_maintenance; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "partition_maintenance";


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";


--
-- Name: aml_review_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."aml_review_status" AS ENUM (
    'pending',
    'cleared',
    'confirmed',
    'escalated'
);


--
-- Name: archive_reward_system_time_partitions(integer, "text"); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."archive_reward_system_time_partitions"("p_archive_after_months" integer DEFAULT 18, "p_archive_schema" "text" DEFAULT 'partition_archive'::"text") RETURNS TABLE("parent_table" "text", "partition_name" "text", "action" "text", "month_start" "date", "month_end" "date")
    LANGUAGE "plpgsql"
    AS $_$
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
$_$;


--
-- Name: enforce_round_event_uniqueness(); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."enforce_round_event_uniqueness"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


--
-- Name: enforce_saas_usage_event_reference_uniqueness(); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."enforce_saas_usage_event_reference_uniqueness"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


--
-- Name: ensure_default_partition("regclass"); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."ensure_default_partition"("p_parent_table" "regclass") RETURNS TABLE("parent_table" "text", "partition_name" "text", "action" "text")
    LANGUAGE "plpgsql"
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


--
-- Name: ensure_monthly_partition("regclass", "date"); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."ensure_monthly_partition"("p_parent_table" "regclass", "p_month_start" "date") RETURNS TABLE("parent_table" "text", "partition_name" "text", "action" "text", "month_start" "date", "month_end" "date")
    LANGUAGE "plpgsql"
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


--
-- Name: ensure_partition_range("regclass", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."ensure_partition_range"("p_parent_table" "regclass", "p_range_start" timestamp with time zone, "p_range_end" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql"
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


--
-- Name: ensure_reward_system_time_partitions(integer, integer); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."ensure_reward_system_time_partitions"("p_future_months" integer DEFAULT 3, "p_months_back" integer DEFAULT 1) RETURNS TABLE("parent_table" "text", "partition_name" "text", "action" "text", "month_start" "date", "month_end" "date")
    LANGUAGE "plpgsql"
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


--
-- Name: rename_index_if_exists("text", "text", "text"); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."rename_index_if_exists"("p_schema" "text", "p_old_name" "text", "p_new_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
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


--
-- Name: rename_table_constraint_if_exists("regclass", "text", "text"); Type: FUNCTION; Schema: partition_maintenance; Owner: -
--

CREATE FUNCTION "partition_maintenance"."rename_table_constraint_if_exists"("p_table" "regclass", "p_old_name" "text", "p_new_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
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


--
-- Name: enforce_saas_billing_run_external_sync_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."enforce_saas_billing_run_external_sync_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD."external_sync_status" = NEW."external_sync_status" THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'idle'
    AND NEW."external_sync_status" = 'processing' THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'processing'
    AND NEW."external_sync_status" IN ('processing', 'succeeded', 'failed') THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'succeeded'
    AND NEW."external_sync_status" IN ('processing', 'succeeded') THEN
    RETURN NEW;
  END IF;

  IF OLD."external_sync_status" = 'failed'
    AND NEW."external_sync_status" IN ('processing', 'failed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Invalid saas_billing_runs.external_sync_status transition: % -> %',
    OLD."external_sync_status",
    NEW."external_sync_status";
END
$$;


SET default_tablespace = '';

--
-- Name: admin_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions" (
    "id" integer CONSTRAINT "admin_actions_id_not_null1" NOT NULL,
    "admin_id" integer,
    "action" character varying(80) CONSTRAINT "admin_actions_action_not_null1" NOT NULL,
    "target_type" character varying(64),
    "target_id" integer,
    "ip" character varying(64),
    "session_id" character varying(255),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "admin_actions_created_at_not_null1" NOT NULL
)
PARTITION BY RANGE ("created_at");


--
-- Name: admin_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."admin_actions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."admin_actions_id_seq" OWNED BY "public"."admin_actions"."id";


SET default_table_access_method = "heap";

--
-- Name: admin_actions_default; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions_default" (
    "id" integer DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass") CONSTRAINT "admin_actions_id_not_null1" NOT NULL,
    "admin_id" integer,
    "action" character varying(80) CONSTRAINT "admin_actions_action_not_null1" NOT NULL,
    "target_type" character varying(64),
    "target_id" integer,
    "ip" character varying(64),
    "session_id" character varying(255),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "admin_actions_created_at_not_null1" NOT NULL
);


--
-- Name: admin_actions_p202603; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions_p202603" (
    "id" integer DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass") CONSTRAINT "admin_actions_id_not_null1" NOT NULL,
    "admin_id" integer,
    "action" character varying(80) CONSTRAINT "admin_actions_action_not_null1" NOT NULL,
    "target_type" character varying(64),
    "target_id" integer,
    "ip" character varying(64),
    "session_id" character varying(255),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "admin_actions_created_at_not_null1" NOT NULL
);


--
-- Name: admin_actions_p202604; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions_p202604" (
    "id" integer DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass") CONSTRAINT "admin_actions_id_not_null1" NOT NULL,
    "admin_id" integer,
    "action" character varying(80) CONSTRAINT "admin_actions_action_not_null1" NOT NULL,
    "target_type" character varying(64),
    "target_id" integer,
    "ip" character varying(64),
    "session_id" character varying(255),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "admin_actions_created_at_not_null1" NOT NULL
);


--
-- Name: admin_actions_p202605; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions_p202605" (
    "id" integer DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass") CONSTRAINT "admin_actions_id_not_null1" NOT NULL,
    "admin_id" integer,
    "action" character varying(80) CONSTRAINT "admin_actions_action_not_null1" NOT NULL,
    "target_type" character varying(64),
    "target_id" integer,
    "ip" character varying(64),
    "session_id" character varying(255),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "admin_actions_created_at_not_null1" NOT NULL
);


--
-- Name: admin_actions_p202606; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions_p202606" (
    "id" integer DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass") CONSTRAINT "admin_actions_id_not_null1" NOT NULL,
    "admin_id" integer,
    "action" character varying(80) CONSTRAINT "admin_actions_action_not_null1" NOT NULL,
    "target_type" character varying(64),
    "target_id" integer,
    "ip" character varying(64),
    "session_id" character varying(255),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "admin_actions_created_at_not_null1" NOT NULL
);


--
-- Name: admin_actions_p202607; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_actions_p202607" (
    "id" integer DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass") CONSTRAINT "admin_actions_id_not_null1" NOT NULL,
    "admin_id" integer,
    "action" character varying(80) CONSTRAINT "admin_actions_action_not_null1" NOT NULL,
    "target_type" character varying(64),
    "target_id" integer,
    "ip" character varying(64),
    "session_id" character varying(255),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "admin_actions_created_at_not_null1" NOT NULL
);


--
-- Name: admin_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_permissions" (
    "id" integer NOT NULL,
    "admin_id" integer NOT NULL,
    "permission_key" character varying(64) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: admin_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."admin_permissions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."admin_permissions_id_seq" OWNED BY "public"."admin_permissions"."id";


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admins" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "display_name" character varying(160),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mfa_enabled" boolean DEFAULT false NOT NULL,
    "mfa_secret_ciphertext" "text",
    "mfa_enabled_at" timestamp with time zone,
    "mfa_recovery_code_hashes" "jsonb",
    "mfa_recovery_codes_generated_at" timestamp with time zone
);


--
-- Name: admins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."admins_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."admins_id_seq" OWNED BY "public"."admins"."id";


--
-- Name: agent_blocklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agent_blocklist" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "agent_id" character varying(128) NOT NULL,
    "mode" character varying(32) DEFAULT 'blocked'::character varying NOT NULL,
    "reason" character varying(255) NOT NULL,
    "budget_multiplier" numeric(5,4),
    "created_by_admin_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: agent_blocklist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."agent_blocklist_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_blocklist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."agent_blocklist_id_seq" OWNED BY "public"."agent_blocklist"."id";


--
-- Name: agent_risk_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agent_risk_state" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "api_key_id" integer NOT NULL,
    "agent_id" character varying(128),
    "player_external_id" character varying(128),
    "identity_type" character varying(32) NOT NULL,
    "identity_value_hash" character varying(128) NOT NULL,
    "identity_hint" character varying(160),
    "risk_score" integer DEFAULT 0 NOT NULL,
    "hit_count" integer DEFAULT 0 NOT NULL,
    "severe_hit_count" integer DEFAULT 0 NOT NULL,
    "last_severity" character varying(16) DEFAULT 'low'::character varying NOT NULL,
    "last_plugin" character varying(64) NOT NULL,
    "last_reason" character varying(255) NOT NULL,
    "metadata" "jsonb",
    "first_hit_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_hit_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: agent_risk_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."agent_risk_state_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_risk_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."agent_risk_state_id_seq" OWNED BY "public"."agent_risk_state"."id";


--
-- Name: aml_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."aml_checks" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "checkpoint" character varying(32) NOT NULL,
    "provider_key" character varying(32) DEFAULT 'mock'::character varying NOT NULL,
    "result" character varying(32) NOT NULL,
    "risk_level" character varying(16) DEFAULT 'low'::character varying NOT NULL,
    "provider_reference" character varying(128),
    "provider_payload" "jsonb",
    "metadata" "jsonb",
    "review_status" "public"."aml_review_status",
    "reviewed_by_admin_id" integer,
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "escalated_at" timestamp with time zone,
    "sla_due_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: aml_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."aml_checks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aml_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."aml_checks_id_seq" OWNED BY "public"."aml_checks"."id";


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."audit_events" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "api_key_id" integer NOT NULL,
    "agent_id" character varying(128),
    "player_external_id" character varying(128),
    "event_type" character varying(32) NOT NULL,
    "severity" character varying(16) NOT NULL,
    "plugin" character varying(64) NOT NULL,
    "identity_type" character varying(32) NOT NULL,
    "identity_value_hash" character varying(128) NOT NULL,
    "identity_hint" character varying(160),
    "ip" character varying(64),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."audit_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."audit_events_id_seq" OWNED BY "public"."audit_events"."id";


--
-- Name: auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."auth_events" (
    "id" integer NOT NULL,
    "user_id" integer,
    "email" character varying(255),
    "event_type" character varying(64) NOT NULL,
    "ip" character varying(64),
    "user_agent" character varying(255),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: auth_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."auth_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."auth_events_id_seq" OWNED BY "public"."auth_events"."id";


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."auth_sessions" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "session_kind" character varying(16) NOT NULL,
    "subject_role" character varying(20) NOT NULL,
    "jti" character varying(64) NOT NULL,
    "status" character varying(16) DEFAULT 'active'::character varying NOT NULL,
    "ip" character varying(64),
    "user_agent" character varying(255),
    "expires_at" timestamp with time zone NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_reason" character varying(120),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: auth_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."auth_sessions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."auth_sessions_id_seq" OWNED BY "public"."auth_sessions"."id";


--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."auth_tokens" (
    "id" integer NOT NULL,
    "user_id" integer,
    "email" character varying(255),
    "phone" character varying(32),
    "token_type" character varying(32) NOT NULL,
    "token_hash" character varying(128) NOT NULL,
    "metadata" "jsonb",
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."auth_tokens_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."auth_tokens_id_seq" OWNED BY "public"."auth_tokens"."id";


--
-- Name: blackjack_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."blackjack_games" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "stake_amount" numeric(14,2) NOT NULL,
    "total_stake" numeric(14,2) NOT NULL,
    "payout_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "player_cards" "jsonb" NOT NULL,
    "dealer_cards" "jsonb" NOT NULL,
    "deck" "jsonb" NOT NULL,
    "next_card_index" integer DEFAULT 0 NOT NULL,
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "metadata" "jsonb",
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "turn_deadline_at" timestamp with time zone
);


--
-- Name: blackjack_games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."blackjack_games_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blackjack_games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."blackjack_games_id_seq" OWNED BY "public"."blackjack_games"."id";


--
-- Name: community_moderation_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."community_moderation_actions" (
    "id" integer NOT NULL,
    "admin_id" integer,
    "target_type" character varying(16) NOT NULL,
    "target_id" integer NOT NULL,
    "thread_id" integer,
    "post_id" integer,
    "action" character varying(32) NOT NULL,
    "reason" character varying(500),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: community_moderation_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."community_moderation_actions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_moderation_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."community_moderation_actions_id_seq" OWNED BY "public"."community_moderation_actions"."id";


--
-- Name: community_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."community_posts" (
    "id" integer NOT NULL,
    "thread_id" integer NOT NULL,
    "author_user_id" integer NOT NULL,
    "body" "text" NOT NULL,
    "status" character varying(16) DEFAULT 'visible'::character varying NOT NULL,
    "hidden_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: community_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."community_posts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."community_posts_id_seq" OWNED BY "public"."community_posts"."id";


--
-- Name: community_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."community_reports" (
    "id" integer NOT NULL,
    "post_id" integer NOT NULL,
    "reporter_user_id" integer,
    "reason" character varying(64) NOT NULL,
    "detail" "text",
    "status" character varying(16) DEFAULT 'open'::character varying NOT NULL,
    "resolution_note" "text",
    "resolved_by_admin_id" integer,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" character varying(24) DEFAULT 'user_report'::character varying NOT NULL,
    "metadata" "jsonb"
);


--
-- Name: community_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."community_reports_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."community_reports_id_seq" OWNED BY "public"."community_reports"."id";


--
-- Name: community_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."community_threads" (
    "id" integer NOT NULL,
    "author_user_id" integer NOT NULL,
    "title" character varying(160) NOT NULL,
    "status" character varying(16) DEFAULT 'visible'::character varying NOT NULL,
    "is_locked" boolean DEFAULT false NOT NULL,
    "post_count" integer DEFAULT 0 NOT NULL,
    "last_post_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "hidden_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: community_threads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."community_threads_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_threads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."community_threads_id_seq" OWNED BY "public"."community_threads"."id";


--
-- Name: config_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."config_change_requests" (
    "id" integer NOT NULL,
    "change_type" character varying(64) NOT NULL,
    "status" character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    "target_type" character varying(64) NOT NULL,
    "target_id" integer,
    "change_payload" "jsonb" NOT NULL,
    "reason" "text",
    "requires_second_confirmation" boolean DEFAULT false NOT NULL,
    "requires_mfa" boolean DEFAULT false NOT NULL,
    "created_by_admin_id" integer NOT NULL,
    "submitted_by_admin_id" integer,
    "approved_by_admin_id" integer,
    "published_by_admin_id" integer,
    "rejected_by_admin_id" integer,
    "submitted_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: config_change_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."config_change_requests_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_change_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."config_change_requests_id_seq" OWNED BY "public"."config_change_requests"."id";


--
-- Name: crypto_chain_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."crypto_chain_transactions" (
    "id" integer NOT NULL,
    "tx_hash" character varying(191) NOT NULL,
    "direction" character varying(16) NOT NULL,
    "chain" character varying(64) NOT NULL,
    "network" character varying(64) NOT NULL,
    "token" character varying(64) NOT NULL,
    "from_address" character varying(191),
    "to_address" character varying(191),
    "amount" numeric(36,18) NOT NULL,
    "confirmations" integer DEFAULT 0 NOT NULL,
    "raw_payload" "jsonb",
    "consumed_by_deposit_id" integer,
    "consumed_by_withdrawal_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: crypto_chain_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."crypto_chain_transactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crypto_chain_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."crypto_chain_transactions_id_seq" OWNED BY "public"."crypto_chain_transactions"."id";


--
-- Name: crypto_deposit_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."crypto_deposit_channels" (
    "id" integer NOT NULL,
    "provider_id" integer,
    "chain" character varying(64) NOT NULL,
    "network" character varying(64) NOT NULL,
    "token" character varying(64) NOT NULL,
    "receive_address" character varying(191) NOT NULL,
    "qr_code_url" "text",
    "memo_required" boolean DEFAULT false NOT NULL,
    "memo_value" character varying(191),
    "min_confirmations" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: crypto_deposit_channels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."crypto_deposit_channels_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crypto_deposit_channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."crypto_deposit_channels_id_seq" OWNED BY "public"."crypto_deposit_channels"."id";


--
-- Name: crypto_review_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."crypto_review_events" (
    "id" integer NOT NULL,
    "target_type" character varying(32) NOT NULL,
    "target_id" integer NOT NULL,
    "action" character varying(64) NOT NULL,
    "reviewer_admin_id" integer,
    "note" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: crypto_review_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."crypto_review_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crypto_review_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."crypto_review_events_id_seq" OWNED BY "public"."crypto_review_events"."id";


--
-- Name: crypto_withdraw_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."crypto_withdraw_addresses" (
    "payout_method_id" integer NOT NULL,
    "chain" character varying(64) NOT NULL,
    "network" character varying(64) NOT NULL,
    "token" character varying(64) NOT NULL,
    "address" character varying(191) NOT NULL,
    "label" character varying(120),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: data_deletion_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."data_deletion_requests" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "status" character varying(32) DEFAULT 'pending_review'::character varying NOT NULL,
    "source" character varying(32) DEFAULT 'user_self_service'::character varying NOT NULL,
    "requested_by_user_id" integer,
    "request_reason" "text",
    "subject_email_hint" character varying(255),
    "subject_phone_hint" character varying(64),
    "subject_email_hash" character varying(64),
    "subject_phone_hash" character varying(64),
    "due_at" timestamp with time zone NOT NULL,
    "reviewed_by_admin_id" integer,
    "review_decision" character varying(16),
    "review_notes" "text",
    "reviewed_at" timestamp with time zone,
    "completed_by_admin_id" integer,
    "completed_at" timestamp with time zone,
    "failure_reason" "text",
    "result_summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: data_deletion_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."data_deletion_requests_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_deletion_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."data_deletion_requests_id_seq" OWNED BY "public"."data_deletion_requests"."id";


--
-- Name: data_rights_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."data_rights_audits" (
    "id" integer NOT NULL,
    "request_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "action" character varying(32) NOT NULL,
    "actor_user_id" integer,
    "actor_admin_id" integer,
    "notes" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: data_rights_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."data_rights_audits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_rights_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."data_rights_audits_id_seq" OWNED BY "public"."data_rights_audits"."id";


--
-- Name: deferred_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."deferred_payouts" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "game_key" character varying(32) NOT NULL,
    "mode" character varying(32) NOT NULL,
    "status" character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    "balance_type" character varying(16) NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "source_session_id" integer,
    "source_reference_type" character varying(64),
    "source_reference_id" integer,
    "trigger_reference_type" character varying(64),
    "trigger_reference_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: deferred_payouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."deferred_payouts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deferred_payouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."deferred_payouts_id_seq" OWNED BY "public"."deferred_payouts"."id";


--
-- Name: deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."deposits" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "provider_id" integer,
    "status" character varying(32) DEFAULT 'requested'::character varying NOT NULL,
    "reference_id" character varying(64),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel_type" character varying(16) DEFAULT 'fiat'::character varying NOT NULL,
    "asset_type" character varying(16) DEFAULT 'fiat'::character varying NOT NULL,
    "asset_code" character varying(64),
    "network" character varying(64),
    "provider_order_id" character varying(128),
    "submitted_tx_hash" character varying(128)
);


--
-- Name: deposits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."deposits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deposits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."deposits_id_seq" OWNED BY "public"."deposits"."id";


--
-- Name: device_fingerprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."device_fingerprints" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "fingerprint" character varying(128) NOT NULL,
    "entrypoint" character varying(32) NOT NULL,
    "activity_type" character varying(64) NOT NULL,
    "session_id" character varying(64),
    "ip" character varying(64),
    "user_agent" character varying(255),
    "event_count" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."device_fingerprints_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."device_fingerprints_id_seq" OWNED BY "public"."device_fingerprints"."id";


--
-- Name: draw_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."draw_records" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "prize_id" integer,
    "draw_cost" numeric(14,2) NOT NULL,
    "reward_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "status" character varying(32) NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: draw_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."draw_records_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draw_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."draw_records_id_seq" OWNED BY "public"."draw_records"."id";


--
-- Name: economy_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."economy_ledger_entries" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "asset_code" character varying(32) NOT NULL,
    "entry_type" character varying(64) NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "balance_before" numeric(14,2) NOT NULL,
    "balance_after" numeric(14,2) NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "actor_type" character varying(32),
    "actor_id" integer,
    "source_app" character varying(64),
    "device_fingerprint" character varying(255),
    "request_id" character varying(191),
    "idempotency_key" character varying(191),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: economy_ledger_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."economy_ledger_entries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: economy_ledger_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."economy_ledger_entries_id_seq" OWNED BY "public"."economy_ledger_entries"."id";


--
-- Name: experiment_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."experiment_assignments" (
    "id" integer NOT NULL,
    "experiment_id" integer NOT NULL,
    "subject_type" character varying(64) NOT NULL,
    "subject_key" character varying(191) NOT NULL,
    "variant_key" character varying(64) NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: experiment_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."experiment_assignments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: experiment_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."experiment_assignments_id_seq" OWNED BY "public"."experiment_assignments"."id";


--
-- Name: experiments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."experiments" (
    "id" integer NOT NULL,
    "key" character varying(128) NOT NULL,
    "description" character varying(255),
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "default_variant_key" character varying(64) DEFAULT 'control'::character varying NOT NULL,
    "variants" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: experiments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."experiments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: experiments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."experiments_id_seq" OWNED BY "public"."experiments"."id";


--
-- Name: fairness_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fairness_audits" (
    "id" integer NOT NULL,
    "epoch" integer NOT NULL,
    "epoch_seconds" integer NOT NULL,
    "commit_hash" character varying(128),
    "computed_hash" character varying(128),
    "matches" boolean DEFAULT false NOT NULL,
    "failure_code" character varying(64),
    "revealed_at" timestamp with time zone,
    "audited_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: fairness_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."fairness_audits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fairness_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."fairness_audits_id_seq" OWNED BY "public"."fairness_audits"."id";


--
-- Name: fairness_seeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fairness_seeds" (
    "id" integer NOT NULL,
    "epoch" integer NOT NULL,
    "epoch_seconds" integer NOT NULL,
    "commit_hash" character varying(128) NOT NULL,
    "seed" character varying(128),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revealed_at" timestamp with time zone
);


--
-- Name: fairness_seeds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."fairness_seeds_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fairness_seeds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."fairness_seeds_id_seq" OWNED BY "public"."fairness_seeds"."id";


--
-- Name: fiat_deposit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fiat_deposit_events" (
    "id" integer NOT NULL,
    "deposit_id" integer NOT NULL,
    "provider_trade_no" character varying(128),
    "client_reference" character varying(128),
    "webhook_id" character varying(128),
    "raw_payload" "jsonb",
    "signature_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: fiat_deposit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."fiat_deposit_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fiat_deposit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."fiat_deposit_events_id_seq" OWNED BY "public"."fiat_deposit_events"."id";


--
-- Name: fiat_payout_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fiat_payout_methods" (
    "payout_method_id" integer NOT NULL,
    "account_name" character varying(160) NOT NULL,
    "bank_name" character varying(160),
    "account_no_masked" character varying(64),
    "routing_code" character varying(64),
    "provider_code" character varying(64),
    "currency" character varying(16),
    "brand" character varying(60),
    "account_last4" character varying(4),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: fiat_withdraw_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fiat_withdraw_events" (
    "id" integer NOT NULL,
    "withdrawal_id" integer NOT NULL,
    "provider_payout_no" character varying(128),
    "settlement_reference" character varying(128),
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: fiat_withdraw_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."fiat_withdraw_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fiat_withdraw_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."fiat_withdraw_events_id_seq" OWNED BY "public"."fiat_withdraw_events"."id";


--
-- Name: finance_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."finance_reviews" (
    "id" integer NOT NULL,
    "order_type" character varying(32) NOT NULL,
    "order_id" integer NOT NULL,
    "action" character varying(64) NOT NULL,
    "review_stage" character varying(16) NOT NULL,
    "admin_id" integer,
    "operator_note" character varying(500) NOT NULL,
    "settlement_reference" character varying(128),
    "processing_channel" character varying(64),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: finance_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."finance_reviews_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: finance_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."finance_reviews_id_seq" OWNED BY "public"."finance_reviews"."id";


--
-- Name: freeze_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."freeze_records" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "reason" character varying(64) DEFAULT 'manual_admin'::character varying NOT NULL,
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "category" character varying(32) DEFAULT 'risk'::character varying NOT NULL,
    "scope" character varying(32) DEFAULT 'account_lock'::character varying NOT NULL,
    "metadata" "jsonb"
);


--
-- Name: freeze_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."freeze_records_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: freeze_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."freeze_records_id_seq" OWNED BY "public"."freeze_records"."id";


--
-- Name: gift_energy_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."gift_energy_accounts" (
    "user_id" integer NOT NULL,
    "current_energy" integer DEFAULT 10 NOT NULL,
    "max_energy" integer DEFAULT 10 NOT NULL,
    "refill_policy" "jsonb" NOT NULL,
    "last_refill_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: gift_pack_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."gift_pack_catalog" (
    "id" integer NOT NULL,
    "code" character varying(128) NOT NULL,
    "iap_product_id" integer NOT NULL,
    "reward_asset_code" character varying(32) NOT NULL,
    "reward_amount" numeric(14,2) NOT NULL,
    "delivery_content" "jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: gift_pack_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."gift_pack_catalog_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gift_pack_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."gift_pack_catalog_id_seq" OWNED BY "public"."gift_pack_catalog"."id";


--
-- Name: gift_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."gift_transfers" (
    "id" integer NOT NULL,
    "sender_user_id" integer NOT NULL,
    "receiver_user_id" integer NOT NULL,
    "asset_code" character varying(32) NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "energy_cost" integer DEFAULT 0 NOT NULL,
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "idempotency_key" character varying(191) NOT NULL,
    "source_app" character varying(64),
    "device_fingerprint" character varying(255),
    "request_id" character varying(191),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: gift_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."gift_transfers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gift_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."gift_transfers_id_seq" OWNED BY "public"."gift_transfers"."id";


--
-- Name: hand_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."hand_histories" (
    "id" integer NOT NULL,
    "round_type" character varying(32) NOT NULL,
    "game_type" character varying(64),
    "table_id" integer,
    "reference_id" integer NOT NULL,
    "primary_user_id" integer,
    "participant_user_ids" "jsonb" NOT NULL,
    "hand_number" integer,
    "status" character varying(32) NOT NULL,
    "summary" "jsonb" NOT NULL,
    "fairness" "jsonb",
    "started_at" timestamp with time zone NOT NULL,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: hand_histories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."hand_histories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hand_histories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."hand_histories_id_seq" OWNED BY "public"."hand_histories"."id";


--
-- Name: holdem_table_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."holdem_table_messages" (
    "id" integer NOT NULL,
    "table_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "seat_index" integer NOT NULL,
    "kind" character varying(16) NOT NULL,
    "text" character varying(180),
    "emoji" character varying(16),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "holdem_table_messages_kind_payload_check" CHECK ((((("kind")::"text" = 'chat'::"text") AND ("text" IS NOT NULL) AND ("emoji" IS NULL)) OR ((("kind")::"text" = 'emoji'::"text") AND ("text" IS NULL) AND ("emoji" IS NOT NULL))))
);


--
-- Name: holdem_table_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."holdem_table_messages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: holdem_table_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."holdem_table_messages_id_seq" OWNED BY "public"."holdem_table_messages"."id";


--
-- Name: holdem_table_seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."holdem_table_seats" (
    "id" integer NOT NULL,
    "table_id" integer NOT NULL,
    "seat_index" integer NOT NULL,
    "user_id" integer NOT NULL,
    "linked_group_id" character varying(128),
    "stack_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "committed_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "total_committed_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "status" character varying(16) DEFAULT 'waiting'::character varying NOT NULL,
    "turn_deadline_at" timestamp with time zone,
    "hole_cards" "jsonb" NOT NULL,
    "last_action" character varying(32),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "presence_heartbeat_at" timestamp with time zone,
    "disconnect_grace_expires_at" timestamp with time zone,
    "seat_lease_expires_at" timestamp with time zone,
    "auto_cash_out_pending" boolean DEFAULT false NOT NULL
);


--
-- Name: holdem_table_seats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."holdem_table_seats_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: holdem_table_seats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."holdem_table_seats_id_seq" OWNED BY "public"."holdem_table_seats"."id";


--
-- Name: holdem_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."holdem_tables" (
    "id" integer NOT NULL,
    "name" character varying(64) NOT NULL,
    "status" character varying(16) DEFAULT 'waiting'::character varying NOT NULL,
    "small_blind" numeric(14,2) DEFAULT '1'::numeric NOT NULL,
    "big_blind" numeric(14,2) DEFAULT '2'::numeric NOT NULL,
    "minimum_buy_in" numeric(14,2) DEFAULT '40'::numeric NOT NULL,
    "maximum_buy_in" numeric(14,2) DEFAULT '200'::numeric NOT NULL,
    "max_seats" integer DEFAULT 6 NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: holdem_tables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."holdem_tables_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: holdem_tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."holdem_tables_id_seq" OWNED BY "public"."holdem_tables"."id";


--
-- Name: house_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."house_account" (
    "id" integer NOT NULL,
    "house_bankroll" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "prize_pool_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "marketing_budget" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "reserve_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "house_account_singleton" CHECK (("id" = 1))
);


--
-- Name: house_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."house_account_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: house_account_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."house_account_id_seq" OWNED BY "public"."house_account"."id";


--
-- Name: house_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."house_transactions" (
    "id" integer NOT NULL,
    "house_account_id" integer NOT NULL,
    "type" character varying(64) NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "balance_before" numeric(14,2) NOT NULL,
    "balance_after" numeric(14,2) NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: house_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."house_transactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: house_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."house_transactions_id_seq" OWNED BY "public"."house_transactions"."id";


--
-- Name: iap_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."iap_products" (
    "id" integer NOT NULL,
    "sku" character varying(128) NOT NULL,
    "store_channel" character varying(16) NOT NULL,
    "delivery_type" character varying(32) NOT NULL,
    "asset_code" character varying(32),
    "asset_amount" numeric(14,2),
    "delivery_content" "jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: iap_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."iap_products_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: iap_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."iap_products_id_seq" OWNED BY "public"."iap_products"."id";


--
-- Name: jurisdiction_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."jurisdiction_rules" (
    "id" integer NOT NULL,
    "country_code" character varying(2) NOT NULL,
    "minimum_age" integer DEFAULT 18 NOT NULL,
    "allowed_features" "jsonb" DEFAULT '["real_money_gameplay", "topup", "withdrawal"]'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: jurisdiction_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."jurisdiction_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jurisdiction_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."jurisdiction_rules_id_seq" OWNED BY "public"."jurisdiction_rules"."id";


--
-- Name: kyc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."kyc_documents" (
    "id" integer NOT NULL,
    "profile_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "submission_version" integer NOT NULL,
    "kind" character varying(32) NOT NULL,
    "label" character varying(160),
    "file_name" character varying(255) NOT NULL,
    "mime_type" character varying(128) NOT NULL,
    "size_bytes" integer,
    "storage_path" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


--
-- Name: kyc_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."kyc_documents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kyc_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."kyc_documents_id_seq" OWNED BY "public"."kyc_documents"."id";


--
-- Name: kyc_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."kyc_profiles" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "current_tier" character varying(16) DEFAULT 'tier_0'::character varying NOT NULL,
    "requested_tier" character varying(16),
    "status" character varying(32) DEFAULT 'not_started'::character varying NOT NULL,
    "submission_version" integer DEFAULT 0 NOT NULL,
    "legal_name" character varying(160),
    "document_type" character varying(32),
    "document_number_last4" character varying(8),
    "country_code" character varying(2),
    "notes" "text",
    "rejection_reason" "text",
    "submitted_data" "jsonb",
    "risk_flags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "freeze_record_id" integer,
    "reviewed_by_admin_id" integer,
    "submitted_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active_submission_version" integer
);


--
-- Name: kyc_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."kyc_profiles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kyc_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."kyc_profiles_id_seq" OWNED BY "public"."kyc_profiles"."id";


--
-- Name: kyc_review_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."kyc_review_events" (
    "id" integer NOT NULL,
    "profile_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "submission_version" integer NOT NULL,
    "action" character varying(32) NOT NULL,
    "from_status" character varying(32) NOT NULL,
    "to_status" character varying(32) NOT NULL,
    "target_tier" character varying(16),
    "actor_admin_id" integer,
    "reason" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: kyc_review_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."kyc_review_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kyc_review_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."kyc_review_events_id_seq" OWNED BY "public"."kyc_review_events"."id";


--
-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_entries" (
    "id" integer CONSTRAINT "ledger_entries_id_not_null1" NOT NULL,
    "user_id" integer,
    "house_account_id" integer,
    "type" character varying(64) CONSTRAINT "ledger_entries_type_not_null1" NOT NULL,
    "amount" numeric(14,2) CONSTRAINT "ledger_entries_amount_not_null1" NOT NULL,
    "balance_before" numeric(14,2) CONSTRAINT "ledger_entries_balance_before_not_null1" NOT NULL,
    "balance_after" numeric(14,2) CONSTRAINT "ledger_entries_balance_after_not_null1" NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "ledger_mutation_event_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "ledger_entries_created_at_not_null1" NOT NULL
)
PARTITION BY RANGE ("created_at");


--
-- Name: ledger_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."ledger_entries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ledger_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."ledger_entries_id_seq" OWNED BY "public"."ledger_entries"."id";


--
-- Name: ledger_entries_default; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_entries_default" (
    "id" integer DEFAULT "nextval"('"public"."ledger_entries_id_seq"'::"regclass") CONSTRAINT "ledger_entries_id_not_null1" NOT NULL,
    "user_id" integer,
    "house_account_id" integer,
    "type" character varying(64) CONSTRAINT "ledger_entries_type_not_null1" NOT NULL,
    "amount" numeric(14,2) CONSTRAINT "ledger_entries_amount_not_null1" NOT NULL,
    "balance_before" numeric(14,2) CONSTRAINT "ledger_entries_balance_before_not_null1" NOT NULL,
    "balance_after" numeric(14,2) CONSTRAINT "ledger_entries_balance_after_not_null1" NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "ledger_mutation_event_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "ledger_entries_created_at_not_null1" NOT NULL
);


--
-- Name: ledger_entries_p202603; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_entries_p202603" (
    "id" integer DEFAULT "nextval"('"public"."ledger_entries_id_seq"'::"regclass") CONSTRAINT "ledger_entries_id_not_null1" NOT NULL,
    "user_id" integer,
    "house_account_id" integer,
    "type" character varying(64) CONSTRAINT "ledger_entries_type_not_null1" NOT NULL,
    "amount" numeric(14,2) CONSTRAINT "ledger_entries_amount_not_null1" NOT NULL,
    "balance_before" numeric(14,2) CONSTRAINT "ledger_entries_balance_before_not_null1" NOT NULL,
    "balance_after" numeric(14,2) CONSTRAINT "ledger_entries_balance_after_not_null1" NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "ledger_mutation_event_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "ledger_entries_created_at_not_null1" NOT NULL
);


--
-- Name: ledger_entries_p202604; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_entries_p202604" (
    "id" integer DEFAULT "nextval"('"public"."ledger_entries_id_seq"'::"regclass") CONSTRAINT "ledger_entries_id_not_null1" NOT NULL,
    "user_id" integer,
    "house_account_id" integer,
    "type" character varying(64) CONSTRAINT "ledger_entries_type_not_null1" NOT NULL,
    "amount" numeric(14,2) CONSTRAINT "ledger_entries_amount_not_null1" NOT NULL,
    "balance_before" numeric(14,2) CONSTRAINT "ledger_entries_balance_before_not_null1" NOT NULL,
    "balance_after" numeric(14,2) CONSTRAINT "ledger_entries_balance_after_not_null1" NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "ledger_mutation_event_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "ledger_entries_created_at_not_null1" NOT NULL
);


--
-- Name: ledger_entries_p202605; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_entries_p202605" (
    "id" integer DEFAULT "nextval"('"public"."ledger_entries_id_seq"'::"regclass") CONSTRAINT "ledger_entries_id_not_null1" NOT NULL,
    "user_id" integer,
    "house_account_id" integer,
    "type" character varying(64) CONSTRAINT "ledger_entries_type_not_null1" NOT NULL,
    "amount" numeric(14,2) CONSTRAINT "ledger_entries_amount_not_null1" NOT NULL,
    "balance_before" numeric(14,2) CONSTRAINT "ledger_entries_balance_before_not_null1" NOT NULL,
    "balance_after" numeric(14,2) CONSTRAINT "ledger_entries_balance_after_not_null1" NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "ledger_mutation_event_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "ledger_entries_created_at_not_null1" NOT NULL
);


--
-- Name: ledger_entries_p202606; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_entries_p202606" (
    "id" integer DEFAULT "nextval"('"public"."ledger_entries_id_seq"'::"regclass") CONSTRAINT "ledger_entries_id_not_null1" NOT NULL,
    "user_id" integer,
    "house_account_id" integer,
    "type" character varying(64) CONSTRAINT "ledger_entries_type_not_null1" NOT NULL,
    "amount" numeric(14,2) CONSTRAINT "ledger_entries_amount_not_null1" NOT NULL,
    "balance_before" numeric(14,2) CONSTRAINT "ledger_entries_balance_before_not_null1" NOT NULL,
    "balance_after" numeric(14,2) CONSTRAINT "ledger_entries_balance_after_not_null1" NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "ledger_mutation_event_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "ledger_entries_created_at_not_null1" NOT NULL
);


--
-- Name: ledger_entries_p202607; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_entries_p202607" (
    "id" integer DEFAULT "nextval"('"public"."ledger_entries_id_seq"'::"regclass") CONSTRAINT "ledger_entries_id_not_null1" NOT NULL,
    "user_id" integer,
    "house_account_id" integer,
    "type" character varying(64) CONSTRAINT "ledger_entries_type_not_null1" NOT NULL,
    "amount" numeric(14,2) CONSTRAINT "ledger_entries_amount_not_null1" NOT NULL,
    "balance_before" numeric(14,2) CONSTRAINT "ledger_entries_balance_before_not_null1" NOT NULL,
    "balance_after" numeric(14,2) CONSTRAINT "ledger_entries_balance_after_not_null1" NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "ledger_mutation_event_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "ledger_entries_created_at_not_null1" NOT NULL
);


--
-- Name: ledger_mutation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ledger_mutation_events" (
    "id" integer NOT NULL,
    "business_event_id" character varying(191) NOT NULL,
    "order_type" character varying(32) NOT NULL,
    "order_id" integer NOT NULL,
    "user_id" integer,
    "provider_id" integer,
    "mutation_type" character varying(64) NOT NULL,
    "source_type" character varying(32) NOT NULL,
    "source_event_key" character varying(191),
    "amount" numeric(14,2) NOT NULL,
    "currency" character varying(16),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ledger_mutation_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."ledger_mutation_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ledger_mutation_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."ledger_mutation_events_id_seq" OWNED BY "public"."ledger_mutation_events"."id";


--
-- Name: legal_document_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."legal_document_acceptances" (
    "id" integer NOT NULL,
    "document_id" integer NOT NULL,
    "publication_id" integer,
    "user_id" integer NOT NULL,
    "source" character varying(64) DEFAULT 'user'::character varying NOT NULL,
    "ip" character varying(64),
    "user_agent" character varying(255),
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: legal_document_acceptances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."legal_document_acceptances_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_document_acceptances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."legal_document_acceptances_id_seq" OWNED BY "public"."legal_document_acceptances"."id";


--
-- Name: legal_document_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."legal_document_publications" (
    "id" integer NOT NULL,
    "document_id" integer NOT NULL,
    "document_key" character varying(64) NOT NULL,
    "locale" character varying(16) NOT NULL,
    "release_mode" character varying(32) NOT NULL,
    "rollout_percent" integer DEFAULT 100 NOT NULL,
    "fallback_publication_id" integer,
    "rollback_from_publication_id" integer,
    "change_request_id" integer,
    "published_by_admin_id" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "activated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superseded_at" timestamp with time zone,
    "superseded_by_publication_id" integer
);


--
-- Name: legal_document_publications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."legal_document_publications_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_document_publications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."legal_document_publications_id_seq" OWNED BY "public"."legal_document_publications"."id";


--
-- Name: legal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."legal_documents" (
    "id" integer NOT NULL,
    "document_key" character varying(64) NOT NULL,
    "locale" character varying(16) DEFAULT 'zh-CN'::character varying NOT NULL,
    "title" character varying(160) NOT NULL,
    "version" integer NOT NULL,
    "html_content" "text" NOT NULL,
    "summary" "text",
    "change_notes" "text",
    "is_required" boolean DEFAULT true NOT NULL,
    "created_by_admin_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: legal_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."legal_documents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."legal_documents_id_seq" OWNED BY "public"."legal_documents"."id";


--
-- Name: missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."missions" (
    "id" character varying(128) NOT NULL,
    "type" character varying(64) NOT NULL,
    "params" "jsonb" NOT NULL,
    "reward" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notification_deliveries" (
    "id" integer NOT NULL,
    "kind" character varying(64) NOT NULL,
    "channel" character varying(16) NOT NULL,
    "recipient" character varying(255) NOT NULL,
    "recipient_key" character varying(255) NOT NULL,
    "provider" character varying(32) NOT NULL,
    "subject" character varying(255) NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "provider_message_id" character varying(255),
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" integer,
    "notification_record_id" integer,
    "body" "text"
);


--
-- Name: notification_deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."notification_deliveries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."notification_deliveries_id_seq" OWNED BY "public"."notification_deliveries"."id";


--
-- Name: notification_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notification_delivery_attempts" (
    "id" integer NOT NULL,
    "delivery_id" integer NOT NULL,
    "attempt_number" integer NOT NULL,
    "provider" character varying(32) NOT NULL,
    "status" character varying(16) NOT NULL,
    "response_code" integer,
    "provider_message_id" character varying(255),
    "latency_ms" integer,
    "error" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notification_delivery_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."notification_delivery_attempts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_delivery_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."notification_delivery_attempts_id_seq" OWNED BY "public"."notification_delivery_attempts"."id";


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notification_preferences" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "kind" character varying(64) NOT NULL,
    "channel" character varying(16) NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notification_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."notification_preferences_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."notification_preferences_id_seq" OWNED BY "public"."notification_preferences"."id";


--
-- Name: notification_push_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notification_push_devices" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "token" character varying(255) NOT NULL,
    "platform" character varying(16) NOT NULL,
    "device_fingerprint" character varying(255),
    "active" boolean DEFAULT true NOT NULL,
    "last_registered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_delivered_at" timestamp with time zone,
    "last_error" "text",
    "deactivated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notification_push_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."notification_push_devices_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_push_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."notification_push_devices_id_seq" OWNED BY "public"."notification_push_devices"."id";


--
-- Name: notification_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notification_records" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "kind" character varying(64) NOT NULL,
    "title" character varying(255) NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notification_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."notification_records_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."notification_records_id_seq" OWNED BY "public"."notification_records"."id";


--
-- Name: payment_outbound_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_outbound_requests" (
    "id" integer NOT NULL,
    "order_type" character varying(32) NOT NULL,
    "order_id" integer NOT NULL,
    "provider_id" integer NOT NULL,
    "action" character varying(64) NOT NULL,
    "idempotency_key" character varying(191) NOT NULL,
    "request_payload" "jsonb" NOT NULL,
    "request_payload_hash" character varying(64) NOT NULL,
    "send_status" character varying(32) DEFAULT 'prepared'::character varying NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "first_sent_at" timestamp with time zone,
    "last_sent_at" timestamp with time zone,
    "next_retry_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "response_http_status" integer,
    "provider_order_id" character varying(128),
    "response_payload" "jsonb",
    "last_error_code" character varying(64),
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_outbound_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payment_outbound_requests_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_outbound_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payment_outbound_requests_id_seq" OWNED BY "public"."payment_outbound_requests"."id";


--
-- Name: payment_provider_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_provider_events" (
    "id" integer NOT NULL,
    "order_type" character varying(32) NOT NULL,
    "order_id" integer NOT NULL,
    "user_id" integer,
    "provider_id" integer,
    "event_type" character varying(64) NOT NULL,
    "provider_status" character varying(32) NOT NULL,
    "external_reference" character varying(128),
    "processing_channel" character varying(64),
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_provider_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payment_provider_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_provider_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payment_provider_events_id_seq" OWNED BY "public"."payment_provider_events"."id";


--
-- Name: payment_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_providers" (
    "id" integer NOT NULL,
    "name" character varying(120) NOT NULL,
    "provider_type" character varying(64) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "is_circuit_broken" boolean DEFAULT false NOT NULL,
    "circuit_broken_at" timestamp with time zone,
    "circuit_break_reason" character varying(255),
    "channel_type" character varying(16),
    "asset_type" character varying(16),
    "asset_code" character varying(64),
    "network" character varying(64)
);


--
-- Name: payment_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payment_providers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payment_providers_id_seq" OWNED BY "public"."payment_providers"."id";


--
-- Name: payment_reconciliation_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_reconciliation_issues" (
    "id" integer NOT NULL,
    "run_id" integer,
    "provider_id" integer,
    "fingerprint" character varying(96) NOT NULL,
    "flow" character varying(32) NOT NULL,
    "order_type" character varying(32),
    "order_id" integer,
    "local_status" character varying(32),
    "remote_status" character varying(32),
    "ledger_status" character varying(64),
    "local_reference" character varying(128),
    "remote_reference" character varying(128),
    "issue_type" character varying(64) NOT NULL,
    "severity" character varying(16) DEFAULT 'error'::character varying NOT NULL,
    "requires_manual_review" boolean DEFAULT true NOT NULL,
    "auto_recheck_eligible" boolean DEFAULT false NOT NULL,
    "status" character varying(16) DEFAULT 'open'::character varying NOT NULL,
    "metadata" "jsonb",
    "first_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_reconciliation_issues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payment_reconciliation_issues_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_reconciliation_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payment_reconciliation_issues_id_seq" OWNED BY "public"."payment_reconciliation_issues"."id";


--
-- Name: payment_reconciliation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_reconciliation_runs" (
    "id" integer NOT NULL,
    "provider_id" integer,
    "trigger" character varying(32) NOT NULL,
    "status" character varying(32) DEFAULT 'running'::character varying NOT NULL,
    "adapter" character varying(64),
    "window_started_at" timestamp with time zone,
    "window_ended_at" timestamp with time zone,
    "summary" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_reconciliation_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payment_reconciliation_runs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_reconciliation_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payment_reconciliation_runs_id_seq" OWNED BY "public"."payment_reconciliation_runs"."id";


--
-- Name: payment_settlement_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_settlement_events" (
    "id" integer NOT NULL,
    "order_type" character varying(32) NOT NULL,
    "order_id" integer NOT NULL,
    "user_id" integer,
    "event_type" character varying(64) NOT NULL,
    "settlement_status" character varying(32) NOT NULL,
    "settlement_reference" character varying(128),
    "failure_reason" character varying(255),
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_settlement_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payment_settlement_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_settlement_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payment_settlement_events_id_seq" OWNED BY "public"."payment_settlement_events"."id";


--
-- Name: payment_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_webhook_events" (
    "id" integer NOT NULL,
    "provider" character varying(120) NOT NULL,
    "event_id" character varying(191) NOT NULL,
    "signature" "text",
    "signature_status" character varying(32) DEFAULT 'skipped'::character varying NOT NULL,
    "payload_raw" "text" NOT NULL,
    "payload_json" "jsonb",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "receive_count" integer DEFAULT 1 NOT NULL,
    "processing_status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "processing_attempts" integer DEFAULT 0 NOT NULL,
    "processing_result" "jsonb",
    "processing_error" "text",
    "processing_locked_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_event_id" character varying(191),
    "provider_trade_id" character varying(128),
    "provider_order_id" character varying(128),
    "event_type" character varying(64),
    "dedupe_key" character varying(191) NOT NULL,
    "payload_hash" character varying(64) NOT NULL,
    "order_type" character varying(32),
    "order_id" integer
);


--
-- Name: payment_webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payment_webhook_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_webhook_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payment_webhook_events_id_seq" OWNED BY "public"."payment_webhook_events"."id";


--
-- Name: payout_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payout_methods" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "method_type" character varying(32) DEFAULT 'bank_account'::character varying NOT NULL,
    "channel_type" character varying(16) DEFAULT 'fiat'::character varying NOT NULL,
    "asset_type" character varying(16) DEFAULT 'fiat'::character varying NOT NULL,
    "asset_code" character varying(64),
    "network" character varying(64),
    "display_name" character varying(160),
    "is_default" boolean DEFAULT false NOT NULL,
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payout_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."payout_methods_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payout_methods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."payout_methods_id_seq" OWNED BY "public"."payout_methods"."id";


--
-- Name: play_mode_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."play_mode_sessions" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "game_key" character varying(32) NOT NULL,
    "mode" character varying(32) DEFAULT 'standard'::character varying NOT NULL,
    "status" character varying(16) DEFAULT 'active'::character varying NOT NULL,
    "outcome" character varying(16),
    "reference_type" character varying(64),
    "reference_id" integer,
    "snapshot" "jsonb" NOT NULL,
    "metadata" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_session_id" integer,
    "execution_index" integer DEFAULT 0 NOT NULL
);


--
-- Name: play_mode_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."play_mode_sessions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: play_mode_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."play_mode_sessions_id_seq" OWNED BY "public"."play_mode_sessions"."id";


--
-- Name: prediction_market_appeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."prediction_market_appeals" (
    "id" integer NOT NULL,
    "market_id" integer NOT NULL,
    "oracle_binding_id" integer,
    "resolved_by_admin_id" integer,
    "appeal_key" character varying(191) NOT NULL,
    "provider" character varying(32),
    "reason" character varying(64) NOT NULL,
    "status" character varying(32) DEFAULT 'open'::character varying NOT NULL,
    "title" character varying(191) NOT NULL,
    "description" "text" NOT NULL,
    "metadata" "jsonb",
    "first_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: prediction_market_appeals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."prediction_market_appeals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prediction_market_appeals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."prediction_market_appeals_id_seq" OWNED BY "public"."prediction_market_appeals"."id";


--
-- Name: prediction_market_oracles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."prediction_market_oracles" (
    "id" integer NOT NULL,
    "market_id" integer NOT NULL,
    "provider" character varying(32) NOT NULL,
    "name" character varying(160),
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "config" "jsonb" NOT NULL,
    "metadata" "jsonb",
    "last_checked_at" timestamp with time zone,
    "last_reported_at" timestamp with time zone,
    "last_resolved_outcome_key" character varying(64),
    "last_payload_hash" character varying(191),
    "last_payload" "jsonb",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: prediction_market_oracles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."prediction_market_oracles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prediction_market_oracles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."prediction_market_oracles_id_seq" OWNED BY "public"."prediction_market_oracles"."id";


--
-- Name: prediction_markets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."prediction_markets" (
    "id" integer NOT NULL,
    "slug" character varying(64) NOT NULL,
    "round_key" character varying(64) NOT NULL,
    "title" character varying(160) NOT NULL,
    "description" "text",
    "mechanism" character varying(32) DEFAULT 'pari_mutuel'::character varying NOT NULL,
    "status" character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    "outcomes" "jsonb" NOT NULL,
    "total_pool_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "winning_outcome_key" character varying(64),
    "winning_pool_amount" numeric(14,2),
    "oracle_source" character varying(64),
    "oracle_external_ref" character varying(128),
    "oracle_reported_at" timestamp with time zone,
    "metadata" "jsonb",
    "opens_at" timestamp with time zone NOT NULL,
    "locks_at" timestamp with time zone NOT NULL,
    "resolves_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolution_rules" "text" NOT NULL,
    "source_of_truth" "text" NOT NULL,
    "category" character varying(32) NOT NULL,
    "tags" "jsonb" NOT NULL,
    "invalid_policy" character varying(32) NOT NULL,
    "vig_bps" integer DEFAULT 0 NOT NULL
);


--
-- Name: prediction_markets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."prediction_markets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prediction_markets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."prediction_markets_id_seq" OWNED BY "public"."prediction_markets"."id";


--
-- Name: prediction_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."prediction_positions" (
    "id" integer NOT NULL,
    "market_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "outcome_key" character varying(64) NOT NULL,
    "stake_amount" numeric(14,2) NOT NULL,
    "payout_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "status" character varying(32) DEFAULT 'open'::character varying NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settled_at" timestamp with time zone
);


--
-- Name: prediction_positions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."prediction_positions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prediction_positions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."prediction_positions_id_seq" OWNED BY "public"."prediction_positions"."id";


--
-- Name: prizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."prizes" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "weight" integer DEFAULT 1 NOT NULL,
    "pool_threshold" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "reward_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "user_pool_threshold" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "payout_budget" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "payout_spent" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "payout_period_days" integer DEFAULT 1 NOT NULL,
    "payout_period_started_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: prizes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."prizes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prizes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."prizes_id_seq" OWNED BY "public"."prizes"."id";


--
-- Name: quick_eight_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."quick_eight_rounds" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "selected_numbers" "jsonb" NOT NULL,
    "drawn_numbers" "jsonb" NOT NULL,
    "matched_numbers" "jsonb" NOT NULL,
    "hit_count" integer NOT NULL,
    "multiplier" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "stake_amount" numeric(14,2) NOT NULL,
    "payout_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "status" character varying(32) NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: quick_eight_rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."quick_eight_rounds_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quick_eight_rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."quick_eight_rounds_id_seq" OWNED BY "public"."quick_eight_rounds"."id";


--
-- Name: reconciliation_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reconciliation_alerts" (
    "id" integer NOT NULL,
    "run_id" integer,
    "user_id" integer,
    "fingerprint" character varying(96) NOT NULL,
    "alert_type" character varying(64) NOT NULL,
    "severity" character varying(16) DEFAULT 'error'::character varying NOT NULL,
    "status" character varying(32) DEFAULT 'open'::character varying NOT NULL,
    "expected_withdrawable_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "actual_withdrawable_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "expected_bonus_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "actual_bonus_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "expected_locked_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "actual_locked_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "expected_wagered_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "actual_wagered_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "expected_total" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "actual_total" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "metadata" "jsonb",
    "first_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: reconciliation_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."reconciliation_alerts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reconciliation_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."reconciliation_alerts_id_seq" OWNED BY "public"."reconciliation_alerts"."id";


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."referrals" (
    "id" integer NOT NULL,
    "referrer_id" integer NOT NULL,
    "referred_id" integer NOT NULL,
    "status" character varying(24) DEFAULT 'pending'::character varying NOT NULL,
    "reward_id" character varying(128) NOT NULL,
    "qualified_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "referrals_referrer_referred_check" CHECK (("referrer_id" <> "referred_id"))
);


--
-- Name: referrals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."referrals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: referrals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."referrals_id_seq" OWNED BY "public"."referrals"."id";


--
-- Name: risk_table_interaction_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."risk_table_interaction_events" (
    "id" integer NOT NULL,
    "table_id" character varying(128) NOT NULL,
    "participant_user_ids" "jsonb" NOT NULL,
    "pair_count" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: risk_table_interaction_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."risk_table_interaction_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: risk_table_interaction_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."risk_table_interaction_events_id_seq" OWNED BY "public"."risk_table_interaction_events"."id";


--
-- Name: risk_table_interaction_pairs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."risk_table_interaction_pairs" (
    "id" integer NOT NULL,
    "table_id" character varying(128) NOT NULL,
    "user_a_id" integer NOT NULL,
    "user_b_id" integer NOT NULL,
    "interaction_count" integer DEFAULT 0 NOT NULL,
    "shared_ip_count" integer DEFAULT 0 NOT NULL,
    "shared_device_count" integer DEFAULT 0 NOT NULL,
    "suspicion_score" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: risk_table_interaction_pairs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."risk_table_interaction_pairs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: risk_table_interaction_pairs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."risk_table_interaction_pairs_id_seq" OWNED BY "public"."risk_table_interaction_pairs"."id";


--
-- Name: round_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."round_events" (
    "id" integer CONSTRAINT "round_events_id_not_null1" NOT NULL,
    "round_type" character varying(32) CONSTRAINT "round_events_round_type_not_null1" NOT NULL,
    "round_entity_id" integer CONSTRAINT "round_events_round_entity_id_not_null1" NOT NULL,
    "user_id" integer,
    "table_id" integer,
    "seat_id" integer,
    "table_round_id" integer,
    "phase" character varying(64),
    "event_index" integer CONSTRAINT "round_events_event_index_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "round_events_event_type_not_null1" NOT NULL,
    "actor" character varying(16) CONSTRAINT "round_events_actor_not_null1" NOT NULL,
    "payload" "jsonb" CONSTRAINT "round_events_payload_not_null1" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "round_events_created_at_not_null1" NOT NULL
)
PARTITION BY RANGE ("created_at");


--
-- Name: round_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."round_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: round_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."round_events_id_seq" OWNED BY "public"."round_events"."id";


--
-- Name: round_events_default; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."round_events_default" (
    "id" integer DEFAULT "nextval"('"public"."round_events_id_seq"'::"regclass") CONSTRAINT "round_events_id_not_null1" NOT NULL,
    "round_type" character varying(32) CONSTRAINT "round_events_round_type_not_null1" NOT NULL,
    "round_entity_id" integer CONSTRAINT "round_events_round_entity_id_not_null1" NOT NULL,
    "user_id" integer,
    "table_id" integer,
    "seat_id" integer,
    "table_round_id" integer,
    "phase" character varying(64),
    "event_index" integer CONSTRAINT "round_events_event_index_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "round_events_event_type_not_null1" NOT NULL,
    "actor" character varying(16) CONSTRAINT "round_events_actor_not_null1" NOT NULL,
    "payload" "jsonb" CONSTRAINT "round_events_payload_not_null1" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "round_events_created_at_not_null1" NOT NULL
);


--
-- Name: round_events_p202603; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."round_events_p202603" (
    "id" integer DEFAULT "nextval"('"public"."round_events_id_seq"'::"regclass") CONSTRAINT "round_events_id_not_null1" NOT NULL,
    "round_type" character varying(32) CONSTRAINT "round_events_round_type_not_null1" NOT NULL,
    "round_entity_id" integer CONSTRAINT "round_events_round_entity_id_not_null1" NOT NULL,
    "user_id" integer,
    "table_id" integer,
    "seat_id" integer,
    "table_round_id" integer,
    "phase" character varying(64),
    "event_index" integer CONSTRAINT "round_events_event_index_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "round_events_event_type_not_null1" NOT NULL,
    "actor" character varying(16) CONSTRAINT "round_events_actor_not_null1" NOT NULL,
    "payload" "jsonb" CONSTRAINT "round_events_payload_not_null1" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "round_events_created_at_not_null1" NOT NULL
);


--
-- Name: round_events_p202604; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."round_events_p202604" (
    "id" integer DEFAULT "nextval"('"public"."round_events_id_seq"'::"regclass") CONSTRAINT "round_events_id_not_null1" NOT NULL,
    "round_type" character varying(32) CONSTRAINT "round_events_round_type_not_null1" NOT NULL,
    "round_entity_id" integer CONSTRAINT "round_events_round_entity_id_not_null1" NOT NULL,
    "user_id" integer,
    "table_id" integer,
    "seat_id" integer,
    "table_round_id" integer,
    "phase" character varying(64),
    "event_index" integer CONSTRAINT "round_events_event_index_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "round_events_event_type_not_null1" NOT NULL,
    "actor" character varying(16) CONSTRAINT "round_events_actor_not_null1" NOT NULL,
    "payload" "jsonb" CONSTRAINT "round_events_payload_not_null1" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "round_events_created_at_not_null1" NOT NULL
);


--
-- Name: round_events_p202605; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."round_events_p202605" (
    "id" integer DEFAULT "nextval"('"public"."round_events_id_seq"'::"regclass") CONSTRAINT "round_events_id_not_null1" NOT NULL,
    "round_type" character varying(32) CONSTRAINT "round_events_round_type_not_null1" NOT NULL,
    "round_entity_id" integer CONSTRAINT "round_events_round_entity_id_not_null1" NOT NULL,
    "user_id" integer,
    "table_id" integer,
    "seat_id" integer,
    "table_round_id" integer,
    "phase" character varying(64),
    "event_index" integer CONSTRAINT "round_events_event_index_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "round_events_event_type_not_null1" NOT NULL,
    "actor" character varying(16) CONSTRAINT "round_events_actor_not_null1" NOT NULL,
    "payload" "jsonb" CONSTRAINT "round_events_payload_not_null1" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "round_events_created_at_not_null1" NOT NULL
);


--
-- Name: round_events_p202606; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."round_events_p202606" (
    "id" integer DEFAULT "nextval"('"public"."round_events_id_seq"'::"regclass") CONSTRAINT "round_events_id_not_null1" NOT NULL,
    "round_type" character varying(32) CONSTRAINT "round_events_round_type_not_null1" NOT NULL,
    "round_entity_id" integer CONSTRAINT "round_events_round_entity_id_not_null1" NOT NULL,
    "user_id" integer,
    "table_id" integer,
    "seat_id" integer,
    "table_round_id" integer,
    "phase" character varying(64),
    "event_index" integer CONSTRAINT "round_events_event_index_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "round_events_event_type_not_null1" NOT NULL,
    "actor" character varying(16) CONSTRAINT "round_events_actor_not_null1" NOT NULL,
    "payload" "jsonb" CONSTRAINT "round_events_payload_not_null1" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "round_events_created_at_not_null1" NOT NULL
);


--
-- Name: round_events_p202607; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."round_events_p202607" (
    "id" integer DEFAULT "nextval"('"public"."round_events_id_seq"'::"regclass") CONSTRAINT "round_events_id_not_null1" NOT NULL,
    "round_type" character varying(32) CONSTRAINT "round_events_round_type_not_null1" NOT NULL,
    "round_entity_id" integer CONSTRAINT "round_events_round_entity_id_not_null1" NOT NULL,
    "user_id" integer,
    "table_id" integer,
    "seat_id" integer,
    "table_round_id" integer,
    "phase" character varying(64),
    "event_index" integer CONSTRAINT "round_events_event_index_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "round_events_event_type_not_null1" NOT NULL,
    "actor" character varying(16) CONSTRAINT "round_events_actor_not_null1" NOT NULL,
    "payload" "jsonb" CONSTRAINT "round_events_payload_not_null1" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "round_events_created_at_not_null1" NOT NULL
);


--
-- Name: rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."rounds" (
    "id" integer NOT NULL,
    "table_id" integer NOT NULL,
    "round_number" integer NOT NULL,
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "phase" character varying(64) NOT NULL,
    "metadata" "jsonb",
    "result" "jsonb",
    "phase_deadline_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rounds_round_number_positive_check" CHECK (("round_number" > 0))
);


--
-- Name: rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."rounds_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."rounds_id_seq" OWNED BY "public"."rounds"."id";


--
-- Name: saas_agent_group_correlations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_agent_group_correlations" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "agent_id" character varying(128) NOT NULL,
    "player_id" integer NOT NULL,
    "draw_record_id" integer NOT NULL,
    "group_id" character varying(128) NOT NULL,
    "window_seconds" integer NOT NULL,
    "group_draw_count_window" integer DEFAULT 0 NOT NULL,
    "group_distinct_player_count_window" integer DEFAULT 0 CONSTRAINT "saas_agent_group_correlatio_group_distinct_player_coun_not_null" NOT NULL,
    "group_reward_amount_window" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_agent_group_correlatio_group_reward_amount_window_not_null" NOT NULL,
    "group_expected_reward_amount_window" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_agent_group_correlatio_group_expected_reward_amou_not_null" NOT NULL,
    "group_positive_variance_window" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_agent_group_correlatio_group_positive_variance_wi_not_null" NOT NULL,
    "agent_draw_count_window" integer DEFAULT 0 NOT NULL,
    "agent_reward_amount_window" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_agent_group_correlatio_agent_reward_amount_window_not_null" NOT NULL,
    "agent_expected_reward_amount_window" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_agent_group_correlatio_agent_expected_reward_amou_not_null" NOT NULL,
    "agent_positive_variance_window" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_agent_group_correlatio_agent_positive_variance_wi_not_null" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_agent_group_correlations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_agent_group_correlations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_agent_group_correlations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_agent_group_correlations_id_seq" OWNED BY "public"."saas_agent_group_correlations"."id";


--
-- Name: saas_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_agents" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "external_id" character varying(128) NOT NULL,
    "group_id" character varying(128),
    "owner_metadata" "jsonb",
    "fingerprint" character varying(255),
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_agents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_agents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_agents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_agents_id_seq" OWNED BY "public"."saas_agents"."id";


--
-- Name: saas_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_api_keys" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "label" character varying(120) NOT NULL,
    "key_prefix" character varying(64) NOT NULL,
    "key_hash" character varying(128) NOT NULL,
    "scopes" "jsonb" NOT NULL,
    "created_by_admin_id" integer,
    "last_used_at" timestamp with time zone,
    "revoked_by_admin_id" integer,
    "revoke_reason" character varying(255),
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "rotated_from_api_key_id" integer,
    "rotated_to_api_key_id" integer
);


--
-- Name: saas_api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_api_keys_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_api_keys_id_seq" OWNED BY "public"."saas_api_keys"."id";


--
-- Name: saas_billing_account_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_billing_account_versions" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "billing_account_id" integer NOT NULL,
    "plan_code" character varying(32) DEFAULT 'starter'::character varying NOT NULL,
    "stripe_customer_id" character varying(128),
    "collection_method" character varying(32) DEFAULT 'send_invoice'::character varying NOT NULL,
    "auto_billing_enabled" boolean DEFAULT false NOT NULL,
    "portal_configuration_id" character varying(128),
    "base_monthly_fee" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "draw_fee" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying NOT NULL,
    "is_billable" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb",
    "effective_at" timestamp with time zone NOT NULL,
    "created_by_admin_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_billing_account_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_billing_account_versions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_billing_account_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_billing_account_versions_id_seq" OWNED BY "public"."saas_billing_account_versions"."id";


--
-- Name: saas_billing_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_billing_accounts" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "plan_code" character varying(32) DEFAULT 'starter'::character varying NOT NULL,
    "stripe_customer_id" character varying(128),
    "collection_method" character varying(32) DEFAULT 'send_invoice'::character varying NOT NULL,
    "auto_billing_enabled" boolean DEFAULT false NOT NULL,
    "portal_configuration_id" character varying(128),
    "base_monthly_fee" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "draw_fee" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying NOT NULL,
    "is_billable" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_billing_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_billing_accounts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_billing_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_billing_accounts_id_seq" OWNED BY "public"."saas_billing_accounts"."id";


--
-- Name: saas_billing_disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_billing_disputes" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "billing_run_id" integer NOT NULL,
    "billing_account_id" integer,
    "status" character varying(32) DEFAULT 'submitted'::character varying NOT NULL,
    "reason" character varying(32) NOT NULL,
    "summary" character varying(160) NOT NULL,
    "description" "text" NOT NULL,
    "requested_refund_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "approved_refund_amount" numeric(14,2),
    "currency" character varying(16) DEFAULT 'USD'::character varying NOT NULL,
    "resolution_type" character varying(32),
    "resolution_notes" "text",
    "stripe_credit_note_id" character varying(128),
    "stripe_credit_note_status" character varying(64),
    "stripe_credit_note_pdf" "text",
    "metadata" "jsonb",
    "created_by_admin_id" integer,
    "resolved_by_admin_id" integer,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_billing_disputes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_billing_disputes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_billing_disputes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_billing_disputes_id_seq" OWNED BY "public"."saas_billing_disputes"."id";


--
-- Name: saas_billing_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_billing_ledger_entries" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "billing_run_id" integer,
    "dispute_id" integer,
    "entry_type" character varying(64) NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "balance_before" numeric(14,2) NOT NULL,
    "balance_after" numeric(14,2) NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "metadata" "jsonb",
    "created_by_admin_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_billing_ledger_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_billing_ledger_entries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_billing_ledger_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_billing_ledger_entries_id_seq" OWNED BY "public"."saas_billing_ledger_entries"."id";


--
-- Name: saas_billing_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_billing_runs" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "billing_account_id" integer,
    "status" character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying NOT NULL,
    "base_fee_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "usage_fee_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "credit_applied_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "total_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "draw_count" integer DEFAULT 0 NOT NULL,
    "stripe_customer_id" character varying(128),
    "stripe_invoice_id" character varying(128),
    "stripe_invoice_status" character varying(64),
    "stripe_hosted_invoice_url" "text",
    "stripe_invoice_pdf" "text",
    "synced_at" timestamp with time zone,
    "finalized_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_by_admin_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "billing_account_version_id" integer,
    "external_sync_status" character varying(32) DEFAULT 'idle'::character varying NOT NULL,
    "external_sync_action" character varying(64),
    "external_sync_stage" character varying(64),
    "external_sync_error" "text",
    "external_sync_recovery_path" character varying(128),
    "external_sync_observed_invoice_status" character varying(64),
    "external_sync_event_type" character varying(128),
    "external_sync_revision" integer DEFAULT 0 NOT NULL,
    "external_sync_attempted_at" timestamp with time zone,
    "external_sync_completed_at" timestamp with time zone,
    CONSTRAINT "saas_billing_runs_external_sync_completed_order_check" CHECK ((("external_sync_completed_at" IS NULL) OR (("external_sync_attempted_at" IS NOT NULL) AND ("external_sync_completed_at" >= "external_sync_attempted_at")))),
    CONSTRAINT "saas_billing_runs_external_sync_state_check" CHECK ((((("external_sync_status")::"text" = 'idle'::"text") AND ("external_sync_action" IS NULL) AND ("external_sync_stage" IS NULL) AND ("external_sync_error" IS NULL) AND ("external_sync_recovery_path" IS NULL) AND ("external_sync_attempted_at" IS NULL) AND ("external_sync_completed_at" IS NULL)) OR ((("external_sync_status")::"text" = 'processing'::"text") AND ("external_sync_action" IS NOT NULL) AND ("external_sync_stage" IS NOT NULL) AND ("external_sync_error" IS NULL) AND ("external_sync_recovery_path" IS NULL) AND ("external_sync_attempted_at" IS NOT NULL) AND ("external_sync_completed_at" IS NULL)) OR ((("external_sync_status")::"text" = 'succeeded'::"text") AND ("external_sync_action" IS NOT NULL) AND ("external_sync_stage" IS NOT NULL) AND ("external_sync_error" IS NULL) AND ("external_sync_recovery_path" IS NULL) AND ("external_sync_attempted_at" IS NOT NULL) AND ("external_sync_completed_at" IS NOT NULL)) OR ((("external_sync_status")::"text" = 'failed'::"text") AND ("external_sync_action" IS NOT NULL) AND ("external_sync_stage" IS NOT NULL) AND ("external_sync_error" IS NOT NULL) AND ("external_sync_recovery_path" IS NOT NULL) AND ("external_sync_attempted_at" IS NOT NULL) AND ("external_sync_completed_at" IS NOT NULL))))
);


--
-- Name: saas_billing_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_billing_runs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_billing_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_billing_runs_id_seq" OWNED BY "public"."saas_billing_runs"."id";


--
-- Name: saas_billing_top_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_billing_top_ups" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "billing_account_id" integer,
    "amount" numeric(14,2) NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying NOT NULL,
    "note" character varying(255),
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "stripe_customer_id" character varying(128),
    "stripe_balance_transaction_id" character varying(128),
    "synced_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_by_admin_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_billing_top_ups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_billing_top_ups_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_billing_top_ups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_billing_top_ups_id_seq" OWNED BY "public"."saas_billing_top_ups"."id";


--
-- Name: saas_distribution_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_distribution_snapshots" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "window_key" character varying(16) NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "window_end" timestamp with time zone NOT NULL,
    "draw_count" integer DEFAULT 0 NOT NULL,
    "tracked_draw_count" integer DEFAULT 0 NOT NULL,
    "tracking_coverage_ratio" numeric(12,6) DEFAULT '0'::numeric NOT NULL,
    "actual_payout_sum" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "expected_payout_sum" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "payout_deviation_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "payout_deviation_ratio" numeric(12,6) DEFAULT '0'::numeric NOT NULL,
    "max_bucket_deviation_ratio" numeric(12,6) DEFAULT '0'::numeric NOT NULL,
    "actual_payout_histogram" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expected_payout_histogram" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actual_bucket_histogram" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expected_bucket_histogram" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "breach_reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_distribution_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_distribution_snapshots_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_distribution_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_distribution_snapshots_id_seq" OWNED BY "public"."saas_distribution_snapshots"."id";


--
-- Name: saas_draw_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_draw_records" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "player_id" integer NOT NULL,
    "prize_id" integer,
    "draw_cost" numeric(14,2) NOT NULL,
    "reward_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "status" character varying(32) NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_id" character varying(128) NOT NULL,
    "group_id" character varying(128),
    "expected_reward_amount" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "environment" character varying(16) NOT NULL
);


--
-- Name: saas_draw_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_draw_records_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_draw_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_draw_records_id_seq" OWNED BY "public"."saas_draw_records"."id";


--
-- Name: saas_fairness_seeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_fairness_seeds" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "epoch" integer NOT NULL,
    "epoch_seconds" integer NOT NULL,
    "commit_hash" character varying(128) NOT NULL,
    "seed" character varying(128) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revealed_at" timestamp with time zone,
    "environment" character varying(16) NOT NULL
);


--
-- Name: saas_fairness_seeds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_fairness_seeds_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_fairness_seeds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_fairness_seeds_id_seq" OWNED BY "public"."saas_fairness_seeds"."id";


--
-- Name: saas_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_ledger_entries" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "player_id" integer NOT NULL,
    "entry_type" character varying(64) NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "balance_before" numeric(14,2) NOT NULL,
    "balance_after" numeric(14,2) NOT NULL,
    "reference_type" character varying(64),
    "reference_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "environment" character varying(16) NOT NULL
);


--
-- Name: saas_ledger_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_ledger_entries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_ledger_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_ledger_entries_id_seq" OWNED BY "public"."saas_ledger_entries"."id";


--
-- Name: saas_outbound_webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_outbound_webhook_deliveries" (
    "id" integer NOT NULL,
    "webhook_id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "draw_record_id" integer,
    "event_type" character varying(64) NOT NULL,
    "event_id" character varying(191) NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_http_status" integer,
    "last_error" "text",
    "last_response_body" "text",
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_outbound_webhook_deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_outbound_webhook_deliveries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_outbound_webhook_deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_outbound_webhook_deliveries_id_seq" OWNED BY "public"."saas_outbound_webhook_deliveries"."id";


--
-- Name: saas_outbound_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_outbound_webhooks" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "url" "text" NOT NULL,
    "secret" character varying(255) NOT NULL,
    "events" "jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_outbound_webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_outbound_webhooks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_outbound_webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_outbound_webhooks_id_seq" OWNED BY "public"."saas_outbound_webhooks"."id";


--
-- Name: saas_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_players" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "external_player_id" character varying(128) NOT NULL,
    "display_name" character varying(160),
    "balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "pity_streak" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_players_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_players_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_players_id_seq" OWNED BY "public"."saas_players"."id";


--
-- Name: saas_project_prizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_project_prizes" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "name" character varying(160) NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "weight" integer DEFAULT 1 NOT NULL,
    "reward_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_project_prizes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_project_prizes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_project_prizes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_project_prizes_id_seq" OWNED BY "public"."saas_project_prizes"."id";


--
-- Name: saas_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_projects" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "slug" character varying(64) NOT NULL,
    "name" character varying(160) NOT NULL,
    "environment" character varying(16) DEFAULT 'sandbox'::character varying NOT NULL,
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying NOT NULL,
    "draw_cost" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "prize_pool_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "fairness_epoch_seconds" integer DEFAULT 3600 NOT NULL,
    "max_draw_count" integer DEFAULT 1 NOT NULL,
    "miss_weight" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "api_rate_limit_burst" integer DEFAULT 120 NOT NULL,
    "api_rate_limit_hourly" integer DEFAULT 3600 NOT NULL,
    "api_rate_limit_daily" integer DEFAULT 86400 NOT NULL,
    "strategy" character varying(32) DEFAULT 'weighted_gacha'::character varying NOT NULL,
    "strategy_params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: saas_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_projects_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_projects_id_seq" OWNED BY "public"."saas_projects"."id";


--
-- Name: saas_report_exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_report_exports" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "project_id" integer,
    "created_by_admin_id" integer,
    "resource" character varying(64) NOT NULL,
    "format" character varying(16) NOT NULL,
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "row_count" integer,
    "content_type" character varying(128),
    "file_name" character varying(255),
    "content" "text",
    "from_at" timestamp with time zone NOT NULL,
    "to_at" timestamp with time zone NOT NULL,
    "last_error" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "locked_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_report_exports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_report_exports_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_report_exports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_report_exports_id_seq" OWNED BY "public"."saas_report_exports"."id";


--
-- Name: saas_reward_envelopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_reward_envelopes" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "project_id" integer,
    "window" character varying(16) NOT NULL,
    "on_cap_hit_strategy" character varying(16) DEFAULT 'reject'::character varying NOT NULL,
    "budget_cap" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "expected_payout_per_call" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "variance_cap" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "current_consumed" numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    "current_call_count" integer DEFAULT 0 NOT NULL,
    "current_window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_reward_envelopes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_reward_envelopes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_reward_envelopes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_reward_envelopes_id_seq" OWNED BY "public"."saas_reward_envelopes"."id";


--
-- Name: saas_status_minutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_status_minutes" (
    "id" integer NOT NULL,
    "minute_start" timestamp with time zone NOT NULL,
    "total_request_count" integer DEFAULT 0 NOT NULL,
    "availability_eligible_request_count" integer DEFAULT 0 CONSTRAINT "saas_status_minutes_availability_eligible_request_coun_not_null" NOT NULL,
    "availability_error_count" integer DEFAULT 0 NOT NULL,
    "error_rate_pct" numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    "api_p95_ms" integer DEFAULT 0 NOT NULL,
    "worker_lag_ms" integer DEFAULT 0 NOT NULL,
    "stripe_webhook_ready_count" integer DEFAULT 0 NOT NULL,
    "stripe_webhook_lag_ms" integer DEFAULT 0 NOT NULL,
    "outbound_webhook_ready_count" integer DEFAULT 0 NOT NULL,
    "outbound_webhook_lag_ms" integer DEFAULT 0 NOT NULL,
    "api_status" character varying(16) DEFAULT 'operational'::character varying NOT NULL,
    "worker_status" character varying(16) DEFAULT 'operational'::character varying NOT NULL,
    "overall_status" character varying(16) DEFAULT 'operational'::character varying NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_status_minutes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_status_minutes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_status_minutes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_status_minutes_id_seq" OWNED BY "public"."saas_status_minutes"."id";


--
-- Name: saas_stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_stripe_webhook_events" (
    "id" integer NOT NULL,
    "tenant_id" integer,
    "billing_run_id" integer,
    "event_id" character varying(128) NOT NULL,
    "event_type" character varying(128) NOT NULL,
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "last_error" "text",
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_stripe_webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_stripe_webhook_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_stripe_webhook_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_stripe_webhook_events_id_seq" OWNED BY "public"."saas_stripe_webhook_events"."id";


--
-- Name: saas_tenant_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_tenant_invites" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" character varying(32) NOT NULL,
    "token_hash" character varying(128) NOT NULL,
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "created_by_admin_id" integer,
    "accepted_by_admin_id" integer,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_tenant_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_tenant_invites_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_tenant_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_tenant_invites_id_seq" OWNED BY "public"."saas_tenant_invites"."id";


--
-- Name: saas_tenant_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_tenant_links" (
    "id" integer NOT NULL,
    "parent_tenant_id" integer NOT NULL,
    "child_tenant_id" integer NOT NULL,
    "link_type" character varying(32) DEFAULT 'agent_client'::character varying NOT NULL,
    "created_by_admin_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_tenant_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_tenant_links_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_tenant_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_tenant_links_id_seq" OWNED BY "public"."saas_tenant_links"."id";


--
-- Name: saas_tenant_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_tenant_memberships" (
    "id" integer NOT NULL,
    "tenant_id" integer NOT NULL,
    "admin_id" integer NOT NULL,
    "role" character varying(32) NOT NULL,
    "created_by_admin_id" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: saas_tenant_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_tenant_memberships_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_tenant_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_tenant_memberships_id_seq" OWNED BY "public"."saas_tenant_memberships"."id";


--
-- Name: saas_tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_tenants" (
    "id" integer NOT NULL,
    "slug" character varying(64) NOT NULL,
    "name" character varying(160) NOT NULL,
    "billing_email" character varying(255),
    "status" character varying(32) DEFAULT 'active'::character varying NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "risk_envelope_daily_budget_cap" numeric(14,2),
    "risk_envelope_max_single_payout" numeric(14,2),
    "risk_envelope_variance_cap" numeric(14,2),
    "risk_envelope_emergency_stop" boolean DEFAULT false NOT NULL,
    "onboarded_at" timestamp with time zone
);


--
-- Name: saas_tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_tenants_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_tenants_id_seq" OWNED BY "public"."saas_tenants"."id";


--
-- Name: saas_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_usage_events" (
    "id" integer CONSTRAINT "saas_usage_events_id_not_null1" NOT NULL,
    "tenant_id" integer CONSTRAINT "saas_usage_events_tenant_id_not_null1" NOT NULL,
    "project_id" integer CONSTRAINT "saas_usage_events_project_id_not_null1" NOT NULL,
    "api_key_id" integer CONSTRAINT "saas_usage_events_api_key_id_not_null1" NOT NULL,
    "billing_run_id" integer,
    "player_id" integer,
    "environment" character varying(16) CONSTRAINT "saas_usage_events_environment_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "saas_usage_events_event_type_not_null1" NOT NULL,
    "decision_type" character varying(32),
    "reference_type" character varying(64),
    "reference_id" integer,
    "units" integer DEFAULT 1 CONSTRAINT "saas_usage_events_units_not_null1" NOT NULL,
    "amount" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_usage_events_amount_not_null1" NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying CONSTRAINT "saas_usage_events_currency_not_null1" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "saas_usage_events_created_at_not_null1" NOT NULL
)
PARTITION BY RANGE ("created_at");


--
-- Name: saas_usage_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."saas_usage_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saas_usage_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."saas_usage_events_id_seq" OWNED BY "public"."saas_usage_events"."id";


--
-- Name: saas_usage_events_default; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_usage_events_default" (
    "id" integer DEFAULT "nextval"('"public"."saas_usage_events_id_seq"'::"regclass") CONSTRAINT "saas_usage_events_id_not_null1" NOT NULL,
    "tenant_id" integer CONSTRAINT "saas_usage_events_tenant_id_not_null1" NOT NULL,
    "project_id" integer CONSTRAINT "saas_usage_events_project_id_not_null1" NOT NULL,
    "api_key_id" integer CONSTRAINT "saas_usage_events_api_key_id_not_null1" NOT NULL,
    "billing_run_id" integer,
    "player_id" integer,
    "environment" character varying(16) CONSTRAINT "saas_usage_events_environment_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "saas_usage_events_event_type_not_null1" NOT NULL,
    "decision_type" character varying(32),
    "reference_type" character varying(64),
    "reference_id" integer,
    "units" integer DEFAULT 1 CONSTRAINT "saas_usage_events_units_not_null1" NOT NULL,
    "amount" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_usage_events_amount_not_null1" NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying CONSTRAINT "saas_usage_events_currency_not_null1" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "saas_usage_events_created_at_not_null1" NOT NULL
);


--
-- Name: saas_usage_events_p202603; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_usage_events_p202603" (
    "id" integer DEFAULT "nextval"('"public"."saas_usage_events_id_seq"'::"regclass") CONSTRAINT "saas_usage_events_id_not_null1" NOT NULL,
    "tenant_id" integer CONSTRAINT "saas_usage_events_tenant_id_not_null1" NOT NULL,
    "project_id" integer CONSTRAINT "saas_usage_events_project_id_not_null1" NOT NULL,
    "api_key_id" integer CONSTRAINT "saas_usage_events_api_key_id_not_null1" NOT NULL,
    "billing_run_id" integer,
    "player_id" integer,
    "environment" character varying(16) CONSTRAINT "saas_usage_events_environment_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "saas_usage_events_event_type_not_null1" NOT NULL,
    "decision_type" character varying(32),
    "reference_type" character varying(64),
    "reference_id" integer,
    "units" integer DEFAULT 1 CONSTRAINT "saas_usage_events_units_not_null1" NOT NULL,
    "amount" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_usage_events_amount_not_null1" NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying CONSTRAINT "saas_usage_events_currency_not_null1" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "saas_usage_events_created_at_not_null1" NOT NULL
);


--
-- Name: saas_usage_events_p202604; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_usage_events_p202604" (
    "id" integer DEFAULT "nextval"('"public"."saas_usage_events_id_seq"'::"regclass") CONSTRAINT "saas_usage_events_id_not_null1" NOT NULL,
    "tenant_id" integer CONSTRAINT "saas_usage_events_tenant_id_not_null1" NOT NULL,
    "project_id" integer CONSTRAINT "saas_usage_events_project_id_not_null1" NOT NULL,
    "api_key_id" integer CONSTRAINT "saas_usage_events_api_key_id_not_null1" NOT NULL,
    "billing_run_id" integer,
    "player_id" integer,
    "environment" character varying(16) CONSTRAINT "saas_usage_events_environment_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "saas_usage_events_event_type_not_null1" NOT NULL,
    "decision_type" character varying(32),
    "reference_type" character varying(64),
    "reference_id" integer,
    "units" integer DEFAULT 1 CONSTRAINT "saas_usage_events_units_not_null1" NOT NULL,
    "amount" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_usage_events_amount_not_null1" NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying CONSTRAINT "saas_usage_events_currency_not_null1" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "saas_usage_events_created_at_not_null1" NOT NULL
);


--
-- Name: saas_usage_events_p202605; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_usage_events_p202605" (
    "id" integer DEFAULT "nextval"('"public"."saas_usage_events_id_seq"'::"regclass") CONSTRAINT "saas_usage_events_id_not_null1" NOT NULL,
    "tenant_id" integer CONSTRAINT "saas_usage_events_tenant_id_not_null1" NOT NULL,
    "project_id" integer CONSTRAINT "saas_usage_events_project_id_not_null1" NOT NULL,
    "api_key_id" integer CONSTRAINT "saas_usage_events_api_key_id_not_null1" NOT NULL,
    "billing_run_id" integer,
    "player_id" integer,
    "environment" character varying(16) CONSTRAINT "saas_usage_events_environment_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "saas_usage_events_event_type_not_null1" NOT NULL,
    "decision_type" character varying(32),
    "reference_type" character varying(64),
    "reference_id" integer,
    "units" integer DEFAULT 1 CONSTRAINT "saas_usage_events_units_not_null1" NOT NULL,
    "amount" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_usage_events_amount_not_null1" NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying CONSTRAINT "saas_usage_events_currency_not_null1" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "saas_usage_events_created_at_not_null1" NOT NULL
);


--
-- Name: saas_usage_events_p202606; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_usage_events_p202606" (
    "id" integer DEFAULT "nextval"('"public"."saas_usage_events_id_seq"'::"regclass") CONSTRAINT "saas_usage_events_id_not_null1" NOT NULL,
    "tenant_id" integer CONSTRAINT "saas_usage_events_tenant_id_not_null1" NOT NULL,
    "project_id" integer CONSTRAINT "saas_usage_events_project_id_not_null1" NOT NULL,
    "api_key_id" integer CONSTRAINT "saas_usage_events_api_key_id_not_null1" NOT NULL,
    "billing_run_id" integer,
    "player_id" integer,
    "environment" character varying(16) CONSTRAINT "saas_usage_events_environment_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "saas_usage_events_event_type_not_null1" NOT NULL,
    "decision_type" character varying(32),
    "reference_type" character varying(64),
    "reference_id" integer,
    "units" integer DEFAULT 1 CONSTRAINT "saas_usage_events_units_not_null1" NOT NULL,
    "amount" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_usage_events_amount_not_null1" NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying CONSTRAINT "saas_usage_events_currency_not_null1" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "saas_usage_events_created_at_not_null1" NOT NULL
);


--
-- Name: saas_usage_events_p202607; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."saas_usage_events_p202607" (
    "id" integer DEFAULT "nextval"('"public"."saas_usage_events_id_seq"'::"regclass") CONSTRAINT "saas_usage_events_id_not_null1" NOT NULL,
    "tenant_id" integer CONSTRAINT "saas_usage_events_tenant_id_not_null1" NOT NULL,
    "project_id" integer CONSTRAINT "saas_usage_events_project_id_not_null1" NOT NULL,
    "api_key_id" integer CONSTRAINT "saas_usage_events_api_key_id_not_null1" NOT NULL,
    "billing_run_id" integer,
    "player_id" integer,
    "environment" character varying(16) CONSTRAINT "saas_usage_events_environment_not_null1" NOT NULL,
    "event_type" character varying(64) CONSTRAINT "saas_usage_events_event_type_not_null1" NOT NULL,
    "decision_type" character varying(32),
    "reference_type" character varying(64),
    "reference_id" integer,
    "units" integer DEFAULT 1 CONSTRAINT "saas_usage_events_units_not_null1" NOT NULL,
    "amount" numeric(14,4) DEFAULT '0'::numeric CONSTRAINT "saas_usage_events_amount_not_null1" NOT NULL,
    "currency" character varying(16) DEFAULT 'USD'::character varying CONSTRAINT "saas_usage_events_currency_not_null1" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() CONSTRAINT "saas_usage_events_created_at_not_null1" NOT NULL
);


--
-- Name: seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."seats" (
    "id" integer NOT NULL,
    "table_id" integer NOT NULL,
    "seat_number" integer NOT NULL,
    "user_id" integer,
    "status" character varying(32) DEFAULT 'empty'::character varying NOT NULL,
    "buy_in_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "stack_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "metadata" "jsonb",
    "joined_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seats_buy_in_amount_non_negative_check" CHECK (("buy_in_amount" >= (0)::numeric)),
    CONSTRAINT "seats_stack_amount_non_negative_check" CHECK (("stack_amount" >= (0)::numeric))
);


--
-- Name: seats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."seats_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."seats_id_seq" OWNED BY "public"."seats"."id";


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."security_events" (
    "id" integer NOT NULL,
    "category" character varying(64) NOT NULL,
    "event_type" character varying(96) NOT NULL,
    "severity" character varying(16) DEFAULT 'info'::character varying NOT NULL,
    "source_table" character varying(64),
    "source_record_id" integer,
    "user_id" integer,
    "admin_id" integer,
    "email" character varying(255),
    "ip" character varying(64),
    "user_agent" character varying(255),
    "session_id" character varying(255),
    "fingerprint" character varying(160),
    "metadata" "jsonb",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: security_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."security_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."security_events_id_seq" OWNED BY "public"."security_events"."id";


--
-- Name: store_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."store_purchase_orders" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "recipient_user_id" integer,
    "iap_product_id" integer NOT NULL,
    "store_channel" character varying(16) NOT NULL,
    "status" character varying(32) DEFAULT 'created'::character varying NOT NULL,
    "idempotency_key" character varying(191) NOT NULL,
    "external_order_id" character varying(191),
    "source_app" character varying(64),
    "device_fingerprint" character varying(255),
    "request_id" character varying(191),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: store_purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."store_purchase_orders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."store_purchase_orders_id_seq" OWNED BY "public"."store_purchase_orders"."id";


--
-- Name: store_purchase_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."store_purchase_receipts" (
    "id" integer NOT NULL,
    "order_id" integer NOT NULL,
    "store_channel" character varying(16) NOT NULL,
    "external_transaction_id" character varying(191),
    "purchase_token" character varying(255),
    "raw_payload" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: store_purchase_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."store_purchase_receipts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_purchase_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."store_purchase_receipts_id_seq" OWNED BY "public"."store_purchase_receipts"."id";


--
-- Name: suspicious_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."suspicious_accounts" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "reason" "text",
    "status" character varying(32) DEFAULT 'open'::character varying NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone
);


--
-- Name: suspicious_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."suspicious_accounts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suspicious_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."suspicious_accounts_id_seq" OWNED BY "public"."suspicious_accounts"."id";


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."system_config" (
    "id" integer NOT NULL,
    "config_key" character varying(128) NOT NULL,
    "config_value" "jsonb",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "config_number" numeric(14,2)
);


--
-- Name: system_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."system_config_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."system_config_id_seq" OWNED BY "public"."system_config"."id";


--
-- Name: table_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."table_events" (
    "id" integer NOT NULL,
    "table_type" character varying(32) NOT NULL,
    "table_id" integer NOT NULL,
    "seat_index" integer,
    "user_id" integer,
    "hand_history_id" integer,
    "phase" character varying(64),
    "event_index" integer NOT NULL,
    "event_type" character varying(64) NOT NULL,
    "actor" character varying(16) NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: table_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."table_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: table_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."table_events_id_seq" OWNED BY "public"."table_events"."id";


--
-- Name: tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tables" (
    "id" integer NOT NULL,
    "definition_key" character varying(64) NOT NULL,
    "game_type" character varying(64) NOT NULL,
    "settlement_model" character varying(32) NOT NULL,
    "status" character varying(32) DEFAULT 'open'::character varying NOT NULL,
    "min_seats" integer NOT NULL,
    "max_seats" integer NOT NULL,
    "time_bank_ms" integer DEFAULT 0 NOT NULL,
    "current_phase" character varying(64),
    "phase_order" "jsonb" NOT NULL,
    "metadata" "jsonb",
    "started_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tables_min_max_seats_check" CHECK (("min_seats" <= "max_seats")),
    CONSTRAINT "tables_time_bank_non_negative_check" CHECK (("time_bank_ms" >= 0))
);


--
-- Name: tables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."tables_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."tables_id_seq" OWNED BY "public"."tables"."id";


--
-- Name: user_asset_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_asset_balances" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "asset_code" character varying(32) NOT NULL,
    "available_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "locked_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "lifetime_earned" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "lifetime_spent" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_asset_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."user_asset_balances_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_asset_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."user_asset_balances_id_seq" OWNED BY "public"."user_asset_balances"."id";


--
-- Name: user_mfa_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_mfa_secrets" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "secret_ciphertext" "text" NOT NULL,
    "enabled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_mfa_secrets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."user_mfa_secrets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_mfa_secrets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."user_mfa_secrets_id_seq" OWNED BY "public"."user_mfa_secrets"."id";


--
-- Name: user_play_modes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_play_modes" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "game_key" character varying(32) NOT NULL,
    "mode" character varying(32) DEFAULT 'standard'::character varying NOT NULL,
    "state" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_play_modes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."user_play_modes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_play_modes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."user_play_modes_id_seq" OWNED BY "public"."user_play_modes"."id";


--
-- Name: user_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_wallets" (
    "user_id" integer NOT NULL,
    "withdrawable_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "bonus_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "locked_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "wagered_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."users" (
    "id" integer NOT NULL,
    "email" character varying(255) NOT NULL,
    "password_hash" character varying(255) NOT NULL,
    "role" character varying(20) DEFAULT 'user'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_pool_balance" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "pity_streak" integer DEFAULT 0 NOT NULL,
    "last_draw_at" timestamp with time zone,
    "last_win_at" timestamp with time zone,
    "phone" character varying(32),
    "phone_verified_at" timestamp with time zone,
    "email_verified_at" timestamp with time zone,
    "birth_date" "date",
    "registration_country_code" character varying(2),
    "country_tier" character varying(16) DEFAULT 'unknown'::character varying NOT NULL,
    "country_resolved_at" timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."users_id_seq" OWNED BY "public"."users"."id";


--
-- Name: wallet_reconciliation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."wallet_reconciliation_runs" (
    "id" integer NOT NULL,
    "trigger" character varying(32) NOT NULL,
    "status" character varying(32) DEFAULT 'running'::character varying NOT NULL,
    "scanned_users" integer DEFAULT 0 NOT NULL,
    "mismatched_users" integer DEFAULT 0 NOT NULL,
    "summary" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: wallet_reconciliation_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."wallet_reconciliation_runs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_reconciliation_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."wallet_reconciliation_runs_id_seq" OWNED BY "public"."wallet_reconciliation_runs"."id";


--
-- Name: withdrawal_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."withdrawal_limits" (
    "id" integer NOT NULL,
    "scope" character varying(16) DEFAULT 'global'::character varying NOT NULL,
    "user_id" integer,
    "max_withdraw_per_day" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "min_withdraw_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "max_withdraw_amount" numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: withdrawal_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."withdrawal_limits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawal_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."withdrawal_limits_id_seq" OWNED BY "public"."withdrawal_limits"."id";


--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."withdrawals" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "status" character varying(32) DEFAULT 'requested'::character varying NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_id" integer,
    "payout_method_id" integer,
    "channel_type" character varying(16) DEFAULT 'fiat'::character varying NOT NULL,
    "asset_type" character varying(16) DEFAULT 'fiat'::character varying NOT NULL,
    "asset_code" character varying(64),
    "network" character varying(64),
    "provider_order_id" character varying(128),
    "submitted_tx_hash" character varying(128)
);


--
-- Name: withdrawals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."withdrawals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withdrawals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."withdrawals_id_seq" OWNED BY "public"."withdrawals"."id";


--
-- Name: admin_actions_default; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ATTACH PARTITION "public"."admin_actions_default" DEFAULT;


--
-- Name: admin_actions_p202603; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ATTACH PARTITION "public"."admin_actions_p202603" FOR VALUES FROM ('2026-03-01 11:00:00+11') TO ('2026-04-01 11:00:00+11');


--
-- Name: admin_actions_p202604; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ATTACH PARTITION "public"."admin_actions_p202604" FOR VALUES FROM ('2026-04-01 11:00:00+11') TO ('2026-05-01 10:00:00+10');


--
-- Name: admin_actions_p202605; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ATTACH PARTITION "public"."admin_actions_p202605" FOR VALUES FROM ('2026-05-01 10:00:00+10') TO ('2026-06-01 10:00:00+10');


--
-- Name: admin_actions_p202606; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ATTACH PARTITION "public"."admin_actions_p202606" FOR VALUES FROM ('2026-06-01 10:00:00+10') TO ('2026-07-01 10:00:00+10');


--
-- Name: admin_actions_p202607; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ATTACH PARTITION "public"."admin_actions_p202607" FOR VALUES FROM ('2026-07-01 10:00:00+10') TO ('2026-08-01 10:00:00+10');


--
-- Name: ledger_entries_default; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_entries" ATTACH PARTITION "public"."ledger_entries_default" DEFAULT;


--
-- Name: ledger_entries_p202603; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_entries" ATTACH PARTITION "public"."ledger_entries_p202603" FOR VALUES FROM ('2026-03-01 11:00:00+11') TO ('2026-04-01 11:00:00+11');


--
-- Name: ledger_entries_p202604; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_entries" ATTACH PARTITION "public"."ledger_entries_p202604" FOR VALUES FROM ('2026-04-01 11:00:00+11') TO ('2026-05-01 10:00:00+10');


--
-- Name: ledger_entries_p202605; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_entries" ATTACH PARTITION "public"."ledger_entries_p202605" FOR VALUES FROM ('2026-05-01 10:00:00+10') TO ('2026-06-01 10:00:00+10');


--
-- Name: ledger_entries_p202606; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_entries" ATTACH PARTITION "public"."ledger_entries_p202606" FOR VALUES FROM ('2026-06-01 10:00:00+10') TO ('2026-07-01 10:00:00+10');


--
-- Name: ledger_entries_p202607; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_entries" ATTACH PARTITION "public"."ledger_entries_p202607" FOR VALUES FROM ('2026-07-01 10:00:00+10') TO ('2026-08-01 10:00:00+10');


--
-- Name: round_events_default; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."round_events" ATTACH PARTITION "public"."round_events_default" DEFAULT;


--
-- Name: round_events_p202603; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."round_events" ATTACH PARTITION "public"."round_events_p202603" FOR VALUES FROM ('2026-03-01 11:00:00+11') TO ('2026-04-01 11:00:00+11');


--
-- Name: round_events_p202604; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."round_events" ATTACH PARTITION "public"."round_events_p202604" FOR VALUES FROM ('2026-04-01 11:00:00+11') TO ('2026-05-01 10:00:00+10');


--
-- Name: round_events_p202605; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."round_events" ATTACH PARTITION "public"."round_events_p202605" FOR VALUES FROM ('2026-05-01 10:00:00+10') TO ('2026-06-01 10:00:00+10');


--
-- Name: round_events_p202606; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."round_events" ATTACH PARTITION "public"."round_events_p202606" FOR VALUES FROM ('2026-06-01 10:00:00+10') TO ('2026-07-01 10:00:00+10');


--
-- Name: round_events_p202607; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."round_events" ATTACH PARTITION "public"."round_events_p202607" FOR VALUES FROM ('2026-07-01 10:00:00+10') TO ('2026-08-01 10:00:00+10');


--
-- Name: saas_usage_events_default; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_usage_events" ATTACH PARTITION "public"."saas_usage_events_default" DEFAULT;


--
-- Name: saas_usage_events_p202603; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_usage_events" ATTACH PARTITION "public"."saas_usage_events_p202603" FOR VALUES FROM ('2026-03-01 11:00:00+11') TO ('2026-04-01 11:00:00+11');


--
-- Name: saas_usage_events_p202604; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_usage_events" ATTACH PARTITION "public"."saas_usage_events_p202604" FOR VALUES FROM ('2026-04-01 11:00:00+11') TO ('2026-05-01 10:00:00+10');


--
-- Name: saas_usage_events_p202605; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_usage_events" ATTACH PARTITION "public"."saas_usage_events_p202605" FOR VALUES FROM ('2026-05-01 10:00:00+10') TO ('2026-06-01 10:00:00+10');


--
-- Name: saas_usage_events_p202606; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_usage_events" ATTACH PARTITION "public"."saas_usage_events_p202606" FOR VALUES FROM ('2026-06-01 10:00:00+10') TO ('2026-07-01 10:00:00+10');


--
-- Name: saas_usage_events_p202607; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_usage_events" ATTACH PARTITION "public"."saas_usage_events_p202607" FOR VALUES FROM ('2026-07-01 10:00:00+10') TO ('2026-08-01 10:00:00+10');


--
-- Name: admin_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_actions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_actions_id_seq"'::"regclass");


--
-- Name: admin_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_permissions_id_seq"'::"regclass");


--
-- Name: admins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admins" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admins_id_seq"'::"regclass");


--
-- Name: agent_blocklist id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_blocklist" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_blocklist_id_seq"'::"regclass");


--
-- Name: agent_risk_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_risk_state" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_risk_state_id_seq"'::"regclass");


--
-- Name: aml_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aml_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aml_checks_id_seq"'::"regclass");


--
-- Name: audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_events_id_seq"'::"regclass");


--
-- Name: auth_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_events_id_seq"'::"regclass");


--
-- Name: auth_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_sessions_id_seq"'::"regclass");


--
-- Name: auth_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_tokens" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_tokens_id_seq"'::"regclass");


--
-- Name: blackjack_games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."blackjack_games" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."blackjack_games_id_seq"'::"regclass");


--
-- Name: community_moderation_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_moderation_actions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."community_moderation_actions_id_seq"'::"regclass");


--
-- Name: community_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_posts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."community_posts_id_seq"'::"regclass");


--
-- Name: community_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."community_reports_id_seq"'::"regclass");


--
-- Name: community_threads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_threads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."community_threads_id_seq"'::"regclass");


--
-- Name: config_change_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."config_change_requests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."config_change_requests_id_seq"'::"regclass");


--
-- Name: crypto_chain_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_chain_transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."crypto_chain_transactions_id_seq"'::"regclass");


--
-- Name: crypto_deposit_channels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_deposit_channels" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."crypto_deposit_channels_id_seq"'::"regclass");


--
-- Name: crypto_review_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_review_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."crypto_review_events_id_seq"'::"regclass");


--
-- Name: data_deletion_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_deletion_requests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."data_deletion_requests_id_seq"'::"regclass");


--
-- Name: data_rights_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_rights_audits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."data_rights_audits_id_seq"'::"regclass");


--
-- Name: deferred_payouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deferred_payouts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deferred_payouts_id_seq"'::"regclass");


--
-- Name: deposits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deposits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deposits_id_seq"'::"regclass");


--
-- Name: device_fingerprints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_fingerprints" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."device_fingerprints_id_seq"'::"regclass");


--
-- Name: draw_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draw_records" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."draw_records_id_seq"'::"regclass");


--
-- Name: economy_ledger_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."economy_ledger_entries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."economy_ledger_entries_id_seq"'::"regclass");


--
-- Name: experiment_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."experiment_assignments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."experiment_assignments_id_seq"'::"regclass");


--
-- Name: experiments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."experiments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."experiments_id_seq"'::"regclass");


--
-- Name: fairness_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fairness_audits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fairness_audits_id_seq"'::"regclass");


--
-- Name: fairness_seeds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fairness_seeds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fairness_seeds_id_seq"'::"regclass");


--
-- Name: fiat_deposit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_deposit_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fiat_deposit_events_id_seq"'::"regclass");


--
-- Name: fiat_withdraw_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_withdraw_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fiat_withdraw_events_id_seq"'::"regclass");


--
-- Name: finance_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."finance_reviews" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."finance_reviews_id_seq"'::"regclass");


--
-- Name: freeze_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."freeze_records" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."freeze_records_id_seq"'::"regclass");


--
-- Name: gift_pack_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_pack_catalog" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."gift_pack_catalog_id_seq"'::"regclass");


--
-- Name: gift_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_transfers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."gift_transfers_id_seq"'::"regclass");


--
-- Name: hand_histories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hand_histories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."hand_histories_id_seq"'::"regclass");


--
-- Name: holdem_table_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."holdem_table_messages_id_seq"'::"regclass");


--
-- Name: holdem_table_seats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_seats" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."holdem_table_seats_id_seq"'::"regclass");


--
-- Name: holdem_tables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_tables" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."holdem_tables_id_seq"'::"regclass");


--
-- Name: house_account id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."house_account" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."house_account_id_seq"'::"regclass");


--
-- Name: house_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."house_transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."house_transactions_id_seq"'::"regclass");


--
-- Name: iap_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."iap_products" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."iap_products_id_seq"'::"regclass");


--
-- Name: jurisdiction_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jurisdiction_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."jurisdiction_rules_id_seq"'::"regclass");


--
-- Name: kyc_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."kyc_documents_id_seq"'::"regclass");


--
-- Name: kyc_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_profiles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."kyc_profiles_id_seq"'::"regclass");


--
-- Name: kyc_review_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_review_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."kyc_review_events_id_seq"'::"regclass");


--
-- Name: ledger_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_entries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ledger_entries_id_seq"'::"regclass");


--
-- Name: ledger_mutation_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_mutation_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ledger_mutation_events_id_seq"'::"regclass");


--
-- Name: legal_document_acceptances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_acceptances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."legal_document_acceptances_id_seq"'::"regclass");


--
-- Name: legal_document_publications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_publications" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."legal_document_publications_id_seq"'::"regclass");


--
-- Name: legal_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."legal_documents_id_seq"'::"regclass");


--
-- Name: notification_deliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_deliveries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notification_deliveries_id_seq"'::"regclass");


--
-- Name: notification_delivery_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_delivery_attempts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notification_delivery_attempts_id_seq"'::"regclass");


--
-- Name: notification_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_preferences" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notification_preferences_id_seq"'::"regclass");


--
-- Name: notification_push_devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_push_devices" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notification_push_devices_id_seq"'::"regclass");


--
-- Name: notification_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_records" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notification_records_id_seq"'::"regclass");


--
-- Name: payment_outbound_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_outbound_requests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_outbound_requests_id_seq"'::"regclass");


--
-- Name: payment_provider_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_provider_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_provider_events_id_seq"'::"regclass");


--
-- Name: payment_providers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_providers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_providers_id_seq"'::"regclass");


--
-- Name: payment_reconciliation_issues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reconciliation_issues" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_reconciliation_issues_id_seq"'::"regclass");


--
-- Name: payment_reconciliation_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reconciliation_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_reconciliation_runs_id_seq"'::"regclass");


--
-- Name: payment_settlement_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_settlement_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_settlement_events_id_seq"'::"regclass");


--
-- Name: payment_webhook_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_webhook_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payment_webhook_events_id_seq"'::"regclass");


--
-- Name: payout_methods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payout_methods" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payout_methods_id_seq"'::"regclass");


--
-- Name: play_mode_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."play_mode_sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."play_mode_sessions_id_seq"'::"regclass");


--
-- Name: prediction_market_appeals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_appeals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prediction_market_appeals_id_seq"'::"regclass");


--
-- Name: prediction_market_oracles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_oracles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prediction_market_oracles_id_seq"'::"regclass");


--
-- Name: prediction_markets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_markets" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prediction_markets_id_seq"'::"regclass");


--
-- Name: prediction_positions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_positions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prediction_positions_id_seq"'::"regclass");


--
-- Name: prizes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prizes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prizes_id_seq"'::"regclass");


--
-- Name: quick_eight_rounds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."quick_eight_rounds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."quick_eight_rounds_id_seq"'::"regclass");


--
-- Name: reconciliation_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reconciliation_alerts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reconciliation_alerts_id_seq"'::"regclass");


--
-- Name: referrals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."referrals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."referrals_id_seq"'::"regclass");


--
-- Name: risk_table_interaction_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."risk_table_interaction_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."risk_table_interaction_events_id_seq"'::"regclass");


--
-- Name: risk_table_interaction_pairs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."risk_table_interaction_pairs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."risk_table_interaction_pairs_id_seq"'::"regclass");


--
-- Name: round_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."round_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."round_events_id_seq"'::"regclass");


--
-- Name: rounds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rounds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rounds_id_seq"'::"regclass");


--
-- Name: saas_agent_group_correlations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agent_group_correlations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_agent_group_correlations_id_seq"'::"regclass");


--
-- Name: saas_agents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_agents_id_seq"'::"regclass");


--
-- Name: saas_api_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_api_keys" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_api_keys_id_seq"'::"regclass");


--
-- Name: saas_billing_account_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_account_versions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_billing_account_versions_id_seq"'::"regclass");


--
-- Name: saas_billing_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_accounts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_billing_accounts_id_seq"'::"regclass");


--
-- Name: saas_billing_disputes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_disputes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_billing_disputes_id_seq"'::"regclass");


--
-- Name: saas_billing_ledger_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_ledger_entries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_billing_ledger_entries_id_seq"'::"regclass");


--
-- Name: saas_billing_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_billing_runs_id_seq"'::"regclass");


--
-- Name: saas_billing_top_ups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_top_ups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_billing_top_ups_id_seq"'::"regclass");


--
-- Name: saas_distribution_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_distribution_snapshots" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_distribution_snapshots_id_seq"'::"regclass");


--
-- Name: saas_draw_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_draw_records" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_draw_records_id_seq"'::"regclass");


--
-- Name: saas_fairness_seeds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_fairness_seeds" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_fairness_seeds_id_seq"'::"regclass");


--
-- Name: saas_ledger_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_ledger_entries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_ledger_entries_id_seq"'::"regclass");


--
-- Name: saas_outbound_webhook_deliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhook_deliveries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_outbound_webhook_deliveries_id_seq"'::"regclass");


--
-- Name: saas_outbound_webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhooks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_outbound_webhooks_id_seq"'::"regclass");


--
-- Name: saas_players id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_players" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_players_id_seq"'::"regclass");


--
-- Name: saas_project_prizes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_project_prizes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_project_prizes_id_seq"'::"regclass");


--
-- Name: saas_projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_projects" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_projects_id_seq"'::"regclass");


--
-- Name: saas_report_exports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_report_exports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_report_exports_id_seq"'::"regclass");


--
-- Name: saas_reward_envelopes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_reward_envelopes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_reward_envelopes_id_seq"'::"regclass");


--
-- Name: saas_status_minutes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_status_minutes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_status_minutes_id_seq"'::"regclass");


--
-- Name: saas_stripe_webhook_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_stripe_webhook_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_stripe_webhook_events_id_seq"'::"regclass");


--
-- Name: saas_tenant_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_invites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_tenant_invites_id_seq"'::"regclass");


--
-- Name: saas_tenant_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_links" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_tenant_links_id_seq"'::"regclass");


--
-- Name: saas_tenant_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_memberships" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_tenant_memberships_id_seq"'::"regclass");


--
-- Name: saas_tenants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenants" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_tenants_id_seq"'::"regclass");


--
-- Name: saas_usage_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_usage_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."saas_usage_events_id_seq"'::"regclass");


--
-- Name: seats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seats" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."seats_id_seq"'::"regclass");


--
-- Name: security_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."security_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."security_events_id_seq"'::"regclass");


--
-- Name: store_purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_orders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."store_purchase_orders_id_seq"'::"regclass");


--
-- Name: store_purchase_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_receipts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."store_purchase_receipts_id_seq"'::"regclass");


--
-- Name: suspicious_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."suspicious_accounts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."suspicious_accounts_id_seq"'::"regclass");


--
-- Name: system_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."system_config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."system_config_id_seq"'::"regclass");


--
-- Name: table_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."table_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."table_events_id_seq"'::"regclass");


--
-- Name: tables id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tables" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tables_id_seq"'::"regclass");


--
-- Name: user_asset_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_asset_balances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_asset_balances_id_seq"'::"regclass");


--
-- Name: user_mfa_secrets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_mfa_secrets" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_mfa_secrets_id_seq"'::"regclass");


--
-- Name: user_play_modes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_play_modes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_play_modes_id_seq"'::"regclass");


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."users_id_seq"'::"regclass");


--
-- Name: wallet_reconciliation_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallet_reconciliation_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."wallet_reconciliation_runs_id_seq"'::"regclass");


--
-- Name: withdrawal_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_limits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."withdrawal_limits_id_seq"'::"regclass");


--
-- Name: withdrawals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."withdrawals_id_seq"'::"regclass");


--
-- Data for Name: admin_actions_default; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_actions_p202603; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_actions_p202604; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_actions_p202605; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_actions_p202606; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_actions_p202607; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_permissions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: agent_blocklist; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: agent_risk_state; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: aml_checks; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: audit_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: auth_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: auth_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: auth_tokens; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: blackjack_games; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: community_moderation_actions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: community_posts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: community_reports; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: community_threads; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: config_change_requests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: crypto_chain_transactions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: crypto_deposit_channels; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: crypto_review_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: crypto_withdraw_addresses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: data_deletion_requests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: data_rights_audits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: deferred_payouts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: deposits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: device_fingerprints; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: draw_records; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: economy_ledger_entries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: experiment_assignments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: experiments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fairness_audits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fairness_seeds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fiat_deposit_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fiat_payout_methods; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fiat_withdraw_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: finance_reviews; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: freeze_records; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gift_energy_accounts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gift_pack_catalog; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gift_transfers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: hand_histories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: holdem_table_messages; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: holdem_table_seats; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: holdem_tables; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: house_account; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."house_account" ("id", "house_bankroll", "prize_pool_balance", "marketing_budget", "reserve_balance", "created_at", "updated_at") VALUES (1, 0.00, 0.00, 0.00, 0.00, '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10');


--
-- Data for Name: house_transactions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: iap_products; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: jurisdiction_rules; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: kyc_documents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: kyc_profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: kyc_review_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ledger_entries_default; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ledger_entries_p202603; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ledger_entries_p202604; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ledger_entries_p202605; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ledger_entries_p202606; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ledger_entries_p202607; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ledger_mutation_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: legal_document_acceptances; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: legal_document_publications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: legal_documents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: missions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."missions" ("id", "type", "params", "reward", "is_active", "created_at", "updated_at") VALUES ('daily_checkin', 'daily_checkin', '{"title": "Daily check-in", "sortOrder": 10, "description": "Sign in each day to keep the streak active and receive the daily auto bonus."}', 0.00, false, '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10');
INSERT INTO "public"."missions" ("id", "type", "params", "reward", "is_active", "created_at", "updated_at") VALUES ('profile_security', 'metric_threshold', '{"title": "Security setup", "metric": "verified_contacts", "target": 2, "cadence": "one_time", "sortOrder": 20, "description": "Verify email and phone to unlock finance tools and earn a profile setup bonus."}', 8.00, true, '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10');
INSERT INTO "public"."missions" ("id", "type", "params", "reward", "is_active", "created_at", "updated_at") VALUES ('first_draw', 'metric_threshold', '{"title": "First draw", "metric": "draw_count_all", "target": 1, "cadence": "one_time", "sortOrder": 30, "description": "Complete your first draw to start the engagement ladder."}', 3.00, true, '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10');
INSERT INTO "public"."missions" ("id", "type", "params", "reward", "is_active", "created_at", "updated_at") VALUES ('draw_streak_daily', 'metric_threshold', '{"title": "Draw sprint", "metric": "draw_count_today", "target": 3, "cadence": "daily", "sortOrder": 40, "description": "Finish 3 draws in one day to unlock the daily sprint payout."}', 5.00, true, '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10');
INSERT INTO "public"."missions" ("id", "type", "params", "reward", "is_active", "created_at", "updated_at") VALUES ('top_up_starter', 'metric_threshold', '{"title": "First deposit bonus", "metric": "deposit_credited_count", "target": 1, "cadence": "one_time", "awardMode": "auto_grant", "sortOrder": 50, "description": "Complete your first credited deposit to receive an automatic starter bonus.", "bonusUnlockWagerRatio": 1.00}', 10.00, true, '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10');
INSERT INTO "public"."missions" ("id", "type", "params", "reward", "is_active", "created_at", "updated_at") VALUES ('referral_starter', 'metric_threshold', '{"title": "Invite a friend", "metric": "referral_success_count", "target": 1, "cadence": "one_time", "rewardId": "referral_program", "sortOrder": 60, "description": "Invite one friend who completes Tier 1 KYC to unlock a referral reward."}', 0.00, false, '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10');


--
-- Data for Name: notification_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_delivery_attempts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_push_devices; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_records; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_outbound_requests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_provider_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_providers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_reconciliation_issues; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_reconciliation_runs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_settlement_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_webhook_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payout_methods; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: play_mode_sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prediction_market_appeals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prediction_market_oracles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prediction_markets; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prediction_positions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: prizes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: quick_eight_rounds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: reconciliation_alerts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: referrals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: risk_table_interaction_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: risk_table_interaction_pairs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: round_events_default; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: round_events_p202603; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: round_events_p202604; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: round_events_p202605; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: round_events_p202606; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: round_events_p202607; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: rounds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_agent_group_correlations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_agents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_api_keys; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_billing_account_versions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_billing_accounts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_billing_disputes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_billing_ledger_entries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_billing_runs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_billing_top_ups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_distribution_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_draw_records; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_fairness_seeds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_ledger_entries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_outbound_webhook_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_outbound_webhooks; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_players; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_project_prizes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_projects; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_report_exports; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_reward_envelopes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_status_minutes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_stripe_webhook_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_tenant_invites; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_tenant_links; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_tenant_memberships; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_tenants; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_usage_events_default; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_usage_events_p202603; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_usage_events_p202604; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_usage_events_p202605; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_usage_events_p202606; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: saas_usage_events_p202607; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: seats; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: security_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store_purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: store_purchase_receipts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: suspicious_accounts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (1, 'system.site_name', '{"value": "Prize Pool & Probability Engine System"}', 'Site name', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', NULL);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (2, 'system.maintenance_mode', NULL, 'Maintenance mode', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (3, 'system.registration_enabled', NULL, 'Registration enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (4, 'system.login_enabled', NULL, 'Login enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (5, 'system.default_language', '{"value": "en"}', 'Default language', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', NULL);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (6, 'draw_system.draw_enabled', NULL, 'Draw enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (7, 'draw_system.min_draw_cost', NULL, 'Minimum draw cost', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (8, 'draw_system.max_draw_cost', NULL, 'Maximum draw cost', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (9, 'draw_system.max_draw_per_request', NULL, 'Max draws per request', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (10, 'draw_system.max_draw_per_day', NULL, 'Max draws per day', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (11, 'draw_system.cooldown_seconds', NULL, 'Draw cooldown in seconds', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (12, 'draw_cost', NULL, 'Draw cost', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (13, 'pool_system.pool_min_reserve', NULL, 'Pool minimum reserve', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (14, 'pool_system.pool_max_payout_ratio', NULL, 'Pool max payout ratio', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (15, 'pool_system.pool_noise_enabled', NULL, 'Pool noise enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (16, 'pool_system.pool_noise_range', '{"max": 0, "min": 0}', 'Pool noise range', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', NULL);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (17, 'pool_system.pool_epoch_seconds', NULL, 'Pool epoch seconds', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (18, 'payout_control.max_big_prize_per_hour', NULL, 'Max big prizes per hour', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (19, 'payout_control.max_big_prize_per_day', NULL, 'Max big prizes per day', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (20, 'payout_control.max_total_payout_per_hour', NULL, 'Max total payout per hour', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (21, 'payout_control.payout_cooldown_seconds', NULL, 'Payout cooldown seconds', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (22, 'probability_control.weight_jitter_enabled', NULL, 'Weight jitter enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (23, 'probability_control.weight_jitter_range', '{"max": 0.1, "min": 0}', 'Weight jitter range', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', NULL);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (24, 'probability_control.probability_scale', NULL, 'Probability scale', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (25, 'probability_control.jackpot_probability_boost', NULL, 'Jackpot probability boost', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (26, 'random_weight_jitter_enabled', NULL, 'Legacy weight jitter enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (27, 'random_weight_jitter_pct', NULL, 'Legacy weight jitter pct', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (28, 'economy.house_bankroll', NULL, 'House bankroll', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (29, 'economy.prize_pool', NULL, 'Prize pool', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (30, 'economy.marketing_budget', NULL, 'Marketing budget', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (31, 'economy.reserve_fund', NULL, 'Reserve fund', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (32, 'economy.bonus_unlock_wager_ratio', NULL, 'Bonus unlock wager ratio', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (33, 'economy.bonus_expire_days', NULL, 'Bonus expire days', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (34, 'anti_abuse.max_accounts_per_ip', NULL, 'Max accounts per IP', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (35, 'anti_abuse.max_withdraw_per_day', NULL, 'Max withdraw per day', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (36, 'anti_abuse.min_wager_before_withdraw', NULL, 'Min wager before withdraw', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (37, 'anti_abuse.suspicious_activity_threshold', NULL, 'Suspicious activity threshold', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (38, 'anti_abuse.auto_freeze_enabled', NULL, 'Auto freeze enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (39, 'payment.deposit_enabled', NULL, 'Deposit enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (40, 'payment.withdraw_enabled', NULL, 'Withdraw enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (41, 'payment.min_deposit_amount', NULL, 'Minimum deposit amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (42, 'payment.max_deposit_amount', NULL, 'Maximum deposit amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (43, 'payment.min_withdraw_amount', NULL, 'Minimum withdraw amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (44, 'payment.max_withdraw_amount', NULL, 'Maximum withdraw amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (45, 'reward_events.signup_bonus_enabled', NULL, 'Signup bonus enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (46, 'reward_events.signup_bonus_amount', NULL, 'Signup bonus amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (47, 'reward_events.referral_bonus_enabled', NULL, 'Referral bonus enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (48, 'reward_events.referral_bonus_amount', NULL, 'Referral bonus amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (49, 'reward_events.daily_bonus_enabled', NULL, 'Daily bonus enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (50, 'analytics.stats_visibility_delay_minutes', NULL, 'Stats visibility delay', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (51, 'analytics.public_stats_enabled', NULL, 'Public stats enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (52, 'analytics.pool_balance_public', NULL, 'Pool balance public', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (53, 'reward_events.daily_bonus_amount', NULL, 'Daily bonus amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (54, 'probability_control.pity_enabled', NULL, 'Pity system enabled', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (55, 'probability_control.pity_threshold', NULL, 'Pity streak threshold', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 5.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (56, 'probability_control.pity_boost_pct', NULL, 'Pity boost percentage', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.05);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (57, 'probability_control.pity_max_boost_pct', NULL, 'Pity max boost percentage', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.50);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (58, 'economy.bonus_auto_release_enabled', NULL, 'Auto release bonus balance', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (59, 'security.auth_failure_window_minutes', NULL, 'Auth failure window minutes', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 15.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (60, 'security.auth_failure_freeze_threshold', NULL, 'Auth failure threshold (user)', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 8.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (61, 'security.admin_failure_freeze_threshold', NULL, 'Auth failure threshold (admin)', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 5.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (62, 'reward_events.profile_security_bonus_amount', NULL, 'Profile security reward amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 8.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (63, 'reward_events.first_draw_bonus_amount', NULL, 'First draw reward amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 3.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (64, 'reward_events.draw_streak_daily_bonus_amount', NULL, 'Daily draw streak reward amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 5.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (65, 'reward_events.top_up_starter_bonus_amount', NULL, 'Top-up starter reward amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 10.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (66, 'blackjack.min_stake', NULL, 'Blackjack minimum stake', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (67, 'blackjack.max_stake', NULL, 'Blackjack maximum stake', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 100.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (68, 'blackjack.win_payout_multiplier', NULL, 'Blackjack win payout multiplier', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 2.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (69, 'blackjack.push_payout_multiplier', NULL, 'Blackjack push payout multiplier', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (70, 'blackjack.natural_payout_multiplier', NULL, 'Blackjack natural payout multiplier', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 2.50);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (71, 'blackjack.dealer_hits_soft_17', NULL, 'Blackjack dealer hits soft 17', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (72, 'blackjack.double_down_allowed', NULL, 'Blackjack double down allowed', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (73, 'blackjack.split_aces_allowed', NULL, 'Blackjack split aces allowed', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (74, 'blackjack.hit_split_aces_allowed', NULL, 'Blackjack hit split aces allowed', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (75, 'blackjack.resplit_allowed', NULL, 'Blackjack resplit allowed', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (76, 'blackjack.max_split_hands', NULL, 'Blackjack maximum split hands', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 4.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (77, 'blackjack.split_ten_value_cards_allowed', NULL, 'Blackjack split ten-value cards allowed', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 0.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (78, 'saas_usage_alert.max_minute_qps', NULL, 'SaaS usage alert threshold for peak minute QPS', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 5.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (79, 'saas_usage_alert.max_single_payout_amount', NULL, 'SaaS usage alert threshold for max single payout amount', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 100.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (80, 'saas_usage_alert.max_anti_exploit_rate_pct', NULL, 'SaaS usage alert threshold for anti-exploit hit rate percentage', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 20.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (81, 'holdem.rake_bps', NULL, 'Holdem rake in basis points', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 500.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (82, 'holdem.rake_cap_amount', NULL, 'Holdem rake cap per hand', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 8.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (83, 'holdem.rake_no_flop_no_drop', NULL, 'Disable rake when the flop was not dealt', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (84, 'holdem.disconnect_grace_seconds', NULL, 'Grace window before a disconnected holdem seat is marked sitting out', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 30.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (85, 'holdem.seat_lease_seconds', NULL, 'Seat retention window before a disconnected holdem seat is auto-cashed out', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 300.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (86, 'saas_status.api_error_rate_pct_warn', NULL, 'Public SaaS status warning threshold for API error rate percentage', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 2.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (87, 'saas_status.api_error_rate_pct_outage', NULL, 'Public SaaS status outage threshold for API error rate percentage', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 10.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (88, 'saas_status.api_p95_ms_warn', NULL, 'Public SaaS status warning threshold for API P95 in milliseconds', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 1000.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (89, 'saas_status.api_p95_ms_outage', NULL, 'Public SaaS status outage threshold for API P95 in milliseconds', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 2500.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (90, 'saas_status.worker_lag_ms_warn', NULL, 'Public SaaS status warning threshold for worker lag in milliseconds', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 60000.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (91, 'saas_status.worker_lag_ms_outage', NULL, 'Public SaaS status outage threshold for worker lag in milliseconds', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 300000.00);
INSERT INTO "public"."system_config" ("id", "config_key", "config_value", "description", "created_at", "updated_at", "config_number") VALUES (92, 'saas_status.monthly_sla_target_pct', NULL, 'Public SaaS status monthly SLA target percentage', '2026-04-30 15:08:28.914108+10', '2026-04-30 15:08:28.914108+10', 99.90);


--
-- Data for Name: table_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tables; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_asset_balances; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_mfa_secrets; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_play_modes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_wallets; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: wallet_reconciliation_runs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: withdrawal_limits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: withdrawals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: admin_actions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."admin_actions_id_seq"', 1, false);


--
-- Name: admin_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."admin_permissions_id_seq"', 1, false);


--
-- Name: admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."admins_id_seq"', 1, false);


--
-- Name: agent_blocklist_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."agent_blocklist_id_seq"', 1, false);


--
-- Name: agent_risk_state_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."agent_risk_state_id_seq"', 1, false);


--
-- Name: aml_checks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."aml_checks_id_seq"', 1, false);


--
-- Name: audit_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."audit_events_id_seq"', 1, false);


--
-- Name: auth_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."auth_events_id_seq"', 1, false);


--
-- Name: auth_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."auth_sessions_id_seq"', 1, false);


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."auth_tokens_id_seq"', 1, false);


--
-- Name: blackjack_games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."blackjack_games_id_seq"', 1, false);


--
-- Name: community_moderation_actions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."community_moderation_actions_id_seq"', 1, false);


--
-- Name: community_posts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."community_posts_id_seq"', 1, false);


--
-- Name: community_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."community_reports_id_seq"', 1, false);


--
-- Name: community_threads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."community_threads_id_seq"', 1, false);


--
-- Name: config_change_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."config_change_requests_id_seq"', 1, false);


--
-- Name: crypto_chain_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."crypto_chain_transactions_id_seq"', 1, false);


--
-- Name: crypto_deposit_channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."crypto_deposit_channels_id_seq"', 1, false);


--
-- Name: crypto_review_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."crypto_review_events_id_seq"', 1, false);


--
-- Name: data_deletion_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."data_deletion_requests_id_seq"', 1, false);


--
-- Name: data_rights_audits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."data_rights_audits_id_seq"', 1, false);


--
-- Name: deferred_payouts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."deferred_payouts_id_seq"', 1, false);


--
-- Name: deposits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."deposits_id_seq"', 1, false);


--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."device_fingerprints_id_seq"', 1, false);


--
-- Name: draw_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."draw_records_id_seq"', 1, false);


--
-- Name: economy_ledger_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."economy_ledger_entries_id_seq"', 1, false);


--
-- Name: experiment_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."experiment_assignments_id_seq"', 1, false);


--
-- Name: experiments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."experiments_id_seq"', 1, false);


--
-- Name: fairness_audits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."fairness_audits_id_seq"', 1, false);


--
-- Name: fairness_seeds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."fairness_seeds_id_seq"', 1, false);


--
-- Name: fiat_deposit_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."fiat_deposit_events_id_seq"', 1, false);


--
-- Name: fiat_withdraw_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."fiat_withdraw_events_id_seq"', 1, false);


--
-- Name: finance_reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."finance_reviews_id_seq"', 1, false);


--
-- Name: freeze_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."freeze_records_id_seq"', 1, false);


--
-- Name: gift_pack_catalog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."gift_pack_catalog_id_seq"', 1, false);


--
-- Name: gift_transfers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."gift_transfers_id_seq"', 1, false);


--
-- Name: hand_histories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."hand_histories_id_seq"', 1, false);


--
-- Name: holdem_table_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."holdem_table_messages_id_seq"', 1, false);


--
-- Name: holdem_table_seats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."holdem_table_seats_id_seq"', 1, false);


--
-- Name: holdem_tables_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."holdem_tables_id_seq"', 1, false);


--
-- Name: house_account_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."house_account_id_seq"', 1, false);


--
-- Name: house_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."house_transactions_id_seq"', 1, false);


--
-- Name: iap_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."iap_products_id_seq"', 1, false);


--
-- Name: jurisdiction_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."jurisdiction_rules_id_seq"', 1, false);


--
-- Name: kyc_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."kyc_documents_id_seq"', 1, false);


--
-- Name: kyc_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."kyc_profiles_id_seq"', 1, false);


--
-- Name: kyc_review_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."kyc_review_events_id_seq"', 1, false);


--
-- Name: ledger_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."ledger_entries_id_seq"', 1, false);


--
-- Name: ledger_mutation_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."ledger_mutation_events_id_seq"', 1, false);


--
-- Name: legal_document_acceptances_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."legal_document_acceptances_id_seq"', 1, false);


--
-- Name: legal_document_publications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."legal_document_publications_id_seq"', 1, false);


--
-- Name: legal_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."legal_documents_id_seq"', 1, false);


--
-- Name: notification_deliveries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."notification_deliveries_id_seq"', 1, false);


--
-- Name: notification_delivery_attempts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."notification_delivery_attempts_id_seq"', 1, false);


--
-- Name: notification_preferences_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."notification_preferences_id_seq"', 1, false);


--
-- Name: notification_push_devices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."notification_push_devices_id_seq"', 1, false);


--
-- Name: notification_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."notification_records_id_seq"', 1, false);


--
-- Name: payment_outbound_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payment_outbound_requests_id_seq"', 1, false);


--
-- Name: payment_provider_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payment_provider_events_id_seq"', 1, false);


--
-- Name: payment_providers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payment_providers_id_seq"', 1, false);


--
-- Name: payment_reconciliation_issues_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payment_reconciliation_issues_id_seq"', 1, false);


--
-- Name: payment_reconciliation_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payment_reconciliation_runs_id_seq"', 1, false);


--
-- Name: payment_settlement_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payment_settlement_events_id_seq"', 1, false);


--
-- Name: payment_webhook_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payment_webhook_events_id_seq"', 1, false);


--
-- Name: payout_methods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."payout_methods_id_seq"', 1, false);


--
-- Name: play_mode_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."play_mode_sessions_id_seq"', 1, false);


--
-- Name: prediction_market_appeals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."prediction_market_appeals_id_seq"', 1, false);


--
-- Name: prediction_market_oracles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."prediction_market_oracles_id_seq"', 1, false);


--
-- Name: prediction_markets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."prediction_markets_id_seq"', 1, false);


--
-- Name: prediction_positions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."prediction_positions_id_seq"', 1, false);


--
-- Name: prizes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."prizes_id_seq"', 1, false);


--
-- Name: quick_eight_rounds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."quick_eight_rounds_id_seq"', 1, false);


--
-- Name: reconciliation_alerts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."reconciliation_alerts_id_seq"', 1, false);


--
-- Name: referrals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."referrals_id_seq"', 1, false);


--
-- Name: risk_table_interaction_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."risk_table_interaction_events_id_seq"', 1, false);


--
-- Name: risk_table_interaction_pairs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."risk_table_interaction_pairs_id_seq"', 1, false);


--
-- Name: round_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."round_events_id_seq"', 1, false);


--
-- Name: rounds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."rounds_id_seq"', 1, false);


--
-- Name: saas_agent_group_correlations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_agent_group_correlations_id_seq"', 1, false);


--
-- Name: saas_agents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_agents_id_seq"', 1, false);


--
-- Name: saas_api_keys_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_api_keys_id_seq"', 1, false);


--
-- Name: saas_billing_account_versions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_billing_account_versions_id_seq"', 1, false);


--
-- Name: saas_billing_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_billing_accounts_id_seq"', 1, false);


--
-- Name: saas_billing_disputes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_billing_disputes_id_seq"', 1, false);


--
-- Name: saas_billing_ledger_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_billing_ledger_entries_id_seq"', 1, false);


--
-- Name: saas_billing_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_billing_runs_id_seq"', 1, false);


--
-- Name: saas_billing_top_ups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_billing_top_ups_id_seq"', 1, false);


--
-- Name: saas_distribution_snapshots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_distribution_snapshots_id_seq"', 1, false);


--
-- Name: saas_draw_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_draw_records_id_seq"', 1, false);


--
-- Name: saas_fairness_seeds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_fairness_seeds_id_seq"', 1, false);


--
-- Name: saas_ledger_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_ledger_entries_id_seq"', 1, false);


--
-- Name: saas_outbound_webhook_deliveries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_outbound_webhook_deliveries_id_seq"', 1, false);


--
-- Name: saas_outbound_webhooks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_outbound_webhooks_id_seq"', 1, false);


--
-- Name: saas_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_players_id_seq"', 1, false);


--
-- Name: saas_project_prizes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_project_prizes_id_seq"', 1, false);


--
-- Name: saas_projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_projects_id_seq"', 1, false);


--
-- Name: saas_report_exports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_report_exports_id_seq"', 1, false);


--
-- Name: saas_reward_envelopes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_reward_envelopes_id_seq"', 1, false);


--
-- Name: saas_status_minutes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_status_minutes_id_seq"', 1, false);


--
-- Name: saas_stripe_webhook_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_stripe_webhook_events_id_seq"', 1, false);


--
-- Name: saas_tenant_invites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_tenant_invites_id_seq"', 1, false);


--
-- Name: saas_tenant_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_tenant_links_id_seq"', 1, false);


--
-- Name: saas_tenant_memberships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_tenant_memberships_id_seq"', 1, false);


--
-- Name: saas_tenants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_tenants_id_seq"', 1, false);


--
-- Name: saas_usage_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."saas_usage_events_id_seq"', 1, false);


--
-- Name: seats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."seats_id_seq"', 1, false);


--
-- Name: security_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."security_events_id_seq"', 1, false);


--
-- Name: store_purchase_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."store_purchase_orders_id_seq"', 1, false);


--
-- Name: store_purchase_receipts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."store_purchase_receipts_id_seq"', 1, false);


--
-- Name: suspicious_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."suspicious_accounts_id_seq"', 1, false);


--
-- Name: system_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."system_config_id_seq"', 92, true);


--
-- Name: table_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."table_events_id_seq"', 1, false);


--
-- Name: tables_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."tables_id_seq"', 1, false);


--
-- Name: user_asset_balances_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."user_asset_balances_id_seq"', 1, false);


--
-- Name: user_mfa_secrets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."user_mfa_secrets_id_seq"', 1, false);


--
-- Name: user_play_modes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."user_play_modes_id_seq"', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."users_id_seq"', 1, false);


--
-- Name: wallet_reconciliation_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."wallet_reconciliation_runs_id_seq"', 1, false);


--
-- Name: withdrawal_limits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."withdrawal_limits_id_seq"', 1, false);


--
-- Name: withdrawals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('"public"."withdrawals_id_seq"', 1, false);


--
-- Name: admin_permissions admin_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id");


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");


--
-- Name: agent_blocklist agent_blocklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_blocklist"
    ADD CONSTRAINT "agent_blocklist_pkey" PRIMARY KEY ("id");


--
-- Name: agent_risk_state agent_risk_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_risk_state"
    ADD CONSTRAINT "agent_risk_state_pkey" PRIMARY KEY ("id");


--
-- Name: aml_checks aml_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aml_checks"
    ADD CONSTRAINT "aml_checks_pkey" PRIMARY KEY ("id");


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id");


--
-- Name: auth_events auth_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_events"
    ADD CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id");


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_sessions"
    ADD CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_tokens"
    ADD CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: blackjack_games blackjack_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."blackjack_games"
    ADD CONSTRAINT "blackjack_games_pkey" PRIMARY KEY ("id");


--
-- Name: community_moderation_actions community_moderation_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_moderation_actions"
    ADD CONSTRAINT "community_moderation_actions_pkey" PRIMARY KEY ("id");


--
-- Name: community_posts community_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");


--
-- Name: community_reports community_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id");


--
-- Name: community_threads community_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_threads"
    ADD CONSTRAINT "community_threads_pkey" PRIMARY KEY ("id");


--
-- Name: config_change_requests config_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."config_change_requests"
    ADD CONSTRAINT "config_change_requests_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_chain_transactions crypto_chain_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_chain_transactions"
    ADD CONSTRAINT "crypto_chain_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_deposit_channels crypto_deposit_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_deposit_channels"
    ADD CONSTRAINT "crypto_deposit_channels_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_review_events crypto_review_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_review_events"
    ADD CONSTRAINT "crypto_review_events_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_withdraw_addresses crypto_withdraw_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_withdraw_addresses"
    ADD CONSTRAINT "crypto_withdraw_addresses_pkey" PRIMARY KEY ("payout_method_id");


--
-- Name: data_deletion_requests data_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_deletion_requests"
    ADD CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id");


--
-- Name: data_rights_audits data_rights_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_rights_audits"
    ADD CONSTRAINT "data_rights_audits_pkey" PRIMARY KEY ("id");


--
-- Name: deferred_payouts deferred_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deferred_payouts"
    ADD CONSTRAINT "deferred_payouts_pkey" PRIMARY KEY ("id");


--
-- Name: deposits deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_pkey" PRIMARY KEY ("id");


--
-- Name: device_fingerprints device_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_fingerprints"
    ADD CONSTRAINT "device_fingerprints_pkey" PRIMARY KEY ("id");


--
-- Name: draw_records draw_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draw_records"
    ADD CONSTRAINT "draw_records_pkey" PRIMARY KEY ("id");


--
-- Name: economy_ledger_entries economy_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."economy_ledger_entries"
    ADD CONSTRAINT "economy_ledger_entries_pkey" PRIMARY KEY ("id");


--
-- Name: experiment_assignments experiment_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."experiment_assignments"
    ADD CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: experiments experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."experiments"
    ADD CONSTRAINT "experiments_pkey" PRIMARY KEY ("id");


--
-- Name: fairness_audits fairness_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fairness_audits"
    ADD CONSTRAINT "fairness_audits_pkey" PRIMARY KEY ("id");


--
-- Name: fairness_seeds fairness_seeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fairness_seeds"
    ADD CONSTRAINT "fairness_seeds_pkey" PRIMARY KEY ("id");


--
-- Name: fiat_deposit_events fiat_deposit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_deposit_events"
    ADD CONSTRAINT "fiat_deposit_events_pkey" PRIMARY KEY ("id");


--
-- Name: fiat_payout_methods fiat_payout_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_payout_methods"
    ADD CONSTRAINT "fiat_payout_methods_pkey" PRIMARY KEY ("payout_method_id");


--
-- Name: fiat_withdraw_events fiat_withdraw_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_withdraw_events"
    ADD CONSTRAINT "fiat_withdraw_events_pkey" PRIMARY KEY ("id");


--
-- Name: finance_reviews finance_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."finance_reviews"
    ADD CONSTRAINT "finance_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: freeze_records freeze_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."freeze_records"
    ADD CONSTRAINT "freeze_records_pkey" PRIMARY KEY ("id");


--
-- Name: gift_energy_accounts gift_energy_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_energy_accounts"
    ADD CONSTRAINT "gift_energy_accounts_pkey" PRIMARY KEY ("user_id");


--
-- Name: gift_pack_catalog gift_pack_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_pack_catalog"
    ADD CONSTRAINT "gift_pack_catalog_pkey" PRIMARY KEY ("id");


--
-- Name: gift_transfers gift_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_transfers"
    ADD CONSTRAINT "gift_transfers_pkey" PRIMARY KEY ("id");


--
-- Name: hand_histories hand_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hand_histories"
    ADD CONSTRAINT "hand_histories_pkey" PRIMARY KEY ("id");


--
-- Name: holdem_table_messages holdem_table_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_messages"
    ADD CONSTRAINT "holdem_table_messages_pkey" PRIMARY KEY ("id");


--
-- Name: holdem_table_seats holdem_table_seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_seats"
    ADD CONSTRAINT "holdem_table_seats_pkey" PRIMARY KEY ("id");


--
-- Name: holdem_tables holdem_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_tables"
    ADD CONSTRAINT "holdem_tables_pkey" PRIMARY KEY ("id");


--
-- Name: house_account house_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."house_account"
    ADD CONSTRAINT "house_account_pkey" PRIMARY KEY ("id");


--
-- Name: house_transactions house_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."house_transactions"
    ADD CONSTRAINT "house_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: iap_products iap_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."iap_products"
    ADD CONSTRAINT "iap_products_pkey" PRIMARY KEY ("id");


--
-- Name: jurisdiction_rules jurisdiction_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."jurisdiction_rules"
    ADD CONSTRAINT "jurisdiction_rules_pkey" PRIMARY KEY ("id");


--
-- Name: kyc_documents kyc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_documents"
    ADD CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id");


--
-- Name: kyc_profiles kyc_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_profiles"
    ADD CONSTRAINT "kyc_profiles_pkey" PRIMARY KEY ("id");


--
-- Name: kyc_review_events kyc_review_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_review_events"
    ADD CONSTRAINT "kyc_review_events_pkey" PRIMARY KEY ("id");


--
-- Name: ledger_mutation_events ledger_mutation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_mutation_events"
    ADD CONSTRAINT "ledger_mutation_events_pkey" PRIMARY KEY ("id");


--
-- Name: legal_document_acceptances legal_document_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_acceptances"
    ADD CONSTRAINT "legal_document_acceptances_pkey" PRIMARY KEY ("id");


--
-- Name: legal_document_publications legal_document_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_publications"
    ADD CONSTRAINT "legal_document_publications_pkey" PRIMARY KEY ("id");


--
-- Name: legal_documents legal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id");


--
-- Name: missions missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."missions"
    ADD CONSTRAINT "missions_pkey" PRIMARY KEY ("id");


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id");


--
-- Name: notification_delivery_attempts notification_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_delivery_attempts"
    ADD CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id");


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");


--
-- Name: notification_push_devices notification_push_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_push_devices"
    ADD CONSTRAINT "notification_push_devices_pkey" PRIMARY KEY ("id");


--
-- Name: notification_records notification_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_records"
    ADD CONSTRAINT "notification_records_pkey" PRIMARY KEY ("id");


--
-- Name: payment_outbound_requests payment_outbound_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_outbound_requests"
    ADD CONSTRAINT "payment_outbound_requests_pkey" PRIMARY KEY ("id");


--
-- Name: payment_provider_events payment_provider_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_provider_events"
    ADD CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id");


--
-- Name: payment_providers payment_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_providers"
    ADD CONSTRAINT "payment_providers_pkey" PRIMARY KEY ("id");


--
-- Name: payment_reconciliation_issues payment_reconciliation_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reconciliation_issues"
    ADD CONSTRAINT "payment_reconciliation_issues_pkey" PRIMARY KEY ("id");


--
-- Name: payment_reconciliation_runs payment_reconciliation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reconciliation_runs"
    ADD CONSTRAINT "payment_reconciliation_runs_pkey" PRIMARY KEY ("id");


--
-- Name: payment_settlement_events payment_settlement_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_settlement_events"
    ADD CONSTRAINT "payment_settlement_events_pkey" PRIMARY KEY ("id");


--
-- Name: payment_webhook_events payment_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");


--
-- Name: payout_methods payout_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payout_methods"
    ADD CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id");


--
-- Name: play_mode_sessions play_mode_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."play_mode_sessions"
    ADD CONSTRAINT "play_mode_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: prediction_market_appeals prediction_market_appeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_appeals"
    ADD CONSTRAINT "prediction_market_appeals_pkey" PRIMARY KEY ("id");


--
-- Name: prediction_market_oracles prediction_market_oracles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_oracles"
    ADD CONSTRAINT "prediction_market_oracles_pkey" PRIMARY KEY ("id");


--
-- Name: prediction_markets prediction_markets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_markets"
    ADD CONSTRAINT "prediction_markets_pkey" PRIMARY KEY ("id");


--
-- Name: prediction_positions prediction_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_positions"
    ADD CONSTRAINT "prediction_positions_pkey" PRIMARY KEY ("id");


--
-- Name: prizes prizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prizes"
    ADD CONSTRAINT "prizes_pkey" PRIMARY KEY ("id");


--
-- Name: quick_eight_rounds quick_eight_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."quick_eight_rounds"
    ADD CONSTRAINT "quick_eight_rounds_pkey" PRIMARY KEY ("id");


--
-- Name: reconciliation_alerts reconciliation_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reconciliation_alerts"
    ADD CONSTRAINT "reconciliation_alerts_pkey" PRIMARY KEY ("id");


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");


--
-- Name: risk_table_interaction_events risk_table_interaction_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."risk_table_interaction_events"
    ADD CONSTRAINT "risk_table_interaction_events_pkey" PRIMARY KEY ("id");


--
-- Name: risk_table_interaction_pairs risk_table_interaction_pairs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."risk_table_interaction_pairs"
    ADD CONSTRAINT "risk_table_interaction_pairs_pkey" PRIMARY KEY ("id");


--
-- Name: rounds rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rounds"
    ADD CONSTRAINT "rounds_pkey" PRIMARY KEY ("id");


--
-- Name: saas_agent_group_correlations saas_agent_group_correlations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agent_group_correlations"
    ADD CONSTRAINT "saas_agent_group_correlations_pkey" PRIMARY KEY ("id");


--
-- Name: saas_agents saas_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agents"
    ADD CONSTRAINT "saas_agents_pkey" PRIMARY KEY ("id");


--
-- Name: saas_api_keys saas_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_api_keys"
    ADD CONSTRAINT "saas_api_keys_pkey" PRIMARY KEY ("id");


--
-- Name: saas_billing_account_versions saas_billing_account_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_account_versions"
    ADD CONSTRAINT "saas_billing_account_versions_pkey" PRIMARY KEY ("id");


--
-- Name: saas_billing_accounts saas_billing_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_accounts"
    ADD CONSTRAINT "saas_billing_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: saas_billing_disputes saas_billing_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_disputes"
    ADD CONSTRAINT "saas_billing_disputes_pkey" PRIMARY KEY ("id");


--
-- Name: saas_billing_ledger_entries saas_billing_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_ledger_entries"
    ADD CONSTRAINT "saas_billing_ledger_entries_pkey" PRIMARY KEY ("id");


--
-- Name: saas_billing_runs saas_billing_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_runs"
    ADD CONSTRAINT "saas_billing_runs_pkey" PRIMARY KEY ("id");


--
-- Name: saas_billing_top_ups saas_billing_top_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_top_ups"
    ADD CONSTRAINT "saas_billing_top_ups_pkey" PRIMARY KEY ("id");


--
-- Name: saas_distribution_snapshots saas_distribution_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_distribution_snapshots"
    ADD CONSTRAINT "saas_distribution_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: saas_draw_records saas_draw_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_draw_records"
    ADD CONSTRAINT "saas_draw_records_pkey" PRIMARY KEY ("id");


--
-- Name: saas_fairness_seeds saas_fairness_seeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_fairness_seeds"
    ADD CONSTRAINT "saas_fairness_seeds_pkey" PRIMARY KEY ("id");


--
-- Name: saas_ledger_entries saas_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_ledger_entries"
    ADD CONSTRAINT "saas_ledger_entries_pkey" PRIMARY KEY ("id");


--
-- Name: saas_outbound_webhook_deliveries saas_outbound_webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhook_deliveries"
    ADD CONSTRAINT "saas_outbound_webhook_deliveries_pkey" PRIMARY KEY ("id");


--
-- Name: saas_outbound_webhooks saas_outbound_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhooks"
    ADD CONSTRAINT "saas_outbound_webhooks_pkey" PRIMARY KEY ("id");


--
-- Name: saas_players saas_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_players"
    ADD CONSTRAINT "saas_players_pkey" PRIMARY KEY ("id");


--
-- Name: saas_project_prizes saas_project_prizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_project_prizes"
    ADD CONSTRAINT "saas_project_prizes_pkey" PRIMARY KEY ("id");


--
-- Name: saas_projects saas_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_projects"
    ADD CONSTRAINT "saas_projects_pkey" PRIMARY KEY ("id");


--
-- Name: saas_report_exports saas_report_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_report_exports"
    ADD CONSTRAINT "saas_report_exports_pkey" PRIMARY KEY ("id");


--
-- Name: saas_reward_envelopes saas_reward_envelopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_reward_envelopes"
    ADD CONSTRAINT "saas_reward_envelopes_pkey" PRIMARY KEY ("id");


--
-- Name: saas_status_minutes saas_status_minutes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_status_minutes"
    ADD CONSTRAINT "saas_status_minutes_pkey" PRIMARY KEY ("id");


--
-- Name: saas_stripe_webhook_events saas_stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_stripe_webhook_events"
    ADD CONSTRAINT "saas_stripe_webhook_events_pkey" PRIMARY KEY ("id");


--
-- Name: saas_tenant_invites saas_tenant_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_invites"
    ADD CONSTRAINT "saas_tenant_invites_pkey" PRIMARY KEY ("id");


--
-- Name: saas_tenant_links saas_tenant_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_links"
    ADD CONSTRAINT "saas_tenant_links_pkey" PRIMARY KEY ("id");


--
-- Name: saas_tenant_memberships saas_tenant_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_memberships"
    ADD CONSTRAINT "saas_tenant_memberships_pkey" PRIMARY KEY ("id");


--
-- Name: saas_tenants saas_tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenants"
    ADD CONSTRAINT "saas_tenants_pkey" PRIMARY KEY ("id");


--
-- Name: seats seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_pkey" PRIMARY KEY ("id");


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");


--
-- Name: store_purchase_orders store_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_orders"
    ADD CONSTRAINT "store_purchase_orders_pkey" PRIMARY KEY ("id");


--
-- Name: store_purchase_receipts store_purchase_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_receipts"
    ADD CONSTRAINT "store_purchase_receipts_pkey" PRIMARY KEY ("id");


--
-- Name: suspicious_accounts suspicious_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."suspicious_accounts"
    ADD CONSTRAINT "suspicious_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("id");


--
-- Name: table_events table_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."table_events"
    ADD CONSTRAINT "table_events_pkey" PRIMARY KEY ("id");


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");


--
-- Name: user_asset_balances user_asset_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_asset_balances"
    ADD CONSTRAINT "user_asset_balances_pkey" PRIMARY KEY ("id");


--
-- Name: user_mfa_secrets user_mfa_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_mfa_secrets"
    ADD CONSTRAINT "user_mfa_secrets_pkey" PRIMARY KEY ("id");


--
-- Name: user_play_modes user_play_modes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_play_modes"
    ADD CONSTRAINT "user_play_modes_pkey" PRIMARY KEY ("id");


--
-- Name: user_wallets user_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_wallets"
    ADD CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("user_id");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: wallet_reconciliation_runs wallet_reconciliation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallet_reconciliation_runs"
    ADD CONSTRAINT "wallet_reconciliation_runs_pkey" PRIMARY KEY ("id");


--
-- Name: withdrawal_limits withdrawal_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_limits"
    ADD CONSTRAINT "withdrawal_limits_pkey" PRIMARY KEY ("id");


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id");


--
-- Name: admin_actions_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_action_idx" ON ONLY "public"."admin_actions" USING "btree" ("action");


--
-- Name: admin_actions_admin_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_admin_created_idx" ON ONLY "public"."admin_actions" USING "btree" ("admin_id", "created_at");


--
-- Name: admin_actions_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_admin_idx" ON ONLY "public"."admin_actions" USING "btree" ("admin_id");


--
-- Name: admin_actions_default_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_default_action_idx" ON "public"."admin_actions_default" USING "btree" ("action");


--
-- Name: admin_actions_default_admin_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_default_admin_id_created_at_idx" ON "public"."admin_actions_default" USING "btree" ("admin_id", "created_at");


--
-- Name: admin_actions_default_admin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_default_admin_id_idx" ON "public"."admin_actions_default" USING "btree" ("admin_id");


--
-- Name: admin_actions_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_id_idx" ON ONLY "public"."admin_actions" USING "btree" ("id");


--
-- Name: admin_actions_default_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_default_id_idx" ON "public"."admin_actions_default" USING "btree" ("id");


--
-- Name: admin_actions_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_session_idx" ON ONLY "public"."admin_actions" USING "btree" ("session_id");


--
-- Name: admin_actions_default_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_default_session_id_idx" ON "public"."admin_actions_default" USING "btree" ("session_id");


--
-- Name: admin_actions_p202603_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202603_action_idx" ON "public"."admin_actions_p202603" USING "btree" ("action");


--
-- Name: admin_actions_p202603_admin_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202603_admin_id_created_at_idx" ON "public"."admin_actions_p202603" USING "btree" ("admin_id", "created_at");


--
-- Name: admin_actions_p202603_admin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202603_admin_id_idx" ON "public"."admin_actions_p202603" USING "btree" ("admin_id");


--
-- Name: admin_actions_p202603_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202603_id_idx" ON "public"."admin_actions_p202603" USING "btree" ("id");


--
-- Name: admin_actions_p202603_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202603_session_id_idx" ON "public"."admin_actions_p202603" USING "btree" ("session_id");


--
-- Name: admin_actions_p202604_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202604_action_idx" ON "public"."admin_actions_p202604" USING "btree" ("action");


--
-- Name: admin_actions_p202604_admin_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202604_admin_id_created_at_idx" ON "public"."admin_actions_p202604" USING "btree" ("admin_id", "created_at");


--
-- Name: admin_actions_p202604_admin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202604_admin_id_idx" ON "public"."admin_actions_p202604" USING "btree" ("admin_id");


--
-- Name: admin_actions_p202604_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202604_id_idx" ON "public"."admin_actions_p202604" USING "btree" ("id");


--
-- Name: admin_actions_p202604_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202604_session_id_idx" ON "public"."admin_actions_p202604" USING "btree" ("session_id");


--
-- Name: admin_actions_p202605_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202605_action_idx" ON "public"."admin_actions_p202605" USING "btree" ("action");


--
-- Name: admin_actions_p202605_admin_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202605_admin_id_created_at_idx" ON "public"."admin_actions_p202605" USING "btree" ("admin_id", "created_at");


--
-- Name: admin_actions_p202605_admin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202605_admin_id_idx" ON "public"."admin_actions_p202605" USING "btree" ("admin_id");


--
-- Name: admin_actions_p202605_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202605_id_idx" ON "public"."admin_actions_p202605" USING "btree" ("id");


--
-- Name: admin_actions_p202605_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202605_session_id_idx" ON "public"."admin_actions_p202605" USING "btree" ("session_id");


--
-- Name: admin_actions_p202606_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202606_action_idx" ON "public"."admin_actions_p202606" USING "btree" ("action");


--
-- Name: admin_actions_p202606_admin_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202606_admin_id_created_at_idx" ON "public"."admin_actions_p202606" USING "btree" ("admin_id", "created_at");


--
-- Name: admin_actions_p202606_admin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202606_admin_id_idx" ON "public"."admin_actions_p202606" USING "btree" ("admin_id");


--
-- Name: admin_actions_p202606_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202606_id_idx" ON "public"."admin_actions_p202606" USING "btree" ("id");


--
-- Name: admin_actions_p202606_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202606_session_id_idx" ON "public"."admin_actions_p202606" USING "btree" ("session_id");


--
-- Name: admin_actions_p202607_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202607_action_idx" ON "public"."admin_actions_p202607" USING "btree" ("action");


--
-- Name: admin_actions_p202607_admin_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202607_admin_id_created_at_idx" ON "public"."admin_actions_p202607" USING "btree" ("admin_id", "created_at");


--
-- Name: admin_actions_p202607_admin_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202607_admin_id_idx" ON "public"."admin_actions_p202607" USING "btree" ("admin_id");


--
-- Name: admin_actions_p202607_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202607_id_idx" ON "public"."admin_actions_p202607" USING "btree" ("id");


--
-- Name: admin_actions_p202607_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "admin_actions_p202607_session_id_idx" ON "public"."admin_actions_p202607" USING "btree" ("session_id");


--
-- Name: admin_permissions_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "admin_permissions_unique" ON "public"."admin_permissions" USING "btree" ("admin_id", "permission_key");


--
-- Name: admins_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "admins_user_id_unique" ON "public"."admins" USING "btree" ("user_id");


--
-- Name: agent_blocklist_tenant_agent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_blocklist_tenant_agent_unique" ON "public"."agent_blocklist" USING "btree" ("tenant_id", "agent_id");


--
-- Name: agent_blocklist_tenant_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_blocklist_tenant_mode_idx" ON "public"."agent_blocklist" USING "btree" ("tenant_id", "mode");


--
-- Name: agent_blocklist_tenant_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_blocklist_tenant_updated_idx" ON "public"."agent_blocklist" USING "btree" ("tenant_id", "updated_at");


--
-- Name: agent_risk_state_api_key_hit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_risk_state_api_key_hit_idx" ON "public"."agent_risk_state" USING "btree" ("api_key_id", "last_hit_at");


--
-- Name: agent_risk_state_project_identity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "agent_risk_state_project_identity_unique" ON "public"."agent_risk_state" USING "btree" ("project_id", "identity_type", "identity_value_hash");


--
-- Name: agent_risk_state_project_risk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_risk_state_project_risk_idx" ON "public"."agent_risk_state" USING "btree" ("project_id", "risk_score", "last_hit_at");


--
-- Name: agent_risk_state_tenant_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "agent_risk_state_tenant_agent_idx" ON "public"."agent_risk_state" USING "btree" ("tenant_id", "agent_id");


--
-- Name: aml_checks_result_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "aml_checks_result_created_idx" ON "public"."aml_checks" USING "btree" ("result", "created_at");


--
-- Name: aml_checks_review_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "aml_checks_review_queue_idx" ON "public"."aml_checks" USING "btree" ("review_status", "result", "sla_due_at");


--
-- Name: aml_checks_user_checkpoint_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "aml_checks_user_checkpoint_created_idx" ON "public"."aml_checks" USING "btree" ("user_id", "checkpoint", "created_at");


--
-- Name: audit_events_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_events_agent_created_idx" ON "public"."audit_events" USING "btree" ("agent_id", "created_at");


--
-- Name: audit_events_event_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_events_event_type_created_idx" ON "public"."audit_events" USING "btree" ("event_type", "created_at");


--
-- Name: audit_events_identity_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_events_identity_created_idx" ON "public"."audit_events" USING "btree" ("identity_type", "identity_value_hash", "created_at");


--
-- Name: audit_events_project_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_events_project_created_idx" ON "public"."audit_events" USING "btree" ("project_id", "created_at");


--
-- Name: auth_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_events_created_idx" ON "public"."auth_events" USING "btree" ("created_at");


--
-- Name: auth_events_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_events_email_idx" ON "public"."auth_events" USING "btree" ("email");


--
-- Name: auth_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_events_type_idx" ON "public"."auth_events" USING "btree" ("event_type");


--
-- Name: auth_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_events_user_idx" ON "public"."auth_events" USING "btree" ("user_id");


--
-- Name: auth_sessions_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_sessions_expires_idx" ON "public"."auth_sessions" USING "btree" ("expires_at");


--
-- Name: auth_sessions_jti_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "auth_sessions_jti_unique" ON "public"."auth_sessions" USING "btree" ("jti");


--
-- Name: auth_sessions_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_sessions_last_seen_idx" ON "public"."auth_sessions" USING "btree" ("last_seen_at");


--
-- Name: auth_sessions_user_kind_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_sessions_user_kind_status_idx" ON "public"."auth_sessions" USING "btree" ("user_id", "session_kind", "status");


--
-- Name: auth_tokens_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_tokens_email_idx" ON "public"."auth_tokens" USING "btree" ("email");


--
-- Name: auth_tokens_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_tokens_expires_idx" ON "public"."auth_tokens" USING "btree" ("expires_at");


--
-- Name: auth_tokens_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_tokens_hash_idx" ON "public"."auth_tokens" USING "btree" ("token_hash");


--
-- Name: auth_tokens_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_tokens_phone_idx" ON "public"."auth_tokens" USING "btree" ("phone");


--
-- Name: auth_tokens_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_tokens_type_idx" ON "public"."auth_tokens" USING "btree" ("token_type");


--
-- Name: auth_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "auth_tokens_user_idx" ON "public"."auth_tokens" USING "btree" ("user_id");


--
-- Name: blackjack_games_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "blackjack_games_status_created_idx" ON "public"."blackjack_games" USING "btree" ("status", "created_at");


--
-- Name: blackjack_games_status_turn_deadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "blackjack_games_status_turn_deadline_idx" ON "public"."blackjack_games" USING "btree" ("status", "turn_deadline_at");


--
-- Name: blackjack_games_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "blackjack_games_user_created_idx" ON "public"."blackjack_games" USING "btree" ("user_id", "created_at");


--
-- Name: blackjack_games_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "blackjack_games_user_status_idx" ON "public"."blackjack_games" USING "btree" ("user_id", "status", "updated_at");


--
-- Name: community_moderation_post_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_moderation_post_created_idx" ON "public"."community_moderation_actions" USING "btree" ("post_id", "created_at");


--
-- Name: community_moderation_target_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_moderation_target_created_idx" ON "public"."community_moderation_actions" USING "btree" ("target_type", "target_id", "created_at");


--
-- Name: community_moderation_thread_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_moderation_thread_created_idx" ON "public"."community_moderation_actions" USING "btree" ("thread_id", "created_at");


--
-- Name: community_posts_author_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_posts_author_created_idx" ON "public"."community_posts" USING "btree" ("author_user_id", "created_at");


--
-- Name: community_posts_thread_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_posts_thread_created_idx" ON "public"."community_posts" USING "btree" ("thread_id", "created_at");


--
-- Name: community_posts_thread_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_posts_thread_status_created_idx" ON "public"."community_posts" USING "btree" ("thread_id", "status", "created_at");


--
-- Name: community_reports_post_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_reports_post_status_idx" ON "public"."community_reports" USING "btree" ("post_id", "status");


--
-- Name: community_reports_reporter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_reports_reporter_idx" ON "public"."community_reports" USING "btree" ("reporter_user_id");


--
-- Name: community_reports_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_reports_status_created_idx" ON "public"."community_reports" USING "btree" ("status", "created_at");


--
-- Name: community_threads_author_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_threads_author_created_idx" ON "public"."community_threads" USING "btree" ("author_user_id", "created_at");


--
-- Name: community_threads_status_last_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_threads_status_last_post_idx" ON "public"."community_threads" USING "btree" ("status", "last_post_at");


--
-- Name: config_change_requests_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "config_change_requests_created_at_idx" ON "public"."config_change_requests" USING "btree" ("created_at");


--
-- Name: config_change_requests_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "config_change_requests_created_by_idx" ON "public"."config_change_requests" USING "btree" ("created_by_admin_id");


--
-- Name: config_change_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "config_change_requests_status_idx" ON "public"."config_change_requests" USING "btree" ("status");


--
-- Name: config_change_requests_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "config_change_requests_target_idx" ON "public"."config_change_requests" USING "btree" ("target_type", "target_id");


--
-- Name: crypto_chain_transactions_deposit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_chain_transactions_deposit_idx" ON "public"."crypto_chain_transactions" USING "btree" ("consumed_by_deposit_id");


--
-- Name: crypto_chain_transactions_direction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_chain_transactions_direction_idx" ON "public"."crypto_chain_transactions" USING "btree" ("direction", "created_at");


--
-- Name: crypto_chain_transactions_tx_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "crypto_chain_transactions_tx_hash_unique" ON "public"."crypto_chain_transactions" USING "btree" ("tx_hash");


--
-- Name: crypto_chain_transactions_withdrawal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_chain_transactions_withdrawal_idx" ON "public"."crypto_chain_transactions" USING "btree" ("consumed_by_withdrawal_id");


--
-- Name: crypto_deposit_channels_network_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_deposit_channels_network_token_idx" ON "public"."crypto_deposit_channels" USING "btree" ("network", "token");


--
-- Name: crypto_deposit_channels_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_deposit_channels_provider_idx" ON "public"."crypto_deposit_channels" USING "btree" ("provider_id");


--
-- Name: crypto_deposit_channels_receive_address_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "crypto_deposit_channels_receive_address_unique" ON "public"."crypto_deposit_channels" USING "btree" ("receive_address");


--
-- Name: crypto_review_events_reviewer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_review_events_reviewer_idx" ON "public"."crypto_review_events" USING "btree" ("reviewer_admin_id", "created_at");


--
-- Name: crypto_review_events_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_review_events_target_idx" ON "public"."crypto_review_events" USING "btree" ("target_type", "target_id", "created_at");


--
-- Name: crypto_withdraw_addresses_address_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "crypto_withdraw_addresses_address_unique" ON "public"."crypto_withdraw_addresses" USING "btree" ("address");


--
-- Name: crypto_withdraw_addresses_network_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crypto_withdraw_addresses_network_token_idx" ON "public"."crypto_withdraw_addresses" USING "btree" ("network", "token");


--
-- Name: data_deletion_requests_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "data_deletion_requests_completed_idx" ON "public"."data_deletion_requests" USING "btree" ("completed_by_admin_id", "completed_at");


--
-- Name: data_deletion_requests_reviewed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "data_deletion_requests_reviewed_idx" ON "public"."data_deletion_requests" USING "btree" ("reviewed_by_admin_id", "reviewed_at");


--
-- Name: data_deletion_requests_status_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "data_deletion_requests_status_due_idx" ON "public"."data_deletion_requests" USING "btree" ("status", "due_at");


--
-- Name: data_deletion_requests_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "data_deletion_requests_user_created_idx" ON "public"."data_deletion_requests" USING "btree" ("user_id", "created_at");


--
-- Name: data_rights_audits_action_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "data_rights_audits_action_created_idx" ON "public"."data_rights_audits" USING "btree" ("action", "created_at");


--
-- Name: data_rights_audits_request_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "data_rights_audits_request_created_idx" ON "public"."data_rights_audits" USING "btree" ("request_id", "created_at");


--
-- Name: data_rights_audits_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "data_rights_audits_user_created_idx" ON "public"."data_rights_audits" USING "btree" ("user_id", "created_at");


--
-- Name: deferred_payouts_source_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deferred_payouts_source_reference_idx" ON "public"."deferred_payouts" USING "btree" ("source_reference_type", "source_reference_id", "created_at");


--
-- Name: deferred_payouts_trigger_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deferred_payouts_trigger_reference_idx" ON "public"."deferred_payouts" USING "btree" ("trigger_reference_type", "trigger_reference_id", "created_at");


--
-- Name: deferred_payouts_user_game_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deferred_payouts_user_game_status_idx" ON "public"."deferred_payouts" USING "btree" ("user_id", "game_key", "status", "created_at");


--
-- Name: deferred_payouts_user_mode_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deferred_payouts_user_mode_status_idx" ON "public"."deferred_payouts" USING "btree" ("user_id", "mode", "status", "created_at");


--
-- Name: deposits_channel_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deposits_channel_status_idx" ON "public"."deposits" USING "btree" ("channel_type", "status");


--
-- Name: deposits_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deposits_provider_idx" ON "public"."deposits" USING "btree" ("provider_id");


--
-- Name: deposits_submitted_tx_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "deposits_submitted_tx_hash_unique" ON "public"."deposits" USING "btree" ("submitted_tx_hash");


--
-- Name: deposits_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deposits_user_status_idx" ON "public"."deposits" USING "btree" ("user_id", "status");


--
-- Name: device_fingerprints_entrypoint_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "device_fingerprints_entrypoint_last_seen_idx" ON "public"."device_fingerprints" USING "btree" ("entrypoint", "last_seen_at");


--
-- Name: device_fingerprints_fingerprint_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "device_fingerprints_fingerprint_last_seen_idx" ON "public"."device_fingerprints" USING "btree" ("fingerprint", "last_seen_at");


--
-- Name: device_fingerprints_ip_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "device_fingerprints_ip_last_seen_idx" ON "public"."device_fingerprints" USING "btree" ("ip", "last_seen_at");


--
-- Name: device_fingerprints_user_fp_activity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "device_fingerprints_user_fp_activity_unique" ON "public"."device_fingerprints" USING "btree" ("user_id", "fingerprint", "activity_type");


--
-- Name: device_fingerprints_user_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "device_fingerprints_user_last_seen_idx" ON "public"."device_fingerprints" USING "btree" ("user_id", "last_seen_at");


--
-- Name: draw_records_prize_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "draw_records_prize_status_idx" ON "public"."draw_records" USING "btree" ("prize_id", "status");


--
-- Name: draw_records_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "draw_records_status_created_idx" ON "public"."draw_records" USING "btree" ("status", "created_at");


--
-- Name: draw_records_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "draw_records_status_idx" ON "public"."draw_records" USING "btree" ("status");


--
-- Name: draw_records_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "draw_records_user_created_idx" ON "public"."draw_records" USING "btree" ("user_id", "created_at");


--
-- Name: economy_ledger_entries_asset_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "economy_ledger_entries_asset_created_idx" ON "public"."economy_ledger_entries" USING "btree" ("asset_code", "created_at", "id");


--
-- Name: economy_ledger_entries_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "economy_ledger_entries_reference_idx" ON "public"."economy_ledger_entries" USING "btree" ("reference_type", "reference_id", "created_at");


--
-- Name: economy_ledger_entries_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "economy_ledger_entries_request_idx" ON "public"."economy_ledger_entries" USING "btree" ("request_id", "created_at");


--
-- Name: economy_ledger_entries_user_asset_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "economy_ledger_entries_user_asset_idempotency_unique" ON "public"."economy_ledger_entries" USING "btree" ("user_id", "asset_code", "idempotency_key");


--
-- Name: economy_ledger_entries_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "economy_ledger_entries_user_created_idx" ON "public"."economy_ledger_entries" USING "btree" ("user_id", "created_at", "id");


--
-- Name: experiment_assignments_experiment_subject_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "experiment_assignments_experiment_subject_unique" ON "public"."experiment_assignments" USING "btree" ("experiment_id", "subject_type", "subject_key");


--
-- Name: experiment_assignments_experiment_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "experiment_assignments_experiment_variant_idx" ON "public"."experiment_assignments" USING "btree" ("experiment_id", "variant_key");


--
-- Name: experiment_assignments_subject_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "experiment_assignments_subject_lookup_idx" ON "public"."experiment_assignments" USING "btree" ("subject_type", "subject_key");


--
-- Name: experiments_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "experiments_key_unique" ON "public"."experiments" USING "btree" ("key");


--
-- Name: experiments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "experiments_status_idx" ON "public"."experiments" USING "btree" ("status");


--
-- Name: fairness_audits_epoch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fairness_audits_epoch_idx" ON "public"."fairness_audits" USING "btree" ("epoch_seconds", "epoch");


--
-- Name: fairness_audits_epoch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fairness_audits_epoch_unique" ON "public"."fairness_audits" USING "btree" ("epoch", "epoch_seconds");


--
-- Name: fairness_audits_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fairness_audits_match_idx" ON "public"."fairness_audits" USING "btree" ("epoch_seconds", "matches", "audited_at");


--
-- Name: fairness_seeds_commit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fairness_seeds_commit_idx" ON "public"."fairness_seeds" USING "btree" ("commit_hash");


--
-- Name: fairness_seeds_epoch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fairness_seeds_epoch_unique" ON "public"."fairness_seeds" USING "btree" ("epoch", "epoch_seconds");


--
-- Name: fiat_deposit_events_deposit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fiat_deposit_events_deposit_idx" ON "public"."fiat_deposit_events" USING "btree" ("deposit_id", "created_at");


--
-- Name: fiat_deposit_events_trade_no_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fiat_deposit_events_trade_no_unique" ON "public"."fiat_deposit_events" USING "btree" ("provider_trade_no");


--
-- Name: fiat_deposit_events_webhook_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fiat_deposit_events_webhook_id_unique" ON "public"."fiat_deposit_events" USING "btree" ("webhook_id");


--
-- Name: fiat_payout_methods_currency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fiat_payout_methods_currency_idx" ON "public"."fiat_payout_methods" USING "btree" ("currency");


--
-- Name: fiat_payout_methods_provider_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fiat_payout_methods_provider_code_idx" ON "public"."fiat_payout_methods" USING "btree" ("provider_code");


--
-- Name: fiat_withdraw_events_payout_no_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fiat_withdraw_events_payout_no_unique" ON "public"."fiat_withdraw_events" USING "btree" ("provider_payout_no");


--
-- Name: fiat_withdraw_events_withdrawal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fiat_withdraw_events_withdrawal_idx" ON "public"."fiat_withdraw_events" USING "btree" ("withdrawal_id", "created_at");


--
-- Name: finance_reviews_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "finance_reviews_admin_idx" ON "public"."finance_reviews" USING "btree" ("admin_id", "created_at");


--
-- Name: finance_reviews_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "finance_reviews_order_idx" ON "public"."finance_reviews" USING "btree" ("order_type", "order_id", "created_at");


--
-- Name: freeze_records_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "freeze_records_scope_idx" ON "public"."freeze_records" USING "btree" ("scope");


--
-- Name: freeze_records_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "freeze_records_status_idx" ON "public"."freeze_records" USING "btree" ("status");


--
-- Name: freeze_records_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "freeze_records_user_idx" ON "public"."freeze_records" USING "btree" ("user_id");


--
-- Name: freeze_records_user_scope_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "freeze_records_user_scope_status_idx" ON "public"."freeze_records" USING "btree" ("user_id", "scope", "status");


--
-- Name: gift_energy_accounts_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gift_energy_accounts_updated_idx" ON "public"."gift_energy_accounts" USING "btree" ("updated_at", "user_id");


--
-- Name: gift_pack_catalog_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "gift_pack_catalog_code_unique" ON "public"."gift_pack_catalog" USING "btree" ("code");


--
-- Name: gift_pack_catalog_iap_product_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "gift_pack_catalog_iap_product_unique" ON "public"."gift_pack_catalog" USING "btree" ("iap_product_id");


--
-- Name: gift_transfers_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "gift_transfers_idempotency_unique" ON "public"."gift_transfers" USING "btree" ("idempotency_key");


--
-- Name: gift_transfers_receiver_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gift_transfers_receiver_created_idx" ON "public"."gift_transfers" USING "btree" ("receiver_user_id", "created_at");


--
-- Name: gift_transfers_sender_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gift_transfers_sender_created_idx" ON "public"."gift_transfers" USING "btree" ("sender_user_id", "created_at");


--
-- Name: gift_transfers_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "gift_transfers_status_created_idx" ON "public"."gift_transfers" USING "btree" ("status", "created_at");


--
-- Name: hand_histories_holdem_table_hand_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hand_histories_holdem_table_hand_unique_idx" ON "public"."hand_histories" USING "btree" ("round_type", "table_id", "hand_number");


--
-- Name: hand_histories_primary_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hand_histories_primary_user_created_idx" ON "public"."hand_histories" USING "btree" ("primary_user_id", "created_at");


--
-- Name: hand_histories_round_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hand_histories_round_type_created_idx" ON "public"."hand_histories" USING "btree" ("round_type", "created_at");


--
-- Name: hand_histories_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hand_histories_status_created_idx" ON "public"."hand_histories" USING "btree" ("status", "created_at");


--
-- Name: hand_histories_table_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hand_histories_table_lookup_idx" ON "public"."hand_histories" USING "btree" ("game_type", "table_id", "hand_number");


--
-- Name: holdem_table_messages_table_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_table_messages_table_created_idx" ON "public"."holdem_table_messages" USING "btree" ("table_id", "created_at", "id");


--
-- Name: holdem_table_messages_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_table_messages_user_created_idx" ON "public"."holdem_table_messages" USING "btree" ("user_id", "created_at");


--
-- Name: holdem_table_seats_disconnect_grace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_table_seats_disconnect_grace_idx" ON "public"."holdem_table_seats" USING "btree" ("disconnect_grace_expires_at");


--
-- Name: holdem_table_seats_seat_lease_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_table_seats_seat_lease_idx" ON "public"."holdem_table_seats" USING "btree" ("seat_lease_expires_at", "auto_cash_out_pending");


--
-- Name: holdem_table_seats_status_turn_deadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_table_seats_status_turn_deadline_idx" ON "public"."holdem_table_seats" USING "btree" ("status", "turn_deadline_at");


--
-- Name: holdem_table_seats_table_seat_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "holdem_table_seats_table_seat_unique" ON "public"."holdem_table_seats" USING "btree" ("table_id", "seat_index");


--
-- Name: holdem_table_seats_table_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_table_seats_table_status_idx" ON "public"."holdem_table_seats" USING "btree" ("table_id", "status", "updated_at");


--
-- Name: holdem_table_seats_user_solo_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "holdem_table_seats_user_solo_unique" ON "public"."holdem_table_seats" USING "btree" ("user_id") WHERE ("linked_group_id" IS NULL);


--
-- Name: holdem_table_seats_user_table_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "holdem_table_seats_user_table_unique" ON "public"."holdem_table_seats" USING "btree" ("user_id", "table_id");


--
-- Name: holdem_tables_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_tables_created_idx" ON "public"."holdem_tables" USING "btree" ("created_at");


--
-- Name: holdem_tables_status_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "holdem_tables_status_updated_idx" ON "public"."holdem_tables" USING "btree" ("status", "updated_at");


--
-- Name: house_transactions_house_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "house_transactions_house_created_idx" ON "public"."house_transactions" USING "btree" ("house_account_id", "created_at");


--
-- Name: house_transactions_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "house_transactions_type_created_idx" ON "public"."house_transactions" USING "btree" ("type", "created_at");


--
-- Name: iap_products_delivery_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "iap_products_delivery_type_idx" ON "public"."iap_products" USING "btree" ("delivery_type", "store_channel");


--
-- Name: iap_products_sku_channel_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "iap_products_sku_channel_unique" ON "public"."iap_products" USING "btree" ("sku", "store_channel");


--
-- Name: jurisdiction_rules_country_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "jurisdiction_rules_country_code_unique" ON "public"."jurisdiction_rules" USING "btree" ("country_code");


--
-- Name: kyc_documents_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_documents_expires_at_idx" ON "public"."kyc_documents" USING "btree" ("expires_at");


--
-- Name: kyc_documents_profile_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_documents_profile_submission_idx" ON "public"."kyc_documents" USING "btree" ("profile_id", "submission_version");


--
-- Name: kyc_documents_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_documents_user_idx" ON "public"."kyc_documents" USING "btree" ("user_id");


--
-- Name: kyc_profiles_requested_tier_submitted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_profiles_requested_tier_submitted_idx" ON "public"."kyc_profiles" USING "btree" ("requested_tier", "submitted_at");


--
-- Name: kyc_profiles_status_submitted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_profiles_status_submitted_idx" ON "public"."kyc_profiles" USING "btree" ("status", "submitted_at");


--
-- Name: kyc_profiles_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_profiles_user_idx" ON "public"."kyc_profiles" USING "btree" ("user_id");


--
-- Name: kyc_review_events_action_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_review_events_action_created_idx" ON "public"."kyc_review_events" USING "btree" ("action", "created_at");


--
-- Name: kyc_review_events_profile_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_review_events_profile_created_idx" ON "public"."kyc_review_events" USING "btree" ("profile_id", "created_at");


--
-- Name: kyc_review_events_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_review_events_user_created_idx" ON "public"."kyc_review_events" USING "btree" ("user_id", "created_at");


--
-- Name: ledger_entries_house_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_house_created_idx" ON ONLY "public"."ledger_entries" USING "btree" ("house_account_id", "created_at", "id");


--
-- Name: ledger_entries_default_house_account_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_default_house_account_id_created_at_id_idx" ON "public"."ledger_entries_default" USING "btree" ("house_account_id", "created_at", "id");


--
-- Name: ledger_entries_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_id_idx" ON ONLY "public"."ledger_entries" USING "btree" ("id");


--
-- Name: ledger_entries_default_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_default_id_idx" ON "public"."ledger_entries_default" USING "btree" ("id");


--
-- Name: ledger_entries_mutation_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_mutation_event_idx" ON ONLY "public"."ledger_entries" USING "btree" ("ledger_mutation_event_id");


--
-- Name: ledger_entries_default_ledger_mutation_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_default_ledger_mutation_event_id_idx" ON "public"."ledger_entries_default" USING "btree" ("ledger_mutation_event_id");


--
-- Name: ledger_entries_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_type_created_idx" ON ONLY "public"."ledger_entries" USING "btree" ("type", "created_at", "id");


--
-- Name: ledger_entries_default_type_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_default_type_created_at_id_idx" ON "public"."ledger_entries_default" USING "btree" ("type", "created_at", "id");


--
-- Name: ledger_entries_type_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_type_user_idx" ON ONLY "public"."ledger_entries" USING "btree" ("type", "user_id");


--
-- Name: ledger_entries_default_type_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_default_type_user_id_idx" ON "public"."ledger_entries_default" USING "btree" ("type", "user_id");


--
-- Name: ledger_entries_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_user_created_idx" ON ONLY "public"."ledger_entries" USING "btree" ("user_id", "created_at", "id");


--
-- Name: ledger_entries_default_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_default_user_id_created_at_id_idx" ON "public"."ledger_entries_default" USING "btree" ("user_id", "created_at", "id");


--
-- Name: ledger_entries_p202603_house_account_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202603_house_account_id_created_at_id_idx" ON "public"."ledger_entries_p202603" USING "btree" ("house_account_id", "created_at", "id");


--
-- Name: ledger_entries_p202603_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202603_id_idx" ON "public"."ledger_entries_p202603" USING "btree" ("id");


--
-- Name: ledger_entries_p202603_ledger_mutation_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202603_ledger_mutation_event_id_idx" ON "public"."ledger_entries_p202603" USING "btree" ("ledger_mutation_event_id");


--
-- Name: ledger_entries_p202603_type_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202603_type_created_at_id_idx" ON "public"."ledger_entries_p202603" USING "btree" ("type", "created_at", "id");


--
-- Name: ledger_entries_p202603_type_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202603_type_user_id_idx" ON "public"."ledger_entries_p202603" USING "btree" ("type", "user_id");


--
-- Name: ledger_entries_p202603_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202603_user_id_created_at_id_idx" ON "public"."ledger_entries_p202603" USING "btree" ("user_id", "created_at", "id");


--
-- Name: ledger_entries_p202604_house_account_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202604_house_account_id_created_at_id_idx" ON "public"."ledger_entries_p202604" USING "btree" ("house_account_id", "created_at", "id");


--
-- Name: ledger_entries_p202604_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202604_id_idx" ON "public"."ledger_entries_p202604" USING "btree" ("id");


--
-- Name: ledger_entries_p202604_ledger_mutation_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202604_ledger_mutation_event_id_idx" ON "public"."ledger_entries_p202604" USING "btree" ("ledger_mutation_event_id");


--
-- Name: ledger_entries_p202604_type_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202604_type_created_at_id_idx" ON "public"."ledger_entries_p202604" USING "btree" ("type", "created_at", "id");


--
-- Name: ledger_entries_p202604_type_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202604_type_user_id_idx" ON "public"."ledger_entries_p202604" USING "btree" ("type", "user_id");


--
-- Name: ledger_entries_p202604_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202604_user_id_created_at_id_idx" ON "public"."ledger_entries_p202604" USING "btree" ("user_id", "created_at", "id");


--
-- Name: ledger_entries_p202605_house_account_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202605_house_account_id_created_at_id_idx" ON "public"."ledger_entries_p202605" USING "btree" ("house_account_id", "created_at", "id");


--
-- Name: ledger_entries_p202605_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202605_id_idx" ON "public"."ledger_entries_p202605" USING "btree" ("id");


--
-- Name: ledger_entries_p202605_ledger_mutation_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202605_ledger_mutation_event_id_idx" ON "public"."ledger_entries_p202605" USING "btree" ("ledger_mutation_event_id");


--
-- Name: ledger_entries_p202605_type_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202605_type_created_at_id_idx" ON "public"."ledger_entries_p202605" USING "btree" ("type", "created_at", "id");


--
-- Name: ledger_entries_p202605_type_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202605_type_user_id_idx" ON "public"."ledger_entries_p202605" USING "btree" ("type", "user_id");


--
-- Name: ledger_entries_p202605_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202605_user_id_created_at_id_idx" ON "public"."ledger_entries_p202605" USING "btree" ("user_id", "created_at", "id");


--
-- Name: ledger_entries_p202606_house_account_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202606_house_account_id_created_at_id_idx" ON "public"."ledger_entries_p202606" USING "btree" ("house_account_id", "created_at", "id");


--
-- Name: ledger_entries_p202606_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202606_id_idx" ON "public"."ledger_entries_p202606" USING "btree" ("id");


--
-- Name: ledger_entries_p202606_ledger_mutation_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202606_ledger_mutation_event_id_idx" ON "public"."ledger_entries_p202606" USING "btree" ("ledger_mutation_event_id");


--
-- Name: ledger_entries_p202606_type_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202606_type_created_at_id_idx" ON "public"."ledger_entries_p202606" USING "btree" ("type", "created_at", "id");


--
-- Name: ledger_entries_p202606_type_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202606_type_user_id_idx" ON "public"."ledger_entries_p202606" USING "btree" ("type", "user_id");


--
-- Name: ledger_entries_p202606_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202606_user_id_created_at_id_idx" ON "public"."ledger_entries_p202606" USING "btree" ("user_id", "created_at", "id");


--
-- Name: ledger_entries_p202607_house_account_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202607_house_account_id_created_at_id_idx" ON "public"."ledger_entries_p202607" USING "btree" ("house_account_id", "created_at", "id");


--
-- Name: ledger_entries_p202607_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202607_id_idx" ON "public"."ledger_entries_p202607" USING "btree" ("id");


--
-- Name: ledger_entries_p202607_ledger_mutation_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202607_ledger_mutation_event_id_idx" ON "public"."ledger_entries_p202607" USING "btree" ("ledger_mutation_event_id");


--
-- Name: ledger_entries_p202607_type_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202607_type_created_at_id_idx" ON "public"."ledger_entries_p202607" USING "btree" ("type", "created_at", "id");


--
-- Name: ledger_entries_p202607_type_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202607_type_user_id_idx" ON "public"."ledger_entries_p202607" USING "btree" ("type", "user_id");


--
-- Name: ledger_entries_p202607_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_entries_p202607_user_id_created_at_id_idx" ON "public"."ledger_entries_p202607" USING "btree" ("user_id", "created_at", "id");


--
-- Name: ledger_mutation_events_business_event_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ledger_mutation_events_business_event_unique" ON "public"."ledger_mutation_events" USING "btree" ("business_event_id");


--
-- Name: ledger_mutation_events_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_mutation_events_order_idx" ON "public"."ledger_mutation_events" USING "btree" ("order_type", "order_id", "created_at");


--
-- Name: ledger_mutation_events_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_mutation_events_source_idx" ON "public"."ledger_mutation_events" USING "btree" ("source_type", "source_event_key");


--
-- Name: legal_document_acceptances_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "legal_document_acceptances_document_idx" ON "public"."legal_document_acceptances" USING "btree" ("document_id", "accepted_at");


--
-- Name: legal_document_acceptances_user_document_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "legal_document_acceptances_user_document_unique" ON "public"."legal_document_acceptances" USING "btree" ("user_id", "document_id");


--
-- Name: legal_document_acceptances_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "legal_document_acceptances_user_idx" ON "public"."legal_document_acceptances" USING "btree" ("user_id", "accepted_at");


--
-- Name: legal_document_publications_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "legal_document_publications_active_idx" ON "public"."legal_document_publications" USING "btree" ("document_key", "locale", "is_active", "activated_at");


--
-- Name: legal_document_publications_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "legal_document_publications_document_idx" ON "public"."legal_document_publications" USING "btree" ("document_id", "activated_at");


--
-- Name: legal_documents_key_locale_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "legal_documents_key_locale_version_idx" ON "public"."legal_documents" USING "btree" ("document_key", "locale", "version");


--
-- Name: legal_documents_key_locale_version_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "legal_documents_key_locale_version_unique" ON "public"."legal_documents" USING "btree" ("document_key", "locale", "version");


--
-- Name: missions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "missions_active_idx" ON "public"."missions" USING "btree" ("is_active");


--
-- Name: missions_single_daily_checkin_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "missions_single_daily_checkin_unique" ON "public"."missions" USING "btree" ("type") WHERE (("type")::"text" = 'daily_checkin'::"text");


--
-- Name: missions_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "missions_type_idx" ON "public"."missions" USING "btree" ("type");


--
-- Name: notification_deliveries_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_created_idx" ON "public"."notification_deliveries" USING "btree" ("created_at");


--
-- Name: notification_deliveries_recipient_kind_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_recipient_kind_created_idx" ON "public"."notification_deliveries" USING "btree" ("recipient_key", "kind", "created_at");


--
-- Name: notification_deliveries_status_next_attempt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_deliveries_status_next_attempt_idx" ON "public"."notification_deliveries" USING "btree" ("status", "next_attempt_at");


--
-- Name: notification_delivery_attempts_delivery_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_delivery_attempts_delivery_created_idx" ON "public"."notification_delivery_attempts" USING "btree" ("delivery_id", "created_at");


--
-- Name: notification_delivery_attempts_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_delivery_attempts_status_created_idx" ON "public"."notification_delivery_attempts" USING "btree" ("status", "created_at");


--
-- Name: notification_preferences_user_kind_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_preferences_user_kind_channel_idx" ON "public"."notification_preferences" USING "btree" ("user_id", "kind", "channel");


--
-- Name: notification_preferences_user_kind_channel_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "notification_preferences_user_kind_channel_unique" ON "public"."notification_preferences" USING "btree" ("user_id", "kind", "channel");


--
-- Name: notification_push_devices_token_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "notification_push_devices_token_unique" ON "public"."notification_push_devices" USING "btree" ("token");


--
-- Name: notification_push_devices_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_push_devices_user_active_idx" ON "public"."notification_push_devices" USING "btree" ("user_id", "active", "updated_at");


--
-- Name: notification_records_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_records_user_created_idx" ON "public"."notification_records" USING "btree" ("user_id", "created_at");


--
-- Name: notification_records_user_read_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notification_records_user_read_created_idx" ON "public"."notification_records" USING "btree" ("user_id", "read_at", "created_at");


--
-- Name: payment_outbound_requests_order_action_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_outbound_requests_order_action_unique" ON "public"."payment_outbound_requests" USING "btree" ("order_type", "order_id", "action");


--
-- Name: payment_outbound_requests_provider_idem_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_outbound_requests_provider_idem_unique" ON "public"."payment_outbound_requests" USING "btree" ("provider_id", "action", "idempotency_key");


--
-- Name: payment_outbound_requests_retry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_outbound_requests_retry_idx" ON "public"."payment_outbound_requests" USING "btree" ("send_status", "next_retry_at", "created_at");


--
-- Name: payment_provider_events_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_provider_events_order_idx" ON "public"."payment_provider_events" USING "btree" ("order_type", "order_id", "created_at");


--
-- Name: payment_provider_events_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_provider_events_provider_idx" ON "public"."payment_provider_events" USING "btree" ("provider_id", "created_at");


--
-- Name: payment_providers_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_providers_name_unique" ON "public"."payment_providers" USING "btree" ("name");


--
-- Name: payment_reconciliation_issues_fingerprint_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_reconciliation_issues_fingerprint_unique" ON "public"."payment_reconciliation_issues" USING "btree" ("fingerprint");


--
-- Name: payment_reconciliation_issues_manual_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_reconciliation_issues_manual_queue_idx" ON "public"."payment_reconciliation_issues" USING "btree" ("requires_manual_review", "status", "last_detected_at");


--
-- Name: payment_reconciliation_issues_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_reconciliation_issues_order_idx" ON "public"."payment_reconciliation_issues" USING "btree" ("order_type", "order_id", "last_detected_at");


--
-- Name: payment_reconciliation_issues_provider_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_reconciliation_issues_provider_status_idx" ON "public"."payment_reconciliation_issues" USING "btree" ("provider_id", "status", "last_detected_at");


--
-- Name: payment_reconciliation_runs_provider_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_reconciliation_runs_provider_created_idx" ON "public"."payment_reconciliation_runs" USING "btree" ("provider_id", "created_at");


--
-- Name: payment_reconciliation_runs_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_reconciliation_runs_status_created_idx" ON "public"."payment_reconciliation_runs" USING "btree" ("status", "created_at");


--
-- Name: payment_settlement_events_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_settlement_events_order_idx" ON "public"."payment_settlement_events" USING "btree" ("order_type", "order_id", "created_at");


--
-- Name: payment_settlement_events_reference_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_settlement_events_reference_unique" ON "public"."payment_settlement_events" USING "btree" ("settlement_reference");


--
-- Name: payment_webhook_events_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_webhook_events_order_idx" ON "public"."payment_webhook_events" USING "btree" ("order_type", "order_id", "received_at");


--
-- Name: payment_webhook_events_processing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_webhook_events_processing_idx" ON "public"."payment_webhook_events" USING "btree" ("processing_status", "last_received_at");


--
-- Name: payment_webhook_events_provider_dedupe_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_webhook_events_provider_dedupe_unique" ON "public"."payment_webhook_events" USING "btree" ("provider", "dedupe_key");


--
-- Name: payment_webhook_events_provider_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_webhook_events_provider_received_idx" ON "public"."payment_webhook_events" USING "btree" ("provider", "received_at");


--
-- Name: payment_webhook_events_provider_trade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_webhook_events_provider_trade_idx" ON "public"."payment_webhook_events" USING "btree" ("provider", "provider_trade_id", "event_type");


--
-- Name: payout_methods_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payout_methods_user_id_idx" ON "public"."payout_methods" USING "btree" ("user_id");


--
-- Name: payout_methods_user_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payout_methods_user_type_idx" ON "public"."payout_methods" USING "btree" ("user_id", "method_type");


--
-- Name: play_mode_sessions_parent_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "play_mode_sessions_parent_session_idx" ON "public"."play_mode_sessions" USING "btree" ("parent_session_id", "execution_index", "started_at");


--
-- Name: play_mode_sessions_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "play_mode_sessions_reference_idx" ON "public"."play_mode_sessions" USING "btree" ("reference_type", "reference_id", "started_at");


--
-- Name: play_mode_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "play_mode_sessions_status_idx" ON "public"."play_mode_sessions" USING "btree" ("status", "game_key", "updated_at");


--
-- Name: play_mode_sessions_user_game_mode_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "play_mode_sessions_user_game_mode_started_idx" ON "public"."play_mode_sessions" USING "btree" ("user_id", "game_key", "mode", "started_at");


--
-- Name: play_mode_sessions_user_game_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "play_mode_sessions_user_game_started_idx" ON "public"."play_mode_sessions" USING "btree" ("user_id", "game_key", "started_at");


--
-- Name: prediction_market_appeals_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "prediction_market_appeals_key_unique" ON "public"."prediction_market_appeals" USING "btree" ("appeal_key");


--
-- Name: prediction_market_appeals_market_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_market_appeals_market_status_idx" ON "public"."prediction_market_appeals" USING "btree" ("market_id", "status", "last_detected_at");


--
-- Name: prediction_market_appeals_reason_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_market_appeals_reason_status_idx" ON "public"."prediction_market_appeals" USING "btree" ("reason", "status", "last_detected_at");


--
-- Name: prediction_market_oracles_market_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "prediction_market_oracles_market_unique" ON "public"."prediction_market_oracles" USING "btree" ("market_id");


--
-- Name: prediction_market_oracles_provider_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_market_oracles_provider_status_idx" ON "public"."prediction_market_oracles" USING "btree" ("provider", "status", "last_checked_at");


--
-- Name: prediction_markets_round_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_markets_round_status_idx" ON "public"."prediction_markets" USING "btree" ("round_key", "status", "created_at");


--
-- Name: prediction_markets_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "prediction_markets_slug_unique" ON "public"."prediction_markets" USING "btree" ("slug");


--
-- Name: prediction_markets_status_locks_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_markets_status_locks_idx" ON "public"."prediction_markets" USING "btree" ("status", "locks_at");


--
-- Name: prediction_positions_market_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_positions_market_created_idx" ON "public"."prediction_positions" USING "btree" ("market_id", "created_at");


--
-- Name: prediction_positions_market_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_positions_market_outcome_idx" ON "public"."prediction_positions" USING "btree" ("market_id", "outcome_key", "created_at");


--
-- Name: prediction_positions_market_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_positions_market_status_idx" ON "public"."prediction_positions" USING "btree" ("market_id", "status", "created_at");


--
-- Name: prediction_positions_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prediction_positions_user_created_idx" ON "public"."prediction_positions" USING "btree" ("user_id", "created_at");


--
-- Name: prizes_active_stock_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prizes_active_stock_idx" ON "public"."prizes" USING "btree" ("is_active", "stock");


--
-- Name: prizes_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prizes_deleted_at_idx" ON "public"."prizes" USING "btree" ("deleted_at");


--
-- Name: prizes_pool_threshold_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prizes_pool_threshold_idx" ON "public"."prizes" USING "btree" ("pool_threshold");


--
-- Name: prizes_user_pool_threshold_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "prizes_user_pool_threshold_idx" ON "public"."prizes" USING "btree" ("user_pool_threshold");


--
-- Name: quick_eight_rounds_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "quick_eight_rounds_status_created_idx" ON "public"."quick_eight_rounds" USING "btree" ("status", "created_at");


--
-- Name: quick_eight_rounds_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "quick_eight_rounds_user_created_idx" ON "public"."quick_eight_rounds" USING "btree" ("user_id", "created_at");


--
-- Name: reconciliation_alerts_fingerprint_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "reconciliation_alerts_fingerprint_unique" ON "public"."reconciliation_alerts" USING "btree" ("fingerprint");


--
-- Name: reconciliation_alerts_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reconciliation_alerts_type_status_idx" ON "public"."reconciliation_alerts" USING "btree" ("alert_type", "status", "last_detected_at");


--
-- Name: reconciliation_alerts_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reconciliation_alerts_user_status_idx" ON "public"."reconciliation_alerts" USING "btree" ("user_id", "status", "last_detected_at");


--
-- Name: referrals_referred_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "referrals_referred_id_unique" ON "public"."referrals" USING "btree" ("referred_id");


--
-- Name: referrals_referred_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "referrals_referred_status_idx" ON "public"."referrals" USING "btree" ("referred_id", "status");


--
-- Name: referrals_referrer_reward_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "referrals_referrer_reward_status_idx" ON "public"."referrals" USING "btree" ("referrer_id", "reward_id", "status");


--
-- Name: referrals_reward_status_qualified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "referrals_reward_status_qualified_idx" ON "public"."referrals" USING "btree" ("reward_id", "status", "qualified_at");


--
-- Name: risk_table_interaction_events_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "risk_table_interaction_events_recorded_at_idx" ON "public"."risk_table_interaction_events" USING "btree" ("recorded_at");


--
-- Name: risk_table_interaction_events_table_recorded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "risk_table_interaction_events_table_recorded_idx" ON "public"."risk_table_interaction_events" USING "btree" ("table_id", "recorded_at");


--
-- Name: risk_table_interaction_pairs_interaction_count_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "risk_table_interaction_pairs_interaction_count_idx" ON "public"."risk_table_interaction_pairs" USING "btree" ("interaction_count", "last_seen_at");


--
-- Name: risk_table_interaction_pairs_table_suspicion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "risk_table_interaction_pairs_table_suspicion_idx" ON "public"."risk_table_interaction_pairs" USING "btree" ("table_id", "suspicion_score");


--
-- Name: risk_table_interaction_pairs_table_users_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "risk_table_interaction_pairs_table_users_unique" ON "public"."risk_table_interaction_pairs" USING "btree" ("table_id", "user_a_id", "user_b_id");


--
-- Name: risk_table_interaction_pairs_user_a_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "risk_table_interaction_pairs_user_a_last_seen_idx" ON "public"."risk_table_interaction_pairs" USING "btree" ("user_a_id", "last_seen_at");


--
-- Name: risk_table_interaction_pairs_user_b_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "risk_table_interaction_pairs_user_b_last_seen_idx" ON "public"."risk_table_interaction_pairs" USING "btree" ("user_b_id", "last_seen_at");


--
-- Name: round_events_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_id_idx" ON ONLY "public"."round_events" USING "btree" ("id");


--
-- Name: round_events_default_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_default_id_idx" ON "public"."round_events_default" USING "btree" ("id");


--
-- Name: round_events_round_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_round_lookup_idx" ON ONLY "public"."round_events" USING "btree" ("round_type", "round_entity_id", "event_index");


--
-- Name: round_events_default_round_type_round_entity_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_default_round_type_round_entity_id_event_index_idx" ON "public"."round_events_default" USING "btree" ("round_type", "round_entity_id", "event_index");


--
-- Name: round_events_table_phase_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_table_phase_created_idx" ON ONLY "public"."round_events" USING "btree" ("table_id", "phase", "created_at");


--
-- Name: round_events_default_table_id_phase_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_default_table_id_phase_created_at_idx" ON "public"."round_events_default" USING "btree" ("table_id", "phase", "created_at");


--
-- Name: round_events_table_round_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_table_round_lookup_idx" ON ONLY "public"."round_events" USING "btree" ("table_round_id", "event_index");


--
-- Name: round_events_default_table_round_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_default_table_round_id_event_index_idx" ON "public"."round_events_default" USING "btree" ("table_round_id", "event_index");


--
-- Name: round_events_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_user_created_idx" ON ONLY "public"."round_events" USING "btree" ("user_id", "created_at", "id");


--
-- Name: round_events_default_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_default_user_id_created_at_id_idx" ON "public"."round_events_default" USING "btree" ("user_id", "created_at", "id");


--
-- Name: round_events_p202603_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202603_id_idx" ON "public"."round_events_p202603" USING "btree" ("id");


--
-- Name: round_events_p202603_round_type_round_entity_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202603_round_type_round_entity_id_event_index_idx" ON "public"."round_events_p202603" USING "btree" ("round_type", "round_entity_id", "event_index");


--
-- Name: round_events_p202603_table_id_phase_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202603_table_id_phase_created_at_idx" ON "public"."round_events_p202603" USING "btree" ("table_id", "phase", "created_at");


--
-- Name: round_events_p202603_table_round_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202603_table_round_id_event_index_idx" ON "public"."round_events_p202603" USING "btree" ("table_round_id", "event_index");


--
-- Name: round_events_p202603_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202603_user_id_created_at_id_idx" ON "public"."round_events_p202603" USING "btree" ("user_id", "created_at", "id");


--
-- Name: round_events_p202604_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202604_id_idx" ON "public"."round_events_p202604" USING "btree" ("id");


--
-- Name: round_events_p202604_round_type_round_entity_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202604_round_type_round_entity_id_event_index_idx" ON "public"."round_events_p202604" USING "btree" ("round_type", "round_entity_id", "event_index");


--
-- Name: round_events_p202604_table_id_phase_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202604_table_id_phase_created_at_idx" ON "public"."round_events_p202604" USING "btree" ("table_id", "phase", "created_at");


--
-- Name: round_events_p202604_table_round_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202604_table_round_id_event_index_idx" ON "public"."round_events_p202604" USING "btree" ("table_round_id", "event_index");


--
-- Name: round_events_p202604_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202604_user_id_created_at_id_idx" ON "public"."round_events_p202604" USING "btree" ("user_id", "created_at", "id");


--
-- Name: round_events_p202605_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202605_id_idx" ON "public"."round_events_p202605" USING "btree" ("id");


--
-- Name: round_events_p202605_round_type_round_entity_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202605_round_type_round_entity_id_event_index_idx" ON "public"."round_events_p202605" USING "btree" ("round_type", "round_entity_id", "event_index");


--
-- Name: round_events_p202605_table_id_phase_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202605_table_id_phase_created_at_idx" ON "public"."round_events_p202605" USING "btree" ("table_id", "phase", "created_at");


--
-- Name: round_events_p202605_table_round_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202605_table_round_id_event_index_idx" ON "public"."round_events_p202605" USING "btree" ("table_round_id", "event_index");


--
-- Name: round_events_p202605_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202605_user_id_created_at_id_idx" ON "public"."round_events_p202605" USING "btree" ("user_id", "created_at", "id");


--
-- Name: round_events_p202606_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202606_id_idx" ON "public"."round_events_p202606" USING "btree" ("id");


--
-- Name: round_events_p202606_round_type_round_entity_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202606_round_type_round_entity_id_event_index_idx" ON "public"."round_events_p202606" USING "btree" ("round_type", "round_entity_id", "event_index");


--
-- Name: round_events_p202606_table_id_phase_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202606_table_id_phase_created_at_idx" ON "public"."round_events_p202606" USING "btree" ("table_id", "phase", "created_at");


--
-- Name: round_events_p202606_table_round_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202606_table_round_id_event_index_idx" ON "public"."round_events_p202606" USING "btree" ("table_round_id", "event_index");


--
-- Name: round_events_p202606_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202606_user_id_created_at_id_idx" ON "public"."round_events_p202606" USING "btree" ("user_id", "created_at", "id");


--
-- Name: round_events_p202607_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202607_id_idx" ON "public"."round_events_p202607" USING "btree" ("id");


--
-- Name: round_events_p202607_round_type_round_entity_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202607_round_type_round_entity_id_event_index_idx" ON "public"."round_events_p202607" USING "btree" ("round_type", "round_entity_id", "event_index");


--
-- Name: round_events_p202607_table_id_phase_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202607_table_id_phase_created_at_idx" ON "public"."round_events_p202607" USING "btree" ("table_id", "phase", "created_at");


--
-- Name: round_events_p202607_table_round_id_event_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202607_table_round_id_event_index_idx" ON "public"."round_events_p202607" USING "btree" ("table_round_id", "event_index");


--
-- Name: round_events_p202607_user_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "round_events_p202607_user_id_created_at_id_idx" ON "public"."round_events_p202607" USING "btree" ("user_id", "created_at", "id");


--
-- Name: rounds_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "rounds_status_created_idx" ON "public"."rounds" USING "btree" ("status", "created_at");


--
-- Name: rounds_table_round_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "rounds_table_round_unique" ON "public"."rounds" USING "btree" ("table_id", "round_number");


--
-- Name: rounds_table_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "rounds_table_status_created_idx" ON "public"."rounds" USING "btree" ("table_id", "status", "created_at");


--
-- Name: saas_agent_group_corr_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_agent_group_corr_agent_created_idx" ON "public"."saas_agent_group_correlations" USING "btree" ("agent_id", "created_at");


--
-- Name: saas_agent_group_corr_draw_record_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_agent_group_corr_draw_record_unique" ON "public"."saas_agent_group_correlations" USING "btree" ("draw_record_id");


--
-- Name: saas_agent_group_corr_project_group_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_agent_group_corr_project_group_created_idx" ON "public"."saas_agent_group_correlations" USING "btree" ("project_id", "group_id", "created_at");


--
-- Name: saas_agents_fingerprint_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_agents_fingerprint_idx" ON "public"."saas_agents" USING "btree" ("project_id", "fingerprint");


--
-- Name: saas_agents_project_external_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_agents_project_external_unique" ON "public"."saas_agents" USING "btree" ("project_id", "external_id");


--
-- Name: saas_agents_project_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_agents_project_group_idx" ON "public"."saas_agents" USING "btree" ("project_id", "group_id");


--
-- Name: saas_agents_project_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_agents_project_status_idx" ON "public"."saas_agents" USING "btree" ("project_id", "status");


--
-- Name: saas_api_keys_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_api_keys_expires_idx" ON "public"."saas_api_keys" USING "btree" ("expires_at");


--
-- Name: saas_api_keys_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_api_keys_hash_unique" ON "public"."saas_api_keys" USING "btree" ("key_hash");


--
-- Name: saas_api_keys_prefix_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_api_keys_prefix_unique" ON "public"."saas_api_keys" USING "btree" ("key_prefix");


--
-- Name: saas_api_keys_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_api_keys_project_idx" ON "public"."saas_api_keys" USING "btree" ("project_id");


--
-- Name: saas_api_keys_rotated_from_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_api_keys_rotated_from_unique" ON "public"."saas_api_keys" USING "btree" ("rotated_from_api_key_id");


--
-- Name: saas_api_keys_rotated_to_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_api_keys_rotated_to_unique" ON "public"."saas_api_keys" USING "btree" ("rotated_to_api_key_id");


--
-- Name: saas_billing_account_versions_account_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_account_versions_account_effective_idx" ON "public"."saas_billing_account_versions" USING "btree" ("billing_account_id", "effective_at");


--
-- Name: saas_billing_account_versions_tenant_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_account_versions_tenant_effective_idx" ON "public"."saas_billing_account_versions" USING "btree" ("tenant_id", "effective_at");


--
-- Name: saas_billing_accounts_tenant_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_billing_accounts_tenant_unique" ON "public"."saas_billing_accounts" USING "btree" ("tenant_id");


--
-- Name: saas_billing_disputes_billing_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_disputes_billing_run_idx" ON "public"."saas_billing_disputes" USING "btree" ("billing_run_id", "created_at");


--
-- Name: saas_billing_disputes_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_disputes_status_created_idx" ON "public"."saas_billing_disputes" USING "btree" ("status", "created_at");


--
-- Name: saas_billing_disputes_stripe_credit_note_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_billing_disputes_stripe_credit_note_unique" ON "public"."saas_billing_disputes" USING "btree" ("stripe_credit_note_id");


--
-- Name: saas_billing_disputes_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_disputes_tenant_created_idx" ON "public"."saas_billing_disputes" USING "btree" ("tenant_id", "created_at");


--
-- Name: saas_billing_ledger_entries_billing_run_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_ledger_entries_billing_run_created_idx" ON "public"."saas_billing_ledger_entries" USING "btree" ("billing_run_id", "created_at");


--
-- Name: saas_billing_ledger_entries_dispute_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_ledger_entries_dispute_created_idx" ON "public"."saas_billing_ledger_entries" USING "btree" ("dispute_id", "created_at");


--
-- Name: saas_billing_ledger_entries_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_ledger_entries_tenant_created_idx" ON "public"."saas_billing_ledger_entries" USING "btree" ("tenant_id", "created_at");


--
-- Name: saas_billing_runs_external_sync_status_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_runs_external_sync_status_updated_idx" ON "public"."saas_billing_runs" USING "btree" ("external_sync_status", "updated_at");


--
-- Name: saas_billing_runs_stripe_invoice_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_billing_runs_stripe_invoice_unique" ON "public"."saas_billing_runs" USING "btree" ("stripe_invoice_id");


--
-- Name: saas_billing_runs_tenant_period_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_billing_runs_tenant_period_unique" ON "public"."saas_billing_runs" USING "btree" ("tenant_id", "period_start", "period_end");


--
-- Name: saas_billing_runs_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_runs_tenant_status_idx" ON "public"."saas_billing_runs" USING "btree" ("tenant_id", "status", "period_end");


--
-- Name: saas_billing_top_ups_stripe_balance_transaction_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_billing_top_ups_stripe_balance_transaction_unique" ON "public"."saas_billing_top_ups" USING "btree" ("stripe_balance_transaction_id");


--
-- Name: saas_billing_top_ups_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_billing_top_ups_tenant_created_idx" ON "public"."saas_billing_top_ups" USING "btree" ("tenant_id", "created_at");


--
-- Name: saas_distribution_snapshots_project_captured_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_distribution_snapshots_project_captured_idx" ON "public"."saas_distribution_snapshots" USING "btree" ("project_id", "captured_at");


--
-- Name: saas_distribution_snapshots_project_window_captured_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_distribution_snapshots_project_window_captured_unique" ON "public"."saas_distribution_snapshots" USING "btree" ("project_id", "window_key", "captured_at");


--
-- Name: saas_distribution_snapshots_window_captured_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_distribution_snapshots_window_captured_idx" ON "public"."saas_distribution_snapshots" USING "btree" ("window_key", "captured_at");


--
-- Name: saas_draw_records_project_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_agent_created_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "agent_id", "created_at");


--
-- Name: saas_draw_records_project_env_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_env_agent_created_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "environment", "agent_id", "created_at");


--
-- Name: saas_draw_records_project_env_group_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_env_group_created_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "environment", "group_id", "created_at");


--
-- Name: saas_draw_records_project_group_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_group_created_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "group_id", "created_at");


--
-- Name: saas_draw_records_project_player_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_player_created_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "player_id", "created_at");


--
-- Name: saas_draw_records_project_player_env_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_player_env_created_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "player_id", "environment", "created_at");


--
-- Name: saas_draw_records_project_player_env_idempotency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_player_env_idempotency_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "player_id", "environment", ((COALESCE("metadata", '{}'::"jsonb") #>> '{rewardRequest,idempotencyKey}'::"text"[])), "id") WHERE ((COALESCE("metadata", '{}'::"jsonb") #>> '{rewardRequest,idempotencyKey}'::"text"[]) IS NOT NULL);


--
-- Name: saas_draw_records_project_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_draw_records_project_status_created_idx" ON "public"."saas_draw_records" USING "btree" ("project_id", "status", "created_at");


--
-- Name: saas_fairness_seeds_project_commit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_fairness_seeds_project_commit_idx" ON "public"."saas_fairness_seeds" USING "btree" ("project_id", "commit_hash");


--
-- Name: saas_fairness_seeds_project_epoch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_fairness_seeds_project_epoch_unique" ON "public"."saas_fairness_seeds" USING "btree" ("project_id", "epoch", "epoch_seconds");


--
-- Name: saas_ledger_entries_entry_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_ledger_entries_entry_type_idx" ON "public"."saas_ledger_entries" USING "btree" ("project_id", "entry_type", "created_at");


--
-- Name: saas_ledger_entries_project_player_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_ledger_entries_project_player_created_idx" ON "public"."saas_ledger_entries" USING "btree" ("project_id", "player_id", "created_at");


--
-- Name: saas_outbound_webhook_deliveries_project_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_outbound_webhook_deliveries_project_created_idx" ON "public"."saas_outbound_webhook_deliveries" USING "btree" ("project_id", "created_at");


--
-- Name: saas_outbound_webhook_deliveries_status_next_attempt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_outbound_webhook_deliveries_status_next_attempt_idx" ON "public"."saas_outbound_webhook_deliveries" USING "btree" ("status", "next_attempt_at");


--
-- Name: saas_outbound_webhook_deliveries_webhook_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_outbound_webhook_deliveries_webhook_created_idx" ON "public"."saas_outbound_webhook_deliveries" USING "btree" ("webhook_id", "created_at");


--
-- Name: saas_outbound_webhook_deliveries_webhook_event_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_outbound_webhook_deliveries_webhook_event_unique" ON "public"."saas_outbound_webhook_deliveries" USING "btree" ("webhook_id", "event_id");


--
-- Name: saas_outbound_webhooks_project_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_outbound_webhooks_project_active_idx" ON "public"."saas_outbound_webhooks" USING "btree" ("project_id", "is_active");


--
-- Name: saas_outbound_webhooks_project_url_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_outbound_webhooks_project_url_unique" ON "public"."saas_outbound_webhooks" USING "btree" ("project_id", "url");


--
-- Name: saas_players_project_external_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_players_project_external_unique" ON "public"."saas_players" USING "btree" ("project_id", "external_player_id");


--
-- Name: saas_players_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_players_project_idx" ON "public"."saas_players" USING "btree" ("project_id");


--
-- Name: saas_project_prizes_active_stock_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_project_prizes_active_stock_idx" ON "public"."saas_project_prizes" USING "btree" ("project_id", "is_active", "stock");


--
-- Name: saas_project_prizes_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_project_prizes_deleted_idx" ON "public"."saas_project_prizes" USING "btree" ("deleted_at");


--
-- Name: saas_project_prizes_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_project_prizes_project_idx" ON "public"."saas_project_prizes" USING "btree" ("project_id");


--
-- Name: saas_projects_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_projects_status_idx" ON "public"."saas_projects" USING "btree" ("status");


--
-- Name: saas_projects_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_projects_tenant_idx" ON "public"."saas_projects" USING "btree" ("tenant_id", "environment");


--
-- Name: saas_projects_tenant_slug_env_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_projects_tenant_slug_env_unique" ON "public"."saas_projects" USING "btree" ("tenant_id", "slug", "environment");


--
-- Name: saas_report_exports_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_report_exports_status_created_idx" ON "public"."saas_report_exports" USING "btree" ("status", "created_at");


--
-- Name: saas_report_exports_status_locked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_report_exports_status_locked_idx" ON "public"."saas_report_exports" USING "btree" ("status", "locked_at");


--
-- Name: saas_report_exports_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_report_exports_tenant_created_idx" ON "public"."saas_report_exports" USING "btree" ("tenant_id", "created_at");


--
-- Name: saas_report_exports_tenant_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_report_exports_tenant_status_created_idx" ON "public"."saas_report_exports" USING "btree" ("tenant_id", "status", "created_at");


--
-- Name: saas_reward_envelopes_project_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_reward_envelopes_project_window_idx" ON "public"."saas_reward_envelopes" USING "btree" ("project_id", "window");


--
-- Name: saas_reward_envelopes_project_window_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_reward_envelopes_project_window_unique" ON "public"."saas_reward_envelopes" USING "btree" ("tenant_id", "project_id", "window") WHERE ("project_id" IS NOT NULL);


--
-- Name: saas_reward_envelopes_tenant_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_reward_envelopes_tenant_project_idx" ON "public"."saas_reward_envelopes" USING "btree" ("tenant_id", "project_id");


--
-- Name: saas_reward_envelopes_tenant_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_reward_envelopes_tenant_window_idx" ON "public"."saas_reward_envelopes" USING "btree" ("tenant_id", "window");


--
-- Name: saas_reward_envelopes_tenant_window_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_reward_envelopes_tenant_window_unique" ON "public"."saas_reward_envelopes" USING "btree" ("tenant_id", "window") WHERE ("project_id" IS NULL);


--
-- Name: saas_status_minutes_minute_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_status_minutes_minute_start_idx" ON "public"."saas_status_minutes" USING "btree" ("minute_start");


--
-- Name: saas_status_minutes_minute_start_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_status_minutes_minute_start_unique" ON "public"."saas_status_minutes" USING "btree" ("minute_start");


--
-- Name: saas_status_minutes_overall_status_minute_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_status_minutes_overall_status_minute_idx" ON "public"."saas_status_minutes" USING "btree" ("overall_status", "minute_start");


--
-- Name: saas_stripe_webhook_events_event_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_stripe_webhook_events_event_id_unique" ON "public"."saas_stripe_webhook_events" USING "btree" ("event_id");


--
-- Name: saas_stripe_webhook_events_status_next_attempt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_stripe_webhook_events_status_next_attempt_idx" ON "public"."saas_stripe_webhook_events" USING "btree" ("status", "next_attempt_at");


--
-- Name: saas_stripe_webhook_events_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_stripe_webhook_events_tenant_created_idx" ON "public"."saas_stripe_webhook_events" USING "btree" ("tenant_id", "created_at");


--
-- Name: saas_tenant_invites_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_tenant_invites_expires_idx" ON "public"."saas_tenant_invites" USING "btree" ("expires_at");


--
-- Name: saas_tenant_invites_tenant_email_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_tenant_invites_tenant_email_status_idx" ON "public"."saas_tenant_invites" USING "btree" ("tenant_id", "email", "status");


--
-- Name: saas_tenant_invites_token_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_tenant_invites_token_hash_unique" ON "public"."saas_tenant_invites" USING "btree" ("token_hash");


--
-- Name: saas_tenant_links_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_tenant_links_child_idx" ON "public"."saas_tenant_links" USING "btree" ("child_tenant_id");


--
-- Name: saas_tenant_links_parent_child_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_tenant_links_parent_child_unique" ON "public"."saas_tenant_links" USING "btree" ("parent_tenant_id", "child_tenant_id", "link_type");


--
-- Name: saas_tenant_links_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_tenant_links_parent_idx" ON "public"."saas_tenant_links" USING "btree" ("parent_tenant_id");


--
-- Name: saas_tenant_memberships_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_tenant_memberships_admin_idx" ON "public"."saas_tenant_memberships" USING "btree" ("admin_id");


--
-- Name: saas_tenant_memberships_tenant_admin_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_tenant_memberships_tenant_admin_unique" ON "public"."saas_tenant_memberships" USING "btree" ("tenant_id", "admin_id");


--
-- Name: saas_tenant_memberships_tenant_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_tenant_memberships_tenant_role_idx" ON "public"."saas_tenant_memberships" USING "btree" ("tenant_id", "role");


--
-- Name: saas_tenants_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saas_tenants_slug_unique" ON "public"."saas_tenants" USING "btree" ("slug");


--
-- Name: saas_tenants_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_tenants_status_idx" ON "public"."saas_tenants" USING "btree" ("status");


--
-- Name: saas_usage_events_api_key_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_api_key_created_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("api_key_id", "created_at", "id");


--
-- Name: saas_usage_events_billing_run_decision_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_billing_run_decision_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("billing_run_id", "decision_type");


--
-- Name: saas_usage_events_billing_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_billing_run_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("billing_run_id");


--
-- Name: saas_usage_events_default_api_key_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_api_key_id_created_at_id_idx" ON "public"."saas_usage_events_default" USING "btree" ("api_key_id", "created_at", "id");


--
-- Name: saas_usage_events_default_billing_run_id_decision_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_billing_run_id_decision_type_idx" ON "public"."saas_usage_events_default" USING "btree" ("billing_run_id", "decision_type");


--
-- Name: saas_usage_events_default_billing_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_billing_run_id_idx" ON "public"."saas_usage_events_default" USING "btree" ("billing_run_id");


--
-- Name: saas_usage_events_event_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_event_reference_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("event_type", "reference_type", "reference_id");


--
-- Name: saas_usage_events_default_event_type_reference_type_referen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_event_type_reference_type_referen_idx" ON "public"."saas_usage_events_default" USING "btree" ("event_type", "reference_type", "reference_id");


--
-- Name: saas_usage_events_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_id_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("id");


--
-- Name: saas_usage_events_default_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_id_idx" ON "public"."saas_usage_events_default" USING "btree" ("id");


--
-- Name: saas_usage_events_player_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_player_created_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("player_id", "created_at", "id");


--
-- Name: saas_usage_events_default_player_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_player_id_created_at_id_idx" ON "public"."saas_usage_events_default" USING "btree" ("player_id", "created_at", "id");


--
-- Name: saas_usage_events_project_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_project_created_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("project_id", "created_at", "id");


--
-- Name: saas_usage_events_default_project_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_project_id_created_at_id_idx" ON "public"."saas_usage_events_default" USING "btree" ("project_id", "created_at", "id");


--
-- Name: saas_usage_events_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_tenant_created_idx" ON ONLY "public"."saas_usage_events" USING "btree" ("tenant_id", "created_at", "id");


--
-- Name: saas_usage_events_default_tenant_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_default_tenant_id_created_at_id_idx" ON "public"."saas_usage_events_default" USING "btree" ("tenant_id", "created_at", "id");


--
-- Name: saas_usage_events_p202603_api_key_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_api_key_id_created_at_id_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("api_key_id", "created_at", "id");


--
-- Name: saas_usage_events_p202603_billing_run_id_decision_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_billing_run_id_decision_type_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("billing_run_id", "decision_type");


--
-- Name: saas_usage_events_p202603_billing_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_billing_run_id_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("billing_run_id");


--
-- Name: saas_usage_events_p202603_event_type_reference_type_referen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_event_type_reference_type_referen_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("event_type", "reference_type", "reference_id");


--
-- Name: saas_usage_events_p202603_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_id_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("id");


--
-- Name: saas_usage_events_p202603_player_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_player_id_created_at_id_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("player_id", "created_at", "id");


--
-- Name: saas_usage_events_p202603_project_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_project_id_created_at_id_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("project_id", "created_at", "id");


--
-- Name: saas_usage_events_p202603_tenant_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202603_tenant_id_created_at_id_idx" ON "public"."saas_usage_events_p202603" USING "btree" ("tenant_id", "created_at", "id");


--
-- Name: saas_usage_events_p202604_api_key_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_api_key_id_created_at_id_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("api_key_id", "created_at", "id");


--
-- Name: saas_usage_events_p202604_billing_run_id_decision_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_billing_run_id_decision_type_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("billing_run_id", "decision_type");


--
-- Name: saas_usage_events_p202604_billing_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_billing_run_id_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("billing_run_id");


--
-- Name: saas_usage_events_p202604_event_type_reference_type_referen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_event_type_reference_type_referen_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("event_type", "reference_type", "reference_id");


--
-- Name: saas_usage_events_p202604_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_id_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("id");


--
-- Name: saas_usage_events_p202604_player_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_player_id_created_at_id_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("player_id", "created_at", "id");


--
-- Name: saas_usage_events_p202604_project_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_project_id_created_at_id_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("project_id", "created_at", "id");


--
-- Name: saas_usage_events_p202604_tenant_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202604_tenant_id_created_at_id_idx" ON "public"."saas_usage_events_p202604" USING "btree" ("tenant_id", "created_at", "id");


--
-- Name: saas_usage_events_p202605_api_key_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_api_key_id_created_at_id_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("api_key_id", "created_at", "id");


--
-- Name: saas_usage_events_p202605_billing_run_id_decision_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_billing_run_id_decision_type_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("billing_run_id", "decision_type");


--
-- Name: saas_usage_events_p202605_billing_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_billing_run_id_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("billing_run_id");


--
-- Name: saas_usage_events_p202605_event_type_reference_type_referen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_event_type_reference_type_referen_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("event_type", "reference_type", "reference_id");


--
-- Name: saas_usage_events_p202605_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_id_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("id");


--
-- Name: saas_usage_events_p202605_player_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_player_id_created_at_id_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("player_id", "created_at", "id");


--
-- Name: saas_usage_events_p202605_project_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_project_id_created_at_id_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("project_id", "created_at", "id");


--
-- Name: saas_usage_events_p202605_tenant_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202605_tenant_id_created_at_id_idx" ON "public"."saas_usage_events_p202605" USING "btree" ("tenant_id", "created_at", "id");


--
-- Name: saas_usage_events_p202606_api_key_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_api_key_id_created_at_id_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("api_key_id", "created_at", "id");


--
-- Name: saas_usage_events_p202606_billing_run_id_decision_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_billing_run_id_decision_type_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("billing_run_id", "decision_type");


--
-- Name: saas_usage_events_p202606_billing_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_billing_run_id_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("billing_run_id");


--
-- Name: saas_usage_events_p202606_event_type_reference_type_referen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_event_type_reference_type_referen_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("event_type", "reference_type", "reference_id");


--
-- Name: saas_usage_events_p202606_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_id_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("id");


--
-- Name: saas_usage_events_p202606_player_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_player_id_created_at_id_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("player_id", "created_at", "id");


--
-- Name: saas_usage_events_p202606_project_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_project_id_created_at_id_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("project_id", "created_at", "id");


--
-- Name: saas_usage_events_p202606_tenant_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202606_tenant_id_created_at_id_idx" ON "public"."saas_usage_events_p202606" USING "btree" ("tenant_id", "created_at", "id");


--
-- Name: saas_usage_events_p202607_api_key_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_api_key_id_created_at_id_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("api_key_id", "created_at", "id");


--
-- Name: saas_usage_events_p202607_billing_run_id_decision_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_billing_run_id_decision_type_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("billing_run_id", "decision_type");


--
-- Name: saas_usage_events_p202607_billing_run_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_billing_run_id_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("billing_run_id");


--
-- Name: saas_usage_events_p202607_event_type_reference_type_referen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_event_type_reference_type_referen_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("event_type", "reference_type", "reference_id");


--
-- Name: saas_usage_events_p202607_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_id_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("id");


--
-- Name: saas_usage_events_p202607_player_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_player_id_created_at_id_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("player_id", "created_at", "id");


--
-- Name: saas_usage_events_p202607_project_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_project_id_created_at_id_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("project_id", "created_at", "id");


--
-- Name: saas_usage_events_p202607_tenant_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "saas_usage_events_p202607_tenant_id_created_at_id_idx" ON "public"."saas_usage_events_p202607" USING "btree" ("tenant_id", "created_at", "id");


--
-- Name: seats_table_seat_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "seats_table_seat_unique" ON "public"."seats" USING "btree" ("table_id", "seat_number");


--
-- Name: seats_table_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seats_table_status_idx" ON "public"."seats" USING "btree" ("table_id", "status", "seat_number");


--
-- Name: seats_table_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "seats_table_user_unique" ON "public"."seats" USING "btree" ("table_id", "user_id");


--
-- Name: seats_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seats_user_status_idx" ON "public"."seats" USING "btree" ("user_id", "status", "updated_at");


--
-- Name: security_events_admin_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_admin_occurred_idx" ON "public"."security_events" USING "btree" ("admin_id", "occurred_at");


--
-- Name: security_events_category_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_category_occurred_idx" ON "public"."security_events" USING "btree" ("category", "occurred_at");


--
-- Name: security_events_email_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_email_occurred_idx" ON "public"."security_events" USING "btree" ("email", "occurred_at");


--
-- Name: security_events_fingerprint_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_fingerprint_idx" ON "public"."security_events" USING "btree" ("fingerprint");


--
-- Name: security_events_ip_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_ip_occurred_idx" ON "public"."security_events" USING "btree" ("ip", "occurred_at");


--
-- Name: security_events_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_occurred_idx" ON "public"."security_events" USING "btree" ("occurred_at");


--
-- Name: security_events_source_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_source_occurred_idx" ON "public"."security_events" USING "btree" ("source_table", "source_record_id", "occurred_at");


--
-- Name: security_events_type_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_type_occurred_idx" ON "public"."security_events" USING "btree" ("event_type", "occurred_at");


--
-- Name: security_events_user_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "security_events_user_occurred_idx" ON "public"."security_events" USING "btree" ("user_id", "occurred_at");


--
-- Name: store_purchase_orders_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "store_purchase_orders_idempotency_unique" ON "public"."store_purchase_orders" USING "btree" ("idempotency_key");


--
-- Name: store_purchase_orders_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "store_purchase_orders_status_created_idx" ON "public"."store_purchase_orders" USING "btree" ("status", "created_at");


--
-- Name: store_purchase_orders_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "store_purchase_orders_user_created_idx" ON "public"."store_purchase_orders" USING "btree" ("user_id", "created_at");


--
-- Name: store_purchase_receipts_order_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "store_purchase_receipts_order_created_idx" ON "public"."store_purchase_receipts" USING "btree" ("order_id", "created_at");


--
-- Name: store_purchase_receipts_purchase_token_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "store_purchase_receipts_purchase_token_unique" ON "public"."store_purchase_receipts" USING "btree" ("store_channel", "purchase_token");


--
-- Name: store_purchase_receipts_transaction_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "store_purchase_receipts_transaction_unique" ON "public"."store_purchase_receipts" USING "btree" ("store_channel", "external_transaction_id");


--
-- Name: suspicious_accounts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "suspicious_accounts_status_idx" ON "public"."suspicious_accounts" USING "btree" ("status");


--
-- Name: suspicious_accounts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "suspicious_accounts_user_idx" ON "public"."suspicious_accounts" USING "btree" ("user_id");


--
-- Name: system_config_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "system_config_key_unique" ON "public"."system_config" USING "btree" ("config_key");


--
-- Name: table_events_hand_history_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "table_events_hand_history_created_idx" ON "public"."table_events" USING "btree" ("hand_history_id", "created_at");


--
-- Name: table_events_table_event_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "table_events_table_event_unique_idx" ON "public"."table_events" USING "btree" ("table_type", "table_id", "event_index");


--
-- Name: table_events_table_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "table_events_table_lookup_idx" ON "public"."table_events" USING "btree" ("table_type", "table_id", "created_at");


--
-- Name: table_events_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "table_events_user_created_idx" ON "public"."table_events" USING "btree" ("user_id", "created_at");


--
-- Name: tables_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tables_definition_idx" ON "public"."tables" USING "btree" ("definition_key");


--
-- Name: tables_game_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tables_game_type_status_idx" ON "public"."tables" USING "btree" ("game_type", "status");


--
-- Name: tables_status_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tables_status_updated_idx" ON "public"."tables" USING "btree" ("status", "updated_at");


--
-- Name: user_asset_balances_asset_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_asset_balances_asset_updated_idx" ON "public"."user_asset_balances" USING "btree" ("asset_code", "updated_at");


--
-- Name: user_asset_balances_user_asset_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_asset_balances_user_asset_created_idx" ON "public"."user_asset_balances" USING "btree" ("user_id", "asset_code", "created_at");


--
-- Name: user_asset_balances_user_asset_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_asset_balances_user_asset_unique" ON "public"."user_asset_balances" USING "btree" ("user_id", "asset_code");


--
-- Name: user_mfa_secrets_user_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_mfa_secrets_user_id_unique" ON "public"."user_mfa_secrets" USING "btree" ("user_id");


--
-- Name: user_play_modes_game_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_play_modes_game_updated_idx" ON "public"."user_play_modes" USING "btree" ("game_key", "updated_at");


--
-- Name: user_play_modes_user_game_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_play_modes_user_game_unique" ON "public"."user_play_modes" USING "btree" ("user_id", "game_key");


--
-- Name: user_wallets_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_wallets_user_id_idx" ON "public"."user_wallets" USING "btree" ("user_id");


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "users_email_unique" ON "public"."users" USING "btree" ("email");


--
-- Name: users_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "users_phone_unique" ON "public"."users" USING "btree" ("phone");


--
-- Name: users_registration_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_registration_country_idx" ON "public"."users" USING "btree" ("registration_country_code");


--
-- Name: users_user_pool_balance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "users_user_pool_balance_idx" ON "public"."users" USING "btree" ("user_pool_balance");


--
-- Name: wallet_reconciliation_runs_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "wallet_reconciliation_runs_status_created_idx" ON "public"."wallet_reconciliation_runs" USING "btree" ("status", "created_at");


--
-- Name: withdrawal_limits_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawal_limits_scope_idx" ON "public"."withdrawal_limits" USING "btree" ("scope");


--
-- Name: withdrawal_limits_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawal_limits_user_idx" ON "public"."withdrawal_limits" USING "btree" ("user_id");


--
-- Name: withdrawals_channel_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawals_channel_status_idx" ON "public"."withdrawals" USING "btree" ("channel_type", "status");


--
-- Name: withdrawals_payout_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawals_payout_method_idx" ON "public"."withdrawals" USING "btree" ("payout_method_id");


--
-- Name: withdrawals_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawals_provider_idx" ON "public"."withdrawals" USING "btree" ("provider_id");


--
-- Name: withdrawals_submitted_tx_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "withdrawals_submitted_tx_hash_unique" ON "public"."withdrawals" USING "btree" ("submitted_tx_hash");


--
-- Name: withdrawals_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawals_user_status_idx" ON "public"."withdrawals" USING "btree" ("user_id", "status");


--
-- Name: admin_actions_default_action_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_action_idx" ATTACH PARTITION "public"."admin_actions_default_action_idx";


--
-- Name: admin_actions_default_admin_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_created_idx" ATTACH PARTITION "public"."admin_actions_default_admin_id_created_at_idx";


--
-- Name: admin_actions_default_admin_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_idx" ATTACH PARTITION "public"."admin_actions_default_admin_id_idx";


--
-- Name: admin_actions_default_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_id_idx" ATTACH PARTITION "public"."admin_actions_default_id_idx";


--
-- Name: admin_actions_default_session_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_session_idx" ATTACH PARTITION "public"."admin_actions_default_session_id_idx";


--
-- Name: admin_actions_p202603_action_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_action_idx" ATTACH PARTITION "public"."admin_actions_p202603_action_idx";


--
-- Name: admin_actions_p202603_admin_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_created_idx" ATTACH PARTITION "public"."admin_actions_p202603_admin_id_created_at_idx";


--
-- Name: admin_actions_p202603_admin_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_idx" ATTACH PARTITION "public"."admin_actions_p202603_admin_id_idx";


--
-- Name: admin_actions_p202603_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_id_idx" ATTACH PARTITION "public"."admin_actions_p202603_id_idx";


--
-- Name: admin_actions_p202603_session_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_session_idx" ATTACH PARTITION "public"."admin_actions_p202603_session_id_idx";


--
-- Name: admin_actions_p202604_action_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_action_idx" ATTACH PARTITION "public"."admin_actions_p202604_action_idx";


--
-- Name: admin_actions_p202604_admin_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_created_idx" ATTACH PARTITION "public"."admin_actions_p202604_admin_id_created_at_idx";


--
-- Name: admin_actions_p202604_admin_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_idx" ATTACH PARTITION "public"."admin_actions_p202604_admin_id_idx";


--
-- Name: admin_actions_p202604_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_id_idx" ATTACH PARTITION "public"."admin_actions_p202604_id_idx";


--
-- Name: admin_actions_p202604_session_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_session_idx" ATTACH PARTITION "public"."admin_actions_p202604_session_id_idx";


--
-- Name: admin_actions_p202605_action_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_action_idx" ATTACH PARTITION "public"."admin_actions_p202605_action_idx";


--
-- Name: admin_actions_p202605_admin_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_created_idx" ATTACH PARTITION "public"."admin_actions_p202605_admin_id_created_at_idx";


--
-- Name: admin_actions_p202605_admin_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_idx" ATTACH PARTITION "public"."admin_actions_p202605_admin_id_idx";


--
-- Name: admin_actions_p202605_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_id_idx" ATTACH PARTITION "public"."admin_actions_p202605_id_idx";


--
-- Name: admin_actions_p202605_session_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_session_idx" ATTACH PARTITION "public"."admin_actions_p202605_session_id_idx";


--
-- Name: admin_actions_p202606_action_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_action_idx" ATTACH PARTITION "public"."admin_actions_p202606_action_idx";


--
-- Name: admin_actions_p202606_admin_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_created_idx" ATTACH PARTITION "public"."admin_actions_p202606_admin_id_created_at_idx";


--
-- Name: admin_actions_p202606_admin_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_idx" ATTACH PARTITION "public"."admin_actions_p202606_admin_id_idx";


--
-- Name: admin_actions_p202606_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_id_idx" ATTACH PARTITION "public"."admin_actions_p202606_id_idx";


--
-- Name: admin_actions_p202606_session_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_session_idx" ATTACH PARTITION "public"."admin_actions_p202606_session_id_idx";


--
-- Name: admin_actions_p202607_action_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_action_idx" ATTACH PARTITION "public"."admin_actions_p202607_action_idx";


--
-- Name: admin_actions_p202607_admin_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_created_idx" ATTACH PARTITION "public"."admin_actions_p202607_admin_id_created_at_idx";


--
-- Name: admin_actions_p202607_admin_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_admin_idx" ATTACH PARTITION "public"."admin_actions_p202607_admin_id_idx";


--
-- Name: admin_actions_p202607_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_id_idx" ATTACH PARTITION "public"."admin_actions_p202607_id_idx";


--
-- Name: admin_actions_p202607_session_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."admin_actions_session_idx" ATTACH PARTITION "public"."admin_actions_p202607_session_id_idx";


--
-- Name: ledger_entries_default_house_account_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_house_created_idx" ATTACH PARTITION "public"."ledger_entries_default_house_account_id_created_at_id_idx";


--
-- Name: ledger_entries_default_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_id_idx" ATTACH PARTITION "public"."ledger_entries_default_id_idx";


--
-- Name: ledger_entries_default_ledger_mutation_event_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_mutation_event_idx" ATTACH PARTITION "public"."ledger_entries_default_ledger_mutation_event_id_idx";


--
-- Name: ledger_entries_default_type_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_created_idx" ATTACH PARTITION "public"."ledger_entries_default_type_created_at_id_idx";


--
-- Name: ledger_entries_default_type_user_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_user_idx" ATTACH PARTITION "public"."ledger_entries_default_type_user_id_idx";


--
-- Name: ledger_entries_default_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_user_created_idx" ATTACH PARTITION "public"."ledger_entries_default_user_id_created_at_id_idx";


--
-- Name: ledger_entries_p202603_house_account_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_house_created_idx" ATTACH PARTITION "public"."ledger_entries_p202603_house_account_id_created_at_id_idx";


--
-- Name: ledger_entries_p202603_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_id_idx" ATTACH PARTITION "public"."ledger_entries_p202603_id_idx";


--
-- Name: ledger_entries_p202603_ledger_mutation_event_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_mutation_event_idx" ATTACH PARTITION "public"."ledger_entries_p202603_ledger_mutation_event_id_idx";


--
-- Name: ledger_entries_p202603_type_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_created_idx" ATTACH PARTITION "public"."ledger_entries_p202603_type_created_at_id_idx";


--
-- Name: ledger_entries_p202603_type_user_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_user_idx" ATTACH PARTITION "public"."ledger_entries_p202603_type_user_id_idx";


--
-- Name: ledger_entries_p202603_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_user_created_idx" ATTACH PARTITION "public"."ledger_entries_p202603_user_id_created_at_id_idx";


--
-- Name: ledger_entries_p202604_house_account_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_house_created_idx" ATTACH PARTITION "public"."ledger_entries_p202604_house_account_id_created_at_id_idx";


--
-- Name: ledger_entries_p202604_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_id_idx" ATTACH PARTITION "public"."ledger_entries_p202604_id_idx";


--
-- Name: ledger_entries_p202604_ledger_mutation_event_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_mutation_event_idx" ATTACH PARTITION "public"."ledger_entries_p202604_ledger_mutation_event_id_idx";


--
-- Name: ledger_entries_p202604_type_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_created_idx" ATTACH PARTITION "public"."ledger_entries_p202604_type_created_at_id_idx";


--
-- Name: ledger_entries_p202604_type_user_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_user_idx" ATTACH PARTITION "public"."ledger_entries_p202604_type_user_id_idx";


--
-- Name: ledger_entries_p202604_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_user_created_idx" ATTACH PARTITION "public"."ledger_entries_p202604_user_id_created_at_id_idx";


--
-- Name: ledger_entries_p202605_house_account_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_house_created_idx" ATTACH PARTITION "public"."ledger_entries_p202605_house_account_id_created_at_id_idx";


--
-- Name: ledger_entries_p202605_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_id_idx" ATTACH PARTITION "public"."ledger_entries_p202605_id_idx";


--
-- Name: ledger_entries_p202605_ledger_mutation_event_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_mutation_event_idx" ATTACH PARTITION "public"."ledger_entries_p202605_ledger_mutation_event_id_idx";


--
-- Name: ledger_entries_p202605_type_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_created_idx" ATTACH PARTITION "public"."ledger_entries_p202605_type_created_at_id_idx";


--
-- Name: ledger_entries_p202605_type_user_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_user_idx" ATTACH PARTITION "public"."ledger_entries_p202605_type_user_id_idx";


--
-- Name: ledger_entries_p202605_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_user_created_idx" ATTACH PARTITION "public"."ledger_entries_p202605_user_id_created_at_id_idx";


--
-- Name: ledger_entries_p202606_house_account_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_house_created_idx" ATTACH PARTITION "public"."ledger_entries_p202606_house_account_id_created_at_id_idx";


--
-- Name: ledger_entries_p202606_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_id_idx" ATTACH PARTITION "public"."ledger_entries_p202606_id_idx";


--
-- Name: ledger_entries_p202606_ledger_mutation_event_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_mutation_event_idx" ATTACH PARTITION "public"."ledger_entries_p202606_ledger_mutation_event_id_idx";


--
-- Name: ledger_entries_p202606_type_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_created_idx" ATTACH PARTITION "public"."ledger_entries_p202606_type_created_at_id_idx";


--
-- Name: ledger_entries_p202606_type_user_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_user_idx" ATTACH PARTITION "public"."ledger_entries_p202606_type_user_id_idx";


--
-- Name: ledger_entries_p202606_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_user_created_idx" ATTACH PARTITION "public"."ledger_entries_p202606_user_id_created_at_id_idx";


--
-- Name: ledger_entries_p202607_house_account_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_house_created_idx" ATTACH PARTITION "public"."ledger_entries_p202607_house_account_id_created_at_id_idx";


--
-- Name: ledger_entries_p202607_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_id_idx" ATTACH PARTITION "public"."ledger_entries_p202607_id_idx";


--
-- Name: ledger_entries_p202607_ledger_mutation_event_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_mutation_event_idx" ATTACH PARTITION "public"."ledger_entries_p202607_ledger_mutation_event_id_idx";


--
-- Name: ledger_entries_p202607_type_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_created_idx" ATTACH PARTITION "public"."ledger_entries_p202607_type_created_at_id_idx";


--
-- Name: ledger_entries_p202607_type_user_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_type_user_idx" ATTACH PARTITION "public"."ledger_entries_p202607_type_user_id_idx";


--
-- Name: ledger_entries_p202607_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."ledger_entries_user_created_idx" ATTACH PARTITION "public"."ledger_entries_p202607_user_id_created_at_id_idx";


--
-- Name: round_events_default_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_id_idx" ATTACH PARTITION "public"."round_events_default_id_idx";


--
-- Name: round_events_default_round_type_round_entity_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_round_lookup_idx" ATTACH PARTITION "public"."round_events_default_round_type_round_entity_id_event_index_idx";


--
-- Name: round_events_default_table_id_phase_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_phase_created_idx" ATTACH PARTITION "public"."round_events_default_table_id_phase_created_at_idx";


--
-- Name: round_events_default_table_round_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_round_lookup_idx" ATTACH PARTITION "public"."round_events_default_table_round_id_event_index_idx";


--
-- Name: round_events_default_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_user_created_idx" ATTACH PARTITION "public"."round_events_default_user_id_created_at_id_idx";


--
-- Name: round_events_p202603_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_id_idx" ATTACH PARTITION "public"."round_events_p202603_id_idx";


--
-- Name: round_events_p202603_round_type_round_entity_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202603_round_type_round_entity_id_event_index_idx";


--
-- Name: round_events_p202603_table_id_phase_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_phase_created_idx" ATTACH PARTITION "public"."round_events_p202603_table_id_phase_created_at_idx";


--
-- Name: round_events_p202603_table_round_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202603_table_round_id_event_index_idx";


--
-- Name: round_events_p202603_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_user_created_idx" ATTACH PARTITION "public"."round_events_p202603_user_id_created_at_id_idx";


--
-- Name: round_events_p202604_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_id_idx" ATTACH PARTITION "public"."round_events_p202604_id_idx";


--
-- Name: round_events_p202604_round_type_round_entity_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202604_round_type_round_entity_id_event_index_idx";


--
-- Name: round_events_p202604_table_id_phase_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_phase_created_idx" ATTACH PARTITION "public"."round_events_p202604_table_id_phase_created_at_idx";


--
-- Name: round_events_p202604_table_round_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202604_table_round_id_event_index_idx";


--
-- Name: round_events_p202604_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_user_created_idx" ATTACH PARTITION "public"."round_events_p202604_user_id_created_at_id_idx";


--
-- Name: round_events_p202605_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_id_idx" ATTACH PARTITION "public"."round_events_p202605_id_idx";


--
-- Name: round_events_p202605_round_type_round_entity_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202605_round_type_round_entity_id_event_index_idx";


--
-- Name: round_events_p202605_table_id_phase_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_phase_created_idx" ATTACH PARTITION "public"."round_events_p202605_table_id_phase_created_at_idx";


--
-- Name: round_events_p202605_table_round_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202605_table_round_id_event_index_idx";


--
-- Name: round_events_p202605_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_user_created_idx" ATTACH PARTITION "public"."round_events_p202605_user_id_created_at_id_idx";


--
-- Name: round_events_p202606_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_id_idx" ATTACH PARTITION "public"."round_events_p202606_id_idx";


--
-- Name: round_events_p202606_round_type_round_entity_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202606_round_type_round_entity_id_event_index_idx";


--
-- Name: round_events_p202606_table_id_phase_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_phase_created_idx" ATTACH PARTITION "public"."round_events_p202606_table_id_phase_created_at_idx";


--
-- Name: round_events_p202606_table_round_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202606_table_round_id_event_index_idx";


--
-- Name: round_events_p202606_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_user_created_idx" ATTACH PARTITION "public"."round_events_p202606_user_id_created_at_id_idx";


--
-- Name: round_events_p202607_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_id_idx" ATTACH PARTITION "public"."round_events_p202607_id_idx";


--
-- Name: round_events_p202607_round_type_round_entity_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202607_round_type_round_entity_id_event_index_idx";


--
-- Name: round_events_p202607_table_id_phase_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_phase_created_idx" ATTACH PARTITION "public"."round_events_p202607_table_id_phase_created_at_idx";


--
-- Name: round_events_p202607_table_round_id_event_index_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_table_round_lookup_idx" ATTACH PARTITION "public"."round_events_p202607_table_round_id_event_index_idx";


--
-- Name: round_events_p202607_user_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."round_events_user_created_idx" ATTACH PARTITION "public"."round_events_p202607_user_id_created_at_id_idx";


--
-- Name: saas_usage_events_default_api_key_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_api_key_created_idx" ATTACH PARTITION "public"."saas_usage_events_default_api_key_id_created_at_id_idx";


--
-- Name: saas_usage_events_default_billing_run_id_decision_type_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_decision_idx" ATTACH PARTITION "public"."saas_usage_events_default_billing_run_id_decision_type_idx";


--
-- Name: saas_usage_events_default_billing_run_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_idx" ATTACH PARTITION "public"."saas_usage_events_default_billing_run_id_idx";


--
-- Name: saas_usage_events_default_event_type_reference_type_referen_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_event_reference_idx" ATTACH PARTITION "public"."saas_usage_events_default_event_type_reference_type_referen_idx";


--
-- Name: saas_usage_events_default_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_id_idx" ATTACH PARTITION "public"."saas_usage_events_default_id_idx";


--
-- Name: saas_usage_events_default_player_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_player_created_idx" ATTACH PARTITION "public"."saas_usage_events_default_player_id_created_at_id_idx";


--
-- Name: saas_usage_events_default_project_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_project_created_idx" ATTACH PARTITION "public"."saas_usage_events_default_project_id_created_at_id_idx";


--
-- Name: saas_usage_events_default_tenant_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_tenant_created_idx" ATTACH PARTITION "public"."saas_usage_events_default_tenant_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202603_api_key_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_api_key_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_api_key_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202603_billing_run_id_decision_type_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_decision_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_billing_run_id_decision_type_idx";


--
-- Name: saas_usage_events_p202603_billing_run_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_billing_run_id_idx";


--
-- Name: saas_usage_events_p202603_event_type_reference_type_referen_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_event_reference_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_event_type_reference_type_referen_idx";


--
-- Name: saas_usage_events_p202603_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_id_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_id_idx";


--
-- Name: saas_usage_events_p202603_player_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_player_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_player_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202603_project_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_project_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_project_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202603_tenant_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_tenant_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202603_tenant_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202604_api_key_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_api_key_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_api_key_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202604_billing_run_id_decision_type_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_decision_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_billing_run_id_decision_type_idx";


--
-- Name: saas_usage_events_p202604_billing_run_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_billing_run_id_idx";


--
-- Name: saas_usage_events_p202604_event_type_reference_type_referen_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_event_reference_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_event_type_reference_type_referen_idx";


--
-- Name: saas_usage_events_p202604_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_id_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_id_idx";


--
-- Name: saas_usage_events_p202604_player_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_player_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_player_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202604_project_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_project_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_project_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202604_tenant_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_tenant_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202604_tenant_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202605_api_key_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_api_key_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_api_key_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202605_billing_run_id_decision_type_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_decision_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_billing_run_id_decision_type_idx";


--
-- Name: saas_usage_events_p202605_billing_run_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_billing_run_id_idx";


--
-- Name: saas_usage_events_p202605_event_type_reference_type_referen_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_event_reference_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_event_type_reference_type_referen_idx";


--
-- Name: saas_usage_events_p202605_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_id_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_id_idx";


--
-- Name: saas_usage_events_p202605_player_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_player_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_player_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202605_project_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_project_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_project_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202605_tenant_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_tenant_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202605_tenant_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202606_api_key_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_api_key_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_api_key_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202606_billing_run_id_decision_type_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_decision_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_billing_run_id_decision_type_idx";


--
-- Name: saas_usage_events_p202606_billing_run_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_billing_run_id_idx";


--
-- Name: saas_usage_events_p202606_event_type_reference_type_referen_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_event_reference_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_event_type_reference_type_referen_idx";


--
-- Name: saas_usage_events_p202606_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_id_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_id_idx";


--
-- Name: saas_usage_events_p202606_player_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_player_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_player_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202606_project_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_project_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_project_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202606_tenant_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_tenant_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202606_tenant_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202607_api_key_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_api_key_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_api_key_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202607_billing_run_id_decision_type_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_decision_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_billing_run_id_decision_type_idx";


--
-- Name: saas_usage_events_p202607_billing_run_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_billing_run_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_billing_run_id_idx";


--
-- Name: saas_usage_events_p202607_event_type_reference_type_referen_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_event_reference_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_event_type_reference_type_referen_idx";


--
-- Name: saas_usage_events_p202607_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_id_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_id_idx";


--
-- Name: saas_usage_events_p202607_player_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_player_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_player_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202607_project_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_project_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_project_id_created_at_id_idx";


--
-- Name: saas_usage_events_p202607_tenant_id_created_at_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX "public"."saas_usage_events_tenant_created_idx" ATTACH PARTITION "public"."saas_usage_events_p202607_tenant_id_created_at_id_idx";


--
-- Name: round_events round_events_uniqueness_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "round_events_uniqueness_guard" BEFORE INSERT OR UPDATE OF "round_type", "round_entity_id", "table_round_id", "event_index" ON "public"."round_events" FOR EACH ROW EXECUTE FUNCTION "partition_maintenance"."enforce_round_event_uniqueness"();


--
-- Name: saas_billing_runs saas_billing_run_external_sync_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "saas_billing_run_external_sync_transition_guard" BEFORE UPDATE ON "public"."saas_billing_runs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_saas_billing_run_external_sync_transition"();


--
-- Name: saas_usage_events saas_usage_events_reference_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "saas_usage_events_reference_guard" BEFORE INSERT OR UPDATE OF "event_type", "reference_type", "reference_id" ON "public"."saas_usage_events" FOR EACH ROW EXECUTE FUNCTION "partition_maintenance"."enforce_saas_usage_event_reference_uniqueness"();


--
-- Name: admin_actions admin_actions_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: admin_permissions admin_permissions_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;


--
-- Name: admins admins_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: agent_blocklist agent_blocklist_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_blocklist"
    ADD CONSTRAINT "agent_blocklist_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: agent_blocklist agent_blocklist_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_blocklist"
    ADD CONSTRAINT "agent_blocklist_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: agent_risk_state agent_risk_state_api_key_id_saas_api_keys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_risk_state"
    ADD CONSTRAINT "agent_risk_state_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE CASCADE;


--
-- Name: agent_risk_state agent_risk_state_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_risk_state"
    ADD CONSTRAINT "agent_risk_state_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: agent_risk_state agent_risk_state_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agent_risk_state"
    ADD CONSTRAINT "agent_risk_state_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: aml_checks aml_checks_reviewed_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aml_checks"
    ADD CONSTRAINT "aml_checks_reviewed_by_admin_id_admins_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: aml_checks aml_checks_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aml_checks"
    ADD CONSTRAINT "aml_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: audit_events audit_events_api_key_id_saas_api_keys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE CASCADE;


--
-- Name: audit_events audit_events_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: audit_events audit_events_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: auth_events auth_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_events"
    ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: auth_sessions auth_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_sessions"
    ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: auth_tokens auth_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."auth_tokens"
    ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: blackjack_games blackjack_games_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."blackjack_games"
    ADD CONSTRAINT "blackjack_games_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: community_moderation_actions community_moderation_actions_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_moderation_actions"
    ADD CONSTRAINT "community_moderation_actions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: community_moderation_actions community_moderation_actions_post_id_community_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_moderation_actions"
    ADD CONSTRAINT "community_moderation_actions_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE SET NULL;


--
-- Name: community_moderation_actions community_moderation_actions_thread_id_community_threads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_moderation_actions"
    ADD CONSTRAINT "community_moderation_actions_thread_id_community_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."community_threads"("id") ON DELETE SET NULL;


--
-- Name: community_posts community_posts_author_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: community_posts community_posts_thread_id_community_threads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_thread_id_community_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."community_threads"("id") ON DELETE CASCADE;


--
-- Name: community_reports community_reports_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;


--
-- Name: community_reports community_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: community_reports community_reports_resolved_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_resolved_by_admin_id_fkey" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: community_threads community_threads_author_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_threads"
    ADD CONSTRAINT "community_threads_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: config_change_requests config_change_requests_approved_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."config_change_requests"
    ADD CONSTRAINT "config_change_requests_approved_by_admin_id_admins_id_fk" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: config_change_requests config_change_requests_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."config_change_requests"
    ADD CONSTRAINT "config_change_requests_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE RESTRICT;


--
-- Name: config_change_requests config_change_requests_published_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."config_change_requests"
    ADD CONSTRAINT "config_change_requests_published_by_admin_id_admins_id_fk" FOREIGN KEY ("published_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: config_change_requests config_change_requests_rejected_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."config_change_requests"
    ADD CONSTRAINT "config_change_requests_rejected_by_admin_id_admins_id_fk" FOREIGN KEY ("rejected_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: config_change_requests config_change_requests_submitted_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."config_change_requests"
    ADD CONSTRAINT "config_change_requests_submitted_by_admin_id_admins_id_fk" FOREIGN KEY ("submitted_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: crypto_chain_transactions crypto_chain_transactions_consumed_by_deposit_id_deposits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_chain_transactions"
    ADD CONSTRAINT "crypto_chain_transactions_consumed_by_deposit_id_deposits_id_fk" FOREIGN KEY ("consumed_by_deposit_id") REFERENCES "public"."deposits"("id") ON DELETE SET NULL;


--
-- Name: crypto_chain_transactions crypto_chain_tx_withdrawal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_chain_transactions"
    ADD CONSTRAINT "crypto_chain_tx_withdrawal_fk" FOREIGN KEY ("consumed_by_withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE SET NULL;


--
-- Name: crypto_deposit_channels crypto_deposit_channels_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_deposit_channels"
    ADD CONSTRAINT "crypto_deposit_channels_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE SET NULL;


--
-- Name: crypto_review_events crypto_review_events_reviewer_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_review_events"
    ADD CONSTRAINT "crypto_review_events_reviewer_admin_id_admins_id_fk" FOREIGN KEY ("reviewer_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: crypto_withdraw_addresses crypto_withdraw_addresses_payout_method_id_payout_methods_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."crypto_withdraw_addresses"
    ADD CONSTRAINT "crypto_withdraw_addresses_payout_method_id_payout_methods_id_fk" FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id") ON DELETE CASCADE;


--
-- Name: data_deletion_requests data_deletion_requests_completed_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_deletion_requests"
    ADD CONSTRAINT "data_deletion_requests_completed_by_admin_id_admins_id_fk" FOREIGN KEY ("completed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: data_deletion_requests data_deletion_requests_requested_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_deletion_requests"
    ADD CONSTRAINT "data_deletion_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: data_deletion_requests data_deletion_requests_reviewed_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_deletion_requests"
    ADD CONSTRAINT "data_deletion_requests_reviewed_by_admin_id_admins_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: data_deletion_requests data_deletion_requests_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_deletion_requests"
    ADD CONSTRAINT "data_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: data_rights_audits data_rights_audits_actor_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_rights_audits"
    ADD CONSTRAINT "data_rights_audits_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: data_rights_audits data_rights_audits_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_rights_audits"
    ADD CONSTRAINT "data_rights_audits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: data_rights_audits data_rights_audits_request_id_data_deletion_requests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_rights_audits"
    ADD CONSTRAINT "data_rights_audits_request_id_data_deletion_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_deletion_requests"("id") ON DELETE CASCADE;


--
-- Name: data_rights_audits data_rights_audits_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."data_rights_audits"
    ADD CONSTRAINT "data_rights_audits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: deferred_payouts deferred_payouts_source_session_id_play_mode_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deferred_payouts"
    ADD CONSTRAINT "deferred_payouts_source_session_id_play_mode_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."play_mode_sessions"("id") ON DELETE SET NULL;


--
-- Name: deferred_payouts deferred_payouts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deferred_payouts"
    ADD CONSTRAINT "deferred_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: deposits deposits_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE SET NULL;


--
-- Name: deposits deposits_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: device_fingerprints device_fingerprints_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."device_fingerprints"
    ADD CONSTRAINT "device_fingerprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: draw_records draw_records_prize_id_prizes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draw_records"
    ADD CONSTRAINT "draw_records_prize_id_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."prizes"("id") ON DELETE SET NULL;


--
-- Name: draw_records draw_records_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draw_records"
    ADD CONSTRAINT "draw_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: economy_ledger_entries economy_ledger_entries_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."economy_ledger_entries"
    ADD CONSTRAINT "economy_ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: experiment_assignments experiment_assignments_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."experiment_assignments"
    ADD CONSTRAINT "experiment_assignments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE CASCADE;


--
-- Name: fiat_deposit_events fiat_deposit_events_deposit_id_deposits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_deposit_events"
    ADD CONSTRAINT "fiat_deposit_events_deposit_id_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id") ON DELETE CASCADE;


--
-- Name: fiat_payout_methods fiat_payout_methods_payout_method_id_payout_methods_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_payout_methods"
    ADD CONSTRAINT "fiat_payout_methods_payout_method_id_payout_methods_id_fk" FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id") ON DELETE CASCADE;


--
-- Name: fiat_withdraw_events fiat_withdraw_events_withdrawal_id_withdrawals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fiat_withdraw_events"
    ADD CONSTRAINT "fiat_withdraw_events_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE CASCADE;


--
-- Name: finance_reviews finance_reviews_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."finance_reviews"
    ADD CONSTRAINT "finance_reviews_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: freeze_records freeze_records_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."freeze_records"
    ADD CONSTRAINT "freeze_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: gift_energy_accounts gift_energy_accounts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_energy_accounts"
    ADD CONSTRAINT "gift_energy_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: gift_pack_catalog gift_pack_catalog_iap_product_id_iap_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_pack_catalog"
    ADD CONSTRAINT "gift_pack_catalog_iap_product_id_iap_products_id_fk" FOREIGN KEY ("iap_product_id") REFERENCES "public"."iap_products"("id") ON DELETE CASCADE;


--
-- Name: gift_transfers gift_transfers_receiver_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_transfers"
    ADD CONSTRAINT "gift_transfers_receiver_user_id_users_id_fk" FOREIGN KEY ("receiver_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: gift_transfers gift_transfers_sender_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."gift_transfers"
    ADD CONSTRAINT "gift_transfers_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: hand_histories hand_histories_primary_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hand_histories"
    ADD CONSTRAINT "hand_histories_primary_user_id_users_id_fk" FOREIGN KEY ("primary_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: holdem_table_messages holdem_table_messages_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_messages"
    ADD CONSTRAINT "holdem_table_messages_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."holdem_tables"("id") ON DELETE CASCADE;


--
-- Name: holdem_table_messages holdem_table_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_messages"
    ADD CONSTRAINT "holdem_table_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: holdem_table_seats holdem_table_seats_table_id_holdem_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_seats"
    ADD CONSTRAINT "holdem_table_seats_table_id_holdem_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."holdem_tables"("id") ON DELETE CASCADE;


--
-- Name: holdem_table_seats holdem_table_seats_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."holdem_table_seats"
    ADD CONSTRAINT "holdem_table_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: house_transactions house_transactions_house_account_id_house_account_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."house_transactions"
    ADD CONSTRAINT "house_transactions_house_account_id_house_account_id_fk" FOREIGN KEY ("house_account_id") REFERENCES "public"."house_account"("id") ON DELETE CASCADE;


--
-- Name: kyc_documents kyc_documents_profile_id_kyc_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_documents"
    ADD CONSTRAINT "kyc_documents_profile_id_kyc_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."kyc_profiles"("id") ON DELETE CASCADE;


--
-- Name: kyc_documents kyc_documents_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_documents"
    ADD CONSTRAINT "kyc_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: kyc_profiles kyc_profiles_freeze_record_id_freeze_records_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_profiles"
    ADD CONSTRAINT "kyc_profiles_freeze_record_id_freeze_records_id_fk" FOREIGN KEY ("freeze_record_id") REFERENCES "public"."freeze_records"("id") ON DELETE SET NULL;


--
-- Name: kyc_profiles kyc_profiles_reviewed_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_profiles"
    ADD CONSTRAINT "kyc_profiles_reviewed_by_admin_id_admins_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: kyc_profiles kyc_profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_profiles"
    ADD CONSTRAINT "kyc_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: kyc_review_events kyc_review_events_actor_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_review_events"
    ADD CONSTRAINT "kyc_review_events_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: kyc_review_events kyc_review_events_profile_id_kyc_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_review_events"
    ADD CONSTRAINT "kyc_review_events_profile_id_kyc_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."kyc_profiles"("id") ON DELETE CASCADE;


--
-- Name: kyc_review_events kyc_review_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_review_events"
    ADD CONSTRAINT "kyc_review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: ledger_entries ledger_entries_house_account_id_house_account_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_house_account_id_house_account_id_fk" FOREIGN KEY ("house_account_id") REFERENCES "public"."house_account"("id") ON DELETE SET NULL;


--
-- Name: ledger_entries ledger_entries_mutation_event_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_mutation_event_fk" FOREIGN KEY ("ledger_mutation_event_id") REFERENCES "public"."ledger_mutation_events"("id") ON DELETE SET NULL;


--
-- Name: ledger_entries ledger_entries_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ledger_mutation_events ledger_mutation_events_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_mutation_events"
    ADD CONSTRAINT "ledger_mutation_events_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE SET NULL;


--
-- Name: ledger_mutation_events ledger_mutation_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ledger_mutation_events"
    ADD CONSTRAINT "ledger_mutation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: legal_document_acceptances legal_document_acceptances_document_id_legal_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_acceptances"
    ADD CONSTRAINT "legal_document_acceptances_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE CASCADE;


--
-- Name: legal_document_acceptances legal_document_acceptances_publication_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_acceptances"
    ADD CONSTRAINT "legal_document_acceptances_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."legal_document_publications"("id") ON DELETE SET NULL;


--
-- Name: legal_document_acceptances legal_document_acceptances_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_acceptances"
    ADD CONSTRAINT "legal_document_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: legal_document_publications legal_document_publications_change_request_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_publications"
    ADD CONSTRAINT "legal_document_publications_change_request_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."config_change_requests"("id") ON DELETE SET NULL;


--
-- Name: legal_document_publications legal_document_publications_document_id_legal_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_publications"
    ADD CONSTRAINT "legal_document_publications_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE CASCADE;


--
-- Name: legal_document_publications legal_document_publications_published_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_document_publications"
    ADD CONSTRAINT "legal_document_publications_published_by_admin_id_admins_id_fk" FOREIGN KEY ("published_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE RESTRICT;


--
-- Name: legal_documents legal_documents_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE RESTRICT;


--
-- Name: notification_delivery_attempts notification_attempts_delivery_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_delivery_attempts"
    ADD CONSTRAINT "notification_attempts_delivery_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE CASCADE;


--
-- Name: notification_deliveries notification_deliveries_notification_record_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_notification_record_fk" FOREIGN KEY ("notification_record_id") REFERENCES "public"."notification_records"("id") ON DELETE SET NULL;


--
-- Name: notification_deliveries notification_deliveries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: notification_push_devices notification_push_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_push_devices"
    ADD CONSTRAINT "notification_push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: notification_records notification_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_records"
    ADD CONSTRAINT "notification_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: payment_outbound_requests payment_outbound_requests_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_outbound_requests"
    ADD CONSTRAINT "payment_outbound_requests_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE RESTRICT;


--
-- Name: payment_provider_events payment_provider_events_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_provider_events"
    ADD CONSTRAINT "payment_provider_events_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE SET NULL;


--
-- Name: payment_provider_events payment_provider_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_provider_events"
    ADD CONSTRAINT "payment_provider_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: payment_reconciliation_issues payment_recon_issues_provider_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reconciliation_issues"
    ADD CONSTRAINT "payment_recon_issues_provider_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE SET NULL;


--
-- Name: payment_reconciliation_issues payment_recon_issues_run_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reconciliation_issues"
    ADD CONSTRAINT "payment_recon_issues_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payment_reconciliation_runs"("id") ON DELETE SET NULL;


--
-- Name: payment_reconciliation_runs payment_reconciliation_runs_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reconciliation_runs"
    ADD CONSTRAINT "payment_reconciliation_runs_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE SET NULL;


--
-- Name: payment_settlement_events payment_settlement_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_settlement_events"
    ADD CONSTRAINT "payment_settlement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: payout_methods payout_methods_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payout_methods"
    ADD CONSTRAINT "payout_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: play_mode_sessions play_mode_sessions_parent_session_id_play_mode_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."play_mode_sessions"
    ADD CONSTRAINT "play_mode_sessions_parent_session_id_play_mode_sessions_id_fk" FOREIGN KEY ("parent_session_id") REFERENCES "public"."play_mode_sessions"("id") ON DELETE CASCADE;


--
-- Name: play_mode_sessions play_mode_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."play_mode_sessions"
    ADD CONSTRAINT "play_mode_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: prediction_market_appeals prediction_market_appeals_market_id_prediction_markets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_appeals"
    ADD CONSTRAINT "prediction_market_appeals_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE CASCADE;


--
-- Name: prediction_market_appeals prediction_market_appeals_oracle_binding_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_appeals"
    ADD CONSTRAINT "prediction_market_appeals_oracle_binding_fk" FOREIGN KEY ("oracle_binding_id") REFERENCES "public"."prediction_market_oracles"("id") ON DELETE SET NULL;


--
-- Name: prediction_market_appeals prediction_market_appeals_resolved_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_appeals"
    ADD CONSTRAINT "prediction_market_appeals_resolved_by_admin_id_admins_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: prediction_market_oracles prediction_market_oracles_market_id_prediction_markets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_market_oracles"
    ADD CONSTRAINT "prediction_market_oracles_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE CASCADE;


--
-- Name: prediction_positions prediction_positions_market_id_prediction_markets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_positions"
    ADD CONSTRAINT "prediction_positions_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE CASCADE;


--
-- Name: prediction_positions prediction_positions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."prediction_positions"
    ADD CONSTRAINT "prediction_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: quick_eight_rounds quick_eight_rounds_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."quick_eight_rounds"
    ADD CONSTRAINT "quick_eight_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: reconciliation_alerts reconciliation_alerts_run_id_wallet_reconciliation_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reconciliation_alerts"
    ADD CONSTRAINT "reconciliation_alerts_run_id_wallet_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."wallet_reconciliation_runs"("id") ON DELETE SET NULL;


--
-- Name: reconciliation_alerts reconciliation_alerts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reconciliation_alerts"
    ADD CONSTRAINT "reconciliation_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: referrals referrals_referred_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: referrals referrals_referrer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: risk_table_interaction_pairs risk_table_interaction_pairs_user_a_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."risk_table_interaction_pairs"
    ADD CONSTRAINT "risk_table_interaction_pairs_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: risk_table_interaction_pairs risk_table_interaction_pairs_user_b_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."risk_table_interaction_pairs"
    ADD CONSTRAINT "risk_table_interaction_pairs_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: round_events round_events_seat_id_seats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."round_events"
    ADD CONSTRAINT "round_events_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE SET NULL;


--
-- Name: round_events round_events_table_id_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."round_events"
    ADD CONSTRAINT "round_events_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;


--
-- Name: round_events round_events_table_round_id_rounds_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."round_events"
    ADD CONSTRAINT "round_events_table_round_id_rounds_id_fk" FOREIGN KEY ("table_round_id") REFERENCES "public"."rounds"("id") ON DELETE CASCADE;


--
-- Name: round_events round_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."round_events"
    ADD CONSTRAINT "round_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: rounds rounds_table_id_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rounds"
    ADD CONSTRAINT "rounds_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


--
-- Name: saas_agent_group_correlations saas_agent_group_correlations_draw_record_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agent_group_correlations"
    ADD CONSTRAINT "saas_agent_group_correlations_draw_record_fk" FOREIGN KEY ("draw_record_id") REFERENCES "public"."saas_draw_records"("id") ON DELETE CASCADE;


--
-- Name: saas_agent_group_correlations saas_agent_group_correlations_player_id_saas_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agent_group_correlations"
    ADD CONSTRAINT "saas_agent_group_correlations_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE CASCADE;


--
-- Name: saas_agent_group_correlations saas_agent_group_correlations_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agent_group_correlations"
    ADD CONSTRAINT "saas_agent_group_correlations_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_agents saas_agents_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_agents"
    ADD CONSTRAINT "saas_agents_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_api_keys saas_api_keys_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_api_keys"
    ADD CONSTRAINT "saas_api_keys_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_api_keys saas_api_keys_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_api_keys"
    ADD CONSTRAINT "saas_api_keys_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_api_keys saas_api_keys_revoked_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_api_keys"
    ADD CONSTRAINT "saas_api_keys_revoked_by_admin_id_admins_id_fk" FOREIGN KEY ("revoked_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_api_keys saas_api_keys_rotated_from_api_key_id_saas_api_keys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_api_keys"
    ADD CONSTRAINT "saas_api_keys_rotated_from_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("rotated_from_api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE SET NULL;


--
-- Name: saas_api_keys saas_api_keys_rotated_to_api_key_id_saas_api_keys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_api_keys"
    ADD CONSTRAINT "saas_api_keys_rotated_to_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("rotated_to_api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_account_versions saas_billing_account_versions_billing_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_account_versions"
    ADD CONSTRAINT "saas_billing_account_versions_billing_account_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."saas_billing_accounts"("id") ON DELETE CASCADE;


--
-- Name: saas_billing_account_versions saas_billing_account_versions_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_account_versions"
    ADD CONSTRAINT "saas_billing_account_versions_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_account_versions saas_billing_account_versions_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_account_versions"
    ADD CONSTRAINT "saas_billing_account_versions_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_billing_accounts saas_billing_accounts_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_accounts"
    ADD CONSTRAINT "saas_billing_accounts_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_billing_disputes saas_billing_disputes_billing_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_disputes"
    ADD CONSTRAINT "saas_billing_disputes_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "public"."saas_billing_accounts"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_disputes saas_billing_disputes_billing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_disputes"
    ADD CONSTRAINT "saas_billing_disputes_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "public"."saas_billing_runs"("id") ON DELETE CASCADE;


--
-- Name: saas_billing_disputes saas_billing_disputes_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_disputes"
    ADD CONSTRAINT "saas_billing_disputes_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_disputes saas_billing_disputes_resolved_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_disputes"
    ADD CONSTRAINT "saas_billing_disputes_resolved_by_admin_id_fkey" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_disputes saas_billing_disputes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_disputes"
    ADD CONSTRAINT "saas_billing_disputes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_billing_ledger_entries saas_billing_ledger_entries_billing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_ledger_entries"
    ADD CONSTRAINT "saas_billing_ledger_entries_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "public"."saas_billing_runs"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_ledger_entries saas_billing_ledger_entries_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_ledger_entries"
    ADD CONSTRAINT "saas_billing_ledger_entries_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_ledger_entries saas_billing_ledger_entries_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_ledger_entries"
    ADD CONSTRAINT "saas_billing_ledger_entries_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."saas_billing_disputes"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_ledger_entries saas_billing_ledger_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_ledger_entries"
    ADD CONSTRAINT "saas_billing_ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_billing_runs saas_billing_runs_billing_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_runs"
    ADD CONSTRAINT "saas_billing_runs_billing_account_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."saas_billing_accounts"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_runs saas_billing_runs_billing_account_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_runs"
    ADD CONSTRAINT "saas_billing_runs_billing_account_version_fk" FOREIGN KEY ("billing_account_version_id") REFERENCES "public"."saas_billing_account_versions"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_runs saas_billing_runs_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_runs"
    ADD CONSTRAINT "saas_billing_runs_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_runs saas_billing_runs_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_runs"
    ADD CONSTRAINT "saas_billing_runs_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_billing_top_ups saas_billing_top_ups_billing_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_top_ups"
    ADD CONSTRAINT "saas_billing_top_ups_billing_account_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."saas_billing_accounts"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_top_ups saas_billing_top_ups_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_top_ups"
    ADD CONSTRAINT "saas_billing_top_ups_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_billing_top_ups saas_billing_top_ups_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_billing_top_ups"
    ADD CONSTRAINT "saas_billing_top_ups_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_distribution_snapshots saas_distribution_snapshots_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_distribution_snapshots"
    ADD CONSTRAINT "saas_distribution_snapshots_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_draw_records saas_draw_records_player_id_saas_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_draw_records"
    ADD CONSTRAINT "saas_draw_records_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE CASCADE;


--
-- Name: saas_draw_records saas_draw_records_prize_id_saas_project_prizes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_draw_records"
    ADD CONSTRAINT "saas_draw_records_prize_id_saas_project_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."saas_project_prizes"("id") ON DELETE SET NULL;


--
-- Name: saas_draw_records saas_draw_records_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_draw_records"
    ADD CONSTRAINT "saas_draw_records_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_fairness_seeds saas_fairness_seeds_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_fairness_seeds"
    ADD CONSTRAINT "saas_fairness_seeds_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_ledger_entries saas_ledger_entries_player_id_saas_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_ledger_entries"
    ADD CONSTRAINT "saas_ledger_entries_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE CASCADE;


--
-- Name: saas_ledger_entries saas_ledger_entries_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_ledger_entries"
    ADD CONSTRAINT "saas_ledger_entries_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_outbound_webhook_deliveries saas_outbound_webhook_deliveries_draw_record_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhook_deliveries"
    ADD CONSTRAINT "saas_outbound_webhook_deliveries_draw_record_fk" FOREIGN KEY ("draw_record_id") REFERENCES "public"."saas_draw_records"("id") ON DELETE SET NULL;


--
-- Name: saas_outbound_webhook_deliveries saas_outbound_webhook_deliveries_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhook_deliveries"
    ADD CONSTRAINT "saas_outbound_webhook_deliveries_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_outbound_webhook_deliveries saas_outbound_webhook_deliveries_webhook_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhook_deliveries"
    ADD CONSTRAINT "saas_outbound_webhook_deliveries_webhook_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."saas_outbound_webhooks"("id") ON DELETE CASCADE;


--
-- Name: saas_outbound_webhooks saas_outbound_webhooks_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_outbound_webhooks"
    ADD CONSTRAINT "saas_outbound_webhooks_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_players saas_players_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_players"
    ADD CONSTRAINT "saas_players_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_project_prizes saas_project_prizes_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_project_prizes"
    ADD CONSTRAINT "saas_project_prizes_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_projects saas_projects_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_projects"
    ADD CONSTRAINT "saas_projects_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_report_exports saas_report_exports_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_report_exports"
    ADD CONSTRAINT "saas_report_exports_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_report_exports saas_report_exports_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_report_exports"
    ADD CONSTRAINT "saas_report_exports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE SET NULL;


--
-- Name: saas_report_exports saas_report_exports_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_report_exports"
    ADD CONSTRAINT "saas_report_exports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_reward_envelopes saas_reward_envelopes_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_reward_envelopes"
    ADD CONSTRAINT "saas_reward_envelopes_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_reward_envelopes saas_reward_envelopes_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_reward_envelopes"
    ADD CONSTRAINT "saas_reward_envelopes_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_stripe_webhook_events saas_stripe_webhook_events_billing_run_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_stripe_webhook_events"
    ADD CONSTRAINT "saas_stripe_webhook_events_billing_run_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."saas_billing_runs"("id") ON DELETE SET NULL;


--
-- Name: saas_stripe_webhook_events saas_stripe_webhook_events_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_stripe_webhook_events"
    ADD CONSTRAINT "saas_stripe_webhook_events_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE SET NULL;


--
-- Name: saas_tenant_invites saas_tenant_invites_accepted_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_invites"
    ADD CONSTRAINT "saas_tenant_invites_accepted_by_admin_id_admins_id_fk" FOREIGN KEY ("accepted_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_tenant_invites saas_tenant_invites_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_invites"
    ADD CONSTRAINT "saas_tenant_invites_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_tenant_invites saas_tenant_invites_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_invites"
    ADD CONSTRAINT "saas_tenant_invites_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_tenant_links saas_tenant_links_child_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_links"
    ADD CONSTRAINT "saas_tenant_links_child_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("child_tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_tenant_links saas_tenant_links_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_links"
    ADD CONSTRAINT "saas_tenant_links_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_tenant_links saas_tenant_links_parent_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_links"
    ADD CONSTRAINT "saas_tenant_links_parent_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("parent_tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_tenant_memberships saas_tenant_memberships_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_memberships"
    ADD CONSTRAINT "saas_tenant_memberships_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE;


--
-- Name: saas_tenant_memberships saas_tenant_memberships_created_by_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_memberships"
    ADD CONSTRAINT "saas_tenant_memberships_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: saas_tenant_memberships saas_tenant_memberships_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."saas_tenant_memberships"
    ADD CONSTRAINT "saas_tenant_memberships_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: saas_usage_events saas_usage_events_api_key_id_saas_api_keys_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."saas_usage_events"
    ADD CONSTRAINT "saas_usage_events_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE CASCADE;


--
-- Name: saas_usage_events saas_usage_events_billing_run_id_saas_billing_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."saas_usage_events"
    ADD CONSTRAINT "saas_usage_events_billing_run_id_saas_billing_runs_id_fk" FOREIGN KEY ("billing_run_id") REFERENCES "public"."saas_billing_runs"("id") ON DELETE SET NULL;


--
-- Name: saas_usage_events saas_usage_events_player_id_saas_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."saas_usage_events"
    ADD CONSTRAINT "saas_usage_events_player_id_saas_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."saas_players"("id") ON DELETE SET NULL;


--
-- Name: saas_usage_events saas_usage_events_project_id_saas_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."saas_usage_events"
    ADD CONSTRAINT "saas_usage_events_project_id_saas_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saas_projects"("id") ON DELETE CASCADE;


--
-- Name: saas_usage_events saas_usage_events_tenant_id_saas_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."saas_usage_events"
    ADD CONSTRAINT "saas_usage_events_tenant_id_saas_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."saas_tenants"("id") ON DELETE CASCADE;


--
-- Name: seats seats_table_id_tables_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


--
-- Name: seats seats_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: security_events security_events_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE SET NULL;


--
-- Name: security_events security_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: store_purchase_orders store_purchase_orders_iap_product_id_iap_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_orders"
    ADD CONSTRAINT "store_purchase_orders_iap_product_id_iap_products_id_fk" FOREIGN KEY ("iap_product_id") REFERENCES "public"."iap_products"("id") ON DELETE RESTRICT;


--
-- Name: store_purchase_orders store_purchase_orders_recipient_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_orders"
    ADD CONSTRAINT "store_purchase_orders_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: store_purchase_orders store_purchase_orders_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_orders"
    ADD CONSTRAINT "store_purchase_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: store_purchase_receipts store_purchase_receipts_order_id_store_purchase_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."store_purchase_receipts"
    ADD CONSTRAINT "store_purchase_receipts_order_id_store_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_purchase_orders"("id") ON DELETE CASCADE;


--
-- Name: suspicious_accounts suspicious_accounts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."suspicious_accounts"
    ADD CONSTRAINT "suspicious_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: table_events table_events_hand_history_id_hand_histories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."table_events"
    ADD CONSTRAINT "table_events_hand_history_id_hand_histories_id_fk" FOREIGN KEY ("hand_history_id") REFERENCES "public"."hand_histories"("id") ON DELETE SET NULL;


--
-- Name: table_events table_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."table_events"
    ADD CONSTRAINT "table_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: user_asset_balances user_asset_balances_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_asset_balances"
    ADD CONSTRAINT "user_asset_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_mfa_secrets user_mfa_secrets_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_mfa_secrets"
    ADD CONSTRAINT "user_mfa_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_play_modes user_play_modes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_play_modes"
    ADD CONSTRAINT "user_play_modes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_wallets user_wallets_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_wallets"
    ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: withdrawal_limits withdrawal_limits_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_limits"
    ADD CONSTRAINT "withdrawal_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: withdrawals withdrawals_payout_method_id_payout_methods_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_payout_method_id_payout_methods_id_fk" FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id") ON DELETE SET NULL;


--
-- Name: withdrawals withdrawals_provider_id_payment_providers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_provider_id_payment_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE SET NULL;


--
-- Name: withdrawals withdrawals_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawals"
    ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


