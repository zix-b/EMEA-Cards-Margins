import {HttpError} from './repository.mjs';
const cache=new Map();
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function authenticate(request,env,transport=(url,init)=>fetch(url,init)) {
 const issuer=env.ACCESS_ISSUER,audience=env.ACCESS_AUD;
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!audience||!env.ADMIN_EMAILS)throw new HttpError(503,'Admin authentication is not configured.');
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token||token.length>16384)throw new HttpError(401,'Sign in with your approved admin email.');
 let stage='decode';
 try{
  const parts=token.split('.');if(parts.length!==3)throw Error();
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  const now=Math.floor(Date.now()/1000);
  stage='algorithm';if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error();
  stage='issuer';if(claims.iss!==issuer)throw Error();
  stage='audience';if(!Array.isArray(claims.aud)||!claims.aud.includes(audience))throw Error();
  stage='time';if(!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+30)))throw Error();
  stage='type';if(claims.type!=='app')throw Error();
  stage='certificates';
  let cached=cache.get(issuer);
  if(!cached||cached.until<Date.now()||!cached.keys.some(k=>k.kid===header.kid)){
   stage='certificates_fetch';
   const response=await transport(issuer+'/cdn-cgi/access/certs',{redirect:'manual'});
   stage='certificates_http_'+response.status;if(!response.ok)throw Error();
   stage='certificates_json';const {keys}=await response.json();if(!Array.isArray(keys))throw Error();
   cached={keys,until:Date.now()+300000};cache.set(issuer,cached);
  }
  stage='certificates_key_id';
  const jwk=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error();
  stage='key';
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  stage='signature';
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
  const allowed=env.ADMIN_EMAILS.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(typeof claims.email!=='string'||!allowed.includes(claims.email.toLowerCase()))throw new HttpError(403,'Your email is not approved for pricing administration.');
  return {email:claims.email,expiresAt:claims.exp};
 }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(401,`Your sign-in could not be verified (AUTH_${stage.toUpperCase()}).`);}
}
