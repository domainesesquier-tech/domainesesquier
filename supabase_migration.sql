-- ============================================================
-- DOMAINE SESQUIER — Migration Supabase
-- Colle ce script dans l'éditeur SQL de Supabase et exécute-le
-- ============================================================

-- 1. TABLE GITES
CREATE TABLE IF NOT EXISTS gites (
    id SERIAL PRIMARY KEY,
    nom TEXT NOT NULL,
    lits_doubles INTEGER DEFAULT 0,
    lits_doubles_separables INTEGER DEFAULT 0,
    lits_simples INTEGER DEFAULT 0,
    lits_simples_mezzanine INTEGER DEFAULT 0,
    canape_lits INTEGER DEFAULT 0,
    cap_canape_prive INTEGER DEFAULT 0,
    cap_canape_seminaire INTEGER DEFAULT 0,
    lit_appoint INTEGER DEFAULT 0,
    capacite_max_prive INTEGER DEFAULT 0,
    capacite_max_seminaire INTEGER DEFAULT 0
);

INSERT INTO gites (nom, lits_doubles, lits_doubles_separables, lits_simples, lits_simples_mezzanine, canape_lits, cap_canape_prive, cap_canape_seminaire, lit_appoint, capacite_max_prive, capacite_max_seminaire) VALUES
('Acacia',      1,1,2,0,1,2,1,0,6,5),
('Hibiscus',    1,1,2,2,0,0,0,0,6,6),
('Jasmin',      1,1,0,0,1,1,1,1,4,4),
('Pivoine',     1,1,2,0,0,0,0,0,4,4),
('Iris',        1,0,2,0,0,0,0,0,4,4),
('Belle de nuit',1,0,2,0,1,2,1,0,6,5),
('Rose',        1,1,0,0,1,2,1,0,4,3),
('Figuier',     1,1,0,0,0,0,0,0,2,2);

-- 2. TABLE POLITIQUE TARIFAIRE
CREATE TABLE IF NOT EXISTS politique_tarifaire (
    id SERIAL PRIMARY KEY,
    categorie TEXT,
    type TEXT,
    intitule TEXT,
    unite TEXT,
    pu NUMERIC(10,2),
    tva_pct NUMERIC(5,2),
    prix_ttc NUMERIC(10,2),
    code TEXT,
    condition TEXT,
    duree_min_nuits INTEGER DEFAULT 0,
    duree_max_nuits INTEGER DEFAULT 99,
    nb_pers_min INTEGER DEFAULT 1,
    nb_pers_max INTEGER DEFAULT 99
);

