import React, { useEffect, useMemo, useRef, useState } from 'react'
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

type Pack = {
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

function mergePartsReplace(existing: ComposerItem[], incoming: ComposerItem[]) {
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
  const [language, setLanguage] = useState<'de' | 'en'>('de')

  const [categories, setCategories] = useState<Category[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [characters, setCharacters] = useState<CharacterPreset[]>([])

  const [librarySelectedCategoryId, setLibrarySelectedCategoryId] = useState<number | null>(null)
  const [composerSelectedCategoryId, setComposerSelectedCategoryId] = useState<number | null>(null)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newPhraseText, setNewPhraseText] = useState('')
  const [newPhraseCategoryId, setNewPhraseCategoryId] = useState<number | null>(null)
  const [newPhraseWeight, setNewPhraseWeight] = useState('')
  const [newPhraseNotes, setNewPhraseNotes] = useState('')
  const [newPhraseRequiredLora, setNewPhraseRequiredLora] = useState('')
  const [phraseModalCategoryId, setPhraseModalCategoryId] = useState<number | null>(null)
  const [importPromptText, setImportPromptText] = useState('')
  const [importingPrompt, setImportingPrompt] = useState(false)
  const [isPhraseModalOpen, setIsPhraseModalOpen] = useState(false)
  const [editingPhraseId, setEditingPhraseId] = useState<number | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<number | null>(null)
  const [draggingCategoryId, setDraggingCategoryId] = useState<number | null>(null)
  const [draggingLibraryPhraseId, setDraggingLibraryPhraseId] = useState<number | null>(null)
  const [chipMenuPhraseId, setChipMenuPhraseId] = useState<number | null>(null)
  const [draggingPhraseId, setDraggingPhraseId] = useState<number | null>(null)

  const i18n = {
    de: {
      login: 'Login',
      username: 'Benutzername',
      password: 'Passwort',
      loginFailed: 'Login fehlgeschlagen',
      syncing: 'syncing...',
      logout: 'Logout',
      dashboard: 'Dashboard',
      library: 'Library',
      composer: 'Composer',
      characters: 'Characters',
      categories: 'Kategorien',
      add: 'Hinzufügen',
      newCategory: 'Neue Kategorie',
      phrases: 'Phrasen',
      selectCategory: 'Kategorie auswählen',
      newPhrase: '+ Neue Phrase',
      inSelectedCategory: 'In ausgewählter Kategorie',
      noPhrases: 'Keine Phrasen in der ausgewählten Kategorie.',
      createPhrase: 'Phrase erstellen',
      editPhrase: 'Phrase bearbeiten',
      phraseText: 'Phrase Text',
      defaultWeight: 'Default Weight (optional)',
      notes: 'Notizen',
      requiredLora: 'Required LoRA',
      cancel: 'Abbrechen',
      create: 'Erstellen',
      save: 'Speichern',
      language: 'Sprache',
      german: 'Deutsch',
      english: 'Englisch',
      phrasePicker: 'Phrase Picker',
      positive: 'Positiv',
      negative: 'Negativ',
      subtitle: 'Baue strukturierte Prompts für Stable Diffusion',
      categoriesCount: 'Kategorien',
      phrasesCount: 'Phrasen',
      presetsCount: 'Presets',
      charactersCount: 'Charaktere',
      promptQuality: 'Prompt Qualität',
      requiredLoras: 'Required LoRAs',
      none: 'keine',
      promptInspector: 'Prompt Inspector',
      qualityScore: 'Quality score',
      looksClean: 'Sieht sauber und bereit aus.',
      autoClean: 'Auto-clean',
      addCinematic: 'Cinematic Starter Pack hinzufügen',
      structuredView: 'Strukturierte Ansicht',
      uncategorized: 'Unkategorisiert',
      qualityRecurring: 'Qualität / Wiederkehrend',
      negativeGroups: 'Negative Gruppen',
      importantTag: 'wichtig',
      positivePrompt: 'Positiver Prompt',
      negativePrompt: 'Negativer Prompt',
      copy: 'Kopieren',
      composerPresets: 'Composer Presets',
      presetName: 'Preset Name',
      load: 'Laden',
      delete: 'Löschen',
      characterPresets: 'Character Presets',
      characterName: 'Character Name',
      description: 'Beschreibung',
      versionFamily: 'Version Familie',
      requiredSdxl: 'Erforderliches SDXL Base Model',
      recommendedSdxl: 'Empfohlenes SDXL Base Model',
      saveAsCharacter: 'Aktuellen Composer als Character speichern',
      duplicateNextVersion: 'Nächste Version duplizieren',
      family: 'Familie',
      na: 'k.A.',
      noItemsYet: 'Noch keine Einträge',
      weight: 'Gewicht',
      category: 'Kategorie',
      important: 'wichtig',
      recurring: 'wiederkehrend',
      noPositiveParts: 'Keine positiven Teile ausgewählt.',
      noImportant: 'Kein wichtiger Kernteil markiert.',
      noRequiredLora: 'Kein Required LoRA erkannt.',
      conflictTerms: 'Begriffe sind in positiv und negativ enthalten.',
      positiveDuplicates: 'Doppelte Einträge in positiv.',
      negativeDuplicates: 'Doppelte Einträge in negativ.',
    },
    en: {
      login: 'Login',
      username: 'username',
      password: 'password',
      loginFailed: 'Login failed',
      syncing: 'syncing...',
      logout: 'Logout',
      dashboard: 'Dashboard',
      library: 'Library',
      composer: 'Composer',
      characters: 'Characters',
      categories: 'Categories',
      add: 'Add',
      newCategory: 'New category',
      phrases: 'Phrases',
      selectCategory: 'Select category',
      newPhrase: '+ New phrase',
      inSelectedCategory: 'In selected category',
      noPhrases: 'No phrases in selected category.',
      createPhrase: 'Create phrase',
      editPhrase: 'Edit phrase',
      phraseText: 'Phrase text',
      defaultWeight: 'Default weight (optional)',
      notes: 'notes',
      requiredLora: 'required LoRA',
      cancel: 'Cancel',
      create: 'Create',
      save: 'Save',
      language: 'Language',
      german: 'German',
      english: 'English',
      phrasePicker: 'Phrase picker',
      positive: 'Positive',
      negative: 'Negative',
      subtitle: 'Forge structured prompts for Stable Diffusion',
      categoriesCount: 'Categories',
      phrasesCount: 'Phrases',
      presetsCount: 'Presets',
      charactersCount: 'Characters',
      promptQuality: 'Prompt Quality',
      requiredLoras: 'Required LoRAs',
      none: 'none',
      promptInspector: 'Prompt Inspector',
      qualityScore: 'Quality score',
      looksClean: 'Looks clean and ready.',
      autoClean: 'Auto-clean',
      addCinematic: 'Add cinematic starter pack',
      structuredView: 'Structured view',
      uncategorized: 'Uncategorized',
      qualityRecurring: 'Quality / Recurring',
      negativeGroups: 'Negative groups',
      importantTag: 'important',
      positivePrompt: 'Positive prompt',
      negativePrompt: 'Negative prompt',
      copy: 'Copy',
      composerPresets: 'Composer Presets',
      presetName: 'Preset name',
      load: 'Load',
      delete: 'Delete',
      characterPresets: 'Character presets',
      characterName: 'character name',
      description: 'description',
      versionFamily: 'version family',
      requiredSdxl: 'required SDXL base model',
      recommendedSdxl: 'recommended SDXL base model',
      saveAsCharacter: 'Save current composer as character',
      duplicateNextVersion: 'Duplicate next version',
      family: 'family',
      na: 'n/a',
      noItemsYet: 'No items yet',
      weight: 'weight',
      category: 'Category',
      important: 'important',
      recurring: 'recurring',
      noPositiveParts: 'No positive parts selected yet.',
      noImportant: 'No important/core part is marked.',
      noRequiredLora: 'No required LoRA detected.',
      conflictTerms: 'terms appear in both positive and negative.',
      positiveDuplicates: 'duplicate entries in positive.',
      negativeDuplicates: 'duplicate entries in negative.',
    },
  } as const
  const t = i18n[language]

  const [presetName, setPresetName] = useState('')
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null)
  const [activePackIds, setActivePackIds] = useState<number[]>([])
  const [isPackNameModalOpen, setIsPackNameModalOpen] = useState(false)
  const [pendingPackName, setPendingPackName] = useState('')
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
      const key = part.isRecurring ? t.qualityRecurring : part.category || t.uncategorized
      const curr = map.get(key) || []
      curr.push(part)
      map.set(key, curr)
    }
    return [...map.entries()]
  }, [positiveParts, categories, t])

  const groupedNegative = useMemo(() => {
    const map = new Map<string, ComposerItem[]>()
    const ordered = orderParts(negativeParts)
    for (const part of ordered) {
      const key = part.category || t.uncategorized
      const curr = map.get(key) || []
      curr.push(part)
      map.set(key, curr)
    }
    return [...map.entries()]
  }, [negativeParts, categories, t])

  const promptHealth = useMemo(() => {
    const issues: string[] = []
    const positiveKeys = new Set(positiveParts.map((p) => normalizeText(p.text)).filter(Boolean))
    const negativeKeys = new Set(negativeParts.map((p) => normalizeText(p.text)).filter(Boolean))
    const duplicatePositiveCount = positiveParts.length - positiveKeys.size
    const duplicateNegativeCount = negativeParts.length - negativeKeys.size

    if (positiveParts.length === 0) issues.push(t.noPositiveParts)
    if (duplicatePositiveCount > 0) issues.push(`Positive has ${duplicatePositiveCount} ${t.positiveDuplicates}`)
    if (duplicateNegativeCount > 0) issues.push(`Negative has ${duplicateNegativeCount} ${t.negativeDuplicates}`)

    let crossConflictCount = 0
    for (const key of positiveKeys) {
      if (negativeKeys.has(key)) crossConflictCount += 1
    }
    if (crossConflictCount > 0) issues.push(`${crossConflictCount} ${t.conflictTerms}`)

    const importantCount = positiveParts.filter((p) => p.isImportant).length
    if (importantCount === 0 && positiveParts.length > 0) issues.push(t.noImportant)

    if (requiredLoras.length === 0 && positiveParts.length > 0) issues.push(t.noRequiredLora)

    const score = Math.max(0, 100 - issues.length * 12)
    return { score, issues }
  }, [positiveParts, negativeParts, requiredLoras.length, t])

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
  const importedCategoryId = useMemo(
    () => categories.find((c) => normalizeText(c.name) === 'imported')?.id ?? null,
    [categories],
  )
  const visibleLibraryCategories = useMemo(
    () => categories.filter((c) => c.id !== importedCategoryId),
    [categories, importedCategoryId],
  )
  const phraseCountByCategoryId = useMemo(() => {
    const counts = new Map<number, number>()
    for (const phrase of phrases) {
      counts.set(phrase.category_id, (counts.get(phrase.category_id) ?? 0) + 1)
    }
    return counts
  }, [phrases])

  const sortedPositiveParts = useMemo(() => orderParts(positiveParts), [positiveParts, categories])
  const sortedNegativeParts = useMemo(() => orderParts(negativeParts), [negativeParts, categories])

  const positivePrompt = useMemo(() => toPrompt(sortedPositiveParts), [sortedPositiveParts])
  const negativePrompt = useMemo(() => toPrompt(sortedNegativeParts), [sortedNegativeParts])

  const packCoverage = useMemo(() => {
    const toKey = (part: PromptPart) => `${normalizeText(part.text)}::${part.weight ?? ''}`
    const activePositive = new Set(positiveParts.map((p) => `${normalizeText(p.text)}::${p.weight ?? ''}`))
    const activeNegative = new Set(negativeParts.map((p) => `${normalizeText(p.text)}::${p.weight ?? ''}`))
    return packs.map((pack) => {
      const posKeys = pack.positive_parts.map(toKey)
      const negKeys = pack.negative_parts.map(toKey)
      const all = [...posKeys.map((k) => `p:${k}`), ...negKeys.map((k) => `n:${k}`)]
      const covered = all.filter((k) => (k.startsWith('p:') ? activePositive.has(k.slice(2)) : activeNegative.has(k.slice(2)))).length
      const total = all.length
      const percent = total === 0 ? 100 : Math.round((covered / total) * 100)
      const inUse = covered > 0
      const isActive = activePackIds.includes(pack.id)
      return { pack, covered, total, percent, complete: total > 0 && covered === total, inUse, isActive }
    }).filter((item) => item.inUse || item.isActive)
  }, [packs, positiveParts, negativeParts, activePackIds])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [c, p, pr, pa, ch] = await Promise.all([
        api<Category[]>('/categories'),
        api<Phrase[]>('/phrases'),
        api<Preset[]>('/presets'),
        api<Pack[]>('/packs'),
        api<CharacterPreset[]>('/characters'),
      ])
      setCategories(c)
      setPhrases(p)
      setPresets(pr)
      setPacks(pa)
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
    const nextName = newCategoryName.trim()
    if (!nextName) return

    const normalized = normalizeText(nextName)
    const duplicateExists = categories.some((c) => normalizeText(c.name) === normalized)
    if (duplicateExists) {
      setError('Category already exists')
      return
    }

    try {
      await api<Category>('/categories', {
        method: 'POST',
        body: JSON.stringify({ name: nextName, sort_order: categories.length }),
      })
      setNewCategoryName('')
      await loadAll()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Category create failed'
      setError(msg.includes('already exists') ? 'Category already exists' : msg)
    }
  }

  async function renameCategory(id: number, name: string) {
    if (!name.trim()) return
    await api(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) })
    await loadAll()
  }

  async function removeCategory(id: number) {
    await api(`/categories/${id}`, { method: 'DELETE' })
    if (librarySelectedCategoryId === id) setLibrarySelectedCategoryId(null)
    if (composerSelectedCategoryId === id) setComposerSelectedCategoryId(null)
    await loadAll()
  }

  async function confirmRemoveCategory() {
    if (pendingDeleteCategoryId === null) return
    await removeCategory(pendingDeleteCategoryId)
    setPendingDeleteCategoryId(null)
  }

  function openCreatePhraseModal() {
    setEditingPhraseId(null)
    const fallbackCategoryId = newPhraseCategoryId ?? librarySelectedCategoryId ?? categories[0]?.id ?? null
    setPhraseModalCategoryId(fallbackCategoryId)
    if (newPhraseCategoryId === null) setNewPhraseCategoryId(fallbackCategoryId)
    setNewPhraseText('')
    setNewPhraseWeight('1')
    setNewPhraseNotes('')
    setNewPhraseRequiredLora('')
    setIsPhraseModalOpen(true)
  }

  function openEditPhraseModal(phrase: Phrase) {
    setEditingPhraseId(phrase.id)
    setPhraseModalCategoryId(phrase.category_id)
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
    setPhraseModalCategoryId(null)
  }

  function splitPromptParts(input: string) {
    const parts: string[] = []
    let current = ''
    let depth = 0
    for (const ch of input) {
      if (ch === '(') depth += 1
      if (ch === ')') depth = Math.max(0, depth - 1)
      if (ch === ',' && depth === 0) {
        parts.push(current)
        current = ''
        continue
      }
      current += ch
    }
    if (current.trim()) parts.push(current)
    return parts
  }

  function parsePromptPhrase(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const weighted = trimmed.match(/^\((.+):\s*[-+]?\d*\.?\d+\)$/)
    if (weighted) return { text: weighted[1].trim(), hasWeight: true }
    return { text: trimmed, hasWeight: false }
  }

  async function importPromptPhrases(e: React.FormEvent) {
    e.preventDefault()
    if (!importPromptText.trim()) return
    setImportingPrompt(true)
    try {
      let importedCategoryId = categories.find((c) => c.name.trim().toLowerCase() === 'imported')?.id ?? null
      if (importedCategoryId === null) {
        const created = await api<Category>('/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'imported', sort_order: categories.length }),
        })
        importedCategoryId = created.id
      }

      const importedCategoryPhrasesCount = phrases.filter((p) => p.category_id === importedCategoryId).length
      const existing = new Set(phrases.map((p) => normalizeText(p.text)).filter(Boolean))
      const seenNew = new Set<string>()
      const parsed = splitPromptParts(importPromptText)
        .map(parsePromptPhrase)
        .filter((v): v is { text: string, hasWeight: boolean } => Boolean(v))

      let nextSortOrder = importedCategoryPhrasesCount
      for (const item of parsed) {
        const key = normalizeText(item.text)
        if (!key || existing.has(key) || seenNew.has(key)) continue
        seenNew.add(key)
        await api<Phrase>('/phrases', {
          method: 'POST',
          body: JSON.stringify({
            category_id: importedCategoryId,
            text: item.text,
            default_weight: item.hasWeight ? 1 : null,
            is_negative_default: false,
            notes: null,
            required_lora: null,
            sort_order: nextSortOrder,
          }),
        })
        nextSortOrder += 1
      }
      setImportPromptText('')
      await loadAll()
    } finally {
      setImportingPrompt(false)
    }
  }

  async function submitPhraseForm(e: React.FormEvent) {
    e.preventDefault()
    if (!phraseModalCategoryId || !newPhraseText.trim()) return
    const body = {
      category_id: phraseModalCategoryId,
      text: newPhraseText.trim(),
      default_weight: newPhraseWeight.trim() ? Number(newPhraseWeight) : 1,
      is_negative_default: false,
      notes: newPhraseNotes.trim() || null,
      required_lora: newPhraseRequiredLora.trim() || null,
      sort_order: phrases.filter((p) => p.category_id === phraseModalCategoryId).length,
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

  async function reorderCategories(sourceId: number, targetId: number) {
    if (sourceId === targetId) return
    const currentVisible = [...visibleLibraryCategories]
    const from = currentVisible.findIndex((c) => c.id === sourceId)
    const to = currentVisible.findIndex((c) => c.id === targetId)
    if (from === -1 || to === -1) return

    const nextVisible = [...currentVisible]
    const [moved] = nextVisible.splice(from, 1)
    nextVisible.splice(to, 0, moved)

    const visibleIds = new Set(nextVisible.map((c) => c.id))
    const hidden = categories.filter((c) => !visibleIds.has(c.id))
    const nextAll = [...nextVisible, ...hidden]

    setCategories(nextAll.map((c, idx) => ({ ...c, sort_order: idx })))

    await Promise.all(nextAll.map((c, idx) => api(`/categories/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sort_order: idx }),
    })))
    await loadAll()
  }

  async function reorderLibraryPhrases(sourceId: number, targetId: number) {
    if (!librarySelectedCategoryId || sourceId === targetId) return
    const current = [...libraryCategoryPhrases]
    const from = current.findIndex((p) => p.id === sourceId)
    const to = current.findIndex((p) => p.id === targetId)
    if (from === -1 || to === -1) return

    const reordered = [...current]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    const reorderedIds = new Set(reordered.map((p) => p.id))
    const others = phrases.filter((p) => !reorderedIds.has(p.id))
    const next = [...others, ...reordered.map((p, idx) => ({ ...p, sort_order: idx }))]
    setPhrases(next)

    await Promise.all(reordered.map((p, idx) => api(`/phrases/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sort_order: idx }),
    })))
    await loadAll()
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

  function partToComposerItem(part: PromptPart, prefix: string, idx: number): ComposerItem {
    return {
      id: `${prefix}-${idx}-${Date.now()}-${Math.random()}`,
      text: part.text,
      weight: part.weight ?? 1,
      category: part.category,
      isImportant: part.is_important,
      isRecurring: part.is_recurring,
      requiredLora: part.required_lora,
    }
  }

  function openSavePackModal() {
    if (positiveParts.length === 0 && negativeParts.length === 0) return
    setPendingPackName('')
    setIsPackNameModalOpen(true)
  }

  function closeSavePackModal() {
    setIsPackNameModalOpen(false)
    setPendingPackName('')
  }

  async function confirmSavePack(e: React.FormEvent) {
    e.preventDefault()
    const nextName = pendingPackName.trim()
    if (!nextName) return
    await api('/packs', {
      method: 'POST',
      body: JSON.stringify({
        name: nextName,
        positive_parts: positiveParts.map((p) => ({ text: p.text, weight: p.weight ?? 1, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
        negative_parts: negativeParts.map((p) => ({ text: p.text, weight: p.weight ?? 1, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
      }),
    })
    setPositiveParts([])
    setNegativeParts([])
    setActivePackIds([])
    closeSavePackModal()
    await loadAll()
  }

  function addPackById(packId: number) {
    const pack = packs.find((p) => p.id === packId)
    if (!pack) return
    setPositiveParts((curr) => mergePartsReplace(curr, pack.positive_parts.map((part, idx) => partToComposerItem(part, `pack-pos-${pack.id}`, idx))))
    setNegativeParts((curr) => mergePartsReplace(curr, pack.negative_parts.map((part, idx) => partToComposerItem(part, `pack-neg-${pack.id}`, idx))))
    setActivePackIds((curr) => (curr.includes(packId) ? curr : [...curr, packId]))
  }

  function removePackContribution(packId: number) {
    const pack = packs.find((p) => p.id === packId)
    if (!pack) return
    const positiveKeys = new Set(pack.positive_parts.map((part) => normalizeText(part.text)).filter(Boolean))
    const negativeKeys = new Set(pack.negative_parts.map((part) => normalizeText(part.text)).filter(Boolean))
    setPositiveParts((curr) => curr.filter((item) => !positiveKeys.has(normalizeText(item.text))))
    setNegativeParts((curr) => curr.filter((item) => !negativeKeys.has(normalizeText(item.text))))
    setActivePackIds((curr) => curr.filter((id) => id !== packId))
  }

  async function deletePack(id: number) {
    if (!window.confirm('Delete pack?')) return
    await api(`/packs/${id}`, { method: 'DELETE' })
    if (selectedPackId === id) setSelectedPackId(null)
    setActivePackIds((curr) => curr.filter((packId) => packId !== id))
    await loadAll()
  }

  async function savePreset(e: React.FormEvent) {
    e.preventDefault()
    if (!presetName.trim()) return
    await api('/presets', {
      method: 'POST',
      body: JSON.stringify({
        name: presetName.trim(),
        positive_parts: positiveParts.map((p) => ({ text: p.text, weight: p.weight ?? 1, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
        negative_parts: negativeParts.map((p) => ({ text: p.text, weight: p.weight ?? 1, category: p.category, is_important: p.isImportant, is_recurring: p.isRecurring, required_lora: p.requiredLora })),
      }),
    })
    setPresetName('')
    await loadAll()
  }

  function loadPreset(preset: Preset) {
    setPositiveParts(preset.positive_parts.map((p, i) => ({ id: `pp-${preset.id}-${i}-${Date.now()}`, text: p.text, weight: p.weight ?? 1, category: p.category, isImportant: p.is_important, isRecurring: p.is_recurring, requiredLora: p.required_lora })))
    setNegativeParts(preset.negative_parts.map((p, i) => ({ id: `np-${preset.id}-${i}-${Date.now()}`, text: p.text, weight: p.weight ?? 1, category: p.category, isImportant: p.is_important, isRecurring: p.is_recurring, requiredLora: p.required_lora })))
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
        setLoginError(t.loginFailed)
        return
      }
      const data = (await res.json()) as { token: string }
      localStorage.setItem('promptdb_token', data.token)
      setIsAuthenticated(true)
      void loadAll()
    } catch {
      setLoginError(t.loginFailed)
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
          <div style={{ minHeight: '80vh', display: 'grid', placeItems: 'center' }}>
          <section style={{ width: 'min(460px, 100%)', background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 18, padding: 22, boxShadow: ui.shadow }}>
            <h3 style={{ marginTop: 0 }}>{t.login}</h3>
            <form onSubmit={login} style={{ display: 'grid', gap: 10 }}>
              <input style={inputStyle} value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder={t.username} />
              <input style={inputStyle} type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder={t.password} />
              <button style={btnStyle} type="submit">{t.login}</button>
              {loginError && <span style={{ color: ui.danger }}>{loginError}</span>}
            </form>
          </section>
          </div>
        ) : (
          <>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.svg" alt="PromptForge logo" style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${ui.border}` }} />
            <div>
              <h1 style={{ margin: 0, letterSpacing: 0.2 }}>PromptForge</h1>
              <p style={{ margin: '4px 0 0 0', color: ui.muted, fontSize: 13 }}>{t.subtitle}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ color: ui.muted }}>{t.language}</label>
            <select style={{ ...inputStyle, padding: '6px 10px' }} value={language} onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}>
              <option value="de">{t.german}</option>
              <option value="en">{t.english}</option>
            </select>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ui.muted }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: loading ? ui.danger : ui.ok, display: 'inline-block' }} />
              {loading ? t.syncing : ''}
            </span>
            <button style={btnGhostStyle} onClick={logout}>{t.logout}</button>
          </div>
        </header>

        <nav style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {[
            ['dashboard', t.dashboard],
            ['library', t.library],
            ['composer', t.composer],
            ['characters', t.characters],
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
            <StatCard title={t.categoriesCount} value={String(categories.length)} />
            <StatCard title={t.phrasesCount} value={String(phrases.length)} />
            <StatCard title={t.presetsCount} value={String(presets.length)} />
            <StatCard title={t.charactersCount} value={String(characters.length)} />
            <StatCard title={t.promptQuality} value={`${promptHealth.score}/100`} highlight />
            <StatCard title={t.requiredLoras} value={requiredLoras.length ? requiredLoras.join(', ') : t.none} />
          </section>
        )}

        {activeTab === 'library' && (
          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <Panel title={t.categories}>
              <form onSubmit={createCategory} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={t.newCategory} />
                <button style={btnStyle} type="submit">{t.add}</button>
              </form>
              {importedCategoryId !== null && (
                <div style={{ marginBottom: 8 }}>
                  <button
                    style={btnGhostStyle}
                    onClick={() => setLibrarySelectedCategoryId(importedCategoryId)}
                  >
                    Show imported ({phraseCountByCategoryId.get(importedCategoryId) ?? 0})
                  </button>
                </div>
              )}
              <div style={{ maxHeight: 'min(52vh, calc(100vh - 300px))', overflowY: 'auto', paddingRight: 4 }}>
              {visibleLibraryCategories.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <div
                    draggable={editingCategoryId !== c.id}
                    onDragStart={() => setDraggingCategoryId(c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggingCategoryId !== null) void reorderCategories(draggingCategoryId, c.id)
                      setDraggingCategoryId(null)
                    }}
                    onDragEnd={() => setDraggingCategoryId(null)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: `1px solid ${librarySelectedCategoryId === c.id ? ui.accent : ui.border}`,
                      background: librarySelectedCategoryId === c.id ? ui.panel2 : ui.panel,
                      borderRadius: 999,
                      padding: '6px 10px',
                      width: '100%',
                      boxShadow: draggingCategoryId === c.id ? `0 0 0 2px ${ui.accent}` : 'none',
                    }}
                  >
                    {editingCategoryId === c.id ? (
                      <>
                        <input
                          style={{ ...inputStyle, flex: 1, padding: '6px 10px', borderRadius: 999 }}
                          value={editingCategoryName}
                          autoFocus
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveRenamedCategory()
                            if (e.key === 'Escape') cancelRenameCategory()
                          }}
                        />
                        <button style={{ ...btnGhostStyle, borderRadius: 999, padding: '4px 8px' }} onClick={() => void saveRenamedCategory()}>✓</button>
                        <button style={{ ...btnGhostStyle, borderRadius: 999, padding: '4px 8px' }} onClick={cancelRenameCategory}>✕</button>
                      </>
                    ) : (
                      <>
                        <button
                          style={{ ...btnGhostStyle, borderRadius: 999, padding: '4px 10px', border: 'none', background: 'transparent', flex: 1, textAlign: 'left' }}
                          onClick={() => setLibrarySelectedCategoryId(c.id)}
                        >
                          {c.name}
                        </button>
                        <span style={{ color: ui.muted, fontSize: 12, border: `1px solid ${ui.border}`, borderRadius: 999, padding: '2px 8px' }}>
                          {phraseCountByCategoryId.get(c.id) ?? 0}
                        </span>
                        <button style={{ ...btnGhostStyle, borderRadius: 999, padding: '4px 8px' }} onClick={() => startRenameCategory(c)} title="Edit">✏️</button>
                        <button style={{ ...btnGhostStyle, borderRadius: 999, padding: '4px 8px' }} onClick={() => setPendingDeleteCategoryId(c.id)} title="Delete">✕</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              </div>
            </Panel>

            <Panel title="">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  style={inputStyle}
                  value={librarySelectedCategoryId ?? ''}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : null
                    setLibrarySelectedCategoryId(nextId)
                  }}
                >
                  <option value="" disabled>
                    {t.selectCategory}
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button style={btnStyle} type="button" disabled={!effectivePhraseCategoryId} onClick={openCreatePhraseModal}>{t.newPhrase}</button>
              </div>

              <form onSubmit={importPromptPhrases} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                <textarea
                  style={textareaStyle}
                  rows={4}
                  value={importPromptText}
                  onChange={(e) => setImportPromptText(e.target.value)}
                  placeholder={language === 'de' ? 'Prompt hier einfügen, Phrasen werden automatisch angelegt' : 'Paste prompt here, phrases will be created automatically'}
                />
                <button style={btnStyle} type="submit" disabled={!effectivePhraseCategoryId || !importPromptText.trim() || importingPrompt}>
                  {importingPrompt ? (language === 'de' ? 'Import läuft...' : 'Importing...') : (language === 'de' ? 'Prompt importieren' : 'Import prompt')}
                </button>
              </form>

              <div style={{ maxHeight: 'min(52vh, calc(100vh - 300px))', overflowY: 'auto', paddingRight: 4 }}>
              {libraryCategoryPhrases.map((p) => (
                <div key={`cat-${p.id}`} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <div
                    draggable
                    onDragStart={() => setDraggingLibraryPhraseId(p.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggingLibraryPhraseId !== null) void reorderLibraryPhrases(draggingLibraryPhraseId, p.id)
                      setDraggingLibraryPhraseId(null)
                    }}
                    onDragEnd={() => setDraggingLibraryPhraseId(null)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: `1px solid ${ui.border}`,
                      background: ui.panel,
                      borderRadius: 999,
                      padding: '6px 10px',
                      width: '100%',
                      boxShadow: draggingLibraryPhraseId === p.id ? `0 0 0 2px ${ui.accent}` : 'none',
                    }}
                  >
                    <strong style={{ flex: 1, textAlign: 'left' }}>{p.text}</strong>
                    {p.default_weight !== null && <span style={{ color: ui.muted }}>({p.default_weight})</span>}
                    <button style={{ ...btnGhostStyle, borderRadius: 999, padding: '4px 8px' }} onClick={() => openEditPhraseModal(p)} title="Edit">✏️</button>
                    <button style={{ ...btnGhostStyle, borderRadius: 999, padding: '4px 8px' }} onClick={() => removePhrase(p.id)} title="Delete">✕</button>
                  </div>
                </div>
              ))}
              {libraryCategoryPhrases.length === 0 && <span style={{ color: ui.muted }}>{t.noPhrases}</span>}
              </div>

            </Panel>
          </section>
        )}

        {activeTab === 'composer' && (
          <>
            <Panel title={t.phrasePicker}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: ui.muted }}>{t.categories}:</span>
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
                        <button style={btnGhostStyle} onClick={() => { addPhraseToComposer(p, 'positive'); setChipMenuPhraseId(null) }}>➕ {t.positive}</button>
                        <button style={btnGhostStyle} onClick={() => { addPhraseToComposer(p, 'negative'); setChipMenuPhraseId(null) }}>➖ {t.negative}</button>
                      </div>
                    )}
                  </div>
                ))}
                {composerCategoryPhrases.length === 0 && <span style={{ color: ui.muted }}>{t.noPhrases}</span>}
              </div>
            </Panel>

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropPhraseTo('positive')}
                style={{ borderRadius: 14, boxShadow: draggingPhraseId !== null ? `0 0 0 2px ${ui.accent}` : 'none' }}
              >
                <ComposerList title={t.positive} items={positiveParts} setItems={setPositiveParts} labels={{ noItemsYet: t.noItemsYet }} />
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropPhraseTo('negative')}
                style={{ borderRadius: 14, boxShadow: draggingPhraseId !== null ? `0 0 0 2px ${ui.accent}` : 'none' }}
              >
                <ComposerList title={t.negative} items={negativeParts} setItems={setNegativeParts} labels={{ noItemsYet: t.noItemsYet }} />
              </div>
            </section>

            <Panel title="Composer Packs">
              <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                {(positiveParts.length > 0 || negativeParts.length > 0) && (
                  <div>
                    <button style={btnStyle} type="button" onClick={openSavePackModal}>Save current as pack</button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    style={inputStyle}
                    value={selectedPackId ?? ''}
                    onChange={(e) => setSelectedPackId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Select pack</option>
                    {packs.map((pack) => (
                      <option key={pack.id} value={pack.id}>{pack.name}</option>
                    ))}
                  </select>
                  <button
                    style={btnStyle}
                    type="button"
                    disabled={selectedPackId === null}
                    onClick={() => {
                      if (selectedPackId !== null) addPackById(selectedPackId)
                    }}
                  >
                    Add pack
                  </button>
                  {selectedPackId !== null && (
                    <button
                      style={{ ...btnGhostStyle, borderColor: ui.danger, color: ui.danger }}
                      type="button"
                      onClick={() => void deletePack(selectedPackId)}
                    >
                      Delete pack
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {packCoverage.map(({ pack, percent, complete }) => (
                    <div
                      key={pack.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        border: `1px solid ${complete ? ui.ok : ui.border}`,
                        borderRadius: 999,
                        padding: '6px 10px',
                        background: ui.panel2,
                      }}
                    >
                      <button
                        style={{ ...btnGhostStyle, border: 'none', padding: 0, background: 'transparent' }}
                        type="button"
                        onClick={() => addPackById(pack.id)}
                        title="Add missing phrases from this pack"
                      >
                        {complete ? '✅' : '🧩'} {pack.name} ({percent}%)
                      </button>
                      <button
                        style={{ ...btnGhostStyle, borderRadius: 999, padding: '2px 6px' }}
                        type="button"
                        onClick={() => removePackContribution(pack.id)}
                        title="Remove this pack from composer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {packs.length === 0 && <span style={{ color: ui.muted }}>No packs yet.</span>}
                </div>
              </div>
            </Panel>

            <Panel title={t.promptInspector}>
              <p style={{ marginTop: 0 }}>{t.qualityScore}: <strong>{promptHealth.score}/100</strong> {promptHealth.score >= 85 ? '🟢' : promptHealth.score >= 60 ? '🟡' : '🔴'}</p>
              {promptHealth.issues.length ? (
                <ul>{promptHealth.issues.map((i) => <li key={i}>{i}</li>)}</ul>
              ) : (
                <p style={{ color: ui.ok }}>{t.looksClean}</p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btnStyle} onClick={smartCleanupPrompt}>{t.autoClean}</button>
                <button style={btnStyle} onClick={addCinematicStarterPack}>{t.addCinematic}</button>
              </div>
            </Panel>

            <Panel title={t.structuredView}>
              {groupedPositive.map(([group, items]) => (
                <div key={group} style={{ marginBottom: 10 }}>
                  <strong>🏷️ {group}</strong>
                  <ul>{items.map((i) => <li key={i.id}>{i.text}{i.weight !== undefined ? ` (${i.weight})` : ''}{i.isImportant ? ` [${t.importantTag}]` : ''}</li>)}</ul>
                </div>
              ))}
              {groupedNegative.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 6 }}>🚫 {t.negativeGroups}</h4>
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
              <Panel title={t.positivePrompt}>
                <textarea readOnly value={positivePrompt} rows={4} style={textareaStyle} />
                <button style={btnStyle} onClick={() => void copyText(positivePrompt)}>{t.copy}</button>
              </Panel>
              <Panel title={t.negativePrompt}>
                <textarea readOnly value={negativePrompt} rows={4} style={textareaStyle} />
                <button style={btnStyle} onClick={() => void copyText(negativePrompt)}>{t.copy}</button>
              </Panel>
            </section>

            <Panel title={t.composerPresets}>
              <form onSubmit={savePreset} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={t.presetName} />
                <button style={btnStyle} type="submit">{t.save}</button>
              </form>
              <div style={{ maxHeight: presets.length > 4 ? 260 : undefined, overflowY: presets.length > 4 ? 'auto' : undefined, paddingRight: 4 }}>
              {presets.map((preset) => (
                <div key={preset.id} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <strong>{preset.name}</strong>
                  <button style={btnGhostStyle} onClick={() => loadPreset(preset)}>{t.load}</button>
                  <button style={btnGhostStyle} onClick={() => void deletePreset(preset.id)}>{t.delete}</button>
                </div>
              ))}
              </div>
            </Panel>
          </>
        )}

        {activeTab === 'characters' && (
          <Panel title={t.characterPresets}>
            <form onSubmit={saveCharacter} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <input style={inputStyle} value={characterName} onChange={(e) => setCharacterName(e.target.value)} placeholder={t.characterName} />
              <input style={inputStyle} value={characterDescription} onChange={(e) => setCharacterDescription(e.target.value)} placeholder={t.description} />
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 120px', gap: 8 }}>
                <input style={inputStyle} value={characterVersionFamily} onChange={(e) => setCharacterVersionFamily(e.target.value)} placeholder={t.versionFamily} />
                <input style={inputStyle} value={characterVersion} onChange={(e) => setCharacterVersion(e.target.value)} type="number" min={1} />
              </div>
              <input style={inputStyle} value={characterRequiredSdxlBaseModel} onChange={(e) => setCharacterRequiredSdxlBaseModel(e.target.value)} placeholder={t.requiredSdxl} />
              <input style={inputStyle} value={characterRecommendedSdxlBaseModel} onChange={(e) => setCharacterRecommendedSdxlBaseModel(e.target.value)} placeholder={t.recommendedSdxl} />
              <button style={btnStyle} type="submit">{t.saveAsCharacter}</button>
            </form>

            <div style={{ maxHeight: characters.length > 4 ? 360 : undefined, overflowY: characters.length > 4 ? 'auto' : undefined, paddingRight: 4 }}>
            {characters.map((character) => (
              <div key={character.id} style={{ borderTop: `1px solid ${ui.border}`, padding: '10px 0' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{character.name}</strong>
                  <span style={{ color: ui.muted }}>{t.family}: {character.version_family || t.na}</span>
                  <span style={{ color: ui.muted }}>v{character.version}</span>
                  {character.required_sdxl_base_model && <span style={{ color: ui.warn }}>Required SDXL: {character.required_sdxl_base_model}</span>}
                  {character.recommended_sdxl_base_model && <span style={{ color: ui.accent }}>Recommended SDXL: {character.recommended_sdxl_base_model}</span>}
                  {character.required_loras.length > 0 && <span style={{ color: ui.ok }}>LoRAs: {character.required_loras.join(', ')}</span>}
                </div>
                {character.description && <p style={{ color: ui.muted }}>{character.description}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btnGhostStyle} onClick={() => loadCharacter(character)}>{t.load}</button>
                  <button style={btnGhostStyle} onClick={() => void duplicateCharacterVersion(character.id)}>{t.duplicateNextVersion}</button>
                  <button style={btnGhostStyle} onClick={() => void deleteCharacter(character.id)}>{t.delete}</button>
                </div>
              </div>
            ))}
            </div>
          </Panel>
        )}

        {isPhraseModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,15,27,0.72)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
            <div style={{ width: 'min(680px, 100%)', background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 14, padding: 14, boxShadow: ui.shadow }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{editingPhraseId === null ? t.createPhrase : t.editPhrase}</h3>
                <button style={btnGhostStyle} onClick={closePhraseModal}>✕</button>
              </div>
              <form onSubmit={submitPhraseForm} style={{ display: 'grid', gap: 8 }}>
                <select
                  style={inputStyle}
                  value={phraseModalCategoryId ?? ''}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : null
                    setPhraseModalCategoryId(nextId)
                  }}
                >
                  <option value="" disabled>
                    {t.selectCategory}
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input style={inputStyle} value={newPhraseText} onChange={(e) => setNewPhraseText(e.target.value)} placeholder={t.phraseText} />
                <input style={inputStyle} value={newPhraseWeight} onChange={(e) => setNewPhraseWeight(e.target.value)} placeholder={t.defaultWeight} type="number" step="0.1" />
                <input style={inputStyle} value={newPhraseNotes} onChange={(e) => setNewPhraseNotes(e.target.value)} placeholder={t.notes} />
                <input style={inputStyle} value={newPhraseRequiredLora} onChange={(e) => setNewPhraseRequiredLora(e.target.value)} placeholder={t.requiredLora} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={btnGhostStyle} type="button" onClick={closePhraseModal}>{t.cancel}</button>
                  <button style={btnStyle} type="submit" disabled={!phraseModalCategoryId || !newPhraseText.trim()}>{editingPhraseId === null ? t.create : t.save}</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {isPackNameModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,15,27,0.72)', display: 'grid', placeItems: 'center', zIndex: 65, padding: 16 }}>
            <div style={{ width: 'min(520px, 100%)', background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 14, padding: 14, boxShadow: ui.shadow }}>
              <h3 style={{ margin: '0 0 8px 0' }}>Save pack</h3>
              <form onSubmit={confirmSavePack} style={{ display: 'grid', gap: 8 }}>
                <input
                  style={inputStyle}
                  value={pendingPackName}
                  autoFocus
                  onChange={(e) => setPendingPackName(e.target.value)}
                  placeholder="Pack name"
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={btnGhostStyle} type="button" onClick={closeSavePackModal}>{t.cancel}</button>
                  <button style={btnStyle} type="submit" disabled={!pendingPackName.trim()}>{t.save}</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {pendingDeleteCategoryId !== null && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,15,27,0.72)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }}>
            <div style={{ width: 'min(520px, 100%)', background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 14, padding: 14, boxShadow: ui.shadow }}>
              <h3 style={{ margin: '0 0 8px 0' }}>Delete category?</h3>
              <p style={{ margin: '0 0 12px 0', color: ui.muted }}>This will delete the category and all phrases inside it.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={btnGhostStyle} onClick={() => setPendingDeleteCategoryId(null)}>{t.cancel}</button>
                <button style={{ ...btnStyle, background: ui.danger }} onClick={() => void confirmRemoveCategory()}>{t.delete}</button>
              </div>
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
      {title ? <h3 style={{ margin: '0 0 10px 0', fontSize: 17 }}>{title}</h3> : null}
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
  labels,
}: {
  title: string
  items: ComposerItem[]
  setItems: React.Dispatch<React.SetStateAction<ComposerItem[]>>
  labels: { noItemsYet: string }
}) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingLora, setEditingLora] = useState('')
  const droppedInsideRef = useRef(false)

  function removeById(id: string) {
    setItems((curr) => curr.filter((item) => item.id !== id))
  }

  function moveByIds(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    setItems((curr) => {
      const from = curr.findIndex((item) => item.id === sourceId)
      const to = curr.findIndex((item) => item.id === targetId)
      if (from === -1 || to === -1) return curr
      const next = [...curr]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function openLoraModal(item: ComposerItem) {
    setEditingItemId(item.id)
    setEditingLora(item.requiredLora ?? '')
  }

  function saveLora() {
    if (!editingItemId) return
    setItems((curr) => curr.map((item) => (item.id === editingItemId ? { ...item, requiredLora: editingLora.trim() || undefined } : item)))
    setEditingItemId(null)
    setEditingLora('')
  }

  return (
    <Panel title={title}>
      {items.length === 0 && <p style={{ color: ui.muted }}>{labels.noItemsYet}</p>}
      <div
        style={{ maxHeight: items.length > 4 ? 340 : undefined, overflowY: items.length > 4 ? 'auto' : undefined, paddingRight: 4, minHeight: 42 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => { droppedInsideRef.current = true }}
      >
      {items.map((item, idx) => (
        <button
          key={item.id}
          draggable
          onDragStart={() => {
            droppedInsideRef.current = false
            setDraggingItemId(item.id)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!draggingItemId) return
            droppedInsideRef.current = true
            moveByIds(draggingItemId, item.id)
          }}
          onDragEnd={() => {
            if (draggingItemId && !droppedInsideRef.current) removeById(draggingItemId)
            setDraggingItemId(null)
            droppedInsideRef.current = false
          }}
          onClick={() => openLoraModal(item)}
          style={{
            ...btnGhostStyle,
            borderRadius: 999,
            padding: '8px 12px',
            marginBottom: 8,
            marginRight: 8,
            background: draggingItemId === item.id ? ui.panel : ui.panel2,
          }}
        >
          {item.text} ({item.weight ?? 1})
          <span
            onClick={(e) => {
              e.stopPropagation()
              removeById(item.id)
            }}
            style={{ marginLeft: 8, border: `1px solid ${ui.border}`, borderRadius: 999, padding: '0 6px' }}
          >
            ✕
          </span>
        </button>
      ))}
      </div>
      {editingItemId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,15,27,0.72)', display: 'grid', placeItems: 'center', zIndex: 70, padding: 16 }}>
          <div style={{ width: 'min(520px, 100%)', background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 14, padding: 14, boxShadow: ui.shadow }}>
            <h3 style={{ margin: '0 0 8px 0' }}>Edit LoRA</h3>
            <input style={inputStyle} value={editingLora} onChange={(e) => setEditingLora(e.target.value)} placeholder="required LoRA" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button style={btnGhostStyle} onClick={() => setEditingItemId(null)}>Cancel</button>
              <button style={btnStyle} onClick={saveLora}>Save</button>
            </div>
          </div>
        </div>
      )}
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
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
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
