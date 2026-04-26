-- Add composite index on (userId, kind) for the Item table.
-- Used by /api/recommendations which filters by userId + kind on every request.
CREATE INDEX IF NOT EXISTS "Item_userId_kind_idx" ON "Item"("userId", "kind");
