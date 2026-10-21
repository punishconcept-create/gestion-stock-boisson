/** V4 TEST : soumission/correction client avec verrouillage après validation.
 * Adapter transaction: tx.get(path), tx.create(path,data), tx.update(path,data).
 * Aucune écriture directe sur les stocks, tarifs ou factures.
 */
const validId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v);
export async function soumettreInventaireV2({adapter,sid,eventId,actorUid,phase,quantites,expectedRevision=0}) {
  if (!adapter?.transaction || !adapter?.serverTimestamp || ![sid,eventId,actorUid].every(validId) || !['depart','fin'].includes(phase)) throw Error('Paramètres invalides');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision<0) throw Error('Révision invalide');
  if (!quantites || typeof quantites !== 'object' || Array.isArray(quantites)) throw Error('Quantités invalides');
  const entries=Object.entries(quantites);
  if (!entries.length || entries.length>200 || entries.some(([id,n])=>!validId(id)||!Number.isSafeInteger(n)||n<0||n>1000000)) throw Error('Quantités invalides');
  const root=`structures/${sid}`, inventoryPath=`${root}/clientInventorySubmissions/${eventId}__${actorUid}__${phase}`;
  return adapter.transaction(async tx=>{
    const event=await tx.get(`${root}/events/${eventId}`);
    if (!event || event.clientUid!==actorUid || !['open','active','draft'].includes(event.status)) throw Error('Événement inaccessible');
    const perms=event.clientInventoryPermissions;
    if (!perms || perms[phase]!==true) throw Error('Phase non autorisée');
    if (!Array.isArray(event.productIds) || entries.some(([id])=>!event.productIds.includes(id))) throw Error('Référence non autorisée');
    const previous=await tx.get(inventoryPath);
    if ((previous?.revision??0)!==expectedRevision) throw Error('Conflit de révision');
    if (previous && (previous.status!=='submitted' || perms.editBeforeSubmission!==true)) throw Error('Inventaire verrouillé');
    const data={eventId,clientUid:actorUid,phase,quantites:Object.fromEntries(entries),status:'submitted',revision:expectedRevision+1,updatedAt:adapter.serverTimestamp()};
    if (previous) tx.update(inventoryPath,data); else tx.create(inventoryPath,data);
    return {eventId,phase,revision:data.revision,status:'submitted'};
  });
}
