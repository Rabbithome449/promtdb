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
  sort_order: number
}

type PromptPart = {
  text: string
  weight?: number
}

type Preset = {
  id: number
  name: string
  positive_parts: PromptPart[]
  negative_parts: PromptPart[]
}

type ComposerItem = {
  id: string
  text: string
  weight?: number
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
  return parts
    .map((p) => (p.weight === undefined ? p.text : `(${p.text}:${p.weight})`))
    .join(', ')
}

function App() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [presets, setPresets] = useState<Preset[]>([])

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newPhraseText, setNewPhraseText] = useState('')
  const [newPhraseWeight, setNewPhraseWeight] = useState('')
  const [newPhraseNegativeDefault, setNewPhraseNegativeDefault] = useState(false)
  const [newPhraseNotes, setNewPhraseNotes] = useState('')

  const [presetName, setPresetName] = useState('')

  const [positiveParts, setPositiveParts] = useState<ComposerItem[]>([])
  const [negativeParts, setNegativeParts] = useState<ComposerItem[]>([])

  const positivePrompt = useMemo(() => toPrompt(positiveParts), [positiveParts])
  const negativePrompt = useMemo(() => toPrompt(negativeParts), [negativeParts])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [c, p, pr] = await Promise.all([
        api<Category[]>('/categories'),
        api<Phrase[]>('/phrases'),
        api<Preset[]>('/presets'),
      ])
      setCategories(c)
      setPhrases(p)
      setPresets(pr)
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
        sort_order: categoryPhrases.length,
      }),
    })
    setNewPhraseText('')
    setNewPhraseWeight('')
    setNewPhraseNegativeDefault(false)
    setNewPhraseNotes('')
    await loadAll()
  }

  async function removePhrase(id: number) {
    await api(`/phrases/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  function addPhraseToComposer(phrase: Phrase) {
    const item: ComposerItem = {
      id: `${phrase.id}-${Date.now()}-${Math.random()}`,
      text: phrase.text,
      weight: phrase.default_weight ?? undefined,
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
        positive_parts: positiveParts.map((p) => ({ text: p.text, weight: p.weight })),
        negative_parts: negativeParts.map((p) => ({ text: p.text, weight: p.weight })),
      }),
    })
    setPresetName('')
    await loadAll()
  }

  function loadPreset(preset: Preset) {
    setPositiveParts(preset.positive_parts.map((p, i) => ({ id: `pp-${preset.id}-${i}-${Date.now()}`, ...p })))
    setNegativeParts(preset.negative_parts.map((p, i) => ({ id: `np-${preset.id}-${i}-${Date.now()}`, ...p })))
  }

  async function deletePreset(id: number) {
    if (!window.confirm('Delete preset?')) return
    await api(`/presets/${id}`, { method: 'DELETE' })
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
            <button type="submit" disabled={!selectedCategoryId}>Add phrase</button>
          </form>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 320, overflow: 'auto' }}>
            {categoryPhrases.map((p) => (
              <li key={p.id} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{p.text}</strong>
                  {p.default_weight !== null && <span>({p.default_weight})</span>}
                  {p.is_negative_default && <span style={{ color: '#8a2be2' }}>negative</span>}
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
            updatePart={updatePart}
            movePart={movePart}
            removePart={removePart}
          />
          <ComposerList
            title="Negative"
            items={negativeParts}
            setItems={setNegativeParts}
            updatePart={updatePart}
            movePart={movePart}
            removePart={removePart}
          />
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
    </main>
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
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, marginBottom: 8 }}>
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
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
