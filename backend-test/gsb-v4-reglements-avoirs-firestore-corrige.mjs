/** V4 TEST — fonctions à exécuter exclusivement côté serveur avec Firebase Admin SDK.
 * adapter.transaction(fn) assure atomicité; tx.get/create/update; adapter.serverTimestamp().
 * Authentification de actorUid obligatoire en amont (jeton Firebase vérifié).
 */
const validId = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const nonnegative = x => Number.isSafeInteger(x) && x >= 0;
const required = (x,label) => {if(typeof x!=='string'||!x.trim())throw Error(label+' requis');return x.trim()};
const prefix = sid => `structures/${sid}`;
const validDate = x => typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x+'T00:00:00Z')) && new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function checkArgs({sid,eventId,actorUid,operationId}) {if(![sid,eventId,actorUid,operationId].every(validId))throw Error('Identifiants invalides')}
async function getAuthorized(tx,p,actorUid){const member=await tx.get(`${p}/collaborators/${actorUid}`);if(!member||!['owner','admin'].includes(member.role)||member.active===false)throw Error('Accès refusé')}
function assertInvoice(invoice){if(!invoice||invoice.status!=='issued'||!nonnegative(invoice.totalTTCCentimes))throw Error('Facture émise requise')}
/** Paiement comptabilisé sans mutation de la facture originale. Identifiant d'opération idempotent. */
export async function enregistrerPaiement({adapter,sid,eventId,actorUid,operationId,montantCentimes,date,moyen,reference=''}){
 checkArgs({sid,eventId,actorUid,operationId});if(!positive(montantCentimes)||!validDate(date))throw Error('Montant ou date invalide');
 required(moyen,'Moyen de paiement');if(typeof reference!=='string'||reference.length>250)throw Error('Référence invalide');
 const p=prefix(sid),path=`${p}/invoicePayments/${operationId}`;
 return adapter.transaction(async tx=>{
  await getAuthorized(tx,p,actorUid);
  const existing=await tx.get(path);
  if(existing){if(existing.eventId!==eventId||existing.montantCentimes!==montantCentimes||existing.date!==date||existing.moyen!==moyen||existing.reference!==reference)throw Error('Identifiant réutilisé pour une autre opération');return {id:operationId,duplicate:true};}
  const invoice=await tx.get(`${p}/invoices/${eventId}`);assertInvoice(invoice);
  const ledgerPath=`${p}/invoiceLedgers/${eventId}`;
  const ledgerDoc=await tx.get(ledgerPath);
  const ledger=ledgerDoc||{paidCentimes:0,creditedTTCCentimes:0};
  if(!nonnegative(ledger.paidCentimes)||!nonnegative(ledger.creditedTTCCentimes))throw Error('Grand livre invalide');
  const due=invoice.totalTTCCentimes-ledger.creditedTTCCentimes-ledger.paidCentimes;
  if(montantCentimes>due)throw Error('Paiement supérieur au solde : remboursement à gérer séparément');
  tx.create(path,{eventId,invoiceNumero:invoice.numero,montantCentimes,date,moyen,reference,actorUid,createdAt:adapter.serverTimestamp()});
  if(ledgerDoc)tx.update(ledgerPath,{paidCentimes:ledger.paidCentimes+montantCentimes});
  else tx.create(ledgerPath,{paidCentimes:montantCentimes,creditedTTCCentimes:0});
  return {id:operationId,duplicate:false,remainingCentimes:due-montantCentimes};
 });
}
/** Avoir complet ou partiel. Montants HT/TVA/TTC calculés et validés côté serveur.
 * Pour les factures déjà réglées, l'avoir crée un crédit à rembourser, sans effacer les paiements.
 */
export async function emettreAvoir({adapter,sid,eventId,actorUid,operationId,motif,montantHTCentimes,montantTVACentimes,dateEmission}){
 checkArgs({sid,eventId,actorUid,operationId});required(motif,'Motif');
 if(!positive(montantHTCentimes)||!nonnegative(montantTVACentimes)||!validDate(dateEmission))throw Error('Montants ou date invalides');
 const montantTTCCentimes=montantHTCentimes+montantTVACentimes;
 if(!Number.isSafeInteger(montantTTCCentimes))throw Error('Montant trop élevé');
 const p=prefix(sid),path=`${p}/creditNotes/${operationId}`;
 return adapter.transaction(async tx=>{
  await getAuthorized(tx,p,actorUid);
  const existing=await tx.get(path);
  if(existing){if(existing.eventId!==eventId||existing.montantHTCentimes!==montantHTCentimes||existing.montantTVACentimes!==montantTVACentimes||existing.motif!==motif||existing.dateEmission!==dateEmission)throw Error('Identifiant réutilisé pour une autre opération');return {id:operationId,numero:existing.numero,duplicate:true};}
  const invoice=await tx.get(`${p}/invoices/${eventId}`);assertInvoice(invoice);
  const ledgerPath=`${p}/invoiceLedgers/${eventId}`;
  const ledgerDoc=await tx.get(ledgerPath);
  const ledger=ledgerDoc||{paidCentimes:0,creditedTTCCentimes:0,creditedHTCentimes:0,creditedTVACentimes:0};
  const ht=ledger.creditedHTCentimes??0,tva=ledger.creditedTVACentimes??0;
  if(![ht,tva,ledger.paidCentimes,ledger.creditedTTCCentimes].every(nonnegative))throw Error('Grand livre invalide');
  if(ht+montantHTCentimes>invoice.totalHTCentimes||tva+montantTVACentimes>invoice.totalTVACentimes||ledger.creditedTTCCentimes+montantTTCCentimes>invoice.totalTTCCentimes)throw Error('Avoir supérieur au montant facturé disponible');
  const year=Number(dateEmission.slice(0,4)),counterPath=`${p}/creditNoteCounters/${year}`;
  const counter=await tx.get(counterPath),seq=(counter?.lastSequence??0)+1;
  if(!Number.isSafeInteger(seq))throw Error('Compteur invalide');
  const numero=`AV-${year}-${String(seq).padStart(6,'0')}`;
  tx.create(path,{eventId,invoiceNumero:invoice.numero,numero,motif,montantHTCentimes,montantTVACentimes,montantTTCCentimes,dateEmission,actorUid,status:'issued',createdAt:adapter.serverTimestamp()});
  if(counter)tx.update(counterPath,{lastSequence:seq});else tx.create(counterPath,{lastSequence:seq});
  const next={paidCentimes:ledger.paidCentimes,creditedHTCentimes:ht+montantHTCentimes,creditedTVACentimes:tva+montantTVACentimes,creditedTTCCentimes:ledger.creditedTTCCentimes+montantTTCCentimes};
  if(ledgerDoc)tx.update(ledgerPath,next);else tx.create(ledgerPath,next);
  return {id:operationId,numero,duplicate:false,remainingCentimes:Math.max(0,invoice.totalTTCCentimes-next.creditedTTCCentimes-next.paidCentimes),refundDueCentimes:Math.max(0,next.paidCentimes+next.creditedTTCCentimes-invoice.totalTTCCentimes)};
 });
}
