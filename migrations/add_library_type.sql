-- Ajout des colonnes pour la bibliothèque déroulé
alter table bibliotheque_prestations
  add column if not exists type text default 'devis',
  add column if not exists heure text,
  add column if not exists tag text;

-- Marquer les items existants comme type devis
update bibliotheque_prestations set type = 'devis' where type is null;
