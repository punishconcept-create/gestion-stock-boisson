/** Passerelle V4 TEST. À appeler UNIQUEMENT depuis un backend de confiance.
 * verifyIdToken doit vérifier signature, expiration et révocation selon la politique retenue.
 * Le client ne choisit jamais sid ni actorUid.
 */
import {enregistrerPaiement, emettreAvoir} from './gsb-v4-reglements-avoirs-firestore-corrige.mjs';

const OPS = new Set(['paiement', 'avoir']);
const safeId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);

export function creerPasserelleFinance({adapter, verifyIdToken, structureId='punish-concept'}) {
  if (!adapter?.transaction || typeof verifyIdToken !== 'function' || !safeId(structureId)) {
    throw new Error('Configuration serveur invalide');
  }
  return async function traiter({idToken, operation, payload}) {
    if (typeof idToken !== 'string' || !idToken || !OPS.has(operation)) throw new Error('Requête invalide');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Données invalides');
    // Authentification avant toute transaction; autorisation owner/admin vérifiée dans le module métier.
    const identity = await verifyIdToken(idToken);
    if (!safeId(identity?.uid)) throw new Error('Identité invalide');
    // Liste blanche: empêche les champs injectés de remplacer actorUid, sid ou adapter.
    if (operation === 'paiement') {
      const {eventId, operationId, montantCentimes, date, moyen, reference} = payload;
      return enregistrerPaiement({adapter,sid:structureId,actorUid:identity.uid,eventId,operationId,montantCentimes,date,moyen,reference});
    }
    const {eventId, operationId, motif, montantHTCentimes, montantTVACentimes, dateEmission} = payload;
    return emettreAvoir({adapter,sid:structureId,actorUid:identity.uid,eventId,operationId,motif,montantHTCentimes,montantTVACentimes,dateEmission});
  };
}
