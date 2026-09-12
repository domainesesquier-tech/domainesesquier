-- ============================================================
-- Colonne pour sauvegarder l'onglet Cuisine (état complet)
-- Colle dans :
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ============================================================

alter table reservations
  add column if not exists cuisine_json text;