INSERT INTO politique_tarifaire (categorie, type, intitule, unite, pu, tva_pct, prix_ttc, code, condition, duree_min_nuits, duree_max_nuits, nb_pers_min, nb_pers_max) VALUES
('Forfait draps','Perso','Draps','/pers (forfait)',6.40,10,7.04,'FORFAIT_DRAPS_PERSO_DRAPS',NULL,3,99,1,99),
('Option','Perso','Ménage fin de séjour','forfait',400.00,20,480.00,'OPTION_PERSO_MENAGE',NULL,0,99,1,99),
('Repas','Perso','Dîner','/pers',27.00,10,29.70,'REPAS_PERSO_DINER',NULL,0,99,1,99),
('Privatisation du domaine','Perso','Privatisation lieu','forfait',500.00,20,600.00,'PRIVATISATION_PERSO_LIEU',NULL,0,99,1,99),
('Repas','Perso','Déjeuner','/pers',24.00,10,26.40,'REPAS_PERSO_DEJ',NULL,0,99,1,99),
('Repas','Perso','Petit-déjeuner','/pers',11.00,10,12.10,'REPAS_PERSO_PDJ',NULL,0,99,1,99),
('Hébergement','Perso','Nuitée','/pers/nuit',48.00,10,52.80,'HEBERGEMENT_PERSO_NUITEE_2NUITS','2 nuits, 35-37 pers',2,2,35,37),
('Hébergement','Perso','Nuitée','/pers/nuit',46.00,10,50.60,'HEBERGEMENT_PERSO_NUITEE_3PLUS','3+ nuits, 25-29 pers',3,99,25,29),
('Hébergement','Perso','Nuitée','/pers/nuit',46.00,10,50.60,'HEBERGEMENT_PERSO_NUITEE_2NUITS_40PLUSPERS','2 nuits, 40+ pers',2,2,40,99),
('Hébergement','Perso','Nuitée','/pers/nuit',52.00,10,57.20,'HEBERGEMENT_PERSO_NUITEE_2NUITS_25_29PERS','2 nuits, 25-29 pers',2,2,25,29),
('Hébergement','Perso','Nuitée','/pers/nuit',44.00,10,48.40,'HEBERGEMENT_PERSO_NUITEE_3PLUS_35_37PERS','3+ nuits, 35-37 pers',3,99,35,37),
('Hébergement','Perso','Nuitée','/pers/nuit',48.00,10,52.80,'HEBERGEMENT_PERSO_NUITEE_3PLUS_20_24PERS','3+ nuits, 20-24 pers',3,99,20,23),
('Hébergement','Perso','Nuitée','/pers/nuit',50.00,10,55.00,'HEBERGEMENT_PERSO_NUITEE_2NUITS_30_34PERS','2 nuits, 30-34 pers',2,2,30,34),
('Hébergement','Perso','Nuitée','/pers/nuit',60.00,10,66.00,'HEBERGEMENT_PERSO_NUITEE_1NUIT_20_24PERS','1 nuit, 20-24 pers',1,1,20,24),
('Hébergement','Perso','Nuitée','/pers/nuit',56.00,10,61.60,'HEBERGEMENT_PERSO_NUITEE_1NUIT_30_34PERS','1 nuit, 30-34 pers',1,1,30,34),
('Hébergement','Perso','Nuitée','/pers/nuit',45.00,10,49.50,'HEBERGEMENT_PERSO_NUITEE_3PLUS_30_34PERS','3+ nuits, 30-34 pers',3,99,30,34),
('Hébergement','Perso','Nuitée','/pers/nuit',56.00,10,61.60,'HEBERGEMENT_PERSO_NUITEE_2NUITS_15_19PERS','2 nuits, 15-19 pers',2,2,15,19),
('Hébergement','Perso','Nuitée','/pers/nuit',54.00,10,59.40,'HEBERGEMENT_PERSO_NUITEE_2NUITS_20_24PERS','2 nuits, 20-24 pers',2,2,20,24),
('Hébergement','Perso','Nuitée','/pers/nuit',52.00,10,57.20,'HEBERGEMENT_PERSO_NUITEE_1NUIT_40PLUSPERS','1 nuit, 40+ pers',1,1,40,99),
('Hébergement','Perso','Nuitée','/pers/nuit',46.00,10,50.60,'HEBERGEMENT_PERSO_NUITEE_2NUITS_38_39PERS','2 nuits, 38-39 pers',2,2,38,39),
('Hébergement','Perso','Nuitée','/pers/nuit',52.00,10,57.20,'HEBERGEMENT_PERSO_NUITEE_1NUIT_38_39PERS','1 nuit, 38-39 pers',1,1,38,39),
('Hébergement','Perso','Nuitée','/pers/nuit',42.00,10,46.20,'HEBERGEMENT_PERSO_NUITEE_3PLUS_38_39PERS','3+ nuits, 38-39 pers',3,99,38,39),
('Hébergement','Perso','Nuitée','/pers/nuit',62.00,10,68.20,'HEBERGEMENT_PERSO_NUITEE_1NUIT_15_19PERS','1 nuit, 15-19 pers',1,1,15,19),
('Hébergement','Perso','Nuitée','/pers/nuit',58.00,10,63.80,'HEBERGEMENT_PERSO_NUITEE_1NUIT_25_29PERS','1 nuit, 25-29 pers',1,1,25,29),
('Hébergement','Perso','Nuitée','/pers/nuit',50.00,10,55.00,'HEBERGEMENT_PERSO_NUITEE_3PLUS_15_19PERS','3+ nuits, 15-19 pers',3,99,15,19),
('Hébergement','Perso','Nuitée','/pers/nuit',42.00,10,46.20,'HEBERGEMENT_PERSO_NUITEE_3PLUS_40PLUS','3+ nuits, 40+ pers',3,99,40,99),
('Hébergement','Perso','Nuitée','/pers/nuit',54.00,10,59.40,'HEBERGEMENT_PERSO_NUITEE_1NUIT_35_37PERS','1 nuit, 35-37 pers',1,1,35,37),
('Forfait draps','Séminaire','Draps','/pers (forfait)',0.00,10,NULL,'FORFAIT_DRAPS_SEMINAIRE_DRAPS',NULL,0,99,1,99),
('Option','Séminaire','Ménage fin de séjour','forfait',0.00,20,NULL,'OPTION_SEMINAIRE_MENAGE',NULL,0,99,1,99),
('Salle de travail','Séminaire','Salle de travail','/jour',550.00,20,660.00,'SALLE_TRAVAIL_SEMINAIRE','20-29 pers',0,99,20,29),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',64.00,10,70.40,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_30A34PERS_2NUITS','30 à 34 pers, 2 nuits',2,2,30,34),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',75.00,10,82.50,'HEBERGEMENT_SEMINAIRE_NUITEE_CHAMBREPARTAGEE_TWIN_10A19PERS_2NUITS','10 à 19 pers, 2 nuits',2,2,10,19),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',55.00,10,60.50,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_2NUITS_35A40PERS','35 à 40 pers, 2 nuits',2,2,30,40),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',52.00,10,57.20,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_3PLUS','35 à 40 pers, 3 nuits ou plus',3,99,1,40),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',70.00,10,77.00,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_1NUIT_30_34PERS','30 à 34 pers, 1 nuit',1,1,30,34),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',66.00,10,72.60,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_3PLUS_20A29PERS','20 à 29 pers, 3 nuits ou plus',3,99,20,29),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',68.00,10,74.80,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_1NUIT','35 à 40 pers, 1 nuit',1,1,30,40),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',70.00,10,77.00,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_20A29PERS_2NUITS','20 à 29 pers, 2 nuits',2,2,20,29),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',60.00,10,66.00,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_3PLUS_30A34PERS','30 à 34 pers, 3 nuits ou plus',3,99,30,34),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',80.00,10,88.00,'HEBERGEMENT_SEMINAIRE_NUITEE_CHAMBRE_PARTAGEE_TWIN_10_19PERS_1NUIT','10 à 19 pers, 1 nuit',1,1,10,19),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',70.00,10,77.00,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_3PLUS_10A19PERS','10 à 19 pers, 3 nuits ou plus',3,99,10,19),
('Hébergement','Séminaire','Nuitée chambre partagée (twin)','/pers/nuit',75.00,10,82.50,'HEBERGEMENT_SEMINAIRE_NUITEECHAMBREPARTAGEE_TWIN_1NUIT_20A29PERS','20 à 29 pers, 1 nuit',1,1,20,29),
('Repas','Séminaire','Petit-déjeuner','/pers',13.00,10,14.30,'REPAS_SEMINAIRE_PDJ',NULL,0,99,1,99),
('Repas','Séminaire','Déjeuner','/pers',25.00,10,27.50,'REPAS_SEMINAIRE_DEJEUNER',NULL,0,99,1,99),
('Repas','Séminaire','Collation','/pers',4.00,10,4.40,'REPAS_SEMINAIRE_COLLATION',NULL,0,99,1,99),
('Repas','Séminaire','Dîner','/pers',29.00,10,31.90,'REPAS_SEMINAIRE_DINER',NULL,0,99,1,99),
('Hébergement','Séminaire','Supplément chambre individuelle (single)','/pers/nuit',30.00,10,33.00,'HEBERGEMENT_SEMINAIRE_SUPPL_SINGLE',NULL,0,99,1,99),
('Repas','Séminaire','Pension complète (PDJ + déjeuner + dîner + 2 collations)','/pers/jour',70.00,10,77.00,'REPAS_SEMINAIRE_PENSION_70',NULL,0,99,1,99),
('Repas','Séminaire','Pension complète (PDJ + déjeuner + dîner)','/pers/jour',65.00,10,71.50,'REPAS_SEMINAIRE_PENSION_65',NULL,0,99,1,99),
('Salle de réception','Séminaire','Espace repas 150m² + cuisine','/jour',750.00,20,900.00,'SALLE_SEMINAIRE_ESPACEREPAS_150M2',NULL,0,99,1,99),
('Salle de travail','Séminaire','Salle de travail','/jour',500.00,20,600.00,'SALLE_TRAVAIL_SEMINAIRE_1_19','1-19 pers',0,99,1,19),
('Salle de travail','Séminaire','Salle de travail','/jour',600.00,20,720.00,'SALLE_TRAVAIL_SEMINAIRE_30_99','30-99 pers',0,99,30,99);

