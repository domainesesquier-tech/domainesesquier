-- Consolidation n°2 (17/11/2026) — reprise dans le journal unique (evenements) des envois notés
-- seulement dans « Suivi Log » (bouton du Devis, anciennes relances). À exécuter UNE fois (ne refait rien si déjà repris).
-- Un envoi déjà présent dans evenements le même jour et du même type n'est pas recopié.
with lignes as (
  select r.id as dossier_id,
         to_date(m[1], 'DD/MM/YYYY') as jour,
         m[2] as detail,
         case when m[2] ilike 'relance signature%' then 'relance_signature'
              when m[2] ilike 'relance%'           then 'relance'
              when m[2] ilike 'devis envoy%'       then 'devis_envoye'
              else 'mail_brochure' end as type
  from public.reservations r
  cross join lateral regexp_matches(coalesce(r.suivi_log, ''),
    '(\d{2}/\d{2}/\d{4}) : (Devis envoyé|Relance signature envoyée[^\n]*|Relance envoyée[^\n]*|Mail brochure envoyé)', 'g') as m
)
insert into public.evenements (dossier_id, quand, type, detail, source)
select l.dossier_id, (l.jour + time '12:00') at time zone 'Europe/Paris', l.type, l.detail, 'reprise suivi'
from lignes l
where not exists (select 1 from public.evenements x
                  where x.dossier_id = l.dossier_id and x.type = l.type
                    and (x.quand at time zone 'Europe/Paris')::date = l.jour)
  and not exists (select 1 from public.evenements y where y.source = 'reprise suivi');

-- Contrôle : select source, type, count(*) from public.evenements group by 1, 2 order by 1, 2;
