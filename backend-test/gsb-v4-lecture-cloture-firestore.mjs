/** Lecture seule du parcours événement -> inventaires -> décompte.
 * À exécuter exclusivement côté serveur avec Firestore Admin.
 * Aucun statut de validation ou facture n'est écrit par ce module.
 */
import {preparerClotureDepuisDeclarations} from './gsb-v4-parcours-inventaire-cloture.mjs';
const ident = (v,n) => {if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(v))throw Error(`${n} invalide`);return v};
const qty = (n) => Number.isSafeInteger(n)&&n>=0;
const lines = (raw) => {
 if(Array.isArray(raw))return raw;
 if(raw && typeof raw==='object' && !Array.isArray(raw))return Object.entries(raw).map(([productId,quantite])=>({productId,quantite}));
 throw Error('Quantités inventaire manquantes');
};
export function creerLectureCloture(db, structureId='punish-concept') {
 if(!db?.doc||!db?.collection)throw Error('Firestore Admin requis');
 const root=`structures/${ident(structureId,'Structure')}`;
 const read=async path=>{const snap=await db.doc(`${root}/${path}`).get();return snap.exists?snap.data():null};
 return async function lireEtPreparer({eventId,clientUid,validatorUid,tarifs,prestations=[],tauxTVA=2000}){
  ident(eventId,'Événement');ident(clientUid,'Client');ident(validatorUid,'Validateur');
  const structure=await db.doc(root).get();
  if(!structure.exists||structure.data()?.ownerUid!==validatorUid)throw Error('Accès prestataire requis');
  const event=await read(`events/${eventId}`);
  if(!event)throw Error('Événement introuvable');
  if(event.status==='closed'||event.status==='cancelled')throw Error('Événement clôturé ou annulé');
  if(event.clientUid!==clientUid)throw Error('Client non rattaché à cet événement');
  const [start,end,moveSnap]=await Promise.all([
   read(`clientInventorySubmissions/${eventId}__${clientUid}__depart`),
   read(`clientInventorySubmissions/${eventId}__${clientUid}__fin`),
   db.collection(`${root}/eventMovements`).where('operation.eventId','==',eventId).get()
  ]);
  if(!start||!end)throw Error('Inventaires départ et fin requis');
  const convert=(s,phase)=>{
   if(s.eventId!==eventId||s.clientUid!==clientUid||s.phase!==phase||s.status!=='validated')throw Error(`Inventaire ${phase} non validé ou non autorisé`);
   const l=lines(s.lines??s.quantites);
   if(!l.length||l.some(r=>!ident(r.productId,'Produit')||!qty(r.quantite)))throw Error('Inventaire invalide');
   return {...s,lines:l};
  };
  const mouvements=moveSnap.docs.map(s=>{
   const data=s.data(),op=data.operation;
   if(!op||op.eventId!==eventId||!qty(op.quantity)||op.quantity===0)throw Error('Mouvement incohérent');
   return {id:op.operationId,eventId,type:op.type,productId:op.productId,quantite:op.quantity,barId:op.barId,destinationBarId:op.destinationBarId,phase:op.phase};
  });
  // L'ordre réel est nécessaire pour détecter un stock négatif intermédiaire.
  // Ne jamais inférer cet ordre à partir de l'identifiant du document.
  const docs=moveSnap.docs;
  if(docs.some(s=>!s.data().createdAt?.toMillis))throw Error('Horodatage mouvement manquant');
  const ordered=docs.map((s,i)=>({...mouvements[i],at:s.data().createdAt.toMillis()})).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const livraisons=ordered.filter(m=>m.type==='livraison');
  if(livraisons.length>1&&livraisons.some(m=>!m.phase))throw Error('Phases de livraison manquantes : départ/réapprovisionnement');
  const mode=event.mode==='multi'?'multi':'global';
  const bars=mode==='multi'?event.barIds:[];
  if(mode==='multi'&&(!Array.isArray(bars)||!bars.length))throw Error('Bars manquants');
  return preparerClotureDepuisDeclarations({eventId,depart:convert(start,'depart'),fin:convert(end,'fin'),mouvements:ordered,tarifs,validatorUid,mode,bars,prestations,tauxTVA});
 };
}
