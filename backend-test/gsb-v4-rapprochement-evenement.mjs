// V4 TEST — rapprochement des mouvements physiques et des inventaires client.
// Module pur : ne modifie jamais Firestore. Les montants sont calculés ailleurs.
const entier=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(`${label} invalide`);return n};
const texte=(s,label)=>{if(typeof s!=='string'||!s.trim())throw Error(`${label} requis`);return s.trim()};
const key=(p,b)=>`${p}\u0000${b}`;
export function rapprocherEvenement({eventId,mode='global',bars=[],mouvements=[],departClient=[],finClient=[]}) {
 texte(eventId,'Événement');
 if(!['global','multi'].includes(mode))throw Error('Mode invalide');
 const barIds=mode==='global'?['global']:bars.map(b=>texte(b,'Bar'));
 if(!barIds.length||new Set(barIds).size!==barIds.length)throw Error('Bars invalides');
 const known=new Set(barIds), balances=new Map(),totals=new Map(),seen=new Set(),anomalies=[];
 const line=(p)=>{if(!totals.has(p))totals.set(p,{productId:p,livrees:0,departLivre:0,reapprovisionnements:0,retoursPhysiques:0,consommeTrace:0,pertes:0,soldeTheorique:0});return totals.get(p)};
 const balance=(p,b)=>balances.get(key(p,b))||0;
 const change=(p,b,n)=>{const next=balance(p,b)+n;if(next<0)anomalies.push({code:'STOCK_NEGATIF',productId:p,barId:b});balances.set(key(p,b),next)};
 for(const m of mouvements){
  if(m.eventId!==eventId)throw Error('Mouvement hors événement');
  const id=texte(m.id,'Identifiant mouvement');if(seen.has(id))throw Error('Mouvement dupliqué');seen.add(id);
  const p=texte(m.productId,'Produit'),q=entier(m.quantite,'Quantité');if(!q)throw Error('Quantité nulle');
  const b=m.barId||'global';if(!known.has(b))throw Error('Bar inconnu');
  const t=line(p);
  switch(m.type){
   case 'livraison':{
    if(m.phase!==undefined && !['depart','reapprovisionnement'].includes(m.phase))throw Error('Phase livraison invalide');
    change(p,b,q);t.livrees+=q;
    if(m.phase==='reapprovisionnement')t.reapprovisionnements+=q;else t.departLivre+=q;
    break;
   }
   case 'retour':change(p,b,-q);t.retoursPhysiques+=q;break;
   case 'consommation':change(p,b,-q);t.consommeTrace+=q;break;
   case 'perte':change(p,b,-q);t.pertes+=q;break;
   case 'transfert_bar':{
    const to=texte(m.destinationBarId,'Bar destinataire');if(!known.has(to)||to===b)throw Error('Transfert invalide');
    change(p,b,-q);change(p,to,q);break;
   }
   default:throw Error('Type de mouvement inconnu');
  }
 }
 const inventory=(rows,label)=>{const map=new Map();for(const r of rows){const p=texte(r.productId,'Produit');if(map.has(p))throw Error(`${label} dupliqué`);map.set(p,entier(r.quantite,label))}return map};
 const start=inventory(departClient,'Départ client'),end=inventory(finClient,'Fin client');
 const ids=new Set([...totals.keys(),...start.keys(),...end.keys()]);
 const details=[];
 for(const p of ids){
  const t=line(p),theoretical=[...balances].filter(([k])=>k.startsWith(`${p}\u0000`)).reduce((s,[,q])=>s+q,0);
  const d=start.get(p),f=end.get(p);
  if(d===undefined)anomalies.push({code:'DEPART_MANQUANT',productId:p});
  if(f===undefined)anomalies.push({code:'FIN_MANQUANTE',productId:p});
  if(d!==undefined&&d!==t.departLivre)anomalies.push({code:'DEPART_DIFFERENT_LIVRAISONS',productId:p,client:d,livre:t.departLivre});
  if(f!==undefined&&f>t.livrees)anomalies.push({code:'FIN_SUPERIEURE_LIVRAISONS',productId:p});
  // La fin client correspond aux bouteilles non ouvertes AVANT reprise physique.
  const retourAttendu=f??null;
  if(f!==undefined&&t.retoursPhysiques>f)anomalies.push({code:'RETOUR_SUPERIEUR_FIN',productId:p});
  // Consommation calculée = livré - fin client - pertes. Ne pas recompter les mouvements 'consommation'.
  const consomme=f===undefined?null:t.livrees-f-t.pertes;
  if(consomme!==null&&consomme<0)anomalies.push({code:'CONSOMMATION_NEGATIVE',productId:p});
  if(consomme!==null&&t.consommeTrace>consomme)anomalies.push({code:'CONSOMMATION_TRACEE_SUPERIEURE',productId:p});
  details.push({...t,soldeTheorique:theoretical,departClient:d??null,finClient:f??null,retourAttendu,consommeCalcule:consomme});
 }
 return {eventId,statut:anomalies.length?'a_verifier':'rapproche',peutValider:anomalies.length===0,details,anomalies};
}
