'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from './lib/supabase'

const CATEGORIES = ['Protocol', 'Case Note', 'Equipment', 'Policy', 'Logbook']

export default function Home() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [fadingSplash, setFadingSplash] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [savePreview, setSavePreview] = useState(false)
  const [pendingSummary, setPendingSummary] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [showLogbook, setShowLogbook] = useState(false)
  const [logbookEntries, setLogbookEntries] = useState<any[]>([])
  const [logbookLoading, setLogbookLoading] = useState(false)
  const [listening, setListening] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        window.location.href = '/login'
      } else {
        setUser(session.user)
        setAuthLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingSplash(true), 5000)
    const hideTimer = setTimeout(() => setShowSplash(false), 6500)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  if (authLoading) return null

  async function fetchLogbook() {
    setLogbookLoading(true)
    try {
      const res = await fetch(`/api/logbook?userId=${user?.id}`)
      const data = await res.json()
      setLogbookEntries(data.entries || [])
    } catch {
      setLogbookEntries([])
    }
    setLogbookLoading(false)
  }

  async function deleteLogbookEntry(id: number) {
    try {
      await fetch('/api/logbook', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      setLogbookEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      console.error('Failed to delete entry')
    }
  }

  function openLogbook() {
    setShowLogbook(true)
    fetchLogbook()
  }

  async function sendMessage() {
    if (!input.trim()) return
    if (input.trim().toLowerCase() === 'logbook') {
      setInput('')
      openLogbook()
      return
    }
    const userMessage = input
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, messages: messages, userId: user?.id })
      })
      const data = await res.json()
      if (data.savePreview) {
        setPendingSummary(data.summary)
        setSavePreview(true)
        setMessages(prev => [...prev, { role: 'assistant', content: '📋 I\'ve prepared a summary of our exchange. Please select a category to save it to your institutional knowledge base.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error getting response.' }])
    }
    setLoading(false)
  }

  async function confirmSave() {
    if (!selectedCategory) return
    setSaving(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '', messages: [], saveMode: true, category: selectedCategory, summaryToSave: pendingSummary, userId: user?.id })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error saving to knowledge base.' }])
    }
    setSavePreview(false)
    setPendingSummary('')
    setSelectedCategory('')
    setSaving(false)
  }

  function cancelSave() {
    setSavePreview(false)
    setPendingSummary('')
    setSelectedCategory('')
    setMessages(prev => [...prev, { role: 'assistant', content: '↩️ No problem, nothing was saved.' }])
  }

  function startListening() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition not supported. Use Chrome!')
      return
    }
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('')
      setInput(transcript)
    }
    recognition.onerror = (event: any) => {
      console.log('Speech error:', event.error)
      setListening(false)
    }
    recognition.start()
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (showSplash) {
    return (
      <div style={{ position: 'relative', height: '100vh', background: '#0f1117', opacity: fadingSplash ? 0 : 1, transition: 'opacity 1s ease', fontFamily: 'system-ui, sans-serif' }}>
        <video ref={videoRef} src="/COR-Opening.mp4" autoPlay muted playsInline preload="auto" style={{ width: '100vw', height: '100vh', objectFit: 'cover' }} />
        <button
          onClick={() => { if (videoRef.current) { videoRef.current.muted = !videoRef.current.muted; setIsMuted(!isMuted) } }}
          style={{ position: 'absolute', bottom: '2rem', right: '2rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2rem', zIndex: 10 }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
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
        @keyframes runAcross { 0% { left: -180px; } 100% { left: 110%; } }
        @keyframes flyAcross { 0% { left: -150px; transform: translateY(-5px); } 50% { transform: translateY(5px); } 100% { left: 110%; transform: translateY(-5px); } }
        @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes fadeInOut { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.8; } }
        @keyframes bob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
        @keyframes modalIn { from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(230,57,70,0.4); } 70% { box-shadow: 0 0 0 10px rgba(230,57,70,0); } 100% { box-shadow: 0 0 0 0 rgba(230,57,70,0); } }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #2a2a3a', display: 'flex', alignItems: 'center', gap: '12px', background: '#0f1117', zIndex: 20 }}>
        <img src="/COR-1.PNG" alt="COR" style={{ width: '36px', height: '36px', objectFit: 'contain', animation: 'bob 3s ease-in-out infinite' }} />
        <div>
          <div style={{ fontWeight: '600', fontSize: '1rem', color: '#ffffff' }}>COR</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Cardiovascular Perfusion Assistant</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{user?.email}</div>
          <button onClick={openLogbook} title="My Logbook" style={{ padding: '0.25rem', borderRadius: '8px', border: '1px solid #2a2a3a', background: showLogbook ? '#1a1a2e' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <img src="/logbook.icon.png" alt="Logbook" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          </button>
          <button onClick={signOut} style={{ padding: '0.3rem 0.75rem', borderRadius: '8px', border: '1px solid #2a2a3a', background: 'transparent', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer' }}>Sign out</button>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
        </div>
      </div>

      {/* MESSAGES */}
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

      {/* LOGBOOK PANEL */}
      {showLogbook && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
          <div onClick={() => setShowLogbook(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '90%', maxWidth: '480px', background: '#1a1a2e', borderLeft: '1px solid #2a2a3a', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.25s ease' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #2a2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>📓</span>
                <div>
                  <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '0.95rem' }}>My Logbook</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{logbookEntries.length} entries</div>
                </div>
              </div>
              <button onClick={() => setShowLogbook(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {logbookLoading && <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.9rem', marginTop: '2rem' }}>Loading entries...</div>}
              {!logbookLoading && logbookEntries.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No logbook entries yet.</div>
                  <div style={{ color: '#4b5563', fontSize: '0.8rem', marginTop: '0.5rem' }}>Save a conversation and select "Logbook" to add entries.</div>
                </div>
              )}
              {logbookEntries.map((entry) => (
                <div key={entry.id} style={{ background: '#0f1117', border: '1px solid #2a2a3a', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <button onClick={() => deleteLogbookEntry(entry.id)} style={{ background: 'transparent', border: 'none', color: '#4b5563', fontSize: '0.8rem', cursor: 'pointer', padding: '0' }}>🗑️</button>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#e8e8e8', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{entry.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SAVE PREVIEW MODAL */}
      {savePreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#1a1a2e', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '2rem', width: '90%', maxWidth: '520px', animation: 'modalIn 0.2s ease' }}>
            <div style={{ fontWeight: '600', fontSize: '1rem', color: '#ffffff', marginBottom: '0.5rem' }}>💾 Save to Knowledge Base</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>Review the summary COR generated, then pick a category.</div>
            <div style={{ background: '#0f1117', border: '1px solid #2a2a3a', borderRadius: '10px', padding: '1rem', fontSize: '0.85rem', color: '#e8e8e8', lineHeight: '1.6', marginBottom: '1.25rem', whiteSpace: 'pre-wrap' }}>{pendingSummary}</div>
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.6rem' }}>Select a category:</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} style={{ padding: '0.4rem 1rem', borderRadius: '20px', border: `1px solid ${selectedCategory === cat ? '#e63946' : '#2a2a3a'}`, background: selectedCategory === cat ? '#e63946' : 'transparent', color: selectedCategory === cat ? '#ffffff' : '#9ca3af', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                  {cat}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={cancelSave} style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', border: '1px solid #2a2a3a', background: 'transparent', color: '#9ca3af', fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmSave} disabled={!selectedCategory || saving} style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', border: 'none', background: !selectedCategory || saving ? '#4b5563' : '#e63946', color: 'white', fontSize: '0.85rem', fontWeight: '500', cursor: !selectedCategory || saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INPUT */}
      <div style={{ padding: '1rem 2rem', borderTop: '1px solid #2a2a3a', background: '#0f1117', zIndex: 20 }}>
        <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '800px', margin: '0 auto' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={listening ? 'Listening... click mic to stop' : 'Ask COR a perfusion question...'}
            style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '12px', border: `1px solid ${listening ? '#e63946' : '#2a2a3a'}`, background: '#1a1a2e', color: '#e8e8e8', fontSize: '0.9rem', outline: 'none' }}
          />
          <button
            onClick={startListening}
            title={listening ? 'Stop listening' : 'Speak your question'}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: listening ? '#e63946' : '#1a1a2e',
              border: `2px solid ${listening ? '#e63946' : '#3a3a4a'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: listening ? '0 0 0 4px rgba(230,57,70,0.2)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            {listening
              ? <div style={{ width: '14px', height: '14px', borderRadius: '2px', background: 'white' }} />
              : <img src="/mic.png" alt="mic" style={{ width: '22px', height: '22px', objectFit: 'contain', filter: 'invert(1)' }} />
            }
          </button>
        </div>
      </div>

    </div>
  )
}
