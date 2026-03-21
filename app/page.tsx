That's the old UI. Let's replace it with the new dark COR design. Press Ctrl+A to select all, delete, then paste the new code I gave you earlier. Here it is again:
typescript'use client'
import { useState, useRef, useEffect } from 'react'

export default function Home() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1117', color: '#e8e8e8', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Header */}
      <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #2a2a3a', display: 'flex', alignItems: 'center', gap: '12px', background: '#0f1117' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #e63946, #c1121f)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', color: 'white' }}>C</div>
        <div>
          <div style={{ fontWeight: '600', fontSize: '1rem', color: '#ffffff' }}>COR</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Cardiovascular Perfusion Assistant</div>
        </div>
        <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '4rem', color: '#4b5563' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🫀</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '500', color: '#9ca3af', marginBottom: '0.5rem' }}>Hello, I am COR</div>
            <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Your cardiovascular perfusion assistant.<br/>Ask me anything about CPB, ECMO, or perfusion guidelines.</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'assistant' && (
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #e63946, #c1121f)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'white', marginRight: '8px', flexShrink: 0, marginTop: '4px' }}>C</div>
            )}
            <div style={{
              maxWidth: '70%',
              padding: '0.75rem 1rem',
              borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.role === 'user' ? '#e63946' : '#1a1a2e',
              color: '#e8e8e8',
              fontSize: '0.9rem',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap'
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #e63946, #c1121f)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'white' }}>C</div>
            <div style={{ background: '#1a1a2e', padding: '0.75rem 1rem', borderRadius: '18px 18px 18px 4px', color: '#6b7280', fontSize: '0.9rem' }}>COR is thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '1rem 2rem', borderTop: '1px solid #2a2a3a', background: '#0f1117' }}>
        <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '800px', margin: '0 auto' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask COR a perfusion question..."
            style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #2a2a3a', background: '#1a1a2e', color: '#e8e8e8', fontSize: '0.9rem', outline: 'none' }}
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{ padding: '0.75rem 1.25rem', background: loading ? '#4b5563' : '#e63946', color: 'white', border: 'none', borderRadius: '12px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: '500' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}