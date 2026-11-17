-- Consolidation n°1 de la base (17/11/2026) — à exécuter UNE fois dans Supabase > SQL Editor.
-- Purement additif : aucune colonne supprimée, aucune donnée existante modifiée.
-- Le tableau de bord et le Worker actuels continuent de fonctionner sans changement.
--   1. Fonctions de lecture sûre (JSON / nombre / date stockés en texte → null si invalide, jamais d'erreur)
--   2. Colonnes calculées automatiquement par la base depuis le devis enregistré (dossier_json) et le type
--   3. Statuts contrôlés par la base (5 valeurs, celles de assets/records.js)
--   4. Table evenements = journal unique de chaque dossier, + reprise du journal existant (timeline_json)

begin;

-- ── 1. Lecture sûre ─────────────────────────────────────────────────────────
create or replace function public.jsonb_sur(t text) returns jsonb
language plpgsql immutable as $$
begin
  if t is null or btrim(t) = '' then return null; end if;
  return t::jsonb;
exception when others then return null;
end $$;

create or replace function public.num_sur(t text) returns numeric
language plpgsql immutable as $$
begin
  if t is null or btrim(t) = '' then return null; end if;
  return t::numeric;
exception when others then return null;
end $$;

create or replace function public.date_sur(t text) returns date
language plpgsql immutable as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(t, 10)::date;
exception when others then return null;
end $$;

create or replace function public.ts_sur(t text) returns timestamptz
language plpgsql stable as $$
begin
  return t::timestamptz;
exception when others then return null;
end $$;

-- ── 2. Chiffres clés en colonnes (recalculés à chaque enregistrement du devis) ──
alter table public.reservations
  add column if not exists montant_ht  numeric generated always as (public.num_sur(public.jsonb_sur(dossier_json::text) #>> '{financials,totalHT}')) stored,
  add column if not exists montant_ttc numeric generated always as (public.num_sur(public.jsonb_sur(dossier_json::text) #>> '{financials,totalTTC}')) stored,
  add column if not exists montant_tva numeric generated always as (public.num_sur(public.jsonb_sur(dossier_json::text) #>> '{financials,totalTVA}')) stored,
  add column if not exists acompte_30  numeric generated always as (public.num_sur(public.jsonb_sur(dossier_json::text) #>> '{financials,acompte30}')) stored,
  add column if not exists solde       numeric generated always as (public.num_sur(public.jsonb_sur(dossier_json::text) #>> '{financials,solde}')) stored,
  add column if not exists prix_pp_ht  numeric generated always as (public.num_sur(public.jsonb_sur(dossier_json::text) #>> '{financials,prixParPersonneHT}')) stored,
  add column if not exists date_devis  date    generated always as (public.date_sur(public.jsonb_sur(dossier_json::text) #>> '{meta,dateDevis}')) stored,
  -- Même règle que assets/records.js : mariage / séminaire (ou vide) / sinon groupe
  add column if not exists segment     text    generated always as (
    case when type::text ilike '%mariage%' then 'mariage'
         when type is null or btrim(type::text) = '' or type::text ilike '%minaire%' then 'seminaire'
         else 'groupe' end) stored;

-- ── 3. Statuts contrôlés ─────────────────────────────────────────────────────
alter table public.reservations drop constraint if exists reservations_statut_ok;
alter table public.reservations add constraint reservations_statut_ok
  check (statut in ('à traiter', 'devis envoyé', 'devis signé', 'effectué', 'annulé'));

-- ── 4. Journal unique ────────────────────────────────────────────────────────
-- Type déduit du texte quand l'appelant ne le donne pas (type = 'auto')
create or replace function public.type_evenement(t text) returns text
language sql immutable as $$
  select case
    when t ~* 'relance signature'                               then 'relance_signature'
    when t ~* '^\W*statut chang'                                then 'statut'
    when t ~* 'devis envoy'                                     then 'devis_envoye'
    when t ~* 'relance( \d+)? envoy'                            then 'relance'
    when t ~* 'brochure'                                        then 'mail_brochure'
    when t ~* 'sign' and t ~* '(en ligne|espace client)'        then 'signature'
    when t ~* 'acompte' and t ~* '(reçu|pay)'                   then 'paiement'
    else 'note' end
$$;

create table if not exists public.evenements (
  id         bigint generated always as identity primary key,
  dossier_id text not null references public.reservations(id) on delete cascade,
  quand      timestamptz not null default now(),
  type       text not null default 'note'
             check (type in ('creation', 'statut', 'devis_envoye', 'relance', 'relance_signature',
                             'mail_brochure', 'signature', 'paiement', 'note')),
  detail     text,
  source     text not null default 'tableau de bord'
);
create index if not exists evenements_dossier_quand on public.evenements (dossier_id, quand desc);

create or replace function public.evenements_type_auto() returns trigger
language plpgsql as $$
begin
  if new.type is null or new.type = 'auto' then new.type := public.type_evenement(new.detail); end if;
  return new;
end $$;
drop trigger if exists evenements_type_auto on public.evenements;
create trigger evenements_type_auto before insert on public.evenements
  for each row execute function public.evenements_type_auto();

alter table public.evenements enable row level security;
drop policy if exists evenements_admin on public.evenements;
create policy evenements_admin on public.evenements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Reprise du journal existant (une seule fois : ne refait rien si déjà repris)
insert into public.evenements (dossier_id, quand, type, detail, source)
select r.id,
       coalesce(public.ts_sur(e->>'date'), r.created_at, now()),
       public.type_evenement(e->>'text'),
       e->>'text',
       'reprise journal'
from public.reservations r
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(public.jsonb_sur(r.timeline_json::text)) = 'array'
       then public.jsonb_sur(r.timeline_json::text) else '[]'::jsonb end) e
where coalesce(e->>'text', '') <> ''
  and not exists (select 1 from public.evenements x where x.source = 'reprise journal');

commit;

-- Contrôle après exécution (doit afficher les montants et le nombre d'événements par type) :
-- select segment, statut, count(*), round(sum(montant_ht)) as ht from public.reservations group by 1, 2 order by 1, 2;
-- select type, count(*) from public.evenements group by 1 order by 2 desc;
