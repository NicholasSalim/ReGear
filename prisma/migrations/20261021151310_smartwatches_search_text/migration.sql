-- searchText includes the category name; update it for listings moved from Wearables.
UPDATE "Listing"
SET "searchText" = replace("searchText", 'wearables', 'smartwatches')
WHERE "category" = 'smartwatches';
