import {calculerDecompte} from './gsb-v4-depot-vente-calculs.mjs';

// Les quantités viennent de l'inventaire validé; les prix exclusivement du snapshot verrouillé.
export function calculerEmissionVerrouillee({draft,inventory,locked}) {
  if (!inventory || inventory.status !== 'validated' || !Array.isArray(inventory.lines)) throw Error('Inventaire validé requis');
  if (!locked || !Array.isArray(locked.lines)) throw Error('Tarifs verrouillés requis');
  const quantities = new Map(inventory.lines.map(l => [l.productId, l]));
  if (quantities.size !== inventory.lines.length || quantities.size !== locked.lines.length) throw Error('Références divergentes');
  const lignes = locked.lines.map(p => {
    const q = quantities.get(p.productId);
    if (!q) throw Error('Produit absent de l’inventaire');
    return {
      id: p.productId, depart: q.depart, apports: q.apports ?? 0,
      retours: q.retours, pertes: q.pertes ?? 0,
      prixUnitaireCentimes: p.prixUnitaireCentimes,
      fraisRetourCentimes: p.fraisRetourCentimes ?? 0
    };
  });
  const d = calculerDecompte({lignes, prestations: locked.serviceCentimes ? [{montantHTCentimes:locked.serviceCentimes}] : [], tauxTVA: locked.tauxTVA});
  return {totalHTCentimes:d.totalHTCentimes,totalTVACentimes:d.tvaCentimes,totalTTCCentimes:d.totalTTCCentimes};
}
