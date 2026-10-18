-- ════════════════════════════════════════════════════════════════════
-- Questionnaire de devis public : insertion d'une demande par le Worker.
-- Préparé le 2026-10-17, À EXÉCUTER au moment de la mise en ligne V2.
-- Le rôle anon ne peut qu'appeler cette fonction : il ne lit rien et
-- n'écrit que les colonnes listées ici : dossier en « à traiter »,
-- entrée de calendrier en « Demandé ».
-- ════════════════════════════════════════════════════════════════════
create or replace function public.public_demande(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid planning.id%type;
begin
  -- 1) Calendrier : la date passe en « Demandé » (affichée « sur demande » sur le calendrier public)
  -- logements obligatoire : une demande bloque l'ensemble du domaine (liste habituelle des réservations de groupe)
  insert into planning (nom, type, date_arrivee, date_depart, statut, nb_personnes, montant, notes, contact_tel, logements)
  values (
    left(p->>'nom_client', 200),
    case p->>'segment' when 'groupe' then 'Week-end privé' when 'mariage' then 'Mariage' else 'Séminaire' end,
    (p->>'date_arrivee')::date, (p->>'date_depart')::date, 'Demandé',
    least(greatest(coalesce((p->>'nombre_de_personnes')::int, 0), 0), 500),
    nullif(p->>'estimation_ht', '')::numeric,
    'Demande reçue via le questionnaire du site', left(p->>'telephone', 40),
    array['Acacia','Hibiscus','Pivoine','Belle de nuit','Iris','Rose','Figuier','Jasmin','Clos Josette','Sous les toits','Champs d''Olivier','Archipel']
  )
  returning id into v_pid;

  -- 2) Dossier client, relié à l'entrée du calendrier
  insert into reservations (
    id, nom_client, entreprise, prenom_contact, nom_contact, email, telephone,
    type, statut, date_arrivee, date_depart, nombre_de_personnes,
    message, budget_estime, suivi_source, details_json, planning_id
  ) values (
    p->>'id',
    left(p->>'nom_client', 200), left(p->>'entreprise', 200),
    left(p->>'prenom_contact', 100), left(p->>'nom_contact', 100),
    left(p->>'email', 200), left(p->>'telephone', 40),
    case p->>'segment' when 'groupe' then 'séjour de groupe' when 'mariage' then 'mariage' else 'Séminaire' end, 'à traiter',
    (p->>'date_arrivee')::date, (p->>'date_depart')::date,
    least(greatest(coalesce((p->>'nombre_de_personnes')::int, 0), 0), 500),
    left(p->>'message', 4000), left(p->>'budget_estime', 100),
    left(p->>'suivi_source', 60), left(p->>'details_json', 15000), v_pid::text
  );
end;
$$;

revoke all on function public.public_demande(jsonb) from public;
grant execute on function public.public_demande(jsonb) to anon, authenticated;
