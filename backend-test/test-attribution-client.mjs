import assert from 'node:assert/strict';
import {creerAttributionClient} from './gsb-v4-attribution-client.mjs';
const root='structures/punish-concept';
function setup({owner='owner',status='draft',clientUid=null,rev=0,inventory=false}={}){
 const data=new Map([[root,{ownerUid:owner}],[`${root}/events/E1`,{status,clientUid,clientAccessRevision:rev,productIds:['R1']}]]);
 if(inventory)data.set(`${root}/clientInventorySubmissions/E1__C1__depart`,{status:'submitted'});
 let writes=0;
 const db={doc:p=>p,runTransaction:async fn=>fn({get:async p=>({exists:data.has(p),data:()=>data.get(p)}),update:(p,v)=>{writes++;data.set(p,{...data.get(p),...v})}})};
 return {assign:creerAttributionClient(db),data,writes:()=>writes};
}
const req={eventId:'E1',clientUid:'C1',actorUid:'owner',permissions:{depart:true,fin:true,editBeforeSubmission:true},expectedRevision:0};
let n=0;
{const s=setup();const r=await s.assign(req);assert.equal(r.revision,1);assert.equal(s.data.get(`${root}/events/E1`).clientUid,'C1');n++}
for(const [setupOpts,changes] of [[{}, {actorUid:'intruder'}],[{status:'closed'},{}],[{rev:2},{}],[{clientUid:'C2'},{}],[{inventory:true},{}]]){
 const s=setup(setupOpts);await assert.rejects(()=>s.assign({...req,...changes}));assert.equal(s.writes(),0);n++;
}
{const s=setup();await assert.rejects(()=>s.assign({...req,permissions:{depart:true}}));n++}
{const s=setup();await assert.rejects(()=>s.assign({...req,clientUid:'../hack'}));n++}
console.log(`${n} tests attribution client réussis`);
