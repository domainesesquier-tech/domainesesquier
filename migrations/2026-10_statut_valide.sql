-- Statuts du tableau de bord : à traiter, devis envoyé (« Envoyé »), devis signé (« Validé »), effectué, annulé (« Refusé »).
-- « confirmé » et « acompte reçu » sont supprimés : le tableau de bord les lit déjà comme « Validé ».
-- À exécuter à la mise en ligne de la V2 (SQL editor Supabase), après sauvegarde. Le planning garde son propre statut « confirmé ».
update reservations set statut = 'devis signé' where lower(statut) in ('confirmé', 'acompte reçu');
