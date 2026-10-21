import assert from 'node:assert/strict';
import {creerAttributionClient} from './gsb-v4-attribution-client.mjs';
const root='structures/punish-concept';
function fakeDb(status='created'){
 const data=new Map([[root,{ownerUid:'owner'}],[`${root}/events/e1`,{status,clientAccessRevision:0}]]);
 const db={doc:path=>({path}),runTransaction:async fn=>fn({get:async r=>({exists:data.has(r.path),data:()=>data.get(r.path)}),update:(r,patch)=>data.set(r.path,{...data.get(r.path),...patch})})};
 return {db,data};
}
const permissions={depart:true,fin:true,editBeforeSubmission:true};
let count=0;
async function rejects(fn){await assert.rejects(fn);count++}
{
 const {db,data}=fakeDb();const assign=creerAttributionClient(db);
 const r=await assign({eventId:'e1',clientUid:'client',actorUid:'owner',permissions});
 assert.equal(r.revision,1);assert.equal(data.get(`${root}/events/e1`).clientUid,'client');count+=2;
 await rejects(()=>assign({eventId:'e1',clientUid:'client',actorUid:'owner',permissions,expectedRevision:0}));
 await rejects(()=>assign({eventId:'e1',clientUid:'other',actorUid:'owner',permissions,expectedRevision:1}));
 await rejects(()=>assign({eventId:'e1',clientUid:'client',actorUid:'intruder',permissions,expectedRevision:1}));
}
{
 const {db}=fakeDb('closed');await rejects(()=>creerAttributionClient(db)({eventId:'e1',clientUid:'client',actorUid:'owner',permissions}));
}
{
 const {db}=fakeDb();await rejects(()=>creerAttributionClient(db)({eventId:'e1',clientUid:'client',actorUid:'owner',permissions:{depart:true}}));
}
console.log(`${count} vérifications d'attribution réussies`);
