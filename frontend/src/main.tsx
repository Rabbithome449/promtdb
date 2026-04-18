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
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
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
  return [...parts]
    .sort((a, b) => Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant)))
    .map((p) => (p.weight === undefined ? p.text : `(${p.text}:${p.weight})`))
    .join(', ')
}

const ui = {
  bg: '#0b1220',
  panel: '#131c2e',
  panel2: '#1a253d',
  text: '#e7edf7',
  muted: '#9fb0cc',
  border: '#2b3a58',
  accent: '#5ea2ff',
  ok: '#52c98c',
  warn: '#f5c26b',
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [characters, setCharacters] = useState<CharacterPreset[]>([])

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newPhraseText, setNewPhraseText] = useState('')
  const [newPhraseWeight, setNewPhraseWeight] = useState('')
  const [newPhraseNegativeDefault, setNewPhraseNegativeDefault] = useState(false)
  const [newPhraseNotes, setNewPhraseNotes] = useState('')
  const [newPhraseRequiredLora, setNewPhraseRequiredLora] = useState('')

  const [presetName, setPresetName] = useState('')
  const [characterName, setCharacterName] = useState('')
  const [characterVersionFamily, setCharacterVersionFamily] = useState('')
  const [characterVersion, setCharacterVersion] = useState('1')
  const [characterDescription, setCharacterDescription] = useState('')
  const [characterRequiredSdxlBaseModel, setCharacterRequiredSdxlBaseModel] = useState('')
  const [characterRecommendedSdxlBaseModel, setCharacterRecommendedSdxlBaseModel] = useState('')

  const [positiveParts, setPositiveParts] = useState<ComposerItem[]>([])
  const [negativeParts, setNegativeParts] = useState<ComposerItem[]>([])

  const positivePrompt = useMemo(() => toPrompt(positiveParts), [positiveParts])
  const negativePrompt = useMemo(() => toPrompt(negativeParts), [negativeParts])

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const categoryOptions = useMemo(() => categories.map((c) => c.name), [categories])

  const requiredLoras = useMemo(() => {
    const vals = [...positiveParts, ...negativeParts]
      .map((p) => p.requiredLora?.trim())
      .filter((v): v is string => Boolean(v))
    return [...new Set(vals)]
  }, [positiveParts, negativeParts])

  const groupedPositive = useMemo(() => {
    const map = new Map<string, ComposerItem[]>()
    const ordered = [...positiveParts].sort((a, b) => Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant)))
    for (const part of ordered) {
      const key = part.isRecurring ? 'Quality / Recurring' : part.category || 'Uncategorized'
      const curr = map.get(key) || []
      curr.push(part)
      map.set(key, curr)
    }
    return [...map.entries()]
  }, [positiveParts])

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

  const categoryPhrases = useMemo(() => phrases.filter((p) => p.category_id === selectedCategoryId), [phrases, selectedCategoryId])

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
      if (selectedCategoryId === null && c.length > 0) setSelectedCategoryId(c[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function renameCategory(id: number, current: string) {
    const name = window.prompt('New category name', current)
    if (!name?.trim()) return
    await api(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) })
    await loadAll()
  }

  async function removeCategory(id: number) {
    if (!window.confirm('Delete category and all its phrases?')) return
    await api(`/categories/${id}`, { method: 'DELETE' })
    if (selectedCategoryId === id) setSelectedCategoryId(null)
    await loadAll()
  }

  async function createPhrase(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCategoryId || !newPhraseText.trim()) return
    await api<Phrase>('/phrases', {
      method: 'POST',
      body: JSON.stringify({
        category_id: selectedCategoryId,
        text: newPhraseText.trim(),
        default_weight: newPhraseWeight.trim() ? Number(newPhraseWeight) : null,
        is_negative_default: newPhraseNegativeDefault,
        notes: newPhraseNotes.trim() || null,
        required_lora: newPhraseRequiredLora.trim() || null,
        sort_order: categoryPhrases.length,
      }),
    })
    setNewPhraseText('')
    setNewPhraseWeight('')
    setNewPhraseNegativeDefault(false)
    setNewPhraseNotes('')
    setNewPhraseRequiredLora('')
    await loadAll()
  }

  async function removePhrase(id: number) {
    await api(`/phrases/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  function addPhraseToComposer(phrase: Phrase) {
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
    if (phrase.is_negative_default) setNegativeParts((curr) => [...curr, item])
    else setPositiveParts((curr) => [...curr, item])
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

  return (
    <main style={{ background: ui.bg, minHeight: '100vh', color: ui.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 20 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>promtdb</h1>
          <span style={{ color: ui.muted }}>{loading ? 'syncing...' : 'ready'}</span>
        </header>

        <nav style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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
                borderRadius: 10,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && <p style={{ color: '#ff8f8f' }}>{error}</p>}

        {activeTab === 'dashboard' && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <StatCard title="Categories" value={String(categories.length)} />
            <StatCard title="Phrases" value={String(phrases.length)} />
            <StatCard title="Presets" value={String(presets.length)} />
            <StatCard title="Characters" value={String(characters.length)} />
            <StatCard title="Prompt Quality" value={`${promptHealth.score}/100`} highlight />
            <StatCard title="Required LoRAs" value={requiredLoras.length ? requiredLoras.join(', ') : 'none'} />
          </section>
        )}

        {activeTab === 'library' && (
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Panel title="Categories">
              <form onSubmit={createCategory} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category" />
                <button style={btnStyle} type="submit">Add</button>
              </form>
              {categories.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <button style={btnStyle} onClick={() => setSelectedCategoryId(c.id)}>{c.name}</button>
                  <button style={btnGhostStyle} onClick={() => renameCategory(c.id, c.name)}>Rename</button>
                  <button style={btnGhostStyle} onClick={() => removeCategory(c.id)}>Delete</button>
                </div>
              ))}
            </Panel>

            <Panel title={`Phrases ${selectedCategoryId ? '' : '(select category)'}`}>
              <form onSubmit={createPhrase} style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} value={newPhraseText} onChange={(e) => setNewPhraseText(e.target.value)} placeholder="Phrase text" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={inputStyle} value={newPhraseWeight} onChange={(e) => setNewPhraseWeight(e.target.value)} placeholder="weight" type="number" step="0.1" />
                  <label><input type="checkbox" checked={newPhraseNegativeDefault} onChange={(e) => setNewPhraseNegativeDefault(e.target.checked)} /> negative</label>
                </div>
                <input style={inputStyle} value={newPhraseNotes} onChange={(e) => setNewPhraseNotes(e.target.value)} placeholder="notes" />
                <input style={inputStyle} value={newPhraseRequiredLora} onChange={(e) => setNewPhraseRequiredLora(e.target.value)} placeholder="required LoRA" />
                <button style={btnStyle} type="submit" disabled={!selectedCategoryId}>Add phrase</button>
              </form>
              {categoryPhrases.map((p) => (
                <div key={p.id} style={{ borderTop: `1px solid ${ui.border}`, padding: '8px 0' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong>{p.text}</strong>
                    {p.default_weight !== null && <span style={{ color: ui.muted }}>({p.default_weight})</span>}
                    {p.required_lora && <span style={{ color: ui.ok }}>LoRA: {p.required_lora}</span>}
                    <button style={btnGhostStyle} onClick={() => addPhraseToComposer(p)}>Add</button>
                    <button style={btnGhostStyle} onClick={() => removePhrase(p.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </Panel>
          </section>
        )}

        {activeTab === 'composer' && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <ComposerList title="Positive" items={positiveParts} setItems={setPositiveParts} categoryOptions={categoryOptions} updatePart={updatePart} movePart={movePart} removePart={removePart} />
              <ComposerList title="Negative" items={negativeParts} setItems={setNegativeParts} categoryOptions={categoryOptions} updatePart={updatePart} movePart={movePart} removePart={removePart} />
            </section>

            <Panel title="Prompt Inspector">
              <p style={{ marginTop: 0 }}>Quality score: <strong>{promptHealth.score}/100</strong></p>
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
                  <strong>{group}</strong>
                  <ul>{items.map((i) => <li key={i.id}>{i.text}{i.weight !== undefined ? ` (${i.weight})` : ''}{i.isImportant ? ' [important]' : ''}</li>)}</ul>
                </div>
              ))}
            </Panel>

            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
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
      </div>
    </main>
  )
}

function Panel({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <section style={{ background: ui.panel, border: `1px solid ${ui.border}`, borderRadius: 12, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </section>
  )
}

function StatCard({ title, value, highlight }: { title: string, value: string, highlight?: boolean }) {
  return (
    <div style={{ background: ui.panel, border: `1px solid ${highlight ? ui.accent : ui.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ color: ui.muted, fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 18, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function ComposerList({
  title,
  items,
  setItems,
  categoryOptions,
  updatePart,
  movePart,
  removePart,
}: {
  title: string
  items: ComposerItem[]
  setItems: React.Dispatch<React.SetStateAction<ComposerItem[]>>
  categoryOptions: string[]
  updatePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number, patch: Partial<ComposerItem>) => void
  movePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number, dir: -1 | 1) => void
  removePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number) => void
}) {
  return (
    <Panel title={title}>
      {items.length === 0 && <p style={{ color: ui.muted }}>No items yet</p>}
      {items.map((item, idx) => (
        <div key={item.id} style={{ border: `1px solid ${ui.border}`, borderRadius: 10, padding: 8, marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, marginBottom: 8 }}>
            <input style={inputStyle} value={item.text} onChange={(e) => updatePart(setItems, idx, { text: e.target.value })} />
            <input style={inputStyle} type="number" step="0.1" placeholder="weight" value={item.weight ?? ''} onChange={(e) => updatePart(setItems, idx, { weight: e.target.value ? Number(e.target.value) : undefined })} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={btnGhostStyle} onClick={() => movePart(setItems, idx, -1)}>↑</button>
              <button style={btnGhostStyle} onClick={() => movePart(setItems, idx, 1)}>↓</button>
              <button style={btnGhostStyle} onClick={() => removePart(setItems, idx)}>✕</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, marginBottom: 8 }}>
            <select style={inputStyle} value={item.category ?? ''} onChange={(e) => updatePart(setItems, idx, { category: e.target.value || undefined })}>
              <option value="">No category</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
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
  borderRadius: 8,
  padding: '8px 10px',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
}

const btnStyle: React.CSSProperties = {
  background: ui.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}

const btnGhostStyle: React.CSSProperties = {
  background: ui.panel2,
  color: ui.text,
  border: `1px solid ${ui.border}`,
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
