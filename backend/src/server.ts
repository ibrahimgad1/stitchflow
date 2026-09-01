import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { closeDatabase, getDatabase } from "./database/connection.js";
import { migrate } from "./database/migrate.js";
import { seed } from "./database/seed.js";
import { checkAutoBackup } from "./services/backup.js";

const env = loadEnv();
const app = createApp();

getDatabase();
migrate();
seed();

const server = app.listen(env.port, env.host, () => {
  console.log(`Backend listening on http://${env.host}:${env.port}`);
  setImmediate(() => {
    checkAutoBackup().catch((err) => {
      console.error("Failed to run automatic backup check on startup:", err);
    });
  });
});

function shutdown(): void {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

