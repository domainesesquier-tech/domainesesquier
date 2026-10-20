-- Motif du refus d'un dossier (saisi à la bascule en « Refusé »)
alter table reservations add column if not exists motif_refus text;
alter table reservations add column if not exists motif_refus_detail text;
