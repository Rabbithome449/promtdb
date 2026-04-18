import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

type TabKey = 'dashboard' | 'library' | 'composer' | 'characters'

type Category = {
  id: number
  name: string
  sort_order: number
}

type Phrase = {
  id: number
  category_id: number
  text: string
  default_weight: number | null
  is_negative_default: boolean
  notes: string | null
  required_lora: string | null
  sort_order: number
}

type PromptPart = {
  text: string
  weight?: number
  category?: string
  is_important?: boolean
  is_recurring?: boolean
  required_lora?: string
}

type Preset = {
  id: number
  name: string
  positive_parts: PromptPart[]
  negative_parts: PromptPart[]
}

type CharacterPreset = {
  id: number
  name: string
  version_family: string
  version: number
  description: string | null
  required_sdxl_base_model: string | null
  recommended_sdxl_base_model: string | null
  positive_prompt: string
  negative_prompt: string
  positive_parts: PromptPart[]
  negative_parts: PromptPart[]
  required_loras: string[]
}

type ComposerItem = {
  id: string
  text: string
  weight?: number
  category?: string
  isImportant?: boolean
  isRecurring?: boolean
  requiredLora?: string
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('promptdb_token')
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    throw new Error('UNAUTHORIZED')
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || `API ${res.status}`)
  }
  return (await res.json()) as T
}

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

