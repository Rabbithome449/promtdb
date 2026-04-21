import type { Category, ComposerItem } from '../domain/types'

export function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function dedupeParts(parts: ComposerItem[]) {
  const seen = new Set<string>()
  const next: ComposerItem[] = []
  for (const part of parts) {
    const key = normalizeText(part.text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    next.push({ ...part, text: part.text.trim() })
  }
  return next
}

export function mergePartsReplace(existing: ComposerItem[], incoming: ComposerItem[]) {
  const map = new Map<string, ComposerItem>()
  for (const part of existing) {
    const key = normalizeText(part.text)
    if (!key) continue
    map.set(key, { ...part, text: part.text.trim() })
  }
  for (const part of incoming) {
    const key = normalizeText(part.text)
    if (!key) continue
    map.set(key, { ...part, text: part.text.trim() })
  }
  return [...map.values()]
}

export function toPrompt(parts: ComposerItem[]) {
  return parts.map((p) => (p.weight === undefined ? p.text : `(${p.text}:${p.weight})`)).join(', ')
}

export function toGroupedPrompt(parts: ComposerItem[], categories: Category[]) {
  const order = new Map<string, number>()
  categories.forEach((c, idx) => order.set(c.name, c.sort_order ?? idx))

  const groups = new Map<string, ComposerItem[]>()
  for (const part of parts) {
    const key = part.category?.trim() || '__uncategorized__'
    const curr = groups.get(key) || []
    curr.push(part)
    groups.set(key, curr)
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === '__uncategorized__') return 1
    if (b === '__uncategorized__') return -1
    const ao = order.get(a) ?? Number.MAX_SAFE_INTEGER
    const bo = order.get(b) ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.localeCompare(b)
  })

  return sortedKeys.map((key, idx) => {
    const items = groups.get(key) || []
    const rendered = items.map((p) => (p.weight === undefined ? `(${p.text})` : `(${p.text}:${p.weight})`)).join(', ')
    const withTransitionComma = idx < sortedKeys.length - 1 ? `${rendered},` : rendered
    const title = key === '__uncategorized__' ? 'Uncategorized' : key
    return `[${title}]\n${withTransitionComma}`
  }).join('\n\n')
}

