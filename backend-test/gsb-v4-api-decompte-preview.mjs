/** Aperçu de décompte V4 TEST : lecture seule, réservé au propriétaire. */
import {creerClotureAvecTarifsVerrouilles} from './gsb-v4-cloture-tarifs-serveur.mjs';
const ident=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
export function creerHandlerApercuDecompte({db,verifyIdToken,structureId='punish-concept',originAutorisee}) {
 if(!db||typeof verifyIdToken!=='function'||!originAutorisee)throw Error('Configuration manquante');
 const preparer=creerClotureAvecTarifsVerrouilles(db,structureId);
 return async(req,res)=>{
  const origin=req.headers?.origin;
  const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if(origin===originAutorisee)h['Access-Control-Allow-Origin']=originAutorisee;
  const send=(status,data)=>{res.writeHead(status,h);res.end(JSON.stringify(data))};
  if(origin&&origin!==originAutorisee)return send(403,{error:'Origine non autorisée'});
  if(req.method==='OPTIONS'){
   if(origin!==originAutorisee)return send(403,{error:'Origine requise'});
   res.writeHead(204,{...h,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});return res.end();
  }
  if(req.method!=='POST')return send(405,{error:'Méthode non autorisée'});
  const token=/^Bearer (\S+)$/.exec(req.headers?.authorization||'')?.[1];
  if(!token)return send(401,{error:'Authentification requise'});
  let bodyText='';
  try {
   for await(const chunk of req){bodyText+=chunk.toString('utf8');if(Buffer.byteLength(bodyText)>8192)return send(413,{error:'Requête trop volumineuse'});}
   const body=JSON.parse(bodyText);
   if(!body||Array.isArray(body)||!ident(body.eventId)||!ident(body.clientUid))return send(400,{error:'Identifiants invalides'});
   const identity=await verifyIdToken(token);
   if(!ident(identity?.uid))return send(401,{error:'Identité invalide'});
   const result=await preparer({eventId:body.eventId,clientUid:body.clientUid,validatorUid:identity.uid});
   return send(200,{ok:true,result});
  }catch(e){return send(403,{error:'Accès refusé ou décompte non disponible'});}
 };
}
