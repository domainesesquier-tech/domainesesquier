-- ============================================================
-- Ajout colonnes contact_tel et draps — table planning
-- Colle dans :
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ============================================================

ALTER TABLE planning
  ADD COLUMN IF NOT EXISTS contact_tel TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS draps       BOOLEAN DEFAULT false;
