-- Trigram matching for "contains" searches (ILIKE %text%). pg_trgm is a trusted
-- extension: the database owner can create it without superuser rights.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "SellerProfile_displayName_trgm_idx" ON "SellerProfile" USING GIN ("displayName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "VerificationRequest_legalName_trgm_idx" ON "VerificationRequest" USING GIN ("legalName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Listing_searchText_trgm_idx" ON "Listing" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Order_paymentRef_idx" ON "Order"("paymentRef");

-- CreateIndex
CREATE INDEX "Order_number_trgm_idx" ON "Order" USING GIN ("number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_ip_idx" ON "AuditLog"("ip");

-- CreateIndex
CREATE INDEX "Withdrawal_accountName_trgm_idx" ON "Withdrawal" USING GIN ("accountName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Withdrawal_accountNumber_trgm_idx" ON "Withdrawal" USING GIN ("accountNumber" gin_trgm_ops);

