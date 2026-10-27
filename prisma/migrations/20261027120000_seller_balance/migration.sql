-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "payoutAccountName" TEXT,
ADD COLUMN     "payoutAccountNumber" TEXT,
ADD COLUMN     "payoutAccountSetAt" TIMESTAMP(3),
ADD COLUMN     "payoutBank" TEXT;

-- CreateTable
CREATE TABLE "BalanceEntry" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountIdr" INTEGER NOT NULL,
    "orderId" TEXT,
    "withdrawalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amountIdr" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "bank" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "reviewReasons" TEXT NOT NULL DEFAULT '[]',
    "providerRef" TEXT,
    "note" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceEntry_sellerId_createdAt_idx" ON "BalanceEntry"("sellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceEntry_type_orderId_key" ON "BalanceEntry"("type", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceEntry_type_withdrawalId_key" ON "BalanceEntry"("type", "withdrawalId");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_providerRef_key" ON "Withdrawal"("providerRef");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_sellerId_createdAt_idx" ON "Withdrawal"("sellerId", "createdAt");

-- AddForeignKey
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Orders completed before the ledger existed were never paid out: credit their sellers.
INSERT INTO "BalanceEntry" ("id", "sellerId", "type", "amountIdr", "orderId", "createdAt")
SELECT 'backfill_' || o."id", o."sellerId", 'SALE', o."totalIdr" - o."platformFeeIdr" - o."refundIdr", o."id", COALESCE(o."completedAt", o."updatedAt")
FROM "Order" o
WHERE o."status" = 'COMPLETED';
