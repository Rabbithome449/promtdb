import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const outputPath = resolve(__dirname, '..', 'src', 'generated', 'version.ts')

function git(cmd) {
  return execSync(`git -C ${repoRoot} ${cmd}`, { encoding: 'utf8' }).trim()
}

function pad3(value) {
  return String(value).padStart(3, '0')
}

function fallbackVersion() {
  const date = git("show -s --date=format:'%Y-%m-%d' --format=%cd HEAD").replace(/'/g, '')
  const subject = git('show -s --format=%s HEAD')
  const issueMatch = subject.match(/#(\d+)/)
  if (issueMatch) {
    const issueId = issueMatch[1]
    const count = Number(git(`rev-list --count --grep='#${issueId}' HEAD`)) || 1
    return `${date}-#${issueId}-${pad3(count)}`
  }
  const count = Number(git('rev-list --count HEAD')) || 1
  return `${date}-${pad3(count)}`
}

let version = 'dev'
try {
  const tag = git('tag --points-at HEAD').split('\n').map((v) => v.trim()).find(Boolean)
  version = tag || fallbackVersion()
} catch {
  version = 'dev'
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `export const APP_VERSION = ${JSON.stringify(version)}\n`, 'utf8')
console.log(`Generated APP_VERSION=${version}`)
