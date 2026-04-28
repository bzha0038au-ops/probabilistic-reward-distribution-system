import { sql, type SQLWrapper } from "@reward/database/orm";

const EMPTY_JSONB_OBJECT_SQL = sql`'{}'::jsonb`;

export const coerceJsonbObjectSql = (value: SQLWrapper) => sql`
  case
    when ${value} is null then ${EMPTY_JSONB_OBJECT_SQL}
    when jsonb_typeof(${value}) = 'object' then ${value}
    when jsonb_typeof(${value}) = 'string'
      then coalesce((${value} #>> '{}')::jsonb, ${EMPTY_JSONB_OBJECT_SQL})
    else ${EMPTY_JSONB_OBJECT_SQL}
  end
`;

export const jsonbTextPathSql = (
  value: SQLWrapper,
  ...path: [string, ...string[]]
) => {
  const pathArgsSql = sql.raw(
    path.map((segment) => `'${segment.replace(/'/g, "''")}'`).join(", "),
  );

  return sql`jsonb_extract_path_text(${coerceJsonbObjectSql(value)}, ${pathArgsSql})`;
};
