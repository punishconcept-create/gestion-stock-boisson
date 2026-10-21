/** Endpoint HTTP pour la passerelle finance V4 TEST.
 * Brancher sur un serveur Firebase Functions/Cloud Run de confiance.
 * Ne jamais embarquer l'Admin SDK ou ses secrets dans le navigateur.
 */
import {creerPasserelleFinance} from './gsb-v4-passerelle-finance-serveur.mjs';

export function creerHandlerFinance({adapter,verifyIdToken,structureId='punish-concept',originAutorisee}) {
  if (!originAutorisee || typeof originAutorisee !== 'string') throw Error('Origine autorisée requise');
  const traiter=creerPasserelleFinance({adapter,verifyIdToken,structureId});
  return async function handler(req,res) {
    const origin=req.headers?.origin;
    const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','Vary':'Origin'};
    if (origin===originAutorisee) headers['Access-Control-Allow-Origin']=originAutorisee;
    const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
    if (origin && origin!==originAutorisee) return send(403,{error:'Origine non autorisée'});
    if (req.method==='OPTIONS') {
      if (!origin) return send(403,{error:'Origine requise'});
      res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});return res.end();
    }
    if(req.method!=='POST') return send(405,{error:'Méthode non autorisée'});
    const auth=req.headers?.authorization||'';
    if(!/^Bearer \S+$/.test(auth)) return send(401,{error:'Authentification requise'});
    // Limite explicite pour ne pas accepter des requêtes démesurées.
    const limit=32*1024;
    let raw='';
    try {
      for await (const chunk of req) {
        raw+=chunk.toString('utf8');
        if(Buffer.byteLength(raw,'utf8')>limit) return send(413,{error:'Requête trop volumineuse'});
      }
      const body=JSON.parse(raw);
      if(!body || typeof body!=='object' || Array.isArray(body)) return send(400,{error:'Corps invalide'});
      const result=await traiter({idToken:auth.slice(7),operation:body.operation,payload:body.payload});
      return send(200,{ok:true,result});
    } catch(err) {
      // Ne pas exposer les détails internes ni les données Firestore.
      return send(400,{error:'Opération refusée ou données invalides'});
    }
  };
}
