/** Route d'émission de facture, backend privilégié uniquement. */
export function creerHandlerEmission({emettre,verifyIdToken,originAutorisee}) {
  if(typeof emettre!=='function'||typeof verifyIdToken!=='function'||!originAutorisee) throw Error('Configuration invalide');
  return async (req,res)=>{
    const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
    if(req.headers?.origin===originAutorisee)h['Access-Control-Allow-Origin']=originAutorisee;
    const send=(status,obj)=>{res.writeHead(status,h);res.end(JSON.stringify(obj))};
    if(req.headers?.origin!==originAutorisee)return send(403,{error:'Origine refusée'});
    if(req.method==='OPTIONS'){res.writeHead(204,{...h,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});return res.end()}
    if(req.method!=='POST')return send(405,{error:'Méthode refusée'});
    const bearer=/^Bearer (\S+)$/.exec(req.headers?.authorization||'');
    if(!bearer)return send(401,{error:'Authentification requise'});
    let identity;
    try{identity=await verifyIdToken(bearer[1]);if(!identity?.uid)throw Error()}catch{return send(401,{error:'Jeton invalide'})}
    let raw='',size=0;
    try{for await(const part of req){size+=part.length;if(size>4096)return send(413,{error:'Corps trop volumineux'});raw+=part.toString('utf8')}}catch{return send(400,{error:'Corps illisible'})}
    let body;
    try{body=JSON.parse(raw)}catch{return send(400,{error:'JSON invalide'})}
    if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['eventId','dateEmission','dateEcheance'].includes(k)))return send(400,{error:'Paramètres interdits'});
    const validId=x=>typeof x==='string'&&/^[\w-]{1,120}$/.test(x);
    const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
    if(!validId(body.eventId)||!validDate(body.dateEmission)||!validDate(body.dateEcheance)||body.dateEcheance<body.dateEmission)return send(400,{error:'Paramètres invalides'});
    try{const result=await emettre({eventId:body.eventId,actorUid:identity.uid,dateEmission:body.dateEmission,dateEcheance:body.dateEcheance});return send(201,{ok:true,result})}
    catch{return send(409,{error:'Émission impossible : droits, inventaire, tarifs ou état à vérifier'})}
  };
}
