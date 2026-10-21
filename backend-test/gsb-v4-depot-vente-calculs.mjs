// Gestion Stock Boisson V4 TEST — moteur de décompte pur (aucune écriture Firebase).
// Montants unitaires en centimes HT, quantités en bouteilles entières.
const entier=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(`${label} doit être un entier positif ou nul`);return n};
const argent=(n,label)=>entier(n,label);
export function calculerDecompte({lignes,prestations=[],tauxTVA=2000}) {
  entier(tauxTVA,'tauxTVA (centièmes de %)');
  if(tauxTVA>10000)throw Error('Taux TVA invalide');
  if(!Array.isArray(lignes)||!lignes.length)throw Error('Au moins une boisson est nécessaire');
  const ids=new Set();
  const details=lignes.map(l=>{
    if(!l.id||ids.has(l.id))throw Error('Référence manquante ou doublon');ids.add(l.id);
    const depart=entier(l.depart,'départ'),apports=entier(l.apports||0,'apports'),retours=entier(l.retours,'retours'),pertes=entier(l.pertes||0,'pertes');
    const disponible=depart+apports;
    if(retours+pertes>disponible)throw Error(`Quantités incohérentes : ${l.id}`);
    const consomme=disponible-retours-pertes;
    const prixUnitaire=argent(l.prixUnitaireCentimes,'prix unitaire');
    const fraisRetour=argent(l.fraisRetourCentimes||0,'frais retour');
    const montantBoissons=consomme*prixUnitaire;
    const montantPertes=pertes*prixUnitaire; // politique par défaut : pertes facturées au tarif boisson
    const montantRetour=retours*fraisRetour;
    for(const n of [montantBoissons,montantPertes,montantRetour])if(!Number.isSafeInteger(n))throw Error('Dépassement de montant');
    return {id:l.id,depart,apports,retours,pertes,consomme,prixUnitaireCentimes:prixUnitaire,fraisRetourCentimes:fraisRetour,montantBoissonsCentimes:montantBoissons,montantPertesCentimes:montantPertes,montantRetourCentimes:montantRetour,totalHTCentimes:montantBoissons+montantPertes+montantRetour};
  });
  const totalPrestations=prestations.reduce((sum,p)=>sum+argent(p.montantHTCentimes,'prestation'),0);
  const totalHT=details.reduce((sum,d)=>sum+d.totalHTCentimes,0)+totalPrestations;
  if(!Number.isSafeInteger(totalHT))throw Error('Dépassement de montant');
  const tva=Math.round(totalHT*tauxTVA/10000);
  return {details,totalPrestationsHTCentimes:totalPrestations,totalHTCentimes:totalHT,tvaCentimes:tva,totalTTCCentimes:totalHT+tva,tauxTVA};
}
