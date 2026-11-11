-- Espace client « Mon séjour » (mon-sejour.html) — 11/11/2026
-- Un lien privé par dossier (clé aléatoire de 24 caractères), sans compte client.
-- Le client y lit son récapitulatif, signe (signature électronique simple),
-- indique la répartition des gîtes et ses infos pratiques.
-- Comme les autres routes publiques : le rôle anon n'a aucun accès direct aux
-- tables, tout passe par ces fonctions security definer, qui ne renvoient que
-- les champs utiles au client.

alter table public.reservations
  add column if not exists espace_cle  text,
  add column if not exists espace_json jsonb not null default '{}'::jsonb;

create unique index if not exists reservations_espace_cle_key
  on public.reservations (espace_cle) where espace_cle is not null;

-- ── Lecture ─────────────────────────────────────────────────────────────
create or replace function public.public_sejour(p_cle text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nom_client',      r.nom_client,
    'entreprise',      r.entreprise,
    'prenom',          r.prenom_contact,
    'nom',             r.nom_contact,
    'type',            r.type,
    'statut',          r.statut,
    'arrivee',         r.date_arrivee,
    'depart',          r.date_depart,
    'personnes',       r.nombre_de_personnes,
    'acompte_paye',    coalesce(r.acompte_paye, false),
    'acompte_montant', r.acompte_montant,
    'dossier',         case when r.dossier_json is null then null else jsonb_build_object(
                         'companyProfile', (r.dossier_json::jsonb) -> 'companyProfile',
                         'prixTTC',        (r.dossier_json::jsonb) -> 'prixTTC',
                         'motAccueil',     (r.dossier_json::jsonb) -> 'motAccueil',
                         'sejour',         (r.dossier_json::jsonb) -> 'sejour',
                         'financials',     (r.dossier_json::jsonb) -> 'financials') end,
    'logements',       p.logements,
    'rooming',         case when r.rooming_json is null then null else (r.rooming_json::jsonb) ->> 'lienSheet' end,
    'espace',          coalesce(r.espace_json, '{}'::jsonb)
  )
  from public.reservations r
  left join public.planning p on p.id::text = r.planning_id::text
  where length(coalesce(p_cle, '')) >= 20
    and r.espace_cle = p_cle
    and coalesce(r.est_archive, false) = false
$$;

-- ── Signature ───────────────────────────────────────────────────────────
-- Une seule fois. Le Worker ajoute l'adresse IP, le navigateur et l'empreinte
-- SHA-256 du document signé. Dossier « à traiter » / « devis envoyé » → « devis signé »,
-- et l'entrée du planning passe en « Confirmé » (même règle que la synchro des dossiers).
create or replace function public.public_sejour_signer(p_cle text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservations%rowtype;
begin
  select * into r from public.reservations
   where length(coalesce(p_cle, '')) >= 20 and espace_cle = p_cle and coalesce(est_archive, false) = false
   for update;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'introuvable'); end if;
  if r.espace_json ? 'signature' then return jsonb_build_object('ok', false, 'erreur', 'deja_signe'); end if;
  if lower(coalesce(r.statut, '')) = 'annulé' then return jsonb_build_object('ok', false, 'erreur', 'annule'); end if;

  update public.reservations set
    espace_json = coalesce(espace_json, '{}'::jsonb) || jsonb_build_object('signature', jsonb_build_object(
      'nom',        left(p ->> 'nom', 120),
      'le',         now(),
      'ip',         left(p ->> 'ip', 64),
      'navigateur', left(p ->> 'ua', 300),
      'empreinte',  left(p ->> 'empreinte', 80),
      'version',    left(p ->> 'version', 40),
      'image',      left(p ->> 'image', 90000))),
    statut = case when lower(coalesce(statut, '')) in ('à traiter', 'devis envoyé') then 'devis signé' else statut end
  where id = r.id;

  if r.planning_id is not null then
    update public.planning set statut = 'Confirmé'
     where id::text = r.planning_id::text and coalesce(statut, '') not in ('Annulé', 'Archivé');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- ── Répartition des gîtes et infos pratiques (modifiables par le client) ──
create or replace function public.public_sejour_infos(p_cle text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if pg_column_size(p) > 30000 then return jsonb_build_object('ok', false, 'erreur', 'trop_long'); end if;
  update public.reservations set
    espace_json = coalesce(espace_json, '{}'::jsonb) || jsonb_build_object(
      'repartition', coalesce(p -> 'repartition', espace_json -> 'repartition', '{}'::jsonb),
      'infos',       coalesce(p -> 'infos',       espace_json -> 'infos',       '{}'::jsonb),
      'maj_client',  now())
  where length(coalesce(p_cle, '')) >= 20 and espace_cle = p_cle and coalesce(est_archive, false) = false
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null);
end
$$;

revoke all on function public.public_sejour(text)                from public;
revoke all on function public.public_sejour_signer(text, jsonb)  from public;
revoke all on function public.public_sejour_infos(text, jsonb)   from public;
grant execute on function public.public_sejour(text)               to anon, authenticated;
grant execute on function public.public_sejour_signer(text, jsonb) to anon, authenticated;
grant execute on function public.public_sejour_infos(text, jsonb)  to anon, authenticated;
