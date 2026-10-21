-- The Wearables category became Smartwatches (no device type field).
-- Move existing listings over and drop the now-unused "type" spec.
UPDATE "Listing"
SET "category" = 'smartwatches',
    "specs" = ("specs"::jsonb - 'type')::text
WHERE "category" = 'wearables';
