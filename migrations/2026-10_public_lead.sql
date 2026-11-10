-- ════════════════════════════════════════════════════════════════════
-- Leads du site (avant la demande de devis) : demande commencée sur le
-- questionnaire, brochure demandée, estimation faite, rappel demandé.
-- Préparé le 2026-10-30, À EXÉCUTER à la main dans le SQL Editor Supabase
-- avant de déployer le Worker (relançable sans risque).
-- Dossier en « à traiter », source « lead · <type> », SANS entrée de calendrier
-- (pas de dates bloquées). Le rôle anon ne lit rien.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.public_lead(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Demande commencée mise à jour (même id, même e-mail, toujours un lead)
  update reservations set
    entreprise          = coalesce(nullif(left(p->>'entreprise', 200), ''), entreprise),
    telephone           = coalesce(nullif(left(p->>'telephone', 40), ''), telephone),
    date_arrivee        = coalesce((p->>'date_arrivee')::date, date_arrivee),
    date_depart         = coalesce((p->>'date_depart')::date, date_depart),
    nombre_de_personnes = coalesce(nullif(least(greatest(coalesce((p->>'nombre_de_personnes')::int, 0), 0), 500), 0), nombre_de_personnes),
    message             = left(p->>'message', 4000),
    budget_estime       = coalesce(left(p->>'budget_estime', 100), budget_estime),
    details_json        = left(p->>'details_json', 15000)
  where id = p->>'id' and suivi_source like 'lead · %' and lower(email) = lower(p->>'email');
  if found then return; end if;

  insert into reservations (
    id, nom_client, entreprise, prenom_contact, nom_contact, email, telephone,
    type, statut, date_arrivee, date_depart, nombre_de_personnes,
    message, budget_estime, suivi_source, details_json
  ) values (
    p->>'id',
    left(p->>'nom_client', 200), left(p->>'entreprise', 200),
    left(p->>'prenom_contact', 100), left(p->>'nom_contact', 100),
    left(p->>'email', 200), left(p->>'telephone', 40),
    case p->>'segment' when 'groupe' then 'séjour de groupe' when 'mariage' then 'mariage' else 'Séminaire' end, 'à traiter',
    (p->>'date_arrivee')::date, (p->>'date_depart')::date,
    least(greatest(coalesce((p->>'nombre_de_personnes')::int, 0), 0), 500),
    left(p->>'message', 4000), left(p->>'budget_estime', 100),
    left(p->>'suivi_source', 60), left(p->>'details_json', 15000)
  )
  on conflict do nothing;
end;
$$;

-- Demande complète reçue : la demande commencée et l'estimation du même e-mail (encore « à traiter »,
-- moins de 60 jours) sont remplacées par le dossier complet. Brochure et rappel sont conservés.
create or replace function public.public_lead_convertir(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from reservations
  where lower(email) = lower(p_email)
    and suivi_source in ('lead · partiel', 'lead · estimation')
    and statut = 'à traiter'
    and created_at > now() - interval '60 days';
$$;

revoke all on function public.public_lead(jsonb) from public;
revoke all on function public.public_lead_convertir(text) from public;
grant execute on function public.public_lead(jsonb) to anon, authenticated;
grant execute on function public.public_lead_convertir(text) to anon, authenticated;
