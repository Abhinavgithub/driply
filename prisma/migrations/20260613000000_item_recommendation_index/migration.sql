-- Composite index for recommendation queries that filter on
-- (userId, kind, analysisStatus). The existing (userId, kind) index only
-- covered the first two columns.
CREATE INDEX "Item_userId_kind_analysisStatus_idx" ON "Item"("userId", "kind", "analysisStatus");
