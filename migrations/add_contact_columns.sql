-- ============================================================
-- Ajout colonnes contact client — Domaine Sesquier
-- Colle dans :
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ============================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS entreprise       TEXT,
  ADD COLUMN IF NOT EXISTS prenom_contact   TEXT,
  ADD COLUMN IF NOT EXISTS nom_contact      TEXT;

-- Migration données existantes depuis nom_client
-- Format actuel : "Entreprise (Prénom Nom)" ou juste "Nom"
UPDATE reservations
SET
  entreprise = CASE
    WHEN nom_client LIKE '%(%'
      THEN trim(split_part(nom_client, '(', 1))
    ELSE nom_client
  END,
  prenom_contact = CASE
    WHEN nom_client LIKE '%(%'
      THEN trim(split_part(split_part(nom_client, '(', 2), ' ', 1))
    ELSE NULL
  END,
  nom_contact = CASE
    WHEN nom_client LIKE '%(%'
      THEN trim(regexp_replace(split_part(nom_client, '(', 2), '\).*', ''))
    ELSE NULL
  END
WHERE entreprise IS NULL;
