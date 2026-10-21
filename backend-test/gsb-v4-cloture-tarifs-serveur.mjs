/** V4 TEST : les montants proviennent uniquement du dossier événement Firestore.
 * Ce module prépare un décompte, sans émission de facture ni écriture.
 */
import {creerLectureCloture} from './gsb-v4-lecture-cloture-firestore.mjs';
const id=(s,n)=>{if(typeof s!=='string'||!/^[\w-]{1,120}$/.test(s))throw Error(`${n} invalide`);return s};
const cents=(n,label)=>{if(!Number.isSafeInteger(n)||n<0||n>1e9)throw Error(`${label} invalide`);return n};
const rate=(n)=>{if(!Number.isSafeInteger(n)||n<0||n>10000)throw Error('TVA invalide');return n};
/**
 * Schéma attendu sur events/{eventId} :
 * pricingLocked: true,
 * pricingSnapshot: [{productId, nom, prixUnitaireCentimes, fraisRetourCentimes}],
 * prestationsSnapshot: [{libelle, montantHTCentimes}], tauxTVA: 2000.
 * Ces champs doivent être modifiables uniquement par le prestataire AVANT verrouillage.
 */
export function creerClotureAvecTarifsVerrouilles(db,structureId='punish-concept') {
 const lire=creerLectureCloture(db,structureId);
 return async function preparer({eventId,clientUid,validatorUid}) {
  id(structureId,'Structure');id(eventId,'Événement');id(clientUid,'Client');id(validatorUid,'Validateur');
  const root=`structures/${structureId}`;
  const structure=await db.doc(root).get();
  if(!structure.exists||structure.data()?.ownerUid!==validatorUid)throw Error('Accès prestataire requis');
  const snap=await db.doc(`${root}/events/${eventId}`).get();
  if(!snap.exists)throw Error('Événement introuvable');
  const event=snap.data();
  if(event.pricingLocked!==true)throw Error('Tarifs événement non verrouillés');
  const prices=event.pricingSnapshot;
  if(!Array.isArray(prices)||!prices.length||prices.length>200)throw Error('Grille tarifaire invalide');
  const seen=new Set();
  const tarifs=prices.map(p=>{
   const productId=id(p.productId,'Produit');
   if(seen.has(productId))throw Error('Tarif dupliqué');seen.add(productId);
   if(typeof p.nom!=='string'||!p.nom.trim()||p.nom.length>200)throw Error('Nom boisson invalide');
   return {productId,nom:p.nom.trim(),prixUnitaireCentimes:cents(p.prixUnitaireCentimes,'Prix'),fraisRetourCentimes:cents(p.fraisRetourCentimes??0,'Frais de retour')};
  });
  const rawFees=event.prestationsSnapshot??[];
  if(!Array.isArray(rawFees)||rawFees.length>100)throw Error('Prestations invalides');
  const prestations=rawFees.map(p=>{
   if(typeof p.libelle!=='string'||!p.libelle.trim()||p.libelle.length>200)throw Error('Libellé prestation invalide');
   return {libelle:p.libelle.trim(),montantHTCentimes:cents(p.montantHTCentimes,'Montant prestation')};
  });
  const tauxTVA=rate(event.tauxTVA);
  // Ne jamais accepter les tarifs/prestations transmis par le navigateur.
  const result=await lire({eventId,clientUid,validatorUid,tarifs,prestations,tauxTVA});
  return {...result,pricingVersion:event.pricingVersion??null};
 };
}
