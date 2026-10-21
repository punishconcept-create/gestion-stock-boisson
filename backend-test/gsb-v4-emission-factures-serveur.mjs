/** V4 TEST. À exécuter UNIQUEMENT dans un backend privilégié (Admin SDK).
 * adapter.transaction(callback) provides tx.get(path), tx.create(path,data), tx.update(path,patch).
 * The adapter must enforce atomicity, Firestore create preconditions, and server-side auth.
 */
import {verifierEmission,numeroFacture} from './gsb-v4-factures-cycle.mjs';
const root=sid=>`structures/${sid}`;
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(s);
const amount=n=>Number.isSafeInteger(n)&&n>=0;
const str=s=>typeof s==='string'&&s.trim().length>0;
export async function emettreFacture({adapter,sid,eventId,actorUid,prestataire,client,dateEmission,dateEcheance,calculer}){
  if(!id(sid)||!id(eventId)||!str(actorUid))throw Error('Identifiants invalides');
  if(typeof calculer!=='function')throw Error('Calculateur serveur requis');
  const p=root(sid),invoicePath=`${p}/invoices/${eventId}`;
  return adapter.transaction(async tx=>{
    const [event,draft,inventory,existing,member]=await Promise.all([
      tx.get(`${p}/events/${eventId}`),tx.get(`${p}/invoiceDrafts/${eventId}`),
      tx.get(`${p}/validatedEventInventories/${eventId}`),tx.get(invoicePath),
      tx.get(`${p}/collaborators/${actorUid}`)
    ]);
    if(existing)throw Error('Facture déjà émise pour cet événement');
    if(!event||!draft||!inventory)throw Error('Données de facturation manquantes');
    if(!member||!['owner','admin'].includes(member.role)||member.active===false)throw Error('Accès refusé');
    if(event.status==='cancelled')throw Error('Événement annulé');
    verifierEmission({brouillon:draft,inventaire:inventory,prestataire,client,dateEmission,dateEcheance});
    const totals=calculer(draft);
    if(!totals||!amount(totals.totalHTCentimes)||!amount(totals.totalTVACentimes)||!amount(totals.totalTTCCentimes)||totals.totalHTCentimes+totals.totalTVACentimes!==totals.totalTTCCentimes)throw Error('Montants invalides');
    const year=Number(dateEmission.slice(0,4)),counterPath=`${p}/invoiceCounters/${year}`;
    const counter=await tx.get(counterPath);
    const next=(counter?.lastSequence??0)+1;
    if(!Number.isSafeInteger(next)||next<1)throw Error('Compteur invalide');
    const numero=numeroFacture(year,next);
    // Snapshot immutable. The invoice must not be editable by browser clients.
    const invoice={eventId,numero,status:'issued',issuedBy:actorUid,dateEmission,dateEcheance,
      prestataire:structuredClone(prestataire),client:structuredClone(client),
      lines:structuredClone(draft.lines),serviceCentimes:draft.serviceCentimes??0,
      tauxTVA:draft.tauxTVA,inventoryVersion:inventory.version??null,
      totalHTCentimes:totals.totalHTCentimes,totalTVACentimes:totals.totalTVACentimes,
      totalTTCCentimes:totals.totalTTCCentimes,createdAt:adapter.serverTimestamp()};
    tx.create(invoicePath,invoice);
    if(counter)tx.update(counterPath,{lastSequence:next});
    else tx.create(counterPath,{lastSequence:next});
    return {numero,eventId,totalTTCCentimes:totals.totalTTCCentimes};
  });
}
