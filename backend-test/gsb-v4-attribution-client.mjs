/** Attribution sécurisée d'un compte client à un événement V4 TEST. */
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
const permissionsValides=p=>p&&typeof p==='object'&&!Array.isArray(p)&&['depart','fin','editBeforeSubmission'].every(k=>typeof p[k]==='boolean');
export function creerAttributionClient(db,sid='punish-concept') {
 if(!db?.doc||!db?.runTransaction||!id(sid))throw Error('Configuration invalide');
 const root=`structures/${sid}`;
 return async ({eventId,clientUid,actorUid,permissions,expectedRevision=0})=>{
  if(![eventId,clientUid,actorUid].every(id)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Paramètres invalides');
  if(!permissionsValides(permissions))throw Error('Permissions invalides');
  const structure=db.doc(root),event=db.doc(`${root}/events/${eventId}`);
  const start=db.doc(`${root}/clientInventorySubmissions/${eventId}__${clientUid}__depart`);
  const end=db.doc(`${root}/clientInventorySubmissions/${eventId}__${clientUid}__fin`);
  return db.runTransaction(async tx=>{
   const [s,e,d,f]=await Promise.all([tx.get(structure),tx.get(event),tx.get(start),tx.get(end)]);
   if(!s.exists||s.data()?.ownerUid!==actorUid)throw Error('Accès refusé');
   if(!e.exists||!['created','draft','open','active'].includes(e.data()?.status))throw Error('Événement indisponible');
   const old=e.data();
   if((old.clientAccessRevision??0)!==expectedRevision)throw Error('Révision obsolète');
   if(old.clientUid&&old.clientUid!==clientUid)throw Error('Client déjà attribué');
   if(d.exists||f.exists)throw Error('Inventaire déjà créé : autorisations verrouillées');
   // Les produits sont liés par les mouvements de livraison, pas nécessairement à la création.
   // Ne jamais autoriser une saisie d'inventaire de produits non livrés côté serveur.
   const nextRevision=expectedRevision+1;
   tx.update(event,{clientUid,clientInventoryPermissions:{depart:permissions.depart,fin:permissions.fin,editBeforeSubmission:permissions.editBeforeSubmission},clientAccessRevision:nextRevision,clientAccessUpdatedBy:actorUid,clientAccessUpdatedAt:new Date()});
   return {eventId,clientUid,revision:nextRevision,permissions};
  });
 };
}
