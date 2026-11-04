-- Admins can ban an account, for a set time or permanently.
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3),
ADD COLUMN "bannedUntil" TIMESTAMP(3),
ADD COLUMN "banReason" TEXT;

CREATE INDEX "User_bannedUntil_idx" ON "User"("bannedUntil");

-- Saved searches remember how their results were sorted.
ALTER TABLE "SavedSearch" ADD COLUMN "sort" TEXT NOT NULL DEFAULT 'newest';
