import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Fresh, fully migrated SQLite database for every test run.
export default function setup() {
  for (const f of ["prisma/test.db", "prisma/test.db-journal"]) rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
    stdio: "ignore",
  });
  return () => {
    rmSync("prisma/test.db", { force: true });
    rmSync("storage-test", { recursive: true, force: true });
  };
}
