'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from './lib/supabase'

const CATEGORIES = ['Protocol', 'Case Note', 'Equipment', 'Policy', 'Logbook']

const SIDEBAR_ITEMS = [
  { key: 'History', emoji: null, image: '/History.icon.png', label: 'History' },
  { key: 'Logbook', emoji: null, image: '/Logbook.icon.png', label: 'Logbook' },
  { key: 'Protocol', emoji: null, image: '/Protocol.icon.png', label: 'Protocol' },
  { key: 'Equipment', emoji: null, image: '/Equipment.Icon.png', label: 'Equipment' },
  { key: 'Policy', emoji: null, image: '/Policy.Icon.png', label: 'Policy' },
]

export default function Home() {
  const [messages, setMessages] = useState<{role: string, content: string, image?: string}[]>([])
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
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const [panelEntries, setPanelEntries] = useState<any[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [attachedImageName, setAttachedImageName] = useState<string>('')
  const [conversations, setConversations] = useState<any[]>([])
  const [savingHistory, setSavingHistory] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const recognitionRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function fetchPanel(category: string) {
    if (category === 'History') {
      await fetchHistory()
      return
    }
    setPanelLoading(true)
    try {
      const res = await fetch(`/api/logbook?userId=${user?.id}&category=${category}`)
      const data = await res.json()
      setPanelEntries(data.entries || [])
    } catch {
      setPanelEntries([])
    }
    setPanelLoading(false)
  }

  async function fetchHistory() {
    setPanelLoading(true)
    try {
      const res = await fetch(`/api/history?userId=${user?.id}`)
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch {
      setConversations([])
    }
    setPanelLoading(false)
  }

  async function saveToHistory() {
    if (messages.length === 0) return
    setSavingHistory(true)
    const firstUserMsg = messages.find(m => m.role === 'user')
    const title = firstUserMsg?.content?.slice(0, 60) || 'Conversation'
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, title, messages })
      })
      if (activePanel === 'History') await fetchHistory()
    } catch {
      console.error('Failed to save history')
    }
    setSavingHistory(false)
  }

  async function pinConversation(id: number, pinned: boolean) {
    try {
      await fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pinned: !pinned })
      })
      setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !pinned } : c))
    } catch {
      console.error('Failed to pin conversation')
    }
  }

  async function deleteConversation(id: number) {
    try {
      await fetch('/api/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      setConversations(prev => prev.filter(c => c.id !== id))
    } catch {
      console.error('Failed to delete conversation')
    }
  }

  function loadConversation(conv: any) {
    setMessages(conv.messages || [])
    setActivePanel(null)
  }

  function openPanel(key: string) {
    if (activePanel === key) {
      setActivePanel(null)
      return
    }
    setActivePanel(key)
    fetchPanel(key)
  }

  async function deletePanelEntry(id: number) {
    try {
      await fetch('/api/logbook', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      setPanelEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      console.error('Failed to delete entry')
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAttachedImage(ev.target?.result as string)
      setAttachedImageName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function sendMessage() {
    if (!input.trim() && !attachedImage) return
    const userMessage = input
    const imageToSend = attachedImage
    setInput('')
    setAttachedImage(null)
    setAttachedImageName('')
    const newUserMsg: any = { role: 'user', content: userMessage }
    if (imageToSend) newUserMsg.image = imageToSend
    setMessages(prev => [...prev, newUserMsg])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, messages: messages, userId: user?.id, image: imageToSend })
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
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('')
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
      <div style={{ position: 'relative', height: '100vh', background: '#080b12', opacity: fadingSplash ? 0 : 1, transition: 'opacity 1.2s ease', fontFamily: 'system-ui, sans-serif' }}>
        <video ref={videoRef} src="/COR.Opener.mp4" autoPlay muted playsInline preload="auto" style={{ width: '100vw', height: '100vh', objectFit: 'cover' }} />
        <button
          onClick={() => { if (videoRef.current) { videoRef.current.muted = !videoRef.current.muted; setIsMuted(!isMuted) } }}
          style={{ position: 'absolute', bottom: '2rem', right: '2rem', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2rem', zIndex: 10 }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080b12', color: '#e2e8f0', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif", overflow: 'hidden' }}>

      <style>{`
        @keyframes runAcross { 0% { left: -180px; } 100% { left: 110%; } }
        @keyframes flyAcross { 0% { left: -150px; transform: translateY(-5px); } 50% { transform: translateY(5px); } 100% { left: 110%; transform: translateY(-5px); } }
        @keyframes pulseBar { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes fadeInOut { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.8; } }
        @keyframes bob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes modalIn { from { opacity: 0; transform: translate(-50%, -46%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes panelSlide { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes micGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(230,57,70,0.5); } 50% { box-shadow: 0 0 0 6px rgba(230,57,70,0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .sidebar-btn:hover { background: rgba(255,255,255,0.06) !important; }
        .sidebar-btn.active { background: rgba(230,57,70,0.12) !important; border-color: rgba(230,57,70,0.4) !important; }
        .msg-bubble { animation: fadeUp 0.2s ease; }
        .history-item:hover { background: rgba(255,255,255,0.06) !important; }
        input::placeholder { color: #4a5568; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 2px; }
      `}</style>

      {/* LEFT SIDEBAR */}
      <div style={{ width: '200px', background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 30 }}>
        <div style={{ padding: '1.25rem 1rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.25rem' }}>
            <img src="/RotatingHeart.gif" alt="COR" style={{ width: '75px', height: '75px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '1rem', color: '#ffffff', letterSpacing: '0.05em' }}>COR</div>
              <div style={{ fontSize: '0.6rem', color: '#4a5568', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Perfusion AI</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '0.75rem 0.5rem', flex: 1 }}>
          <div style={{ fontSize: '0.6rem', color: '#4a5568', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: '0.5rem' }}>Knowledge Base</div>
          {SIDEBAR_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => openPanel(item.key)}
              className={`sidebar-btn${activePanel === item.key ? ' active' : ''}`}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s ease', marginBottom: '2px', textAlign: 'left' }}
            >
              <span style={{ fontSize: '1rem', width: '50px', textAlign: 'center', flexShrink: 0 }}>
                {item.image
                  ? <img src={item.image} alt={item.label} style={{ width: '50px', height: '50px', objectFit: 'contain', verticalAlign: 'middle' }} />
                  : item.emoji
                }
              </span>
              <span style={{ fontSize: '0.82rem', color: activePanel === item.key ? '#e63946' : '#94a3b8', fontWeight: activePanel === item.key ? '600' : '400' }}>{item.label}</span>
              {activePanel === item.key && <div style={{ marginLeft: 'auto', width: '4px', height: '4px', borderRadius: '50%', background: '#e63946', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '0.65rem', color: '#4a5568', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          <button onClick={signOut} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#4a5568', fontSize: '0.72rem', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>

      {/* PANEL */}
      {activePanel && (
        <div style={{ width: '300px', background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', flexShrink: 0, animation: 'panelSlide 0.2s ease' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '0.88rem' }}>{activePanel}</div>
              <div style={{ fontSize: '0.7rem', color: '#4a5568', marginTop: '1px' }}>
                {activePanel === 'History' ? `${conversations.length} conversations` : `${panelEntries.length} saved entries`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {activePanel === 'History' && messages.length > 0 && (
                <button
                  onClick={saveToHistory}
                  disabled={savingHistory}
                  style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(230,57,70,0.3)', background: 'rgba(230,57,70,0.1)', color: '#e63946', fontSize: '0.72rem', cursor: 'pointer' }}
                >
                  {savingHistory ? '...' : '+ Save'}
                </button>
              )}
              <button onClick={() => setActivePanel(null)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '1rem', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
            {panelLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '2rem' }}>Loading...</div>}

            {activePanel === 'History' && !panelLoading && (
              <>
                {conversations.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>🕐</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>No saved conversations yet.</div>
                    <div style={{ color: '#4a5568', fontSize: '0.72rem', marginTop: '0.4rem', opacity: 0.7 }}>Click "+ Save" to save the current chat.</div>
                  </div>
                )}
                {conversations.map((conv) => (
                  <div key={conv.id} className="history-item" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.6rem', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <div onClick={() => loadConversation(conv)} style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: '1.4', marginBottom: '0.25rem', fontWeight: '500' }}>{conv.title}</div>
                        <div style={{ fontSize: '0.68rem', color: '#4a5568' }}>
                          {new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {!conv.pinned && conv.expires_at && <span style={{ marginLeft: '0.4rem', color: '#6b4a4a' }}>· expires {new Date(conv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                          {conv.pinned && <span style={{ marginLeft: '0.4rem', color: '#e63946' }}>· pinned</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem', flexShrink: 0 }}>
                        <button onClick={() => pinConversation(conv.id, conv.pinned)} title={conv.pinned ? 'Unpin' : 'Pin'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: conv.pinned ? 1 : 0.4, padding: '2px' }}>📌</button>
                        <button onClick={() => deleteConversation(conv.id)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, padding: '2px' }}>🗑️</button>
                      </div>
                    </div>
                    <div onClick={() => loadConversation(conv)} style={{ fontSize: '0.75rem', color: '#4a5568', lineHeight: '1.4' }}>
                      {conv.messages?.find((m: any) => m.role === 'assistant')?.content?.slice(0, 80)}...
                    </div>
                  </div>
                ))}
              </>
            )}

            {activePanel !== 'History' && !panelLoading && (
              <>
                {panelEntries.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>📭</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>No {activePanel} entries yet.</div>
                  </div>
                )}
                {panelEntries.map((entry) => (
                  <div key={entry.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.68rem', color: '#4a5568' }}>{new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <button onClick={() => deletePanelEntry(entry.id)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6 }}>🗑️</button>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{entry.content}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* MAIN CHAT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ position: 'absolute', bottom: '80px', left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, #e63946, transparent)', animation: 'pulseBar 1.2s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#e63946', fontSize: '0.75rem', fontWeight: '500', letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.6, animation: 'fadeInOut 1.5s ease-in-out infinite' }}>searching knowledge base</div>
            <img src="/COR-Bot.PNG" alt="COR" style={{ position: 'absolute', top: '42%', width: '120px', height: '120px', objectFit: 'contain', animation: 'runAcross 10s linear infinite', filter: 'drop-shadow(0 0 8px #e63946)' }} />
            <img src="/COR-Tank.PNG" alt="COR-T" style={{ position: 'absolute', bottom: '100px', width: '140px', height: '140px', objectFit: 'contain', animation: 'runAcross 14s linear infinite 2s', filter: 'drop-shadow(0 0 8px #3b82f6)' }} />
            <img src="/COR-Hovering-GIF.gif" alt="COR-H" style={{ position: 'absolute', top: '12%', width: '110px', height: '110px', objectFit: 'contain', animation: 'flyAcross 8s linear infinite 1s', mixBlendMode: 'screen' as any, filter: 'drop-shadow(0 0 12px #22c55e)' }} />
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2rem 1rem' }}>
          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', height: '100%', minHeight: '400px' }}>
              <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '300', color: '#e2e8f0', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>Hello, I am <span style={{ color: '#e63946', fontWeight: '700' }}>COR</span></div>
                <div style={{ fontSize: '0.88rem', color: '#4a5568', lineHeight: '1.6' }}>Your cardiovascular perfusion assistant.<br/>Ask me anything about CPB, ECMO, or perfusion guidelines.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '1rem' }}>
                <img src="/CORx3Dance.gif" alt="COR dancing" style={{ width: '500px', height: 'auto', objectFit: 'contain' }} />
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="msg-bubble" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '0.75rem' }}>
              {m.role === 'assistant' && <img src="/COR-1.PNG" alt="COR" style={{ width: '26px', height: '26px', objectFit: 'contain', marginRight: '8px', flexShrink: 0, marginTop: '4px' }} />}
              <div style={{ maxWidth: '68%', padding: '0.7rem 1rem', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.role === 'user' ? '#e63946' : 'rgba(255,255,255,0.05)', border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.88rem', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>
                {m.image && <img src={m.image} alt="attachment" style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '0.5rem', display: 'block' }} />}
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
              <img src="/COR-1.PNG" alt="COR" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.7rem 1rem', borderRadius: '18px 18px 18px 4px', color: '#4a5568', fontSize: '0.85rem' }}>COR is thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {savePreview && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, backdropFilter: 'blur(4px)' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.75rem', width: '90%', maxWidth: '500px', animation: 'modalIn 0.2s ease' }}>
              <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#ffffff', marginBottom: '0.4rem' }}>💾 Save to Knowledge Base</div>
              <div style={{ fontSize: '0.78rem', color: '#4a5568', marginBottom: '1rem' }}>Review the summary, then pick a category.</div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.9rem', fontSize: '0.82rem', color: '#94a3b8', lineHeight: '1.6', marginBottom: '1rem', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>{pendingSummary}</div>
              <div style={{ fontSize: '0.75rem', color: '#4a5568', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Category</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} style={{ padding: '0.35rem 0.9rem', borderRadius: '20px', border: `1px solid ${selectedCategory === cat ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: selectedCategory === cat ? '#e63946' : 'transparent', color: selectedCategory === cat ? '#ffffff' : '#94a3b8', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s ease' }}>{cat}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button onClick={cancelSave} style={{ padding: '0.55rem 1.1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
                <button onClick={confirmSave} disabled={!selectedCategory || saving} style={{ padding: '0.55rem 1.1rem', borderRadius: '8px', border: 'none', background: !selectedCategory || saving ? '#2d3748' : '#e63946', color: 'white', fontSize: '0.82rem', fontWeight: '500', cursor: !selectedCategory || saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: '0.75rem 1.5rem 1.25rem', background: '#080b12', flexShrink: 0 }}>
          {attachedImage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', width: 'fit-content' }}>
              <img src={attachedImage} alt="attachment" style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px' }} />
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{attachedImageName}</span>
              <button onClick={() => { setAttachedImage(null); setAttachedImageName('') }} style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.6rem', maxWidth: '780px', margin: '0 auto', alignItems: 'center' }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.25rem', color: '#94a3b8' }}>+</button>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={listening ? 'Listening...' : 'Ask COR anything about perfusion...'}
                style={{ width: '100%', padding: '0.75rem 3rem 0.75rem 1.1rem', borderRadius: '24px', border: `1px solid ${listening ? 'rgba(230,57,70,0.5)' : 'rgba(255,255,255,0.1)'}`, background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s ease' }}
              />
              <button onClick={startListening} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px', borderRadius: '50%', background: listening ? '#e63946' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', animation: listening ? 'micGlow 1.5s ease-in-out infinite' : 'none' }}>
                {listening ? <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: 'white' }} /> : <img src="/microphone.icon.png" alt="mic" style={{ width: '32px', height: '32px', objectFit: 'contain', opacity: 0.5 }} />}
              </button>
            </div>
            <button onClick={sendMessage} disabled={loading} style={{ width: '38px', height: '38px', borderRadius: '50%', background: loading ? 'rgba(255,255,255,0.06)' : '#e63946', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.9rem' }}>➤</button>
          </div>
        </div>
      </div>
    </div>
  )
}
