const fs=require('fs');
const text=fs.readFileSync('/data/.openclaw/workspace/secrets/portainer.env','utf8');
const vals={};
for (const raw of text.split(/\r?\n/)) { const line=raw.trim(); if(!line||line.startsWith('#')||!line.includes('=')) continue; const i=line.indexOf('='); vals[line.slice(0,i)]=line.slice(i+1); }
const base=vals.PORTAINER_URL.replace(/\/$/,'');
async function req(path, opts={}){ const r=await fetch(base+path, opts); const t=await r.text(); let d; try{d=JSON.parse(t)}catch{d=t}; return {status:r.status, data:d}; }
(async()=>{
  const a=await req('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:vals.PORTAINER_USER,password:vals.PORTAINER_PASSWORD})});
  console.log('auth',a.status, typeof a.data==='object'?Object.keys(a.data):String(a.data).slice(0,120));
  if(a.status!==200) return;
  const h={Authorization:`Bearer ${a.data.jwt}`};
  for (const p of ['/api/status','/api/users/me','/api/endpoints','/api/stacks','/api/stacks?filters=%7B%7D']){
    const r=await req(p,{headers:h});
    console.log('\n',p,'=>',r.status);
    console.log(JSON.stringify(r.data).slice(0,1200));
  }
})();