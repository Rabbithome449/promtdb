const fs=require('fs');

function loadEnv(path){
  const vals={};
  const text=fs.readFileSync(path,'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.trim();
    if(!line||line.startsWith('#')||!line.includes('=')) continue;
    const i=line.indexOf('=');
    vals[line.slice(0,i).trim()]=line.slice(i+1).trim();
  }
  return vals;
}

const p=loadEnv('/data/.openclaw/workspace/secrets/portainer.env');
const cf=loadEnv('/data/.openclaw/workspace/secrets/cloudflare-tunnel.env');
const base=p.PORTAINER_URL.replace(/\/$/,'');

const cfHeaders={
  'CF-Access-Client-Id': cf.CF_ACCESS_CLIENT_ID,
  'CF-Access-Client-Secret': cf.CF_ACCESS_CLIENT_SECRET,
};

async function j(path, opts={}){
  const headers={...(opts.headers||{}), ...cfHeaders};
  const r=await fetch(base+path,{...opts, headers});
  const t=await r.text();
  let data;
  try { data=JSON.parse(t); } catch { data=t; }
  if(!r.ok){
    throw new Error(`${r.status} ${r.statusText}: ${typeof data==='string'?data.slice(0,300):JSON.stringify(data).slice(0,300)}`);
  }
  return data;
}

(async()=>{
  const auth=await j('/api/auth',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:p.PORTAINER_USER,password:p.PORTAINER_PASSWORD}),
  });
  const headers={Authorization:`Bearer ${auth.jwt}`};

  const endpointsRaw=await j('/api/endpoints',{headers});
  const endpoints=Array.isArray(endpointsRaw) ? endpointsRaw : (endpointsRaw.value || endpointsRaw.data || endpointsRaw.endpoints || []);
  if(endpoints.length===0) throw new Error('No endpoints found in Portainer account');

  const candidates=[];
  for (const e of endpoints){
    let stacks=[];
    try {
      const raw=await j(`/api/stacks?endpointId=${e.Id}`,{headers});
      stacks=Array.isArray(raw)?raw:[];
    } catch {
      continue;
    }
    for (const s of stacks){
      const n=(s.Name||'').toLowerCase();
      if(n.includes('promtdb') || n.includes('promptdb')){
        candidates.push({endpointId:e.Id, stack:s});
      }
    }
  }

  if(candidates.length===0) throw new Error('No stack with name containing promtdb/promptdb found');
  const target=candidates[0];

  await j(`/api/stacks/${target.stack.Id}/git/redeploy?endpointId=${target.endpointId}`,{
    method:'PUT',
    headers:{...headers, 'Content-Type':'application/json'},
    body: JSON.stringify({}),
  });

  const details=await j(`/api/stacks/${target.stack.Id}?endpointId=${target.endpointId}`,{headers});

  console.log(JSON.stringify({
    ok:true,
    stack:{ id:target.stack.Id, name:target.stack.Name, endpointId:target.endpointId },
    status: details.Status,
    autoUpdate: details.AutoUpdate,
    updatedAt: details.UpdatedAt,
  }, null, 2));
})();
