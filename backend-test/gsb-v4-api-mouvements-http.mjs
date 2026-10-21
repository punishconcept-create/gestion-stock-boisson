/** API mouvements événementiels TEST, à exécuter uniquement côté serveur. */
export function creerHandlerMouvements({service,verifyIdToken,originAutorisee}) {
  if(typeof service!=='function'||typeof verifyIdToken!=='function'||!originAutorisee) throw Error('Configuration invalide');
  return async function handler(req,res){
    const origin=req.headers?.origin;
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
    if(origin===originAutorisee) headers['Access-Control-Allow-Origin']=originAutorisee;
    const send=(code,data)=>{res.writeHead(code,headers);res.end(JSON.stringify(data));};
    if(origin!==originAutorisee)return send(403,{error:'Origine non autorisée'});
    if(req.method==='OPTIONS'){
      res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});
      return res.end();
    }
    if(req.method!=='POST')return send(405,{error:'Méthode non autorisée'});
    const auth=req.headers?.authorization||'';
    if(!/^Bearer \S+$/.test(auth))return send(401,{error:'Authentification requise'});
    let raw='',bytes=0;
    try{
      for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)return send(413,{error:'Requête trop volumineuse'});raw+=chunk.toString('utf8');}
      const payload=JSON.parse(raw);
      if(!payload||typeof payload!=='object'||Array.isArray(payload))return send(400,{error:'Corps invalide'});
      const decoded=await verifyIdToken(auth.slice(7));
      if(!decoded?.uid) return send(401,{error:'Identité invalide'});
      // L'identité de l'auteur provient exclusivement du jeton vérifié.
      const result=await service({...payload,actorUid:decoded.uid},decoded.uid);
      return send(200,{ok:true,result});
    }catch(err){return send(400,{error:'Mouvement refusé ou données invalides'});}
  };
}
