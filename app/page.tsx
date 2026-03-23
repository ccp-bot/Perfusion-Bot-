'use client'
import { useState, useRef, useEffect } from 'react'

export default function Home() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [fadingSplash, setFadingSplash] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingSplash(true), 5000)
    const hideTimer = setTimeout(() => setShowSplash(false), 6500)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

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

  if (showSplash) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117', opacity: fadingSplash ? 0 : 1, transition: 'opacity 1s ease', fontFamily: 'system-ui, sans-serif' }}>
        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        <video
          src="/COR-Wave-3.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          style={{ width: '100vw', height: '100vh', objectFit: 'cover', marginBottom: '0' }}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1117', color: '#e8e8e8', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', position: 'relative' }}>

      {loading && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
          <div style={{ position: 'absolute', bottom: '80px', left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #e63946, transparent)', animation: 'pulse 1s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#e63946', fontSize: '0.85rem', fontWeight: '500', letterSpacing: '0.1em', opacity: 0.7, animation: 'fadeInOut 1.5s ease-in-out infinite' }}>
            searching through knowledge...
          </div>
          <img src="/COR-Bot.PNG" alt="COR" style={{ position: 'absolute', top: '42%', width: '140px', height: '140px', objectFit: 'contain', animation: 'runAcross 10s linear infinite', filter: 'drop-shadow(0 0 8px #e63946)' }} />
          <img src="/COR-Tank.PNG" alt="COR-T" style={{ position: 'absolute', bottom: '100px', width: '160px', height: '160px', objectFit: 'contain', animation: 'runAcross 14s linear infinite 2s', filter: 'drop-shadow(0 0 8px #3b82f6)' }} />
          <img src="/COR-Hovering-GIF.gif" alt="COR-H" style={{ position: 'absolute', top: '12%', width: '120px', height: '120px', objectFit: 'contain', animation: 'flyAcross 8s linear infinite 1s', mixBlendMode: 'screen' as any, filter: 'drop-shadow(0 0 12px #22c55e)' }} />
        </div>
      )}

      <style>{`
        @keyframes runAcross {
          0% { left: -180px; }
          100% { left: 110%; }
        }
        @keyframes flyAcross {
          0% { left: -150px; transform: translateY(-5px); }
          50% { transform: translateY(5px); }
          100% { left: 110%; transform: translateY(-5px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        @keyframes bob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #2a2a3a', display: 'flex', alignItems: 'center', gap: '12px', background: '#0f1117', zIndex: 20 }}>
        <img src="/COR-1.PNG" alt="COR" style={{ width: '36px', height: '36px', objectFit: 'contain', animation: 'bob 3s ease-in-out infinite' }} />
        <div>
          <div style={{ fontWeight: '600', fontSize: '1rem', color: '#ffffff' }}>COR</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Cardiovascular Perfusion Assistant</div>
        </div>
        <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', zIndex: 20 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '500', color: '#9ca3af', marginBottom: '0.5rem' }}>Hello, I am COR</div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Your cardiovascular perfusion assistant.<br/>Ask me anything about CPB, ECMO, or perfusion guidelines.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2rem', paddingBottom: '1rem' }}>
              <img src="/COR-Tank.PNG" alt="COR-T" style={{ width: '120px', height: '120px', objectFit: 'contain', animation: 'bob 3.2s ease-in-out infinite' }} />
              <img src="/COR-1.PNG" alt="COR" style={{ width: '140px', height: '140px', objectFit: 'contain', animation: 'bob 2.8s ease-in-out infinite 0.3s' }} />
              <video src="/COR-Hovering.webm" autoPlay loop muted playsInline style={{ width: '110px', height: '110px', objectFit: 'contain', animation: 'bob 3.5s ease-in-out infinite 0.6s' }} />
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'assistant' && (
              <img src="/COR-1.PNG" alt="COR" style={{ width: '28px', height: '28px', objectFit: 'contain', marginRight: '8px', flexShrink: 0, marginTop: '4px' }} />
            )}
            <div style={{ maxWidth: '70%', padding: '0.75rem 1rem', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.role === 'user' ? '#e63946' : '#1a1a2e', color: '#e8e8e8', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/COR-1.PNG" alt="COR" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
            <div style={{ background: '#1a1a2e', padding: '0.75rem 1rem', borderRadius: '18px 18px 18px 4px', color: '#6b7280', fontSize: '0.9rem' }}>COR is thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '1rem 2rem', borderTop: '1px solid #2a2a3a', background: '#0f1117', zIndex: 20 }}>
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