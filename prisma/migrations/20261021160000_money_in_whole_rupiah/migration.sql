-- Money moves from integer minor units ("cents") to whole rupiah, so the
-- columns are renamed *Cents -> *Idr and existing values divided by 100.
-- (Rupiah has no minor unit in practice, and Int can't hold Rp 200M in sen.)

ALTER TABLE "Listing" RENAME COLUMN "priceCents" TO "priceIdr";
ALTER TABLE "Listing" RENAME COLUMN "originalPriceCents" TO "originalPriceIdr";
ALTER TABLE "Listing" RENAME COLUMN "shippingCents" TO "shippingIdr";
ALTER INDEX "Listing_status_priceCents_idx" RENAME TO "Listing_status_priceIdr_idx";

ALTER TABLE "Order" RENAME COLUMN "priceCents" TO "priceIdr";
ALTER TABLE "Order" RENAME COLUMN "shippingCents" TO "shippingIdr";
ALTER TABLE "Order" RENAME COLUMN "platformFeeCents" TO "platformFeeIdr";
ALTER TABLE "Order" RENAME COLUMN "totalCents" TO "totalIdr";
ALTER TABLE "Order" RENAME COLUMN "refundCents" TO "refundIdr";

ALTER TABLE "Dispute" RENAME COLUMN "refundCents" TO "refundIdr";

UPDATE "Listing" SET
  "priceIdr" = ROUND("priceIdr" / 100.0),
  "originalPriceIdr" = ROUND("originalPriceIdr" / 100.0),
  "shippingIdr" = ROUND("shippingIdr" / 100.0);
UPDATE "Order" SET
  "priceIdr" = ROUND("priceIdr" / 100.0),
  "shippingIdr" = ROUND("shippingIdr" / 100.0),
  "platformFeeIdr" = ROUND("platformFeeIdr" / 100.0),
  "totalIdr" = ROUND("totalIdr" / 100.0),
  "refundIdr" = ROUND("refundIdr" / 100.0);
UPDATE "Dispute" SET "refundIdr" = ROUND("refundIdr" / 100.0);
