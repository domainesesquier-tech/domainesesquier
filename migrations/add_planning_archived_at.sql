-- ============================================================
-- Ajout colonne archived_at — table planning
-- Colle dans :
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ============================================================

ALTER TABLE planning
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
