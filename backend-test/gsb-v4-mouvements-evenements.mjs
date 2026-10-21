/** V4 TEST — mouvements événementiels atomiques.
 * Stock dépôt: structures/{sid}/stocks/{locationId}__{productId}
 * Stock événement: structures/{sid}/eventStocks/{eventId}__{barId}__{productId}
 * Usage serveur avec Firebase Admin, jamais directement depuis un client non fiable.
 */
const integer=(v,n)=>{if(!Number.isSafeInteger(v)||v<0)throw Error(`${n}: entier positif ou nul requis`);return v};
const identifier=(v,n)=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(v))throw Error(`${n}: identifiant invalide`);return v};
const assertSafe=(n)=>{if(!Number.isSafeInteger(n))throw Error('Dépassement de quantité');return n};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const allowedTypes=new Set(['livraison','retour','transfert_bar','perte','consommation']);
export function validerOperation(o){
 if(!o||!allowedTypes.has(o.type))throw Error('Type de mouvement invalide');
 for(const k of ['operationId','eventId','productId','actorUid'])identifier(o[k],k);
 integer(o.quantity,'quantity');if(!o.quantity)throw Error('Quantité strictement positive requise');
 if(o.type==='livraison'||o.type==='retour')identifier(o.depotId,'depotId');
 if(o.type==='livraison'&&o.phase!==undefined&&!['depart','reapprovisionnement'].includes(o.phase))throw Error('Phase livraison invalide');
 if(o.type==='livraison'||o.type==='retour'||o.type==='transfert_bar'||o.type==='perte'||o.type==='consommation')identifier(o.barId,'barId');
 if(o.type==='transfert_bar'){identifier(o.destinationBarId,'destinationBarId');if(o.barId===o.destinationBarId)throw Error('Bars identiques');}
 return Object.freeze({type:o.type,operationId:o.operationId,eventId:o.eventId,productId:o.productId,actorUid:o.actorUid,quantity:o.quantity,depotId:o.depotId||null,barId:o.barId,destinationBarId:o.destinationBarId||null,...(o.type==='livraison'&&o.phase?{phase:o.phase}:{})});
}
export function construireMouvement(o){
 const op=validerOperation(o);const e=(bar)=>`event:${op.eventId}:${bar}:${op.productId}`,d=()=>`depot:${op.depotId}:${op.productId}`;
 const transfers={livraison:[[d(),-op.quantity],[e(op.barId),op.quantity]],retour:[[e(op.barId),-op.quantity],[d(),op.quantity]],transfert_bar:[[e(op.barId),-op.quantity],[e(op.destinationBarId),op.quantity]],perte:[[e(op.barId),-op.quantity]],consommation:[[e(op.barId),-op.quantity]]};
 return {operation:op,deltas:transfers[op.type]};
}
/** runTransaction: transaction adapter exposing getStock, getMovement, putStock, putMovement, getEvent, getBar, getDepot, getProduct.
 * Transaction reads happen before any write. Idempotency key is scoped to the event.
 */
export async function executerMouvement(o,runTransaction){
 const {operation:op,deltas}=construireMouvement(o);
 if(typeof runTransaction!=='function')throw Error('Transaction requise');
 return runTransaction(async tx=>{
   const [previous,event,product,...stockValues]=await Promise.all([
     tx.getMovement(op.eventId,op.operationId),tx.getEvent(op.eventId),tx.getProduct(op.productId),
     ...deltas.map(([key])=>tx.getStock(key))
   ]);
   if(previous){if(!same(previous.operation,op))throw Error('Clé idempotence déjà utilisée pour une autre opération');return {duplicate:true,operationId:op.operationId};}
   if(!event||event.status==='closed'||event.status==='cancelled')throw Error('Événement introuvable ou fermé');
   if(!product||product.archived)throw Error('Boisson introuvable ou archivée');
   if(event.mode!=='global'&&event.mode!=='multi')throw Error('Mode événement invalide');
   if(event.mode==='global'&&(op.barId!=='global'||op.destinationBarId))throw Error('Mode global : bar global obligatoire');
   if(event.mode==='multi'){
     const bars=[op.barId,...(op.destinationBarId?[op.destinationBarId]:[])];
     for(const bar of bars)if(!Array.isArray(event.barIds)||!event.barIds.includes(bar))throw Error('Bar non autorisé pour cet événement');
   }
   if(op.depotId){const depot=await tx.getDepot(op.depotId);if(!depot||depot.archived)throw Error('Dépôt inexistant ou archivé');}
   const writes=[];
   for(let i=0;i<deltas.length;i++){
     const [key,delta]=deltas[i];const current=integer(stockValues[i]?.quantity??0,'stock');const next=assertSafe(current+delta);
     if(next<0)throw Error(`Stock insuffisant : ${key}`);
     writes.push([key,next]);
   }
   // The caller must verify actor permissions server-side before invoking this method.
   for(const [key,quantity] of writes)tx.putStock(key,{quantity,lastMovementId:op.operationId});
   tx.putMovement(op.eventId,op.operationId,{operation:op,deltas,createdAt:'SERVER_TIMESTAMP'});
   return {duplicate:false,operationId:op.operationId,stocks:Object.fromEntries(writes)};
 });
}
