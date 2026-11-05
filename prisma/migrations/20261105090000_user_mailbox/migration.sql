-- The inbox each address delivers to, so aliases of a banned person's address
-- (you+1@..., y.o.u@gmail.com) can be refused at sign-up. Same rule as
-- mailboxKey() in src/lib/account/mailbox.ts.
ALTER TABLE "User" ADD COLUMN "mailbox" TEXT;

UPDATE "User" SET "mailbox" = CASE
    WHEN d IN ('gmail.com', 'googlemail.com') THEN replace(l, '.', '') || '@gmail.com'
    ELSE l || '@' || d
  END
FROM (
  SELECT "id" AS uid,
         regexp_replace(split_part(lower(trim("email")), '@', 1), '^([^+]+)\+.*$', '\1') AS l,
         split_part(lower(trim("email")), '@', 2) AS d
  FROM "User"
  WHERE "deletedAt" IS NULL
) AS parts
WHERE "User"."id" = parts.uid;

CREATE INDEX "User_mailbox_idx" ON "User"("mailbox");
