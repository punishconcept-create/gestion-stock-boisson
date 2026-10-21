/** Backend finance TEST — Node 20+, Firebase Admin, Cloud Run or trusted Node host.
 * Required: GOOGLE_CLOUD_PROJECT=gestion-stock-boisson-test,
 * ALLOWED_ORIGIN=https://punishconcept-create.github.io,
 * STRUCTURE_ID=punish-concept. Use workload identity, not a service-account JSON in frontend.
 */
import http from 'node:http';
import {creerHandlerEmission} from './gsb-v4-api-emission-http.mjs';
import {emettreFacture} from './gsb-v4-emission-factures-serveur.mjs';
import {creerAttributionClient} from './gsb-v4-attribution-client.mjs';
import {creerHandlerAttribution} from './gsb-v4-api-attribution-http.mjs';
import { creerHandlerSoumission } from './gsb-v4-api-soumission-http.mjs';
import { soumettreInventaireV2 } from './gsb-v4-soumission-inventaire-serveur-v2.mjs';
import { creerHandlerValidation } from './gsb-v4-api-validation-http.mjs';
import { creerValidationInventaire } from './gsb-v4-validation-firestore-TEST.mjs';
import {creerHandlerApercuDecompte} from './gsb-v4-api-decompte-preview.mjs';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createFirestoreAdminAdapter } from './gsb-v4-adaptateur-firestore-admin.mjs';
import { creerHandlerFinance } from './gsb-v4-api-finance-http.mjs';
import { creerServiceMouvements } from './gsb-v4-firestore-mouvements-adapter.mjs';
import { creerHandlerMouvements } from './gsb-v4-api-mouvements-http.mjs';

const projectId=process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
if(projectId!=='gestion-stock-boisson-test') throw Error('Sécurité: projet Firebase TEST obligatoire');
const origin=process.env.ALLOWED_ORIGIN;
if(origin!=='https://punishconcept-create.github.io') throw Error('Origine GitHub Pages TEST requise');
const sid=process.env.STRUCTURE_ID;
if(sid!=='punish-concept') throw Error('Structure TEST requise');
if(!getApps().length) initializeApp({credential:applicationDefault(),projectId});
const db=getFirestore();
const adapter=createFirestoreAdminAdapter(db,{FieldValue});
const finance=creerHandlerFinance({adapter,verifyIdToken:token=>getAuth().verifyIdToken(token,true),structureId:sid,originAutorisee:origin});
const mouvements=creerHandlerMouvements({service:creerServiceMouvements(db,FieldValue,sid),verifyIdToken:token=>getAuth().verifyIdToken(token,true),originAutorisee:origin});
const apercu=creerHandlerApercuDecompte({db,verifyIdToken:token=>getAuth().verifyIdToken(token,true),structureId:sid,originAutorisee:origin});
const validation=creerHandlerValidation({valider:creerValidationInventaire(db,sid),verifyIdToken:token=>getAuth().verifyIdToken(token,true),originAutorisee:origin});
const attribution=creerHandlerAttribution({attribuer:creerAttributionClient(db,sid),verifyIdToken:token=>getAuth().verifyIdToken(token,true),originAutorisee:origin});
const soumission=creerHandlerSoumission({soumettre:args=>soumettreInventaireV2({adapter,sid,...args}),verifyIdToken:token=>getAuth().verifyIdToken(token,true),originAutorisee:origin});
const emission=creerHandlerEmission({emettre:args=>emettreFacture({adapter,sid,...args}),verifyIdToken:token=>getAuth().verifyIdToken(token,true),originAutorisee:origin});
const server=http.createServer((req,res)=>{
  if(req.url==='/health'&&req.method==='GET') {
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ok:true,service:'gsb-v4-finance-test'}));
  }
  if(req.url==='/api/evenements/attribuer-client') return attribution(req,res);
  if(req.url==='/api/inventaires/soumettre') return soumission(req,res);
  if(req.url==='/api/inventaires/valider') return validation(req,res);
  if(req.url==='/api/decompte/apercu') return apercu(req,res);
  if(req.url==='/api/factures/emettre') return emission(req,res);
  if(req.url==='/api/mouvements') return mouvements(req,res);
  if(req.url!=='/api/finance') {
    res.writeHead(404,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({error:'Route inconnue'}));
  }
  return finance(req,res);
});
const port=Number(process.env.PORT||8080);
server.listen(port,'0.0.0.0',()=>console.log(`Finance TEST prêt sur ${port}`));
