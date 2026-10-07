import crypto from 'node:crypto';
import { ascKey } from '../config.mjs';
const { id: KEY_ID, issuer: ISS, key } = ascKey();
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=b64({alg:'ES256',kid:KEY_ID,typ:'JWT'}), p=b64({iss:ISS,iat:now,exp:now+1100,aud:'appstoreconnect-v1'});
const sig=crypto.sign('sha256',Buffer.from(h+'.'+p),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
const token=`${h}.${p}.${sig}`;
const [method,path,body]=process.argv.slice(2);
const r=await fetch('https://api.appstoreconnect.apple.com'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body||undefined});
const t=await r.text();
console.log(r.status); try{console.log(JSON.stringify(JSON.parse(t),null,1))}catch{console.log(t)}