function dedupeParts(parts: ComposerItem[]) {
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

function toPrompt(parts: ComposerItem[]) {
  return parts.map((p) => (p.weight === undefined ? p.text : `(${p.text}:${p.weight})`)).join(', ')
}

const ui = {
  bg: '#090f1b',
  bg2: '#111b2f',
  panel: '#131e33',
  panel2: '#1a2742',
  text: '#e7edf7',
  muted: '#9fb0cc',
  border: '#2b3a58',
  accent: '#5ea2ff',
  ok: '#52c98c',
  warn: '#f5c26b',
  danger: '#ff8f8f',
  shadow: '0 10px 30px rgba(0,0,0,0.25)',
}

function App() {
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(localStorage.getItem('promptdb_token')))
  const [loginUser, setLoginUser] = useState('promptdb')
  const [loginPass, setLoginPass] = useState('promptdb')
  const [loginError, setLoginError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [characters, setCharacters] = useState<CharacterPreset[]>([])

  const [librarySelectedCategoryId, setLibrarySelectedCategoryId] = useState<number | null>(null)
  const [composerSelectedCategoryId, setComposerSelectedCategoryId] = useState<number | null>(null)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newPhraseText, setNewPhraseText] = useState('')
  const [newPhraseCategoryId, setNewPhraseCategoryId] = useState<number | null>(null)
  const [newPhraseWeight, setNewPhraseWeight] = useState('')
  const [newPhraseNotes, setNewPhraseNotes] = useState('')
  const [newPhraseRequiredLora, setNewPhraseRequiredLora] = useState('')
  const [isPhraseModalOpen, setIsPhraseModalOpen] = useState(false)
  const [editingPhraseId, setEditingPhraseId] = useState<number | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [chipMenuPhraseId, setChipMenuPhraseId] = useState<number | null>(null)
  const [draggingPhraseId, setDraggingPhraseId] = useState<number | null>(null)

  const [presetName, setPresetName] = useState('')
  const [characterName, setCharacterName] = useState('')
  const [characterVersionFamily, setCharacterVersionFamily] = useState('')
  const [characterVersion, setCharacterVersion] = useState('1')
  const [characterDescription, setCharacterDescription] = useState('')
  const [characterRequiredSdxlBaseModel, setCharacterRequiredSdxlBaseModel] = useState('')
  const [characterRecommendedSdxlBaseModel, setCharacterRecommendedSdxlBaseModel] = useState('')

  const [positiveParts, setPositiveParts] = useState<ComposerItem[]>([])
  const [negativeParts, setNegativeParts] = useState<ComposerItem[]>([])
  const isMobile = viewportWidth < 900
  const isNarrow = viewportWidth < 640

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const categoryByName = useMemo(() => {
    const map = new Map<string, Category>()
    categories.forEach((c) => map.set(c.name, c))
    return map
  }, [categories])

  const orderParts = (parts: ComposerItem[]) => {
    return [...parts].sort((a, b) => {
      const imp = Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant))
      if (imp !== 0) return imp
      const aOrder = a.category ? (categoryByName.get(a.category)?.sort_order ?? 9999) : 9999
      const bOrder = b.category ? (categoryByName.get(b.category)?.sort_order ?? 9999) : 9999
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.text.localeCompare(b.text)
    })
  }

  const requiredLoras = useMemo(() => {
    const vals = [...positiveParts, ...negativeParts]
      .map((p) => p.requiredLora?.trim())
      .filter((v): v is string => Boolean(v))
    return [...new Set(vals)]
  }, [positiveParts, negativeParts])

  const groupedPositive = useMemo(() => {
    const map = new Map<string, ComposerItem[]>()
    const ordered = orderParts(positiveParts)
    for (const part of ordered) {
      const key = part.isRecurring ? 'Quality / Recurring' : part.category || 'Uncategorized'
      const curr = map.get(key) || []
      curr.push(part)
      map.set(key, curr)
    }
    return [...map.entries()]
  }, [positiveParts, categories])

  const groupedNegative = useMemo(() => {
    const map = new Map<string, ComposerItem[]>()
    const ordered = orderParts(negativeParts)
    for (const part of ordered) {
      const key = part.category || 'Uncategorized'
      const curr = map.get(key) || []
      curr.push(part)
      map.set(key, curr)
    }
    return [...map.entries()]
  }, [negativeParts, categories])

  const promptHealth = useMemo(() => {
    const issues: string[] = []
    const positiveKeys = new Set(positiveParts.map((p) => normalizeText(p.text)).filter(Boolean))
    const negativeKeys = new Set(negativeParts.map((p) => normalizeText(p.text)).filter(Boolean))
    const duplicatePositiveCount = positiveParts.length - positiveKeys.size
    const duplicateNegativeCount = negativeParts.length - negativeKeys.size

    if (positiveParts.length === 0) issues.push('No positive parts selected yet.')
    if (duplicatePositiveCount > 0) issues.push(`Positive has ${duplicatePositiveCount} duplicate entries.`)
    if (duplicateNegativeCount > 0) issues.push(`Negative has ${duplicateNegativeCount} duplicate entries.`)

    let crossConflictCount = 0
    for (const key of positiveKeys) {
      if (negativeKeys.has(key)) crossConflictCount += 1
    }
    if (crossConflictCount > 0) issues.push(`${crossConflictCount} terms appear in both positive and negative.`)

    const importantCount = positiveParts.filter((p) => p.isImportant).length
    if (importantCount === 0 && positiveParts.length > 0) issues.push('No important/core part is marked.')

    if (requiredLoras.length === 0 && positiveParts.length > 0) issues.push('No required LoRA detected.')

    const score = Math.max(0, 100 - issues.length * 12)
    return { score, issues }
  }, [positiveParts, negativeParts, requiredLoras.length])

  const libraryCategoryPhrases = useMemo(
    () => phrases.filter((p) => p.category_id === librarySelectedCategoryId),
    [phrases, librarySelectedCategoryId],
  )
  const composerCategoryPhrases = useMemo(
    () => phrases.filter((p) => p.category_id === composerSelectedCategoryId),
    [phrases, composerSelectedCategoryId],
  )
  const effectivePhraseCategoryId = newPhraseCategoryId ?? librarySelectedCategoryId ?? categories[0]?.id ?? null
  const phrasesInEffectivePhraseCategory = useMemo(
    () => phrases.filter((p) => p.category_id === effectivePhraseCategoryId),
    [phrases, effectivePhraseCategoryId],
  )

  const sortedPositiveParts = useMemo(() => orderParts(positiveParts), [positiveParts, categories])
  const sortedNegativeParts = useMemo(() => orderParts(negativeParts), [negativeParts, categories])

  const positivePrompt = useMemo(() => toPrompt(sortedPositiveParts), [sortedPositiveParts])
  const negativePrompt = useMemo(() => toPrompt(sortedNegativeParts), [sortedNegativeParts])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [c, p, pr, ch] = await Promise.all([
        api<Category[]>('/categories'),
        api<Phrase[]>('/phrases'),
        api<Preset[]>('/presets'),
        api<CharacterPreset[]>('/characters'),
      ])
      setCategories(c)
      setPhrases(p)
      setPresets(pr)
      setCharacters(ch)
      if (librarySelectedCategoryId === null && c.length > 0) setLibrarySelectedCategoryId(c[0].id)
      if (composerSelectedCategoryId === null && c.length > 0) setComposerSelectedCategoryId(c[0].id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      if (msg === 'UNAUTHORIZED') {
        localStorage.removeItem('promptdb_token')
        setIsAuthenticated(false)
        setLoginError('Session expired. Please login again.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) void loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    document.body.style.margin = '0'
    document.body.style.background = ui.bg
  }, [])

  useEffect(() => {
    if (newPhraseCategoryId === null && librarySelectedCategoryId !== null) {
      setNewPhraseCategoryId(librarySelectedCategoryId)
    }
  }, [librarySelectedCategoryId, newPhraseCategoryId])

  useEffect(() => {
    if (categories.length === 0) return
    if (librarySelectedCategoryId === null) setLibrarySelectedCategoryId(categories[0].id)
    if (composerSelectedCategoryId === null) setComposerSelectedCategoryId(categories[0].id)
    if (newPhraseCategoryId === null) setNewPhraseCategoryId(categories[0].id)
  }, [categories, librarySelectedCategoryId, composerSelectedCategoryId, newPhraseCategoryId])

  async function createCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    await api<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: newCategoryName.trim(), sort_order: categories.length }),
    })
    setNewCategoryName('')
    await loadAll()
  }

  async function renameCategory(id: number, name: string) {
    if (!name.trim()) return
    await api(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) })
    await loadAll()
  }

  async function removeCategory(id: number) {
    if (!window.confirm('Delete category and all its phrases?')) return
    await api(`/categories/${id}`, { method: 'DELETE' })
    if (librarySelectedCategoryId === id) setLibrarySelectedCategoryId(null)
    if (composerSelectedCategoryId === id) setComposerSelectedCategoryId(null)
    await loadAll()
  }

  function openCreatePhraseModal() {
    setEditingPhraseId(null)
    if (newPhraseCategoryId === null) setNewPhraseCategoryId(librarySelectedCategoryId ?? categories[0]?.id ?? null)
    setNewPhraseText('')
    setNewPhraseWeight('')
    setNewPhraseNotes('')
    setNewPhraseRequiredLora('')
    setIsPhraseModalOpen(true)
  }

  function openEditPhraseModal(phrase: Phrase) {
    setEditingPhraseId(phrase.id)
    setNewPhraseCategoryId(phrase.category_id)
    setNewPhraseText(phrase.text)
    setNewPhraseWeight(phrase.default_weight === null ? '' : String(phrase.default_weight))
    setNewPhraseNotes(phrase.notes ?? '')
    setNewPhraseRequiredLora(phrase.required_lora ?? '')
    setIsPhraseModalOpen(true)
  }

  function closePhraseModal() {
    setIsPhraseModalOpen(false)
    setEditingPhraseId(null)
  }

  async function submitPhraseForm(e: React.FormEvent) {
    e.preventDefault()
    if (!effectivePhraseCategoryId || !newPhraseText.trim()) return
    const body = {
      category_id: effectivePhraseCategoryId,
      text: newPhraseText.trim(),
      default_weight: newPhraseWeight.trim() ? Number(newPhraseWeight) : null,
      is_negative_default: false,
      notes: newPhraseNotes.trim() || null,
      required_lora: newPhraseRequiredLora.trim() || null,
      sort_order: phrasesInEffectivePhraseCategory.length,
    }
    if (editingPhraseId === null) {
      await api<Phrase>('/phrases', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } else {
      await api(`/phrases/${editingPhraseId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    }
    setNewPhraseText('')
    setNewPhraseWeight('')
    setNewPhraseNotes('')
    setNewPhraseRequiredLora('')
    closePhraseModal()
    await loadAll()
  }

  async function removePhrase(id: number) {
    await api(`/phrases/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  async function changePhraseCategory(phrase: Phrase, categoryId: number) {
    await api(`/phrases/${phrase.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ category_id: categoryId }),
    })
    setLibrarySelectedCategoryId(categoryId)
    await loadAll()
  }

  function addPhraseToComposer(phrase: Phrase, target: 'positive' | 'negative') {
    const categoryName = categoryNameById.get(phrase.category_id)
    const item: ComposerItem = {
      id: `${phrase.id}-${Date.now()}-${Math.random()}`,
      text: phrase.text,
      weight: phrase.default_weight ?? undefined,
      category: categoryName,
      isImportant: false,
      isRecurring: categoryName?.toLowerCase().includes('quality') ?? false,
      requiredLora: phrase.required_lora ?? undefined,
    }
    if (target === 'negative') setNegativeParts((curr) => [...curr, item])
    else setPositiveParts((curr) => [...curr, item])
  }

  function startRenameCategory(category: Category) {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  async function saveRenamedCategory() {
    if (editingCategoryId === null) return
    await renameCategory(editingCategoryId, editingCategoryName)
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  function cancelRenameCategory() {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  function getPhraseById(id: number | null) {
    if (id === null) return null
    return phrases.find((p) => p.id === id) ?? null
  }

  function dropPhraseTo(target: 'positive' | 'negative') {
    const phrase = getPhraseById(draggingPhraseId)
    if (!phrase) return
    addPhraseToComposer(phrase, target)
    setDraggingPhraseId(null)
  }

  function updatePart(setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number, patch: Partial<ComposerItem>) {
    setter((curr) => curr.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  function movePart(setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number, dir: -1 | 1) {
    setter((curr) => {
      const next = [...curr]
      const target = idx + dir
      if (target < 0 || target >= curr.length) return curr
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function removePart(setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number) {
    setter((curr) => curr.filter((_, i) => i !== idx))
  }

  async function copyText(text: string) {
    if (!text) return
    await navigator.clipboard.writeText(text)
  }

  async function savePreset(e: React.FormEvent) {
    e.preventDefault()
    if (!presetName.trim()) return
    await api('/presets', {
      method: 'POST',
      body: JSON.stringify({
        name: presetName.trim(),
        positive_parts: positiveParts.map((p) => ({ text: p.text, weight: p.weight, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
        negative_parts: negativeParts.map((p) => ({ text: p.text, weight: p.weight, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
      }),
    })
    setPresetName('')
    await loadAll()
  }

  function loadPreset(preset: Preset) {
    setPositiveParts(preset.positive_parts.map((p, i) => ({ id: `pp-${preset.id}-${i}-${Date.now()}`, text: p.text, weight: p.weight, category: p.category, isImportant: p.is_important, isRecurring: p.is_recurring, requiredLora: p.required_lora })))
    setNegativeParts(preset.negative_parts.map((p, i) => ({ id: `np-${preset.id}-${i}-${Date.now()}`, text: p.text, weight: p.weight, category: p.category, isImportant: p.is_important, isRecurring: p.is_recurring, requiredLora: p.required_lora })))
  }

  async function deletePreset(id: number) {
    if (!window.confirm('Delete preset?')) return
    await api(`/presets/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  async function saveCharacter(e: React.FormEvent) {
    e.preventDefault()
    if (!characterName.trim()) return
    await api('/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: characterName.trim(),
        version_family: characterVersionFamily.trim() || null,
        version: characterVersion.trim() ? Number(characterVersion) : null,
        description: characterDescription.trim() || null,
        required_sdxl_base_model: characterRequiredSdxlBaseModel.trim() || null,
        recommended_sdxl_base_model: characterRecommendedSdxlBaseModel.trim() || null,
        positive_prompt: positivePrompt,
        negative_prompt: negativePrompt,
        positive_parts: positiveParts.map((p) => ({ text: p.text, weight: p.weight, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
        negative_parts: negativeParts.map((p) => ({ text: p.text, weight: p.weight, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
        required_loras: requiredLoras,
      }),
    })
    setCharacterName('')
    setCharacterVersionFamily('')
    setCharacterVersion('1')
    setCharacterDescription('')
    setCharacterRequiredSdxlBaseModel('')
    setCharacterRecommendedSdxlBaseModel('')
    await loadAll()
  }

  function loadCharacter(character: CharacterPreset) {
    setPositiveParts(character.positive_parts.map((p, i) => ({ id: `cp-${character.id}-${i}-${Date.now()}`, text: p.text, weight: p.weight, category: p.category, isImportant: p.is_important, isRecurring: p.is_recurring, requiredLora: p.required_lora })))
    setNegativeParts(character.negative_parts.map((p, i) => ({ id: `cn-${character.id}-${i}-${Date.now()}`, text: p.text, weight: p.weight, category: p.category, isImportant: p.is_important, isRecurring: p.is_recurring, requiredLora: p.required_lora })))
  }

  async function deleteCharacter(id: number) {
    if (!window.confirm('Delete character preset?')) return
    await api(`/characters/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  async function duplicateCharacterVersion(id: number) {
    await api(`/characters/${id}/duplicate-version`, { method: 'POST' })
    await loadAll()
  }

  function smartCleanupPrompt() {
    setPositiveParts((curr) => {
      const cleaned = dedupeParts(curr)
      return cleaned.map((p, idx) => ({ ...p, isImportant: p.isImportant ?? idx === 0, isRecurring: p.isRecurring ?? /quality|detail|masterpiece|highres/i.test(p.text) }))
    })
    setNegativeParts((curr) => dedupeParts(curr))
  }

  function addCinematicStarterPack() {
    const pack: ComposerItem[] = [
      { id: `auto-cine-${Date.now()}-1`, text: 'cinematic lighting', isRecurring: true, category: 'Lighting' },
      { id: `auto-cine-${Date.now()}-2`, text: 'highly detailed', isRecurring: true, category: 'Quality' },
      { id: `auto-cine-${Date.now()}-3`, text: 'sharp focus', isRecurring: true, category: 'Quality' },
    ]
    setPositiveParts((curr) => dedupeParts([...curr, ...pack]))
  }

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      })
      if (!res.ok) {
        setLoginError('Login failed')
        return
      }
      const data = (await res.json()) as { token: string }
      localStorage.setItem('promptdb_token', data.token)
      setIsAuthenticated(true)
      void loadAll()
    } catch {
      setLoginError('Login failed')
    }
  }

  function logout() {
    localStorage.removeItem('promptdb_token')
    setIsAuthenticated(false)
  }

  return (
    <main style={{ background: `radial-gradient(circle at top, ${ui.bg2}, ${ui.bg})`, minHeight: '100vh', color: ui.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        {!isAuthenticated ? (
          <Panel title="Login">
            <form onSubmit={login} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
              <input style={inputStyle} value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="username" />
              <input style={inputStyle} type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="password" />
              <button style={btnStyle} type="submit">Login</button>
              {loginError && <span style={{ color: ui.danger }}>{loginError}</span>}
            </form>
          </Panel>
        ) : (
          <>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.svg" alt="PromptForge logo" style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${ui.border}` }} />
            <div>
              <h1 style={{ margin: 0, letterSpacing: 0.2 }}>PromptForge</h1>
              <p style={{ margin: '4px 0 0 0', color: ui.muted, fontSize: 13 }}>Forge structured prompts for Stable Diffusion</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ui.muted }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: loading ? ui.danger : ui.ok, display: 'inline-block' }} />
              {loading ? 'syncing...' : ''}
            </span>
            <button style={btnGhostStyle} onClick={logout}>Logout</button>
          </div>
        </header>

        <nav style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {[
            ['dashboard', 'Dashboard'],
            ['library', 'Library'],
            ['composer', 'Composer'],
            ['characters', 'Characters'],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setActiveTab(k as TabKey)}
              style={{
                background: activeTab === k ? ui.accent : ui.panel,
                color: ui.text,
                border: `1px solid ${ui.border}`,
                borderRadius: 999,
                padding: '9px 16px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeTab === k ? '0 0 0 3px rgba(94,162,255,0.2)' : 'none',
              }}
            >
              {k === 'dashboard' ? '📊 ' : k === 'library' ? '📚 ' : k === 'composer' ? '🧩 ' : '🧬 '}{label}
            </button>
          ))}
        </nav>

        {error && <p style={{ color: ui.danger }}>{error}</p>}

        {activeTab === 'dashboard' && (
          <section style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${isNarrow ? 170 : 220}px,1fr))`, gap: 12 }}>
            <StatCard title="Categories" value={String(categories.length)} />
            <StatCard title="Phrases" value={String(phrases.length)} />
            <StatCard title="Presets" value={String(presets.length)} />
            <StatCard title="Characters" value={String(characters.length)} />
            <StatCard title="Prompt Quality" value={`${promptHealth.score}/100`} highlight />
            <StatCard title="Required LoRAs" value={requiredLoras.length ? requiredLoras.join(', ') : 'none'} />
          </section>
        )}

        {activeTab === 'library' && (
          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <Panel title="Categories">
              <form onSubmit={createCategory} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category" />
                <button style={btnStyle} type="submit">Add</button>
              </form>
              {categories.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <button style={btnStyle} onClick={() => setLibrarySelectedCategoryId(c.id)}>Select</button>
                  {editingCategoryId === c.id ? (
                    <>
                      <input
                        style={inputStyle}
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveRenamedCategory()
                          if (e.key === 'Escape') cancelRenameCategory()
                        }}
                      />
                      <button style={btnGhostStyle} onClick={() => void saveRenamedCategory()}>Save</button>
                      <button style={btnGhostStyle} onClick={cancelRenameCategory}>✕</button>
                    </>
                  ) : (
                    <>
                      <button style={btnGhostStyle} onClick={() => startRenameCategory(c)}>{c.name}</button>
                      <button style={btnGhostStyle} onClick={() => removeCategory(c.id)} title="Delete">🗑️</button>
                    </>
                  )}
                </div>
              ))}
            </Panel>

            <Panel title={`Phrases ${librarySelectedCategoryId ? '' : '(select category)'}`}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  style={inputStyle}
                  value={effectivePhraseCategoryId ?? ''}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : null
                    setNewPhraseCategoryId(nextId)
                    setLibrarySelectedCategoryId(nextId)
                  }}
                >
                  <option value="" disabled>
                    Select category
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button style={btnStyle} type="button" disabled={!effectivePhraseCategoryId} onClick={openCreatePhraseModal}>+ New phrase</button>
              </div>
              <h4 style={{ margin: '8px 0', color: ui.muted }}>In selected category ({libraryCategoryPhrases.length})</h4>
              {libraryCategoryPhrases.map((p) => (
                <div key={`cat-${p.id}`} style={{ borderTop: `1px solid ${ui.border}`, padding: '8px 0' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong>{p.text}</strong>
                    {p.default_weight !== null && <span style={{ color: ui.muted }}>({p.default_weight})</span>}
                    {p.required_lora && <span style={{ color: ui.ok }}>LoRA: {p.required_lora}</span>}
                    <button style={btnGhostStyle} onClick={() => openEditPhraseModal(p)} title="Edit">✏️</button>
                    <button style={btnGhostStyle} onClick={() => removePhrase(p.id)} title="Delete">🗑️</button>
                  </div>
                </div>
              ))}

            </Panel>
          </section>
        )}

        {activeTab === 'composer' && (
          <>
            <Panel title="Phrase picker">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: ui.muted }}>Category:</span>
                <select
                  style={inputStyle}
                  value={composerSelectedCategoryId ?? ''}
                  onChange={(e) => setComposerSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {composerCategoryPhrases.map((p) => (
                  <div key={`picker-${p.id}`} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDraggingPhraseId(p.id)}
                      onDragEnd={() => setDraggingPhraseId(null)}
                      onClick={() => setChipMenuPhraseId((curr) => (curr === p.id ? null : p.id))}
                      style={{
                        ...btnGhostStyle,
                        borderRadius: 999,
                        padding: '8px 12px',
                        background: ui.panel2,
                        borderColor: chipMenuPhraseId === p.id ? ui.accent : ui.border,
                      }}
                    >
                      {p.text}
                      {p.default_weight !== null ? ` (${p.default_weight})` : ''}
                    </button>
                    {chipMenuPhraseId === p.id && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, display: 'flex', gap: 6, background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 10, padding: 6 }}>
                        <button style={btnGhostStyle} onClick={() => { addPhraseToComposer(p, 'positive'); setChipMenuPhraseId(null) }}>➕ Positive</button>
                        <button style={btnGhostStyle} onClick={() => { addPhraseToComposer(p, 'negative'); setChipMenuPhraseId(null) }}>➖ Negative</button>
                      </div>
                    )}
                  </div>
                ))}
                {composerCategoryPhrases.length === 0 && <span style={{ color: ui.muted }}>No phrases in selected category.</span>}
              </div>
            </Panel>

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropPhraseTo('positive')}
                style={{ borderRadius: 14, boxShadow: draggingPhraseId !== null ? `0 0 0 2px ${ui.accent}` : 'none' }}
              >
                <ComposerList title="Positive" items={positiveParts} setItems={setPositiveParts} updatePart={updatePart} movePart={movePart} removePart={removePart} />
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropPhraseTo('negative')}
                style={{ borderRadius: 14, boxShadow: draggingPhraseId !== null ? `0 0 0 2px ${ui.accent}` : 'none' }}
              >
                <ComposerList title="Negative" items={negativeParts} setItems={setNegativeParts} updatePart={updatePart} movePart={movePart} removePart={removePart} />
              </div>
            </section>

            <Panel title="Prompt Inspector">
              <p style={{ marginTop: 0 }}>Quality score: <strong>{promptHealth.score}/100</strong> {promptHealth.score >= 85 ? '🟢' : promptHealth.score >= 60 ? '🟡' : '🔴'}</p>
              {promptHealth.issues.length ? (
                <ul>{promptHealth.issues.map((i) => <li key={i}>{i}</li>)}</ul>
              ) : (
                <p style={{ color: ui.ok }}>Looks clean and ready.</p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btnStyle} onClick={smartCleanupPrompt}>Auto-clean</button>
                <button style={btnStyle} onClick={addCinematicStarterPack}>Add cinematic starter pack</button>
              </div>
            </Panel>

            <Panel title="Structured view">
              {groupedPositive.map(([group, items]) => (
                <div key={group} style={{ marginBottom: 10 }}>
                  <strong>🏷️ {group}</strong>
                  <ul>{items.map((i) => <li key={i.id}>{i.text}{i.weight !== undefined ? ` (${i.weight})` : ''}{i.isImportant ? ' [important]' : ''}</li>)}</ul>
                </div>
              ))}
              {groupedNegative.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 6 }}>🚫 Negative groups</h4>
                  {groupedNegative.map(([group, items]) => (
                    <div key={`neg-${group}`} style={{ marginBottom: 10 }}>
                      <strong>🏷️ {group}</strong>
                      <ul>{items.map((i) => <li key={i.id}>{i.text}{i.weight !== undefined ? ` (${i.weight})` : ''}</li>)}</ul>
                    </div>
                  ))}
                </>
              )}
            </Panel>

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <Panel title="Positive prompt">
                <textarea readOnly value={positivePrompt} rows={4} style={textareaStyle} />
                <button style={btnStyle} onClick={() => void copyText(positivePrompt)}>Copy</button>
              </Panel>
              <Panel title="Negative prompt">
                <textarea readOnly value={negativePrompt} rows={4} style={textareaStyle} />
                <button style={btnStyle} onClick={() => void copyText(negativePrompt)}>Copy</button>
              </Panel>
            </section>

            <Panel title="Composer Presets">
              <form onSubmit={savePreset} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" />
                <button style={btnStyle} type="submit">Save</button>
              </form>
              {presets.map((preset) => (
                <div key={preset.id} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <strong>{preset.name}</strong>
                  <button style={btnGhostStyle} onClick={() => loadPreset(preset)}>Load</button>
                  <button style={btnGhostStyle} onClick={() => void deletePreset(preset.id)}>Delete</button>
                </div>
              ))}
            </Panel>
          </>
        )}

        {activeTab === 'characters' && (
          <Panel title="Character presets">
            <form onSubmit={saveCharacter} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <input style={inputStyle} value={characterName} onChange={(e) => setCharacterName(e.target.value)} placeholder="character name" />
              <input style={inputStyle} value={characterDescription} onChange={(e) => setCharacterDescription(e.target.value)} placeholder="description" />
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 120px', gap: 8 }}>
                <input style={inputStyle} value={characterVersionFamily} onChange={(e) => setCharacterVersionFamily(e.target.value)} placeholder="version family" />
                <input style={inputStyle} value={characterVersion} onChange={(e) => setCharacterVersion(e.target.value)} type="number" min={1} />
              </div>
              <input style={inputStyle} value={characterRequiredSdxlBaseModel} onChange={(e) => setCharacterRequiredSdxlBaseModel(e.target.value)} placeholder="required SDXL base model" />
              <input style={inputStyle} value={characterRecommendedSdxlBaseModel} onChange={(e) => setCharacterRecommendedSdxlBaseModel(e.target.value)} placeholder="recommended SDXL base model" />
              <button style={btnStyle} type="submit">Save current composer as character</button>
            </form>

            {characters.map((character) => (
              <div key={character.id} style={{ borderTop: `1px solid ${ui.border}`, padding: '10px 0' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{character.name}</strong>
                  <span style={{ color: ui.muted }}>family: {character.version_family || 'n/a'}</span>
                  <span style={{ color: ui.muted }}>v{character.version}</span>
                  {character.required_sdxl_base_model && <span style={{ color: ui.warn }}>Required SDXL: {character.required_sdxl_base_model}</span>}
                  {character.recommended_sdxl_base_model && <span style={{ color: ui.accent }}>Recommended SDXL: {character.recommended_sdxl_base_model}</span>}
                  {character.required_loras.length > 0 && <span style={{ color: ui.ok }}>LoRAs: {character.required_loras.join(', ')}</span>}
                </div>
                {character.description && <p style={{ color: ui.muted }}>{character.description}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btnGhostStyle} onClick={() => loadCharacter(character)}>Load</button>
                  <button style={btnGhostStyle} onClick={() => void duplicateCharacterVersion(character.id)}>Duplicate next version</button>
                  <button style={btnGhostStyle} onClick={() => void deleteCharacter(character.id)}>Delete</button>
                </div>
              </div>
            ))}
          </Panel>
        )}

        {isPhraseModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,15,27,0.72)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
            <div style={{ width: 'min(680px, 100%)', background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 14, padding: 14, boxShadow: ui.shadow }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{editingPhraseId === null ? 'Create phrase' : 'Edit phrase'}</h3>
                <button style={btnGhostStyle} onClick={closePhraseModal}>✕</button>
              </div>
              <form onSubmit={submitPhraseForm} style={{ display: 'grid', gap: 8 }}>
                <select
                  style={inputStyle}
                  value={effectivePhraseCategoryId ?? ''}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : null
                    setNewPhraseCategoryId(nextId)
                    setLibrarySelectedCategoryId(nextId)
                  }}
                >
                  <option value="" disabled>
                    Select category
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input style={inputStyle} value={newPhraseText} onChange={(e) => setNewPhraseText(e.target.value)} placeholder="Phrase text" />
                <input style={inputStyle} value={newPhraseWeight} onChange={(e) => setNewPhraseWeight(e.target.value)} placeholder="default weight (optional)" type="number" step="0.1" />
                <input style={inputStyle} value={newPhraseNotes} onChange={(e) => setNewPhraseNotes(e.target.value)} placeholder="notes" />
                <input style={inputStyle} value={newPhraseRequiredLora} onChange={(e) => setNewPhraseRequiredLora(e.target.value)} placeholder="required LoRA" />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={btnGhostStyle} type="button" onClick={closePhraseModal}>Cancel</button>
                  <button style={btnStyle} type="submit" disabled={!effectivePhraseCategoryId || !newPhraseText.trim()}>{editingPhraseId === null ? 'Create' : 'Save'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </main>
  )
}

function Panel({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <section style={{ background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 14, padding: 14, boxShadow: ui.shadow }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: 17 }}>{title}</h3>
      {children}
    </section>
  )
}

function StatCard({ title, value, highlight }: { title: string, value: string, highlight?: boolean }) {
  return (
    <div style={{ background: ui.panel, border: `1px solid ${highlight ? ui.accent : ui.border}`, borderRadius: 14, padding: 14, boxShadow: ui.shadow }}>
      <div style={{ color: ui.muted, fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 19, marginTop: 6, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function ComposerList({
  title,
  items,
  setItems,
  updatePart,
  movePart,
  removePart,
}: {
  title: string
  items: ComposerItem[]
  setItems: React.Dispatch<React.SetStateAction<ComposerItem[]>>
  updatePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number, patch: Partial<ComposerItem>) => void
  movePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number, dir: -1 | 1) => void
  removePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number) => void
}) {
  return (
    <Panel title={title}>
      {items.length === 0 && <p style={{ color: ui.muted }}>No items yet</p>}
      {items.map((item, idx) => (
        <div key={item.id} style={{ border: `1px solid ${ui.border}`, borderRadius: 10, padding: 6, marginBottom: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px auto', gap: 6, marginBottom: 6 }}>
            <input style={inputStyle} value={item.text} onChange={(e) => updatePart(setItems, idx, { text: e.target.value })} />
            <input style={inputStyle} type="number" step="0.1" placeholder="weight" value={item.weight ?? ''} onChange={(e) => updatePart(setItems, idx, { weight: e.target.value ? Number(e.target.value) : undefined })} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={btnGhostStyle} onClick={() => movePart(setItems, idx, -1)}>↑</button>
              <button style={btnGhostStyle} onClick={() => movePart(setItems, idx, 1)}>↓</button>
              <button style={btnGhostStyle} onClick={() => removePart(setItems, idx)}>✕</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ color: ui.muted }}>Category: {item.category || 'Uncategorized'}</span>
            <label><input type="checkbox" checked={Boolean(item.isImportant)} onChange={(e) => updatePart(setItems, idx, { isImportant: e.target.checked })} /> important</label>
            <label><input type="checkbox" checked={Boolean(item.isRecurring)} onChange={(e) => updatePart(setItems, idx, { isRecurring: e.target.checked })} /> recurring</label>
          </div>
          <input style={inputStyle} value={item.requiredLora ?? ''} onChange={(e) => updatePart(setItems, idx, { requiredLora: e.target.value || undefined })} placeholder="Required LoRA" />
        </div>
      ))}
    </Panel>
  )
}

const inputStyle: React.CSSProperties = {
  background: ui.panel2,
  color: ui.text,
  border: `1px solid ${ui.border}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
}

const btnStyle: React.CSSProperties = {
  background: ui.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '9px 13px',
  fontWeight: 600,
  cursor: 'pointer',
}

const btnGhostStyle: React.CSSProperties = {
  background: ui.panel2,
  color: ui.text,
  border: `1px solid ${ui.border}`,
  borderRadius: 10,
  padding: '6px 10px',
  fontWeight: 500,
  cursor: 'pointer',
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
