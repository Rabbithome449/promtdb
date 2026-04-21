const fs = require('fs')
const { execSync } = require('child_process')

const args = process.argv.slice(2)
const branchArgIndex = args.findIndex((a) => a === '--branch' || a === '-b')
const branch = branchArgIndex >= 0 ? (args[branchArgIndex + 1] || '').trim() : ''

function loadEnv(path) {
  const vals = {}
  const text = fs.readFileSync(path, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    vals[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return vals
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getHeadSha(repoUrl, ref) {
  if (!repoUrl || !ref) return null
  try {
    const out = execSync(`git ls-remote ${repoUrl} ${ref}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (!out) return null
    return out.split(/\s+/)[0] || null
  } catch {
    return null
  }
}

const p = loadEnv('/data/.openclaw/workspace/secrets/portainer.env')
const cf = loadEnv('/data/.openclaw/workspace/secrets/cloudflare-tunnel.env')
const base = p.PORTAINER_URL.replace(/\/$/, '')

const cfHeaders = {
  'CF-Access-Client-Id': cf.CF_ACCESS_CLIENT_ID,
  'CF-Access-Client-Secret': cf.CF_ACCESS_CLIENT_SECRET,
}

async function j(path, opts = {}) {
  const headers = { ...(opts.headers || {}), ...cfHeaders }
  const r = await fetch(base + path, { ...opts, headers })
  const t = await r.text()
  let data
  try { data = JSON.parse(t) } catch { data = t }
  if (!r.ok) {
    throw new Error(`${r.status} ${r.statusText}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`)
  }
  return data
}

(async () => {
  const auth = await j('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: p.PORTAINER_USER, password: p.PORTAINER_PASSWORD }),
  })
  const headers = { Authorization: `Bearer ${auth.jwt}` }

  const endpointsRaw = await j('/api/endpoints', { headers })
  const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : (endpointsRaw.value || endpointsRaw.data || endpointsRaw.endpoints || [])
  if (endpoints.length === 0) throw new Error('No endpoints found in Portainer account')

  const candidates = []
  for (const e of endpoints) {
    let stacks = []
    try {
      const raw = await j(`/api/stacks?endpointId=${e.Id}`, { headers })
      stacks = Array.isArray(raw) ? raw : []
    } catch {
      continue
    }
    for (const s of stacks) {
      const n = (s.Name || '').toLowerCase()
      if (n.includes('promtdb') || n.includes('promptdb')) {
        candidates.push({ endpointId: e.Id, stack: s })
      }
    }
  }

  if (candidates.length === 0) throw new Error('No stack with name containing promtdb/promptdb found')
  const target = candidates[0]

  const desiredRef = branch || target.stack?.GitConfig?.ReferenceName || null

  if (desiredRef) {
    await j(`/api/stacks/${target.stack.Id}/git?endpointId=${target.endpointId}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryReferenceName: desiredRef }),
    })
  }

  // Portainer often needs time to finish stack update behind Cloudflare.
  await sleep(8000)

  let details = null
  const headSha = getHeadSha(target.stack?.GitConfig?.URL || '', desiredRef)

  for (let i = 0; i < 20; i += 1) {
    details = await j(`/api/stacks/${target.stack.Id}?endpointId=${target.endpointId}`, { headers })

    const refOk = !desiredRef || details?.GitConfig?.ReferenceName === desiredRef
    const hashOk = !headSha || details?.GitConfig?.ConfigHash === headSha

    if (refOk && hashOk) {
      console.log(JSON.stringify({
        ok: true,
        stack: { id: target.stack.Id, name: target.stack.Name, endpointId: target.endpointId },
        requestedBranch: desiredRef,
        headSha,
        configHash: details?.GitConfig?.ConfigHash || null,
        updateDate: details?.UpdateDate || null,
        status: details?.Status,
        autoUpdate: details?.AutoUpdate,
      }, null, 2))
      return
    }

    await sleep(4000)
  }

  throw new Error(`Redeploy verification failed. desiredRef=${desiredRef || 'null'} headSha=${headSha || 'null'} configHash=${details?.GitConfig?.ConfigHash || 'null'}`)
})()
