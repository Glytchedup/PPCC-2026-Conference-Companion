/**
 * Cloudflare Workers companion sync endpoint.
 * Bind KV namespace as EVENTS, static ./public as ASSETS.
 * Shared room key is never logged or persisted; KV prefix uses its SHA-256 digest.
 * Authentication is possession of the high-entropy room key.
 */
const ALLOWED_TYPES=new Set(['choice','status','rating','contact','goal','check','note','meeting','delete-note','delete-meeting','plan','hide']);
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Room-Key','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json;charset=utf-8'}});
async function digest(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export default {
 async fetch(request,env){const u=new URL(request.url);
  if(u.pathname!=='/api/events')return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
  const secret=request.headers.get('X-Room-Key')||'';
  if(secret.length<24||secret.length>512)return json({error:'Invalid room key'},401);
  if(!env.EVENTS)return json({error:'KV binding EVENTS is missing'},503);
  const prefix='room:'+await digest(secret)+':';
  if(request.method==='GET'){
   let result;
   try{result=await env.EVENTS.list({prefix,limit:1000,...(u.searchParams.has('cursor')?{cursor:u.searchParams.get('cursor')}: {})});}
   catch{return json({error:'Could not list room'},500)}
   const values=await Promise.all(result.keys.map(k=>env.EVENTS.get(k.name,'json')));
   return json({events:values.filter(Boolean),cursor:result.list_complete?'':result.cursor});
  }
  const length=Number(request.headers.get('content-length')||0);
  if(length>16000)return json({error:'Event too large'},413);
  let evt;try{const raw=await request.text();if(raw.length>16000)throw Error('size');evt=JSON.parse(raw);}catch{return json({error:'Invalid JSON or too large'},400)}
  if(!evt||typeof evt.id!=='string'||!(/^[0-9a-f]{24}$/.test(evt.id))||!ALLOWED_TYPES.has(evt.type)||typeof evt.ts!=='string'||Number.isNaN(Date.parse(evt.ts))||!evt.payload||typeof evt.payload!=='object'||Array.isArray(evt.payload))return json({error:'Invalid event'},400);
  // Using one immutable event per key avoids overwriting updates from two phones.
  const key=prefix+evt.id;
  await env.EVENTS.put(key,JSON.stringify({id:evt.id,ts:evt.ts,type:evt.type,payload:evt.payload}));
  return json({saved:true});
 }
};