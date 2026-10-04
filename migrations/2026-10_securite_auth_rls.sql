-- ════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — Authentification réelle + RLS restrictif
-- À exécuter dans l'éditeur SQL Supabase, PARTIE PAR PARTIE, dans l'ordre
-- indiqué par la procédure de bascule (pas tout d'un coup).
-- https://supabase.com/dashboard/project/ymwebdihbmzrcaivldxu/sql/new
-- ════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────
-- PARTIE 1 — Ajouts sans impact (à lancer en premier)
-- Ne ferme rien : crée seulement les fonctions utilisées par la suite.
-- ────────────────────────────────────────────────────────────────────

-- Comptes autorisés à accéder aux données (email du compte Supabase Auth).
-- Pour ajouter quelqu'un plus tard : ajouter son email dans la liste.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') = any (array[
    'smali.w05@gmail.com'
  ]);
$$;

-- Calendrier public : uniquement dates / statut / type. Jamais de nom,
-- téléphone, montant ou notes.
create or replace function public.public_disponibilites(p_from date default null, p_to date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'date_arrivee', p.date_arrivee,
           'date_depart',  p.date_depart,
           'statut',       p.statut,
           'type',         p.type
         ) order by p.date_arrivee), '[]'::jsonb)
  from planning p
  where (p_from is null or p.date_depart::date  > p_from)
    and (p_to   is null or p.date_arrivee::date < p_to);
$$;

-- Menu client : nom + dates + planning repas d'UN dossier, par son id
-- (id aléatoire de 14 caractères, transmis au client par lien privé).
create or replace function public.public_menu(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nom_client',   r.nom_client,
           'date_arrivee', r.date_arrivee,
           'date_depart',  r.date_depart,
           'cuisine_json', r.cuisine_json
         )
  from reservations r
  where r.id = p_id;
$$;

revoke execute on function public.public_disponibilites(date, date) from public;
revoke execute on function public.public_menu(text)                 from public;
grant  execute on function public.public_disponibilites(date, date) to anon, authenticated;
grant  execute on function public.public_menu(text)                 to anon, authenticated;


-- ────────────────────────────────────────────────────────────────────
-- PARTIE 2 — Le verrou (à lancer APRÈS avoir vérifié que la connexion
-- au dashboard fonctionne avec le nouveau Worker)
-- ────────────────────────────────────────────────────────────────────

-- 2a) Toutes les tables du schéma public : on supprime les policies
--     "ouvertes à tous" et on n'autorise que les comptes admin connectés.
--     Le rôle anon (clé publique) ne voit plus aucune ligne.
do $$
declare
  t   record;
  pol record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t.tablename
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t.tablename);
    end loop;
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format(
      'create policy admin_only on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())',
      t.tablename);
  end loop;
end $$;

-- 2b) Numérotation des factures : seul un admin connecté peut consommer
--     un numéro (évite les "trous" dans la séquence, obligatoires à
--     éviter pour des factures).
create or replace function public.next_doc_number(p_series text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into doc_counters (series, last_number)
  values (p_series, 1)
  on conflict (series)
  do update set last_number = doc_counters.last_number + 1
  returning last_number into v_num;
  return v_num;
end;
$$;
revoke execute on function public.next_doc_number(text) from public, anon;
grant  execute on function public.next_doc_number(text) to authenticated;

-- 2c) Stockage des documents (PDF de devis, pièces jointes) : bucket privé,
--     accès réservé aux admins connectés (liens signés temporaires).
update storage.buckets set public = false where id = 'documents';

do $$
declare
  pol record;
begin
  for pol in
    select policyname, coalesce(qual, '') || coalesce(with_check, '') as def
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    -- Supprime les policies qui visent ce bucket, ou qui ne ciblent aucun
    -- bucket en particulier (elles s'appliqueraient aussi à 'documents').
    if pol.def ilike '%documents%' or pol.def not ilike '%bucket_id%' then
      execute format('drop policy %I on storage.objects', pol.policyname);
    end if;
  end loop;
end $$;

create policy documents_admin_only on storage.objects
  for all to authenticated
  using      (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());


-- ────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (après la partie 2)
-- ────────────────────────────────────────────────────────────────────
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
-- select tablename, policyname, roles, cmd from pg_policies
--   where schemaname in ('public', 'storage') order by 1, 2;
-- Vues du schéma public (elles contourneraient RLS) — doit être vide :
-- select table_name from information_schema.views where table_schema = 'public';


-- ────────────────────────────────────────────────────────────────────
-- RETOUR ARRIÈRE (uniquement en cas de problème après la partie 2)
-- Rouvre l'accès comme avant. À ne lancer que si nécessaire.
-- ────────────────────────────────────────────────────────────────────
-- do $$
-- declare t record;
-- begin
--   for t in select tablename from pg_tables where schemaname = 'public' loop
--     execute format('drop policy if exists admin_only on public.%I', t.tablename);
--     execute format('create policy allow_all on public.%I for all using (true) with check (true)', t.tablename);
--   end loop;
-- end $$;
-- grant execute on function public.next_doc_number(text) to anon;
-- update storage.buckets set public = true where id = 'documents';
-- drop policy if exists documents_admin_only on storage.objects;
-- create policy documents_allow_all on storage.objects
--   for all using (bucket_id = 'documents') with check (bucket_id = 'documents');
