/** Validation prestataire des inventaires client, exclusivement côté serveur Admin SDK.
 * Les documents client ne sont jamais directement promus par le navigateur.
 */
const id=(v,label)=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(v))throw Error(`${label} invalide`);return v};
export function creerValidationInventaire(db,structureId='punish-concept'){
 if(!db?.doc||!db?.runTransaction)throw Error('Firestore Admin requis');
 const root=`structures/${id(structureId,'Structure')}`;
 return async ({eventId,clientUid,phase,validatorUid,expectedRevision,decision='valider',motif=''})=>{
  id(eventId,'Événement');id(clientUid,'Client');id(validatorUid,'Validateur');
  if(!['depart','fin'].includes(phase))throw Error('Phase invalide');
  if(!['valider','rejeter'].includes(decision))throw Error('Décision invalide');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw Error('Révision invalide');
  if(decision==='rejeter'&&(typeof motif!=='string'||!motif.trim()||motif.length>500))throw Error('Motif obligatoire');
  const structureRef=db.doc(root),eventRef=db.doc(`${root}/events/${eventId}`);
  const invRef=db.doc(`${root}/clientInventorySubmissions/${eventId}__${clientUid}__${phase}`);
  return db.runTransaction(async tx=>{
   // Toutes les lectures avant les écritures (contrainte Firestore).
   const [structureSnap,eventSnap,invSnap]=await Promise.all([tx.get(structureRef),tx.get(eventRef),tx.get(invRef)]);
   if(!structureSnap.exists||structureSnap.data()?.ownerUid!==validatorUid)throw Error('Accès prestataire requis');
   if(!eventSnap.exists||eventSnap.data()?.clientUid!==clientUid)throw Error('Client ou événement invalide');
   if(['closed','cancelled'].includes(eventSnap.data()?.status))throw Error('Événement verrouillé');
   if(!invSnap.exists)throw Error('Inventaire absent');
   const inv=invSnap.data();
   if(inv.eventId!==eventId||inv.clientUid!==clientUid||inv.phase!==phase)throw Error('Inventaire incohérent');
   if(inv.status!=='submitted')throw Error('Inventaire non soumis ou déjà traité');
   if(inv.revision!==expectedRevision)throw Error('Inventaire modifié : actualiser');
   const quantities=inv.quantites;
   if(!quantities||typeof quantities!=='object'||Array.isArray(quantities)||Object.keys(quantities).length===0||Object.keys(quantities).length>200||Object.entries(quantities).some(([k,v])=>!/^[A-Za-z0-9_-]{1,120}$/.test(k)||!Number.isSafeInteger(v)||v<0||v>1000000))throw Error('Quantités invalides');
   const status=decision==='valider'?'validated':'rejected';
   tx.update(invRef,{status,validatedBy:validatorUid,validatedAt:new Date(),validationMotif:decision==='rejeter'?motif.trim():null});
   return {eventId,clientUid,phase,revision:expectedRevision,status};
  });
 };
}
