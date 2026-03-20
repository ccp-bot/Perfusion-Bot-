'use client'
import { useState } from 'react'

export default function Home() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMessage() {
    if (!input.trim()) return
    const userMessage = input
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error getting response.' }])
    }
    setLoading(false)
  }

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Perfusion Bot</h1>
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', minHeight: '400px', marginBottom: '1rem', overflowY: 'auto' }}>
        {messages.length === 0 && <p style={{ color: '#999' }}>Ask a perfusion question...</p>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '1rem', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <span style={{ background: m.role === 'user' ? '#0070f3' : '#f0f0f0', color: m.role === 'user' ? 'white' : 'black', padding: '0.5rem 1rem', borderRadius: '8px', display: 'inline-block', maxWidth: '80%' }}>
              {m.content}
            </span>
          </div>
        ))}
        {loading && <p style={{ color: '#999' }}>Thinking...</p>}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask a perfusion question..."
          style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem' }}
        />
        <button
          onClick={sendMessage}
          style={{ padding: '0.75rem 1.5rem', background: '#0070f3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem' }}
        >
          Send
        </button>
      </div>
    </main>
  )
}