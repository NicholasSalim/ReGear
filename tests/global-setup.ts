import "dotenv/config";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Fresh, fully migrated test database for every run. vitest.config.mts has
// already checked that TEST_DATABASE_URL is set and is not the dev database.
export default function setup() {
  execSync("npx prisma migrate reset --force", {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: "ignore",
  });
  return () => {
    rmSync("storage-test", { recursive: true, force: true });
  };
}
