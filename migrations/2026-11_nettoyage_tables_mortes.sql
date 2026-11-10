-- Nettoyage des tables et colonnes mortes (11/11/2026)
-- Plus lues ni écrites par aucun code depuis le commit 69fc7c5
-- (pages Cuisine, Menu client, Ménage du dossier supprimées).
-- Export préalable : ~/DOMAINE_SESQUIER_SAUVEGARDES/supabase_2026-11-11_avant_nettoyage_tables.json
-- (données, schéma, règles d'accès et définition de public_menu).
-- details_json reste : le questionnaire l'écrit (public_demande, public_lead).

begin;
drop function if exists public.public_menu(text);
drop table if exists public.gites;
drop table if exists public.menage_logements;
drop table if exists public.bibliotheque_menus;
alter table public.reservations
  drop column if exists cuisine_json,
  drop column if exists menage_json,
  drop column if exists json_snapshot;
commit;
