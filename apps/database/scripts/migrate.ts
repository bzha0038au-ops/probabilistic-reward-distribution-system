import "dotenv/config";

import { runDatabaseMigrations } from "../src/migration-runner.js";

await runDatabaseMigrations({ verbose: true });