-- 3. TABLE RESERVATIONS
CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,  -- on garde les IDs Airtable pour compatibilité
    nom_client TEXT,
    email TEXT,
    telephone TEXT,
    type TEXT,
    statut TEXT DEFAULT 'à traiter',
    date_arrivee DATE,
    date_depart DATE,
    nombre_de_personnes INTEGER DEFAULT 0,
    option_draps TEXT,
    option_menage TEXT,
    repas_petit_dej INTEGER DEFAULT 0,
    repas_dejeuner INTEGER DEFAULT 0,
    repas_diner INTEGER DEFAULT 0,
    qte_collation INTEGER DEFAULT 0,
    montant_hebergement_ht NUMERIC(10,2) DEFAULT 0,
    montant_repas_ht NUMERIC(10,2) DEFAULT 0,
    montant_options_ht NUMERIC(10,2) DEFAULT 0,
    message TEXT,
    budget_estime TEXT,
    details_json TEXT,
    json_snapshot TEXT,
    dossier_json TEXT,
    timeline_json TEXT,
    rooming_json TEXT,
    notes TEXT,
    suivi_source TEXT,
    suivi_decideur TEXT,
    suivi_date_devis DATE,
    suivi_probabilite TEXT,
    suivi_date_relance DATE,
    suivi_prochaine_action TEXT,
    suivi_log TEXT,
    est_archive BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservations_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Import des réservations existantes
