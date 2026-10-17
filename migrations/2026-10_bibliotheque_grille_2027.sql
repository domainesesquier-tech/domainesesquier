-- ════════════════════════════════════════════════════════════════════
-- Bibliothèque de prestations : alignement sur la grille 2027 (séminaire)
-- Préparé le 2026-10-17, À EXÉCUTER UNE SEULE FOIS en production
-- (Supabase > SQL Editor) après validation dans la copie V2.
-- Hébergement et espaces ne sont plus dans la bibliothèque : ils sont
-- calculés par assets/pricing-engine.js. Les noms de catégories sont
-- conservés (ils pilotent la section du devis), refonte prévue plus tard.
-- ════════════════════════════════════════════════════════════════════
begin;

-- 1) Nouveaux champs : unité de prix et segment
alter table bibliotheque_prestations add column if not exists unite text;
alter table bibliotheque_prestations add column if not exists segment text default 'seminaire';

-- 2) Mises à jour de prix et de libellés
update bibliotheque_prestations set prix_ht = 20, unite = 'pers' where id = 4;
update bibliotheque_prestations set nom = 'Déjeuner — buffet ou grande tablée conviviale', prix_ht = 35, unite = 'pers',
  description = 'Entrée, plat et dessert maison préparés par nos chefs, servis en buffet ou posés au centre de la table. Café, eaux plate et gazeuse, service inclus. Menu au choix parmi une sélection.' where id = 5;
update bibliotheque_prestations set prix_ht = 15, unite = 'pers' where id = 6;
update bibliotheque_prestations set nom = 'Dîner — buffet ou grande tablée conviviale', prix_ht = 35, unite = 'pers',
  description = 'Entrée, plat et dessert maison préparés sur place par nos chefs, servis en buffet ou posés au centre de la table. Menu au choix parmi une sélection. Vin en supplément (+10 € HT/pers).' where id = 7;
update bibliotheque_prestations set prix_ht = 10, unite = 'pers' where id in (8, 9);
update bibliotheque_prestations set nom = 'Navette autocar gare SNCF ↔ Domaine (A/R)', prix_ht = 1000, unite = 'forfait',
  description = 'Autocar privatisé pour le groupe, aller et retour.' where id = 10;
update bibliotheque_prestations set prix_ht = 30, tva = '20%', unite = 'pers',
  description = 'Soirée animée par notre hôte : vins du Languedoc à l''aveugle, spécialités et musiques du Sud, matériel fourni.' where id = 11;
update bibliotheque_prestations set unite = 'forfait' where id in (12, 59, 61);
update bibliotheque_prestations set nom = 'Repas grillade en plein air — menu complet', prix_ht = 40, unite = 'pers' where id = 13;
update bibliotheque_prestations set nom = 'Bouteille de vin local (rouge ou blanc)', prix_ht = 16.67, unite = 'unite' where id = 14;
update bibliotheque_prestations set nom = 'Accueil café & mignardises', prix_ht = 10, unite = 'pers',
  description = 'Café, thé et infusions accompagnés d''une sélection de mignardises sucrées et salées, fruits et jus, servis dès votre arrivée.' where id = 15;
update bibliotheque_prestations set nom = 'Coordination des animations', prix_ht = 400, unite = 'jour',
  description = 'Conception et conduite des activités : déroulé, coordination des prestataires, animation des temps forts, coordinateur dédié présent les jours d''animation.' where id = 18;
update bibliotheque_prestations set prix_ht = 20, unite = 'pers' where id = 19;
update bibliotheque_prestations set nom = 'Workshop intelligence collective — ouverture & clôture (2 × 1h)', prix_ht = 750, unite = 'forfait',
  description = 'Séquence d''ouverture le premier jour et de clôture le dernier jour : conception sur mesure, fil conducteur, animation et matériel fournis.' where id = 21;
update bibliotheque_prestations set nom = 'Fût de bière artisanale Kisswing 30 L', prix_ht = 180, unite = 'unite',
  description = 'Fût de 30 L de la brasserie locale Kisswing : tireuse professionnelle, installation et gestion.' where id = 33;
update bibliotheque_prestations set prix_ht = 35, unite = 'pers' where id = 34;
update bibliotheque_prestations set prix_ht = 1000, unite = 'forfait' where id = 35;
update bibliotheque_prestations set nom = 'Formule apéritif soirée complète', prix_ht = 500, unite = 'forfait' where id = 52;
update bibliotheque_prestations set nom = 'L''étang à vélo — balade guidée', prix_ht = 45, unite = 'pers',
  description = 'Balade guidée à vélo entre vignes et étang de Thau : espace littoral protégé, points de vue, visite du village de Mèze. Location des vélos incluse.' where id = 62;

-- 3) Archivage (remplacées par le moteur de calcul, ou retirées de l'offre)
--    1 privatisation, 2-3 hébergement par personne, 17 salle de travail,
--    57 atelier huîtres, 60 Archipel format réception
update bibliotheque_prestations set actif = false where id in (1, 2, 3, 17, 57, 60);

-- 4) Nouvelles prestations
insert into bibliotheque_prestations (nom, description, categorie, prix_ht, tva, actif, type, unite, segment) values
  ('Fût de bière artisanale Kisswing 20 L', 'Fût de 20 L de la brasserie locale Kisswing : tireuse professionnelle, installation et gestion.', 'Restauration', 135, '20%', true, 'devis', 'unite', 'seminaire'),
  ('Supplément vin au repas', 'Vins locaux servis à table (1 bouteille pour 4 personnes).', 'Restauration', 10, '20%', true, 'devis', 'pers', 'seminaire'),
  ('Petit-déjeuner + panier repas départ', 'Petit-déjeuner complet servi au domaine et sac à emporter : sandwich maison, boisson fraîche, cake maison et fruit.', 'Restauration', 32.5, '10%', true, 'devis', 'pers', 'seminaire'),
  ('Pack soirée libre-service', 'Boissons en libre-service pour la soirée : bouteilles, glaçons, softs, verrerie.', 'Restauration', 20, '20%', true, 'devis', 'pers', 'seminaire'),
  ('Kayak guidé sur l''étang de Thau (2h)', 'Départ de la base nautique de Mèze en kayak double, accompagné et guidé, le long des parcs à huîtres. 30 participants maximum.', 'Team Building', 1000, '20%', true, 'devis', 'forfait', 'seminaire'),
  ('Navette VTC Montpellier ↔ Domaine (A/R)', 'Véhicule 7 places, aller et retour.', 'Activités & Services Annexes', 140, '20%', true, 'devis', 'unite', 'seminaire');

commit;
