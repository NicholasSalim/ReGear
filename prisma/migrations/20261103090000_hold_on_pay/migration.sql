-- The item is now held from pressing Pay, not from checkout. reservedAt marks
-- the order holding it, so only that order releases it.
ALTER TABLE "Order" ADD COLUMN "reservedAt" TIMESTAMP(3);

-- Orders placed before this held their item from checkout.
UPDATE "Order" SET "reservedAt" = "createdAt" WHERE "status" <> 'CANCELLED';
