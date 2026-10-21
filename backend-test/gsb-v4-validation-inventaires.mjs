// Gestion Stock Boisson V4 TEST — validation métier pure (aucune écriture Firebase).
const entier=(v,label)=>{if(!Number.isSafeInteger(v)||v<0)throw Error(`${label} doit être un entier positif`);return v};
const texte=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error(`${label} requis`);return v.trim()};
const cle=l=>texte(l.productId,'Référence produit');
function indexer(lignes){if(!Array.isArray(lignes)||!lignes.length)throw Error('Inventaire vide');const map=new Map();for(const l of lignes){const id=cle(l);if(map.has(id))throw Error('Référence dupliquée : '+id);map.set(id,l)}return map}
export function soumettreInventaire({eventId,phase,actorUid,autorisation,lignes,revision=1}){
 texte(eventId,'Événement');texte(actorUid,'Utilisateur');
 if(!['depart','fin'].includes(phase))throw Error('Phase inconnue');
 if(!autorisation||autorisation[phase]!==true)throw Error('Saisie non autorisée');
 entier(revision,'Révision');if(revision<1)throw Error('Révision invalide');
 const map=indexer(lignes);
 const result=[...map.values()].map(l=>({productId:cle(l),quantite:entier(l.quantite,'Quantité')}));
 return {eventId,phase,actorUid,revision,status:'submitted',lines:result};
}
export function validerInventaires({eventId,depart,fin,apports=[],pertes=[],validatorUid,version=1}){
 texte(eventId,'Événement');texte(validatorUid,'Validateur');entier(version,'Version');if(version<1)throw Error('Version invalide');
 for(const [d,phase] of [[depart,'depart'],[fin,'fin']])if(!d||d.eventId!==eventId||d.phase!==phase||d.status!=='submitted')throw Error(`Inventaire ${phase} non soumis`);
 const deb=indexer(depart.lines),ret=indexer(fin.lines);
 const extra=(items,label)=>{const map=new Map();for(const l of items){const id=cle(l);if(map.has(id))throw Error(label+' dupliqué');map.set(id,entier(l.quantite,label))}return map};
 const add=extra(apports,'Apports'),loss=extra(pertes,'Pertes');
 for(const id of [...ret.keys(),...add.keys(),...loss.keys()])if(!deb.has(id))throw Error('Référence absente du départ : '+id);
 const lines=[];
 for(const [id,d] of deb){const start=entier(d.quantite,'Départ'),received=add.get(id)||0,returned=ret.has(id)?entier(ret.get(id).quantite,'Restant'):0,lost=loss.get(id)||0;
  if(returned+lost>start+received)throw Error('Stock final incohérent : '+id);
  lines.push({productId:id,depart:start,apports:received,retours:returned,pertes:lost});
 }
 return {eventId,status:'validated',version,validatedBy:validatorUid,source:{departRevision:depart.revision,finRevision:fin.revision},lines};
}
