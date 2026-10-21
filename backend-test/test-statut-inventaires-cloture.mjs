import assert from 'node:assert/strict';
import {creerLectureCloture} from './gsb-v4-lecture-cloture-firestore.mjs';
const root='structures/punish-concept';
const eventId='event1',clientUid='client1',validatorUid='owner1';
const docs={
 [root]:{ownerUid:validatorUid},
 [`${root}/events/${eventId}`]:{clientUid,status:'created',mode:'global'},
};
const mk=(phase,status)=>({eventId,clientUid,phase,status,lines:[{productId:'rhum',quantite:1}]});
const db={doc:path=>({get:async()=>({exists:!!docs[path],data:()=>docs[path]})}),collection:()=>({where:()=>({get:async()=>({docs:[]})})})};
const run=creerLectureCloture(db);
const args={eventId,clientUid,validatorUid,tarifs:[{productId:'rhum',nom:'Rhum',prixUnitaireCentimes:1000,fraisRetourCentimes:0}]};
for(const status of ['submitted','rejected']){
 docs[`${root}/clientInventorySubmissions/${eventId}__${clientUid}__depart`]=mk('depart',status);
 docs[`${root}/clientInventorySubmissions/${eventId}__${clientUid}__fin`]=mk('fin','validated');
 await assert.rejects(()=>run(args),/Inventaire depart non validé/);
}
docs[`${root}/clientInventorySubmissions/${eventId}__${clientUid}__depart`]=mk('depart','validated');
const result=await run(args);
assert.ok(result && typeof result==='object');
console.log('OK: inventaires non validés refusés; inventaires validés franchissent le contrôle de statut');
