// Orchestration métier V4 TEST : déclarations client -> validation prestataire -> clôture.
// Aucun accès Firebase ; le serveur devra vérifier l'identité et l'état des documents.
import {validerInventaires} from './gsb-v4-validation-inventaires.mjs';
import {preparerCloture} from './gsb-v4-cloture-evenement-TEST.mjs';

const requireText=(s,label)=>{if(typeof s!=='string'||!s.trim())throw Error(`${label} requis`);return s.trim()};
const indexed=(rows,label)=>{
  if(!Array.isArray(rows))throw Error(`${label} invalide`);
  const seen=new Set();
  return rows.map(row=>{
    const productId=requireText(row.productId,`Produit ${label}`);
    if(seen.has(productId))throw Error(`Doublon ${label} : ${productId}`);
    seen.add(productId);
    if(!Number.isSafeInteger(row.quantite)||row.quantite<0)throw Error(`Quantité ${label} invalide`);
    return {productId,quantite:row.quantite};
  });
};
/** Ne clôture que des déclarations soumises et rapprochées des mouvements physiques. */
export function preparerClotureDepuisDeclarations({eventId,depart,fin,mouvements,tarifs,validatorUid,mode='global',bars=[],prestations=[],tauxTVA=2000,version=1}){
  requireText(eventId,'Événement');requireText(validatorUid,'Validateur');
  if(!Array.isArray(mouvements))throw Error('Mouvements invalides');
  const d=indexed(depart?.lines,'départ');
  const f=indexed(fin?.lines,'fin');
  // Le rapprochement utilise les mouvements comme source d'autorité pour les apports et pertes.
  // On ne permet pas de leur substituer des chiffres fournis par le client.
  const cloture=preparerCloture({eventId,mode,bars,mouvements,departClient:d,finClient:f,tarifs,prestations,tauxTVA,validatorUid});
  if(!cloture.peutCloturer)return {...cloture,bilanValide:null};
  const apports=cloture.bilan.details.map(d=>({productId:d.productId,quantite:d.reapprovisionnements}));
  const pertes=cloture.bilan.details.map(d=>({productId:d.productId,quantite:d.pertes}));
  const bilanValide=validerInventaires({eventId,depart,fin,apports,pertes,validatorUid,version});
  const validated=new Map(bilanValide.lines.map(l=>[l.productId,l]));
  for(const detail of cloture.bilan.details){
    const v=validated.get(detail.productId);
    if(!v || v.depart!==detail.departClient || v.retours!==detail.finClient || v.apports!==detail.reapprovisionnements || v.pertes!==detail.pertes){
      return {...cloture,peutCloturer:false,decompte:null,bilanValide:null,anomalies:[{code:'BILAN_MOUVEMENTS_INCOHERENT',productId:detail.productId}]};
    }
  }
  return {...cloture,bilanValide};
}
