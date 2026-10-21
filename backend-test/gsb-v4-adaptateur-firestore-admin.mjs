/** Adaptateur Firestore Admin SDK pour modules de facturation V4 TEST.
 * Usage EXCLUSIVEMENT dans un environnement serveur de confiance.
 * Initialiser admin.firestore() dans le backend, jamais dans le navigateur.
 * Les chemins sont relatifs à la racine Firestore.
 */
export function createFirestoreAdminAdapter(db, adminFirestore) {
  if (!db?.runTransaction || !db?.doc || !adminFirestore?.FieldValue?.serverTimestamp) {
    throw new Error('Firestore Admin SDK requis');
  }
  return {
    serverTimestamp: () => adminFirestore.FieldValue.serverTimestamp(),
    transaction: fn => db.runTransaction(async nativeTx => {
      let writeStarted = false;
      const tx = {
        async get(path) {
          if (writeStarted) throw new Error('Lecture après écriture interdite dans une transaction Firestore');
          const snap = await nativeTx.get(db.doc(path));
          return snap.exists ? snap.data() : null;
        },
        create(path, data) {
          writeStarted = true;
          nativeTx.create(db.doc(path), data);
        },
        update(path, data) {
          writeStarted = true;
          nativeTx.update(db.doc(path), data);
        }
      };
      return fn(tx);
    })
  };
}
