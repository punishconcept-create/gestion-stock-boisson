import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {creerHandlerSoumission} from './gsb-v4-api-soumission-http.mjs';
let calls=[];
const handler=creerHandlerSoumission({originAutorisee:'https://punishconcept-create.github.io',verifyIdToken:async token=>token==='valid'?{uid:'client-1'}:null,soumettre:async x=>{calls.push(x);return {revision:2}}});
async function run({origin='https://punishconcept-create.github.io',method='POST',authorization='Bearer valid',body={eventId:'e1',phase:'depart',quantites:{rhum:4},expectedRevision:1}}={}){
 const req=Readable.from([JSON.stringify(body)]);req.headers={origin,authorization};req.method=method;
 const res={status:0,writeHead(n){this.status=n},end(v=''){this.body=v}};
 await handler(req,res);return res;
}
assert.equal((await run()).status,200);
assert.equal(calls[0].actorUid,'client-1');
assert.equal((await run({origin:'https://evil.example'})).status,403);
assert.equal((await run({authorization:''})).status,401);
assert.equal((await run({authorization:'Bearer bad'})).status,401);
assert.equal((await run({body:{eventId:'e1',phase:'bad',quantites:{},expectedRevision:0}})).status,400);
assert.equal((await run({method:'GET'})).status,405);
assert.equal((await run({body:{eventId:'e1',phase:'fin',quantites:{rhum:3},expectedRevision:0}})).status,200);
console.log('7 contrôles API de soumission OK');
