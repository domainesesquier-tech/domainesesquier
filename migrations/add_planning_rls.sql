-- ============================================================
-- RLS pour la table planning — Domaine Sesquier
-- Colle dans :
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ============================================================

ALTER TABLE planning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_planning" ON planning FOR ALL USING (true) WITH CHECK (true);