INSERT INTO reservations (id, nom_client, email, telephone, type, statut, date_arrivee, date_depart, nombre_de_personnes, option_draps, option_menage, repas_petit_dej, repas_dejeuner, repas_diner, qte_collation, montant_hebergement_ht, montant_repas_ht, montant_options_ht, message, budget_estime, json_snapshot, suivi_source, suivi_decideur, suivi_date_devis, suivi_probabilite, suivi_date_relance, suivi_prochaine_action, suivi_log) VALUES
('recCniBThJI6LCSNl','Yann Corderoc''h','yann.corderoch@yara.com','+33 6 86 37 02 96','séminaire professionnel','effectué','2026-03-18','2026-03-19',10,'Non','Non',10,10,10,20,1000.00,700.00,100.00,NULL,'1990,00€ TTC',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recIkxstxsyuATo8u','Cécile Les plaisirs du midi','smali.W05@gmail.com',NULL,'séminaire professionnel','annulé','2026-03-31','2026-04-01',15,'Non','Non',15,15,0,15,1500.00,675.00,500.00,NULL,'2540€ - 2810€ HT',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recqsYLxvjdrxr0d4','Mirly','julien@mirly.eu','06 71 33 30 67',NULL,'confirmé','2026-06-03','2026-06-04',40,'Non','Non',40,80,40,160,2800.00,4640.00,500.00,NULL,'7540€ - 8340€ HT',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recjUp4XlDLRALwUs','Fabrice Vincent','fabrice.vincent@ubikasec.com',NULL,'séminaire professionnel','annulé','2026-05-18','2026-05-19',4,'Non','Non',4,8,4,8,400.00,424.00,0.00,NULL,'780€ - 870€ HT',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('rec0GXwGFcJdrLo4w','Supertripper (Sarah)',NULL,'TEST','Séminaire professionnel','annulé','2026-05-14','2026-05-17',35,'Non','Non',20,40,20,40,1500.00,1860.12,650.00,'Source: Site Web','3680€ - 4080€ HT',NULL,'LinkedIn','lisa','2026-04-04','20%','2027-06-05','a faire','[01/05/2026 23:56] test'),
('recyu4cc10KHBOj2Q','ALTRAD','test@gmail.com',NULL,'séminaire professionnel','annulé','2026-09-08','2026-09-11',14,'Non','Non',42,42,42,84,2907.00,2751.20,1000.00,NULL,'8340€ - 9220€ HT',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recNTld7URPAgJb1k','Isabelle',NULL,NULL,'séminaire professionnel','devis envoyé','2026-09-09','2026-09-11',14,'Non','Non',28,42,28,70,3360.00,3122.00,1950.00,NULL,'6010€ - 6660€ HT',NULL,'Isabelle','Isabelle','2026-04-28',NULL,'2026-05-04',NULL,'[04/05/2026 11:47] Relancé le 4 mai 2026 sur Kactus'),
('recUNCI2NKUL05gzN','Christelle Pansier','christelle.pansier@lacostedbe.fr',NULL,NULL,'devis envoyé','2026-09-30','2026-10-01',20,'Non','Non',20,20,20,20,1520.00,1420.00,650.00,NULL,'3340€ - 3700€ HT',NULL,'Christelle Pansier','Christelle Pansier','2026-04-28','40%',NULL,'Relancer le 7 mai 2026','[04/05/2026 11:43] Relancé le 4 mai 2026, doit donner une réponse dans la semaine'),
('rec1AvT799DS6dSIl','Dilitrust (Val)',NULL,NULL,'Séminaire professionnel','à traiter',NULL,NULL,0,NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recoCQm7AA5bh9r77','D (Valentine)',NULL,NULL,'Séminaire professionnel','à traiter',NULL,NULL,0,NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recHOdE9Me3FjecxK','Dilitrsut (Vale)',NULL,NULL,'Séminaire professionnel','à traiter',NULL,NULL,0,NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recku8OBiPcKZW3t9','Valentine',NULL,NULL,'séminaire professionnel','à traiter','2026-06-30','2026-07-02',13,NULL,NULL,0,39,26,78,1820.00,2366.00,1000.00,NULL,'5805€',NULL,'Valentine','Valentine','2026-05-02','20%','2026-05-07','relancer',NULL),
('recJvi9r5XHUATi7K','Nouveau Dossier 02/05/2026',NULL,NULL,'séminaire professionnel','à traiter','2026-05-02',NULL,0,NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('rec61tcOoO8iFmFEd','Nouveau Dossier 05/05/2026',NULL,NULL,'séminaire professionnel','à traiter','2026-05-05',NULL,0,NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('recUVfX9HV6Lj6b51','Nouveau Dossier 05/05/2026',NULL,NULL,'séminaire professionnel','à traiter','2026-05-05',NULL,0,NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('rec5U0Oc91Yn5qzAU','Ines Pietresson de Saint','ines@ludico.fr',NULL,'séminaire professionnel','devis envoyé','2026-07-02','2026-07-03',41,'Non','Non',0,82,41,164,2170.00,4756.00,500.00,NULL,'8248€',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
('rec3k9p7ggNo7NgIJ','Laposte',NULL,NULL,'Séminaire professionnel','à traiter','2026-05-26','2026-05-27',14,NULL,NULL,0,0,0,0,NULL,NULL,NULL,'Source: Kactus',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);

-- 4. TABLE BIBLIOTHÈQUE PRESTATIONS
CREATE TABLE IF NOT EXISTS bibliotheque_prestations (
    id SERIAL PRIMARY KEY,
    nom TEXT NOT NULL,
    description TEXT,
    categorie TEXT,
    prix_ht NUMERIC(10,2) DEFAULT 0,
    tva TEXT DEFAULT '10%',
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active Row Level Security (RLS) — lecture publique, écriture authentifiée
ALTER TABLE gites ENABLE ROW LEVEL SECURITY;
ALTER TABLE politique_tarifaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque_prestations ENABLE ROW LEVEL SECURITY;

-- Politique : accès total avec la clé anon (pour le Worker)
CREATE POLICY "allow_all_gites" ON gites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tarifs" ON politique_tarifaire FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_reservations" ON reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_bibliotheque" ON bibliotheque_prestations FOR ALL USING (true) WITH CHECK (true);
