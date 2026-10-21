// V4 TEST — contrôle métier de clôture, sans accès réseau ni écriture Firebase.
import {rapprocherEvenement} from './gsb-v4-rapprochement-evenement.mjs';
import {calculerDecompte} from './gsb-v4-depot-vente-calculs.mjs';
const entier=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(`${label} invalide`);return n};
const texte=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error(`${label} requis`);return v.trim()};
/**
 * Prépare un décompte à partir des mouvements physiques ET des inventaires soumis.
 * La clôture exige que toutes les bouteilles non consommées soient reprises,
 * et que les quantités départ soient confirmées par le client.
 * Ne crée aucune facture officielle; la validation/numérotation est serveur.
 */
export function preparerCloture({eventId,mode='global',bars=[],mouvements=[],departClient=[],finClient=[],tarifs=[],prestations=[],tauxTVA=2000,validatorUid}) {
 texte(eventId,'Événement');texte(validatorUid,'Validateur');
 const bilan=rapprocherEvenement({eventId,mode,bars,mouvements,departClient,finClient});
 const anomalies=[...bilan.anomalies];
 const byPrice=new Map();
 if(!Array.isArray(tarifs))throw Error('Tarifs invalides');
 for(const t of tarifs){const id=texte(t.productId,'Référence tarif');if(byPrice.has(id))throw Error('Tarif dupliqué');byPrice.set(id,{nom:texte(t.nom,'Nom boisson'),prixUnitaireCentimes:entier(t.prixUnitaireCentimes,'Prix'),fraisRetourCentimes:entier(t.fraisRetourCentimes??0,'Frais de retour')})}
 const lignes=[];
 for(const d of bilan.details){
  if(d.finClient!==null && d.retoursPhysiques!==d.finClient)anomalies.push({code:'RETOURS_NON_CONFIRMES',productId:d.productId,declares:d.finClient,physiques:d.retoursPhysiques});
  const t=byPrice.get(d.productId);
  if(!t){anomalies.push({code:'TARIF_MANQUANT',productId:d.productId});continue}
  if(d.departClient===null||d.finClient===null)continue;
  lignes.push({id:d.productId,nom:t.nom,depart:d.departClient,apports:d.reapprovisionnements,retours:d.finClient,pertes:d.pertes,prixUnitaireCentimes:t.prixUnitaireCentimes,fraisRetourCentimes:t.fraisRetourCentimes});
 }
 for(const id of byPrice.keys())if(!bilan.details.some(d=>d.productId===id))anomalies.push({code:'TARIF_SANS_MOUVEMENT',productId:id});
 if(anomalies.length)return {eventId,peutCloturer:false,anomalies,bilan,decompte:null};
 // Le moteur de facturation compte les pertes à part, au tarif bouteille.
 const decompte=calculerDecompte({lignes,prestations,tauxTVA});
 return {eventId,peutCloturer:true,anomalies:[],bilan,decompte,validatorUid};
}
