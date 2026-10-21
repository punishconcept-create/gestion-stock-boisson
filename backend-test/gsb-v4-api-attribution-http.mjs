/** API d'attribution client, identité vérifiée côté serveur. */
export function creerHandlerAttribution({attribuer,verifyIdToken,originAutorisee}) {
 if(typeof attribuer!=='function'||typeof verifyIdToken!=='function'||!originAutorisee)throw Error('Configuration invalide');
 return async(req,res)=>{
  const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if(req.headers?.origin===originAutorisee)h['Access-Control-Allow-Origin']=originAutorisee;
  const send=(code,obj)=>{res.writeHead(code,h);res.end(JSON.stringify(obj))};
  if(req.headers?.origin!==originAutorisee)return send(403,{error:'Origine refusée'});
  if(req.method==='OPTIONS'){res.writeHead(204,{...h,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});return res.end()}
  if(req.method!=='POST')return send(405,{error:'Méthode refusée'});
  const token=/^Bearer (\S+)$/.exec(req.headers?.authorization||'')?.[1];
  if(!token)return send(401,{error:'Authentification requise'});
  let identity;try{identity=await verifyIdToken(token);if(!identity?.uid)throw Error()}catch{return send(401,{error:'Jeton invalide'})}
  let raw='',bytes=0;
  try{for await(const c of req){bytes+=c.length;if(bytes>8192)return send(413,{error:'Requête trop volumineuse'});raw+=c.toString('utf8')}}catch{return send(400,{error:'Corps illisible'})}
  let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'JSON invalide'})}
  if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Paramètres invalides'});
  try{return send(200,{ok:true,result:await attribuer({...body,actorUid:identity.uid})})}
  catch{return send(409,{error:'Attribution refusée : droits, état ou révision à vérifier'})}
 };
}
