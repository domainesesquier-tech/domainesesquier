-- ============================================================
-- Ajout colonnes acompte — Domaine Sesquier
-- Colle dans :
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ============================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS acompte_paye    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS acompte_montant NUMERIC(10,2) DEFAULT NULL;
