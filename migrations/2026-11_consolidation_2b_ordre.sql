-- Consolidation n°2b (17/11/2026) — ordre des envois repris de « Suivi Log » (source « reprise suivi »).
-- Ils étaient tous posés à midi : le même jour, une relance pouvait passer avant le devis et ne pas être comptée.
-- On les décale de quelques secondes selon leur position dans Suivi Log. Sans effet si déjà fait (secondes ≠ 0).
update public.evenements e
   set quand = e.quand + make_interval(secs => strpos(r.suivi_log, e.detail))
  from public.reservations r
 where r.id = e.dossier_id
   and e.source = 'reprise suivi'
   and extract(second from e.quand) = 0
   and strpos(r.suivi_log, e.detail) > 0;
