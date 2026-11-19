-- Consolidation n°4 (19/11/2026) — le planning suit les dossiers, quelle que soit l'origine de la modification
-- (tableau de bord, devis, signature en ligne, questionnaire, Apps Script…). Remplace syncToPlanning() de index.html.
-- Règles (identiques à l'ancienne synchro de la page, sauf mention) :
--   · dossier annulé → son entrée sort du planning (sauf si archivée), le lien est effacé
--   · devis signé / effectué → « Confirmé » (avant : effectué repassait en « Option »)
--   · à traiter / devis envoyé → « Option » ; « Demandé » (questionnaire) reste tel quel tant que le dossier est à traiter
--   · entrée « Archivé » ou « Annulé » au planning → jamais retouchée (choix fait au planning)
--   · pas d'entrée → création avec tous les logements, seulement pour un séjour à venir,
--     et pas pour les leads du questionnaire partiel encore à traiter
--   · dossier supprimé → son entrée sort du planning (sauf si archivée)
-- Les entrées du planning sans dossier (Airbnb, week-ends, réservations directes) ne sont jamais lues ni modifiées.

begin;

create or replace function public.planning_sync(r public.reservations) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_st      text := lower(coalesce(r.statut, ''));
  v_pid     text := nullif(r.planning_id, '');
  v_actuel  text;
  v_trouve  boolean := false;
  v_type    text;
  v_montant numeric;
  v_nouveau planning.id%type;
begin
  if v_pid is not null then
    select statut into v_actuel from planning where id::text = v_pid;
    v_trouve := found;
  end if;

  -- Choix fait au planning : on n'y touche pas
  if v_trouve and v_actuel in ('Archivé', 'Annulé') then return v_pid; end if;

  if v_st = 'annulé' then
    if v_trouve then delete from planning where id::text = v_pid; end if;
    return null;
  end if;

  if r.date_arrivee is null or r.date_depart is null then
    return case when v_trouve then v_pid end;
  end if;

  v_type := case when r.type ilike '%mariage%' then 'Mariage'
                 when coalesce(btrim(r.type), '') = '' or r.type ilike '%minaire%' or r.type ilike '%professionnel%' then 'Séminaire'
                 else 'Week-end privé' end;
  v_montant := coalesce(
    public.num_sur(public.jsonb_sur(r.dossier_json) #>> '{financials,totalHT}'),
    nullif(coalesce(r.montant_hebergement_ht, 0) + coalesce(r.montant_repas_ht, 0) + coalesce(r.montant_options_ht, 0), 0));

  if v_trouve then
    update planning set
      nom          = coalesce(r.nom_client, ''),
      type         = v_type,
      date_arrivee = r.date_arrivee,
      date_depart  = r.date_depart,
      statut       = case when v_st in ('devis signé', 'effectué') then 'Confirmé'
                          when v_st = 'à traiter' and v_actuel = 'Demandé' then 'Demandé'
                          else 'Option' end,
      nb_personnes = nullif(r.nombre_de_personnes, 0),
      montant      = coalesce(v_montant, montant)
    where id::text = v_pid;
    return v_pid;
  end if;

  -- Pas (ou plus) d'entrée : création seulement pour un séjour à venir, hors lead partiel
  if r.date_depart < current_date or v_st = 'effectué'
     or (v_st = 'à traiter' and coalesce(r.suivi_source, '') like 'lead · %') then
    return null;
  end if;
  insert into planning (nom, type, date_arrivee, date_depart, statut, nb_personnes, montant, logements)
  values (coalesce(r.nom_client, ''), v_type, r.date_arrivee, r.date_depart,
          case when v_st = 'devis signé' then 'Confirmé' else 'Option' end,
          nullif(r.nombre_de_personnes, 0), v_montant,
          array['Acacia','Hibiscus','Pivoine','Belle de nuit','Iris','Rose','Figuier','Jasmin',
                'Clos Josette','Sous les toits','Champs d''Olivier','Archipel'])
  returning id into v_nouveau;
  return v_nouveau::text;
end $$;

-- Avant chaque enregistrement d'un dossier : met le planning à jour et pose le lien planning_id
create or replace function public.reservations_vers_planning() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.statut              is not distinct from old.statut
     and new.nom_client          is not distinct from old.nom_client
     and new.type                is not distinct from old.type
     and new.date_arrivee        is not distinct from old.date_arrivee
     and new.date_depart         is not distinct from old.date_depart
     and new.nombre_de_personnes is not distinct from old.nombre_de_personnes
     and new.dossier_json        is not distinct from old.dossier_json
     and new.montant_hebergement_ht is not distinct from old.montant_hebergement_ht
     and new.montant_repas_ht    is not distinct from old.montant_repas_ht
     and new.montant_options_ht  is not distinct from old.montant_options_ht then
    return new;  -- rien qui concerne le planning
  end if;
  new.planning_id := public.planning_sync(new);
  return new;
end $$;
drop trigger if exists reservations_vers_planning on public.reservations;
create trigger reservations_vers_planning before insert or update on public.reservations
  for each row execute function public.reservations_vers_planning();

create or replace function public.reservations_retrait_planning() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if nullif(old.planning_id, '') is not null then
    delete from planning where id::text = old.planning_id and coalesce(statut, '') <> 'Archivé';
  end if;
  return old;
end $$;
drop trigger if exists reservations_retrait_planning on public.reservations;
create trigger reservations_retrait_planning after delete on public.reservations
  for each row execute function public.reservations_retrait_planning();

-- Remise à plat unique des dossiers déjà liés (le déclencheur ignore ce changement : seul planning_id bouge)
do $$
declare r public.reservations; v text;
begin
  for r in select * from public.reservations where nullif(planning_id, '') is not null loop
    v := public.planning_sync(r);
    if v is distinct from r.planning_id then
      update public.reservations set planning_id = v where id = r.id;
    end if;
  end loop;
end $$;

commit;

-- Contrôle : statut du dossier → statut au planning
-- select lower(r.statut), p.statut, count(*) from public.reservations r
--   left join public.planning p on p.id::text = r.planning_id group by 1, 2 order by 1, 2;
