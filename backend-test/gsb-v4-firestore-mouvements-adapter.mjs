/** Adaptateur serveur Firestore Admin pour mouvements événementiels V4 TEST.
 * À utiliser derrière une API authentifiée ; jamais dans le navigateur.
 */
import {executerMouvement, validerOperation} from './gsb-v4-mouvements-evenements.mjs';
const id=s=>{if(typeof s!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(s))throw Error('Identifiant invalide');return s};
export function creerServiceMouvements(db, FieldValue, structureId='punish-concept'){
 if(!db?.doc||!db?.runTransaction||!FieldValue?.serverTimestamp)throw Error('Firestore Admin requis');
 const root=`structures/${id(structureId)}`;
 const doc=p=>db.doc(`${root}/${p}`);
 const stockPath=key=>{
  const parts=key.split(':');
  if(parts[0]==='depot'&&parts.length===3)return `stocks/${id(parts[1])}__${id(parts[2])}`;
  if(parts[0]==='event'&&parts.length===4)return `eventStocks/${id(parts[1])}__${id(parts[2])}__${id(parts[3])}`;
  throw Error('Clé stock invalide');
 };
 return async function enregistrerMouvement(input,verifiedUid){
  const op=validerOperation(input);
  if(!verifiedUid||op.actorUid!==verifiedUid)throw Error('Identité non autorisée');
  return executerMouvement(op,callback=>db.runTransaction(async native=>{
   let written=false;const read=async path=>{
    if(written)throw Error('Lecture après écriture');
    const snap=await native.get(doc(path));return snap.exists?snap.data():null;
   };
   const tx={
    getMovement:(eventId,operationId)=>read(`eventMovements/${id(eventId)}__${id(operationId)}`),
    getEvent:eventId=>read(`events/${id(eventId)}`),
    getProduct:productId=>read(`products/${id(productId)}`),
    getDepot:depotId=>read(`locations/${id(depotId)}`),
    getStock:async key=>read(stockPath(key)),
    putStock:(key,data)=>{written=true;native.set(doc(stockPath(key)),data,{merge:true})},
    putMovement:(eventId,operationId,data)=>{written=true;native.create(doc(`eventMovements/${id(eventId)}__${id(operationId)}`),{...data,createdAt:FieldValue.serverTimestamp()})}
   };
   // Vérification du rôle avant toute écriture et avant les autres lectures.
   const structureSnap=await native.get(db.doc(root));
   const structure=structureSnap.exists?structureSnap.data():null;
   const collaborator=await read(`collaborators/${id(verifiedUid)}`);
   if(structure?.ownerUid!==verifiedUid && collaborator?.role!=='admin')throw Error('Accès prestataire requis');
   return callback(tx);
  }));
 }
}
