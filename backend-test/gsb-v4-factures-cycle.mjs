// V4 TEST — logique métier pure. L'émission réelle exige une transaction serveur sécurisée.
const entier=(n,nom)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(nom+' invalide');return n};
const ident=(s,nom)=>{if(typeof s!=='string'||!s.trim())throw Error(nom+' requis');return s.trim()};
export function verifierEmission({brouillon,inventaire,prestataire,client,dateEmission,dateEcheance}){
 if(!brouillon||brouillon.status!=='draft')throw Error('Brouillon requis');
 if(!inventaire||inventaire.status!=='validated')throw Error('Inventaire non validé');
 if(brouillon.eventId!==inventaire.eventId)throw Error('Événement différent');
 if(brouillon.inventoryVersion!==undefined&&brouillon.inventoryVersion!==null&&brouillon.inventoryVersion!==inventaire.version)throw Error('Inventaire modifié');
 if(!Array.isArray(brouillon.lines)||!Array.isArray(inventaire.lines)||brouillon.lines.length!==inventaire.lines.length)throw Error('Lignes incompatibles');
 const map=new Map(inventaire.lines.map(l=>[l.productId,l]));
 if(map.size!==inventaire.lines.length)throw Error('Références dupliquées');
 for(const l of brouillon.lines){const i=map.get(l.productId);if(!i||['depart','apports','retours','pertes'].some(k=>l[k]!==i[k]))throw Error('Inventaire divergent');}
 for(const [o,n] of [[prestataire,'Prestataire'],[client,'Client']]){if(!o)throw Error(n+' requis');ident(o.nom,n+' nom');ident(o.adresse,n+' adresse');}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dateEmission)||!/^\d{4}-\d{2}-\d{2}$/.test(dateEcheance)||dateEcheance<dateEmission)throw Error('Dates invalides');
 return true;
}
export function numeroFacture(annee,sequence){entier(annee,'Année');entier(sequence,'Séquence');if(annee<2000||annee>2200||sequence<1)throw Error('Numérotation invalide');return `FAC-${annee}-${String(sequence).padStart(6,'0')}`}
export function etatReglement(totalTTCCentimes,paiements=[]){entier(totalTTCCentimes,'Total');let paye=0;const ids=new Set();for(const p of paiements){ident(p.id,'ID paiement');if(ids.has(p.id))throw Error('Paiement dupliqué');ids.add(p.id);ident(p.date,'Date');paye+=entier(p.montantCentimes,'Paiement');if(!Number.isSafeInteger(paye))throw Error('Dépassement numérique');}if(paye>totalTTCCentimes)throw Error('Trop-perçu : traiter séparément');return {payeCentimes:paye,resteCentimes:totalTTCCentimes-paye,statut:paye===totalTTCCentimes?'payee':paye===0?'a_regler':'partiellement_reglee'};}
export function preparerAvoir({facture,numeroAvoir,motif,montantHTCentimes}){if(!facture||facture.status!=='issued')throw Error('Facture émise requise');ident(numeroAvoir,'Numéro avoir');ident(motif,'Motif');entier(montantHTCentimes,'Montant avoir');if(montantHTCentimes>facture.totalHTCentimes)throw Error('Avoir supérieur au total HT');return {factureId:facture.id,numero:numeroAvoir,motif,montantHTCentimes,status:'draft'};}
