import React from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>promtdb</h1>
      <p>MVP scaffold is ready.</p>
      <ul>
        <li>Backend health: <code>/health</code></li>
        <li>Next: Categories + Phrases CRUD</li>
        <li>Then: Prompt Composer UI</li>
      </ul>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
