import { createDatabase } from "./db/schema.js";
import { createDbClient } from "./db/client.js";
import { createMessageRoutes } from "./routes/messages.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createServer } from "./server.js";

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);
const HOST = process.env["HOST"] ?? "127.0.0.1";
const DB_PATH = process.env["DB_PATH"];

async function main() {
  const database = createDatabase(DB_PATH);
  const db = createDbClient(database);

  const messageRoutes = createMessageRoutes(db);
  const taskRoutes = createTaskRoutes(db);

  const server = createServer([messageRoutes, taskRoutes]);

  await server.listen({ port: PORT, host: HOST });

  console.log(`Bridge server running at http://${HOST}:${PORT}`);
  console.log(`MCP server available via: node dist/mcp.js`);
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
