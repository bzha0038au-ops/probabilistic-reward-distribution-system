import { sql } from '@reward/database/orm';

import { db } from '../../db';
import { getConfig } from '../../shared/config';
import { readSqlRows } from '../../shared/sql-result';

type PartitionActionRow = {
  parent_table: string;
  partition_name: string;
  action: string;
  month_start: Date | string;
  month_end: Date | string;
};

type PartitionActionSummary = {
  count: number;
  partitions: string[];
};

export type DbPartitionMaintenanceResult = {
  ensured: PartitionActionSummary;
  archived: PartitionActionSummary;
};

const summarizeActions = (rows: PartitionActionRow[]): PartitionActionSummary => ({
  count: rows.length,
  partitions: rows.map((row) => `${row.parent_table}:${row.partition_name}`),
});

export async function runDbPartitionMaintenanceCycle(): Promise<DbPartitionMaintenanceResult> {
  const config = getConfig();
  const futureMonths = Math.max(0, config.dbPartitionMaintenanceFutureMonths);
  const archiveAfterMonths = Math.max(
    1,
    config.dbPartitionMaintenanceArchiveAfterMonths
  );

  const ensuredResult = await db.execute(sql`
    SELECT *
    FROM partition_maintenance.ensure_reward_system_time_partitions(
      ${futureMonths},
      ${1}
    )
  `);
  const ensuredRows = readSqlRows<PartitionActionRow>(ensuredResult);

  const archivedResult = await db.execute(sql`
    SELECT *
    FROM partition_maintenance.archive_reward_system_time_partitions(
      ${archiveAfterMonths},
      ${config.dbPartitionMaintenanceArchiveSchema}
    )
  `);
  const archivedRows = readSqlRows<PartitionActionRow>(archivedResult);

  return {
    ensured: summarizeActions(ensuredRows),
    archived: summarizeActions(archivedRows),
  };
}
