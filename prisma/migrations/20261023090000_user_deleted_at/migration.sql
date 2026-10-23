-- Accounts deleted by their owner are anonymised and keep their row.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
