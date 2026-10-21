/** Contrôles serveur avant émission. Les données client ne sont jamais une source de prix. */
const entier=n=>Number.isSafeInteger(n)&&n>=0;
const texte=s=>typeof s==='string'&&s.trim().length>0;
export function verifierSourcesFacture({event,draft,inventory}) {
  if(!event||!draft||!inventory)throw Error('Documents manquants');
  if(event.status!=='closed'||inventory.status!=='validated')throw Error('Événement ou inventaire non validé');
  const b=event.billingSnapshot;
  if(!b||b.locked!==true||!Array.isArray(b.lines))throw Error('Tarifs événement non verrouillés');
  if(!event.billingParties?.supplier||!event.billingParties?.customer)throw Error('Coordonnées légales manquantes');
  for(const party of [event.billingParties.supplier,event.billingParties.customer]) {
    if(!texte(party.nom)||!texte(party.adresse))throw Error('Identité de facturation incomplète');
  }
  if(b.lines.length!==draft.lines?.length)throw Error('Références tarifaires divergentes');
  const byId=new Map();
  for(const line of b.lines){
    if(!texte(line.productId)||!entier(line.prixUnitaireCentimes)||byId.has(line.productId))throw Error('Tarifs verrouillés invalides');
    byId.set(line.productId,line);
  }
  for(const line of draft.lines){
    const locked=byId.get(line.productId);
    if(!locked||line.prixUnitaireCentimes!==locked.prixUnitaireCentimes)throw Error('Tarif brouillon différent du tarif verrouillé');
  }
  if(!entier(b.serviceCentimes??0)||!entier(draft.serviceCentimes??0)||b.serviceCentimes!==draft.serviceCentimes)throw Error('Prestations non verrouillées');
  if(!entier(b.tauxTVA)||b.tauxTVA!==draft.tauxTVA)throw Error('TVA différente du tarif verrouillé');
  return {prestataire:structuredClone(event.billingParties.supplier),client:structuredClone(event.billingParties.customer),lines:structuredClone(b.lines),serviceCentimes:b.serviceCentimes,tauxTVA:b.tauxTVA};
}
