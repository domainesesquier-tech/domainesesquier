-- ============================================================
-- Ajout colonne statut_original — table planning
-- Colle dans :
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ============================================================

ALTER TABLE planning
  ADD COLUMN IF NOT EXISTS statut_original TEXT DEFAULT NULL;
