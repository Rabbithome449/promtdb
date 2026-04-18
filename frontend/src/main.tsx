import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

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

function toPrompt(parts: ComposerItem[]) {
  return [...parts]
    .sort((a, b) => Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant)))
    .map((p) => (p.weight === undefined ? p.text : `(${p.text}:${p.weight})`))
    .join(', ')
}

function App() {
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

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )
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
      if (selectedCategoryId === null && c.length > 0) {
        setSelectedCategoryId(c[0].id)
      }
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

  const categoryPhrases = useMemo(
    () => phrases.filter((p) => p.category_id === selectedCategoryId),
    [phrases, selectedCategoryId],
  )

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
    await api(`/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: name.trim() }),
    })
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
    if (phrase.is_negative_default) {
      setNegativeParts((curr) => [...curr, item])
    } else {
      setPositiveParts((curr) => [...curr, item])
    }
  }

  function updatePart(
    setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>,
    idx: number,
    patch: Partial<ComposerItem>,
  ) {
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
        positive_parts: positiveParts.map((p) => ({
          text: p.text,
          weight: p.weight,
          category: p.category,
          is_important: p.isImportant,
          is_recurring: p.isRecurring,
          required_lora: p.requiredLora,
        })),
        negative_parts: negativeParts.map((p) => ({
          text: p.text,
          weight: p.weight,
          category: p.category,
          is_important: p.isImportant,
          is_recurring: p.isRecurring,
          required_lora: p.requiredLora,
        })),
      }),
    })
    setPresetName('')
    await loadAll()
  }

  function loadPreset(preset: Preset) {
    setPositiveParts(
      preset.positive_parts.map((p, i) => ({
        id: `pp-${preset.id}-${i}-${Date.now()}`,
        text: p.text,
        weight: p.weight,
        category: p.category,
        isImportant: p.is_important,
        isRecurring: p.is_recurring,
        requiredLora: p.required_lora,
      })),
    )
    setNegativeParts(
      preset.negative_parts.map((p, i) => ({
        id: `np-${preset.id}-${i}-${Date.now()}`,
        text: p.text,
        weight: p.weight,
        category: p.category,
        isImportant: p.is_important,
        isRecurring: p.is_recurring,
        requiredLora: p.required_lora,
      })),
    )
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
        positive_parts: positiveParts.map((p) => ({
          text: p.text,
          weight: p.weight,
          category: p.category,
          is_important: p.isImportant,
          is_recurring: p.isRecurring,
          required_lora: p.requiredLora,
        })),
        negative_parts: negativeParts.map((p) => ({
          text: p.text,
          weight: p.weight,
          category: p.category,
          is_important: p.isImportant,
          is_recurring: p.isRecurring,
          required_lora: p.requiredLora,
        })),
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
    setPositiveParts(
      character.positive_parts.map((p, i) => ({
        id: `cp-${character.id}-${i}-${Date.now()}`,
        text: p.text,
        weight: p.weight,
        category: p.category,
        isImportant: p.is_important,
        isRecurring: p.is_recurring,
        requiredLora: p.required_lora,
      })),
    )
    setNegativeParts(
      character.negative_parts.map((p, i) => ({
        id: `cn-${character.id}-${i}-${Date.now()}`,
        text: p.text,
        weight: p.weight,
        category: p.category,
        isImportant: p.is_important,
        isRecurring: p.is_recurring,
        requiredLora: p.required_lora,
      })),
    )
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

  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>promtdb MVP</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <h2>Categories</h2>
          <form onSubmit={createCategory} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category" />
            <button type="submit">Add</button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {categories.map((c) => (
              <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button onClick={() => setSelectedCategoryId(c.id)} style={{ fontWeight: selectedCategoryId === c.id ? 700 : 400 }}>
                  {c.name}
                </button>
                <button onClick={() => renameCategory(c.id, c.name)}>Rename</button>
                <button onClick={() => removeCategory(c.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <h2>Phrases {selectedCategoryId ? '' : '(select category)'}</h2>
          <form onSubmit={createPhrase} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <input value={newPhraseText} onChange={(e) => setNewPhraseText(e.target.value)} placeholder="Phrase text" />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newPhraseWeight}
                onChange={(e) => setNewPhraseWeight(e.target.value)}
                placeholder="Default weight (optional)"
                type="number"
                step="0.1"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={newPhraseNegativeDefault}
                  onChange={(e) => setNewPhraseNegativeDefault(e.target.checked)}
                />
                Negative default
              </label>
            </div>
            <input value={newPhraseNotes} onChange={(e) => setNewPhraseNotes(e.target.value)} placeholder="Notes (optional)" />
            <input
              value={newPhraseRequiredLora}
              onChange={(e) => setNewPhraseRequiredLora(e.target.value)}
              placeholder="Required LoRA (optional), e.g. character_v3"
            />
            <button type="submit" disabled={!selectedCategoryId}>Add phrase</button>
          </form>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 320, overflow: 'auto' }}>
            {categoryPhrases.map((p) => (
              <li key={p.id} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{p.text}</strong>
                  {p.default_weight !== null && <span>({p.default_weight})</span>}
                  {p.is_negative_default && <span style={{ color: '#8a2be2' }}>negative</span>}
                  {p.required_lora && <span style={{ color: '#006400' }}>LoRA: {p.required_lora}</span>}
                  <button onClick={() => addPhraseToComposer(p)}>Add to composer</button>
                  <button onClick={() => removePhrase(p.id)}>Delete</button>
                </div>
                {p.notes && <small>{p.notes}</small>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 20 }}>
        <h2>Composer</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ComposerList
            title="Positive"
            items={positiveParts}
            setItems={setPositiveParts}
            categoryOptions={categoryOptions}
            updatePart={updatePart}
            movePart={movePart}
            removePart={removePart}
          />
          <ComposerList
            title="Negative"
            items={negativeParts}
            setItems={setNegativeParts}
            categoryOptions={categoryOptions}
            updatePart={updatePart}
            movePart={movePart}
            removePart={removePart}
          />
        </div>

        <div style={{ marginTop: 12, border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
          <h3 style={{ marginTop: 0 }}>Structured view (human readable)</h3>
          {groupedPositive.length === 0 && <p style={{ opacity: 0.7 }}>No positive blocks yet.</p>}
          {groupedPositive.map(([group, items]) => (
            <div key={group} style={{ marginBottom: 8 }}>
              <strong>{group}</strong>
              <ul style={{ margin: '6px 0 0 16px' }}>
                {items.map((i) => (
                  <li key={i.id}>
                    {i.text}
                    {i.weight !== undefined ? ` (${i.weight})` : ''}
                    {i.isImportant ? ' [important]' : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {requiredLoras.length > 0 && (
            <p style={{ marginBottom: 0 }}>
              <strong>Required LoRAs:</strong> {requiredLoras.join(', ')}
            </p>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Positive prompt</label>
          <textarea readOnly value={positivePrompt} rows={3} style={{ width: '100%' }} />
          <button onClick={() => void copyText(positivePrompt)}>Copy positive</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Negative prompt</label>
          <textarea readOnly value={negativePrompt} rows={3} style={{ width: '100%' }} />
          <button onClick={() => void copyText(negativePrompt)}>Copy negative</button>
        </div>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 20 }}>
        <h2>Presets</h2>
        <form onSubmit={savePreset} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" />
          <button type="submit">Save current composer as preset</button>
        </form>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {presets.map((preset) => (
            <li key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <strong>{preset.name}</strong>
              <button onClick={() => loadPreset(preset)}>Load</button>
              <button onClick={() => void deletePreset(preset.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 20 }}>
        <h2>Character presets (full prompt)</h2>
        <form onSubmit={saveCharacter} style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <input
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="Character name (e.g. cyberpunk_anna_v1)"
          />
          <input
            value={characterDescription}
            onChange={(e) => setCharacterDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
            <input
              value={characterVersionFamily}
              onChange={(e) => setCharacterVersionFamily(e.target.value)}
              placeholder="Version family (optional, e.g. anna_cyberpunk)"
            />
            <input
              value={characterVersion}
              onChange={(e) => setCharacterVersion(e.target.value)}
              type="number"
              min={1}
              placeholder="Version"
            />
          </div>
          <input
            value={characterRequiredSdxlBaseModel}
            onChange={(e) => setCharacterRequiredSdxlBaseModel(e.target.value)}
            placeholder="Required SDXL base model (optional)"
          />
          <input
            value={characterRecommendedSdxlBaseModel}
            onChange={(e) => setCharacterRecommendedSdxlBaseModel(e.target.value)}
            placeholder="Recommended SDXL base model (optional)"
          />
          <button type="submit">Save current full prompt as character</button>
        </form>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {characters.map((character) => (
            <li key={character.id} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{character.name}</strong>
                <span style={{ color: '#555' }}>family: {character.version_family || 'n/a'}</span>
                <span style={{ color: '#555' }}>v{character.version}</span>
                {character.required_sdxl_base_model && (
                  <span style={{ color: '#b22222' }}>Required SDXL: {character.required_sdxl_base_model}</span>
                )}
                {character.recommended_sdxl_base_model && (
                  <span style={{ color: '#1e40af' }}>Recommended SDXL: {character.recommended_sdxl_base_model}</span>
                )}
                {character.required_loras.length > 0 && (
                  <span style={{ color: '#006400' }}>LoRAs: {character.required_loras.join(', ')}</span>
                )}
                <button onClick={() => loadCharacter(character)}>Load</button>
                <button onClick={() => void duplicateCharacterVersion(character.id)}>Duplicate as next version</button>
                <button onClick={() => void deleteCharacter(character.id)}>Delete</button>
              </div>
              {character.description && <small>{character.description}</small>}
            </li>
          ))}
        </ul>
      </section>
    </main>
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
  updatePart: (
    setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>,
    idx: number,
    patch: Partial<ComposerItem>,
  ) => void
  movePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number, dir: -1 | 1) => void
  removePart: (setter: React.Dispatch<React.SetStateAction<ComposerItem[]>>, idx: number) => void
}) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
      <h3>{title}</h3>
      {items.length === 0 && <p style={{ opacity: 0.7 }}>No parts yet.</p>}
      {items.map((item, idx) => (
        <div key={item.id} style={{ border: '1px solid #f2f2f2', borderRadius: 6, padding: 8, marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, marginBottom: 8 }}>
          <input value={item.text} onChange={(e) => updatePart(setItems, idx, { text: e.target.value })} />
          <input
            type="number"
            step="0.1"
            placeholder="weight"
            value={item.weight ?? ''}
            onChange={(e) => updatePart(setItems, idx, { weight: e.target.value ? Number(e.target.value) : undefined })}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => movePart(setItems, idx, -1)}>↑</button>
            <button onClick={() => movePart(setItems, idx, 1)}>↓</button>
            <button onClick={() => removePart(setItems, idx)}>✕</button>
          </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
            <select
              value={item.category ?? ''}
              onChange={(e) => updatePart(setItems, idx, { category: e.target.value || undefined })}
            >
              <option value="">No category</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={Boolean(item.isImportant)}
                onChange={(e) => updatePart(setItems, idx, { isImportant: e.target.checked })}
              />
              important
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={Boolean(item.isRecurring)}
                onChange={(e) => updatePart(setItems, idx, { isRecurring: e.target.checked })}
              />
              recurring/quality
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <input
              value={item.requiredLora ?? ''}
              onChange={(e) => updatePart(setItems, idx, { requiredLora: e.target.value || undefined })}
              placeholder="Required LoRA (optional)"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
