const fs=require('fs');
function loadEnv(path){const vals={};for(const raw of fs.readFileSync(path,'utf8').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#')||!line.includes('='))continue;const i=line.indexOf('=');vals[line.slice(0,i).trim()]=line.slice(i+1).trim();}return vals;}
const p=loadEnv('/data/.openclaw/workspace/secrets/portainer.env');
const cf=loadEnv('/data/.openclaw/workspace/secrets/cloudflare-tunnel.env');
const base=p.PORTAINER_URL.replace(/\/$/,'');
const cfHeaders={'CF-Access-Client-Id':cf.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':cf.CF_ACCESS_CLIENT_SECRET};
async function j(path,opts={}){const headers={...(opts.headers||{}),...cfHeaders};const r=await fetch(base+path,{...opts,headers});const t=await r.text();let d;try{d=JSON.parse(t)}catch{d=t}if(!r.ok)throw new Error(`${r.status}: ${String(t).slice(0,120)}`);return d;}
(async()=>{const a=await j('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:p.PORTAINER_USER,password:p.PORTAINER_PASSWORD})});const headers={Authorization:`Bearer ${a.jwt}`};
const spec=await j('/api/swagger.json',{headers});
const paths=Object.keys(spec.paths||{}).filter(p=>p.includes('/stacks/'));
console.log(paths.sort().join('\n'));
if(spec.paths?.['/stacks/{id}/git/redeploy']) console.log('\nredeploy schema', JSON.stringify(spec.paths['/stacks/{id}/git/redeploy'],null,2).slice(0,2000));
})();