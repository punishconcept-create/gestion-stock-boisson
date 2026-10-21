/** Route d'inventaire client V4 TEST. Auth Firebase requise, aucune écriture directe sur les stocks. */
export function creerHandlerSoumission({soumettre,verifyIdToken,originAutorisee}) {
  if(typeof soumettre!=='function'||typeof verifyIdToken!=='function'||!originAutorisee)throw Error('Configuration invalide');
  return async (req,res)=>{
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
    if(req.headers?.origin===originAutorisee)headers['Access-Control-Allow-Origin']=originAutorisee;
    const send=(status,data)=>{res.writeHead(status,headers);return res.end(JSON.stringify(data))};
    if(req.headers?.origin!==originAutorisee)return send(403,{error:'Origine refusée'});
    if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});return res.end()}
    if(req.method!=='POST')return send(405,{error:'Méthode refusée'});
    const match=/^Bearer (\S+)$/.exec(req.headers?.authorization||'');
    if(!match)return send(401,{error:'Authentification requise'});
    let identity;
    try{identity=await verifyIdToken(match[1]);if(!identity?.uid)throw Error()}catch{return send(401,{error:'Jeton invalide'})}
    let raw='',size=0;
    try{for await(const chunk of req){size+=chunk.length;if(size>32768)return send(413,{error:'Requête trop volumineuse'});raw+=chunk.toString('utf8')}}catch{return send(400,{error:'Corps illisible'})}
    let body;
    try{body=JSON.parse(raw)}catch{return send(400,{error:'JSON invalide'})}
    if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Requête invalide'});
    const {eventId,phase,quantites,expectedRevision}=body;
    if(typeof eventId!=='string'||!['depart','fin'].includes(phase)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!quantites||typeof quantites!=='object'||Array.isArray(quantites)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)return send(400,{error:'Paramètres invalides'});
    try{return send(200,{ok:true,result:await soumettre({eventId,phase,quantites,expectedRevision,actorUid:identity.uid})})}
    catch{return send(409,{error:'Soumission refusée : droits, quantités, état ou révision à vérifier'})}
  };
}
