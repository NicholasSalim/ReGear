-- Sign-ups wait here until their emailed code is entered; see SignupRequest in schema.prisma.
CREATE TABLE "SignupRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sends" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignupRequest_email_idx" ON "SignupRequest"("email");
CREATE INDEX "SignupRequest_expiresAt_idx" ON "SignupRequest"("expiresAt");

-- Like every table: no rows through Supabase's Data API.
ALTER TABLE "SignupRequest" ENABLE ROW LEVEL SECURITY;

-- Email confirmation links are retired: confirming by link could confirm an
-- account someone else created with their own password.
DELETE FROM "EmailToken" WHERE "purpose" = 'VERIFY_EMAIL';
