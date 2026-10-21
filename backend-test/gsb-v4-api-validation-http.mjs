/** API de validation d'inventaire côté serveur — projet TEST uniquement. */
export function creerHandlerValidation({valider,verifyIdToken,originAutorisee}) {
 if(typeof valider!=='function'||typeof verifyIdToken!=='function'||!originAutorisee)throw Error('Configuration invalide');
 return async(req,res)=>{
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if(req.headers?.origin===originAutorisee)headers['Access-Control-Allow-Origin']=originAutorisee;
  const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data))};
  if(req.headers?.origin!==originAutorisee)return send(403,{error:'Origine refusée'});
  if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});return res.end()}
  if(req.method!=='POST')return send(405,{error:'Méthode refusée'});
  const match=/^Bearer (\S+)$/.exec(req.headers?.authorization||'');
  if(!match)return send(401,{error:'Authentification requise'});
  let identity;
  try{identity=await verifyIdToken(match[1]);if(!identity?.uid)throw Error()}catch{return send(401,{error:'Jeton invalide'})}
  let size=0,raw='';
  try{for await(const chunk of req){size+=chunk.length;if(size>8192)return send(413,{error:'Requête trop volumineuse'});raw+=chunk.toString('utf8')}}catch{return send(400,{error:'Corps illisible'})}
  let body;
  try{body=JSON.parse(raw)}catch{return send(400,{error:'JSON invalide'})}
  if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Requête invalide'});
  const {eventId,clientUid,phase,expectedRevision,decision,motif=''}=body;
  const validId=x=>typeof x==='string'&&/^[\w-]{1,120}$/.test(x);
  if(!validId(eventId)||!validId(clientUid)||!['depart','fin'].includes(phase)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1||!['valider','rejeter'].includes(decision)||typeof motif!=='string'||motif.length>500)return send(400,{error:'Paramètres invalides'});
  try{
   const result=await valider({eventId,clientUid,phase,expectedRevision,decision,motif,validatorUid:identity.uid});
   return send(200,{ok:true,result});
  }catch(err){return send(409,{error:'Validation refusée : droits, état ou révision à vérifier'})}
 }
}
