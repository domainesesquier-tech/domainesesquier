-- Ajout du champ déroulé de séjour sur la table reservations
alter table reservations add column if not exists deroule_json text;
