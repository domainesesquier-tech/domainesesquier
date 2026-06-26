-- ════════════════════════════════════════════════════════════════════
-- Numérotation séquentielle des documents (devis / factures)
-- À exécuter dans l'éditeur SQL Supabase.
-- ════════════════════════════════════════════════════════════════════

-- 1) Table compteur : une ligne par "série" (ex: foudre-devis-2026)
create table if not exists doc_counters (
  series       text primary key,
  last_number  int  not null default 0
);

-- 2) Colonne pour figer les numéros attribués sur chaque dossier
alter table reservations add column if not exists numeros_json text;

-- 3) Fonction atomique : incrémente le compteur de la série et renvoie
--    le nouveau numéro. UPSERT => pas de course / pas de doublon.
--    SECURITY DEFINER : s'exécute avec les droits du propriétaire, donc
--    indépendante de RLS / des grants sur la table (appelée via la clé anon).
create or replace function next_doc_number(p_series text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num int;
begin
  insert into doc_counters (series, last_number)
  values (p_series, 1)
  on conflict (series)
  do update set last_number = doc_counters.last_number + 1
  returning last_number into v_num;
  return v_num;
end;
$$;

-- 4) Autoriser l'appel via PostgREST (clé anon / authenticated)
grant execute on function next_doc_number(text) to anon, authenticated;
