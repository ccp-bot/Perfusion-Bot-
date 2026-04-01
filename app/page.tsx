'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from './lib/supabase'

const CATEGORIES = ['Protocol', 'Case Note', 'Equipment', 'Policy', 'Logbook']

const SIDEBAR_ITEMS = [
  { key: 'History', emoji: null, image: '/History.Icon.png', label: 'History' },
  { key: 'Logbook', emoji: null, image: '/Logbook.icon.png', label: 'Logbook' },
  { key: 'Protocol', emoji: null, image: '/Protocol.Icon.png', label: 'Protocol' },
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userGroupId, setUserGroupId] = useState<string | null>(null)
  const [userGroupName, setUserGroupName] = useState<string | null>(null)
  const [groupMembers, setGroupMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('worker')
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [groupName, setGroupName] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const recognitionRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const userRef = useRef<any>(null)
  const activePanelRef = useRef<string | null>(null)

  // Keep refs in sync
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { activePanelRef.current = activePanel }, [activePanel])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        window.location.href = '/login'
      } else {
        setUser(session.user)
        userRef.current = session.user
        setAuthLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Fetch group membership when user is set
  useEffect(() => {
    if (!user) return
    async function fetchGroup() {
      try {
        const res = await fetch(`/api/groups?userId=${user.id}&email=${encodeURIComponent(user.email)}`)
        const data = await res.json()
        if (data.memberships && data.memberships.length > 0) {
          const m = data.memberships[0]
          setUserRole(m.role)
          setUserGroupId(m.group_id)
          setUserGroupName(m.group?.name || null)
        }
      } catch { /* no group yet */ }
    }
    fetchGroup()
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingSplash(true), 5000)
    const hideTimer = setTimeout(() => setShowSplash(false), 6500)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  if (authLoading) return null

  async function autoSaveHistory(currentMessages: {role: string, content: string, image?: string}[]) {
    const currentUser = userRef.current
    if (!currentUser?.id || currentMessages.length < 2) return
    const firstUserMsg = currentMessages.find(m => m.role === 'user')
    const title = firstUserMsg?.content?.slice(0, 60) || 'Conversation'
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, title, messages: currentMessages })
      })
      if (activePanelRef.current === 'History') {
        await fetchHistory()
      }
    } catch {
      console.error('Auto-save failed')
    }
  }

  async function fetchGroupMembers() {
    if (!userGroupId) return
    try {
      const res = await fetch(`/api/groups/members?groupId=${userGroupId}`)
      const data = await res.json()
      setGroupMembers(data.members || [])
    } catch {
      setGroupMembers([])
    }
  }

  async function createGroup() {
    if (!groupName.trim() || !user) return
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email, name: groupName.trim() })
      })
      const data = await res.json()
      if (data.group) {
        setUserRole('owner')
        setUserGroupId(data.group.id)
        setUserGroupName(data.group.name)
        setGroupName('')
      }
    } catch { console.error('Failed to create group') }
  }

  async function inviteMember() {
    if (!inviteEmail.trim() || !userGroupId || !user) return
    setInviteError('')
    setInviteSuccess('')
    try {
      const res = await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, groupId: userGroupId, action: 'invite', targetEmail: inviteEmail.trim(), newRole: inviteRole })
      })
      const data = await res.json()
      if (data.success) {
        setInviteSuccess(`Invited ${inviteEmail.trim()} as ${inviteRole}`)
        setInviteEmail('')
        fetchGroupMembers()
      } else {
        setInviteError(data.error || 'Failed to invite')
      }
    } catch { setInviteError('Network error') }
  }

  async function removeMember(email: string) {
    if (!userGroupId || !user) return
    try {
      await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, groupId: userGroupId, targetEmail: email })
      })
      fetchGroupMembers()
    } catch { console.error('Failed to remove member') }
  }

  async function changeRole(email: string, newRole: string) {
    if (!userGroupId || !user) return
    try {
      await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, groupId: userGroupId, action: 'change_role', targetEmail: email, newRole })
      })
      fetchGroupMembers()
    } catch { console.error('Failed to change role') }
  }

  async function fetchPanel(category: string) {
    if (category === 'History') {
      await fetchHistory()
      return
    }
    if (category === 'Admin') {
      await fetchGroupMembers()
      return
    }
    setPanelLoading(true)
    try {
      const groupParam = userGroupId ? `&groupId=${userGroupId}` : ''
      const res = await fetch(`/api/logbook?userId=${user?.id}&category=${category}${groupParam}`)
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
    await autoSaveHistory(messages)
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
        body: JSON.stringify({ id, userId: user?.id, userRole })
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

    const updatedMessages = [...messages, newUserMsg]
    setMessages(updatedMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, messages: messages, userId: user?.id, image: imageToSend, groupId: userGroupId })
      })
      const data = await res.json()

      let finalMessages: any[]
      if (data.savePreview) {
        setPendingSummary(data.summary)
        setSavePreview(true)
        const assistantMsg = { role: 'assistant', content: '📋 I\'ve prepared a summary of our exchange. Please select a category to save it to your institutional knowledge base.' }
        finalMessages = [...updatedMessages, assistantMsg]
        setMessages(finalMessages)
      } else {
        const assistantMsg = { role: 'assistant', content: data.answer }
        finalMessages = [...updatedMessages, assistantMsg]
        setMessages(finalMessages)
      }

      // Auto-save to history after every response
      await autoSaveHistory(finalMessages)

    } catch {
      const errorMsg = { role: 'assistant', content: 'Error getting response.' }
      const finalMessages = [...updatedMessages, errorMsg]
      setMessages(finalMessages)
      await autoSaveHistory(finalMessages)
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
        body: JSON.stringify({ message: '', messages: [], saveMode: true, category: selectedCategory, summaryToSave: pendingSummary, userId: user?.id, groupId: userGroupId })
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
    // Stop if already listening
    if (recognitionRef.current) {
      const ref = recognitionRef.current
      recognitionRef.current = null
      ref.onend = null
      ref.onerror = null
      ref.onresult = null
      try { ref.stop() } catch {}
      setListening(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    let stopped = false
    recognition.onstart = () => {
      if (!stopped) setListening(true)
    }
    recognition.onend = () => {
      if (stopped) return
      // Auto-restart on timeout
      try { recognition.start() } catch {
        stopped = true
        recognitionRef.current = null
        setListening(false)
      }
    }
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('')
      setInput(transcript)
    }
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') return
      console.log('Speech error:', event.error)
      stopped = true
      recognitionRef.current = null
      setListening(false)
    }
    recognitionRef.current = recognition
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
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .desktop-sidebar.mobile-open { display: flex !important; position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important; width: 220px !important; z-index: 100 !important; }
          .sidebar-overlay { display: block !important; }
          .mobile-hamburger { display: flex !important; }
          .slide-panel { position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important; width: 100% !important; z-index: 90 !important; }
          .chat-area { padding: 1rem 0.75rem 0.5rem !important; }
          .input-bar { padding: 0.5rem 0.75rem 0.75rem !important; }
          .input-wrapper { max-width: 100% !important; }
          .msg-max-width { max-width: 85% !important; }
          .idle-gif { width: 280px !important; }
          .idle-container { min-height: 300px !important; }
          .idle-title { font-size: 1.2rem !important; }
          .thinking-bots { display: none !important; }
        }
      `}</style>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90 }} />}

      {/* LEFT SIDEBAR */}
      <div className={`desktop-sidebar${sidebarOpen ? ' mobile-open' : ''}`} style={{ width: '200px', background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 100 }}>
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
              onClick={() => { openPanel(item.key); setSidebarOpen(false) }}
              className={`sidebar-btn${activePanel === item.key ? ' active' : ''}`}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s ease', marginBottom: '2px', textAlign: 'left' }}
            >
              <span style={{ fontSize: '1rem', width: '50px', textAlign: 'center', flexShrink: 0 }}>
                {item.image
                  ? <img src={item.image} alt={item.label} style={{ width: '50px', height: '50px', objectFit: 'contain', verticalAlign: 'middle' }} />
                  : item.emoji}
              </span>
              <span style={{ fontSize: '0.82rem', color: activePanel === item.key ? '#e63946' : '#94a3b8', fontWeight: activePanel === item.key ? '600' : '400' }}>{item.label}</span>
              {activePanel === item.key && <div style={{ marginLeft: 'auto', width: '4px', height: '4px', borderRadius: '50%', background: '#e63946', flexShrink: 0 }} />}
            </button>
          ))}
          {(userRole === 'owner' || userRole === 'admin') && (
            <>
              <div style={{ fontSize: '0.6rem', color: '#4a5568', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 0.5rem', marginTop: '0.75rem', marginBottom: '0.5rem' }}>Management</div>
              <button
                onClick={() => { openPanel('Admin'); setSidebarOpen(false) }}
                className={`sidebar-btn${activePanel === 'Admin' ? ' active' : ''}`}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s ease', marginBottom: '2px', textAlign: 'left' }}
              >
                <span style={{ fontSize: '1.2rem', width: '50px', textAlign: 'center', flexShrink: 0 }}>&#9881;</span>
                <span style={{ fontSize: '0.82rem', color: activePanel === 'Admin' ? '#e63946' : '#94a3b8', fontWeight: activePanel === 'Admin' ? '600' : '400' }}>Admin</span>
                {activePanel === 'Admin' && <div style={{ marginLeft: 'auto', width: '4px', height: '4px', borderRadius: '50%', background: '#e63946', flexShrink: 0 }} />}
              </button>
            </>
          )}
        </div>
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {userGroupName && (
            <div style={{ fontSize: '0.6rem', color: '#e63946', marginBottom: '0.3rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {userGroupName}
            </div>
          )}
          {userRole && (
            <div style={{ fontSize: '0.6rem', color: '#4a5568', marginBottom: '0.3rem', textTransform: 'capitalize' }}>
              {userRole}
            </div>
          )}
          <div style={{ fontSize: '0.65rem', color: '#4a5568', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          <button onClick={signOut} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#4a5568', fontSize: '0.72rem', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>

      {/* PANEL */}
      {activePanel && (
        <div className="slide-panel" style={{ width: '300px', background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', flexShrink: 0, animation: 'panelSlide 0.2s ease' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '0.88rem' }}>{activePanel}</div>
              <div style={{ fontSize: '0.7rem', color: '#4a5568', marginTop: '1px' }}>
                {activePanel === 'History' ? `${conversations.length} conversations` : activePanel === 'Admin' ? `${groupMembers.length} members` : `${panelEntries.length} saved entries`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {activePanel === 'History' && messages.length > 0 && (
                <button onClick={saveToHistory} disabled={savingHistory} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(230,57,70,0.3)', background: 'rgba(230,57,70,0.1)', color: '#e63946', fontSize: '0.72rem', cursor: 'pointer' }}>
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
                    <div style={{ color: '#4a5568', fontSize: '0.72rem', marginTop: '0.4rem', opacity: 0.7 }}>Conversations auto-save after each response.</div>
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

            {activePanel === 'Admin' && (
              <div>
                {/* Create group (if no group yet) */}
                {!userGroupId && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: '500' }}>Create a Group</div>
                    <input
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      placeholder="Group / Institution name"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.82rem', outline: 'none', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                    />
                    <button onClick={createGroup} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.82rem', fontWeight: '500', cursor: 'pointer' }}>Create Group</button>
                  </div>
                )}

                {/* Group info + invite (if group exists) */}
                {userGroupId && (
                  <>
                    <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: '600', color: '#ffffff', marginBottom: '0.2rem' }}>{userGroupName}</div>
                      <div style={{ fontSize: '0.7rem', color: '#4a5568', textTransform: 'capitalize' }}>Your role: {userRole}</div>
                    </div>

                    {/* Invite form — owners and admins only */}
                    {(userRole === 'owner' || userRole === 'admin') && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Invite Member</div>
                        <input
                          value={inviteEmail}
                          onChange={e => setInviteEmail(e.target.value)}
                          placeholder="Email address"
                          style={{ width: '100%', padding: '0.55rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.82rem', outline: 'none', marginBottom: '0.4rem', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                          {['worker', ...(userRole === 'owner' ? ['admin'] : [])].map(r => (
                            <button key={r} onClick={() => setInviteRole(r)} style={{ padding: '0.3rem 0.7rem', borderRadius: '16px', border: `1px solid ${inviteRole === r ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: inviteRole === r ? '#e63946' : 'transparent', color: inviteRole === r ? '#ffffff' : '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', textTransform: 'capitalize' }}>{r}</button>
                          ))}
                        </div>
                        <button onClick={inviteMember} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.82rem', fontWeight: '500', cursor: 'pointer' }}>Send Invite</button>
                        {inviteError && <div style={{ color: '#e63946', fontSize: '0.72rem', marginTop: '0.4rem' }}>{inviteError}</div>}
                        {inviteSuccess && <div style={{ color: '#22c55e', fontSize: '0.72rem', marginTop: '0.4rem' }}>{inviteSuccess}</div>}
                      </div>
                    )}

                    {/* Members list */}
                    <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Members</div>
                    {groupMembers.map((member) => (
                      <div key={member.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '500' }}>{member.email || 'Unknown'}</div>
                          <div style={{ fontSize: '0.68rem', color: member.role === 'owner' ? '#e63946' : member.role === 'admin' ? '#3b82f6' : '#4a5568', textTransform: 'capitalize', marginTop: '2px' }}>{member.role}</div>
                        </div>
                        {userRole === 'owner' && member.role !== 'owner' && (
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <select
                              value={member.role}
                              onChange={e => changeRole(member.email, e.target.value)}
                              style={{ padding: '0.2rem 0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: '#0d1117', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer' }}
                            >
                              <option value="worker">Worker</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => removeMember(member.email)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, padding: '2px' }}>&#10005;</button>
                          </div>
                        )}
                        {userRole === 'admin' && member.role === 'worker' && (
                          <button onClick={() => removeMember(member.email)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, padding: '2px' }}>&#10005;</button>
                        )}
                      </div>
                    ))}
                    {groupMembers.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.8rem', marginTop: '1rem' }}>No members yet. Invite someone above.</div>
                    )}
                  </>
                )}
              </div>
            )}

            {activePanel !== 'History' && activePanel !== 'Admin' && !panelLoading && (
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
        {/* MOBILE HAMBURGER */}
        <button className="mobile-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: 'none', position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 50, width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '1.1rem' }}>☰</button>

        {loading && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ position: 'absolute', bottom: '80px', left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, #e63946, transparent)', animation: 'pulseBar 1.2s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#e63946', fontSize: '0.75rem', fontWeight: '500', letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.6, animation: 'fadeInOut 1.5s ease-in-out infinite' }}>searching knowledge base</div>
            <img className="thinking-bots" src="/COR-Bot.PNG" alt="COR" style={{ position: 'absolute', top: '42%', width: '120px', height: '120px', objectFit: 'contain', animation: 'runAcross 10s linear infinite', filter: 'drop-shadow(0 0 8px #e63946)' }} />
            <img className="thinking-bots" src="/COR-Tank.PNG" alt="COR-T" style={{ position: 'absolute', bottom: '100px', width: '140px', height: '140px', objectFit: 'contain', animation: 'runAcross 14s linear infinite 2s', filter: 'drop-shadow(0 0 8px #3b82f6)' }} />
            <img className="thinking-bots" src="/COR-Hovering-GIF.gif" alt="COR-H" style={{ position: 'absolute', top: '12%', width: '110px', height: '110px', objectFit: 'contain', animation: 'flyAcross 8s linear infinite 1s', mixBlendMode: 'screen' as any, filter: 'drop-shadow(0 0 12px #22c55e)' }} />
          </div>
        )}

        <div className="chat-area" style={{ flex: 1, overflowY: 'auto', padding: '2rem 2rem 1rem' }}>
          {messages.length === 0 && (
            <div className="idle-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', height: '100%', minHeight: '400px' }}>
              <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
                <div className="idle-title" style={{ fontSize: '1.5rem', fontWeight: '300', color: '#e2e8f0', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>Hello, I am <span style={{ color: '#e63946', fontWeight: '700' }}>COR</span></div>
                <div style={{ fontSize: '0.88rem', color: '#4a5568', lineHeight: '1.6' }}>Your cardiovascular perfusion assistant.<br/>Ask me anything about CPB, ECMO, or perfusion guidelines.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '1rem' }}>
                <img className="idle-gif" src="/CORx3Dance.gif" alt="COR dancing" style={{ width: '500px', height: 'auto', objectFit: 'contain' }} />
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="msg-bubble" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '0.75rem' }}>
              {m.role === 'assistant' && <img src="/COR-1.PNG" alt="COR" style={{ width: '26px', height: '26px', objectFit: 'contain', marginRight: '8px', flexShrink: 0, marginTop: '4px' }} />}
              <div className="msg-max-width" style={{ maxWidth: '68%', padding: '0.7rem 1rem', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.role === 'user' ? '#e63946' : 'rgba(255,255,255,0.05)', border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.88rem', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>
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

        <div className="input-bar" style={{ padding: '0.75rem 1.5rem 1.25rem', background: '#080b12', flexShrink: 0 }}>
          {attachedImage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', width: 'fit-content' }}>
              <img src={attachedImage} alt="attachment" style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px' }} />
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{attachedImageName}</span>
              <button onClick={() => { setAttachedImage(null); setAttachedImageName('') }} style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>✕</button>
            </div>
          )}
          <div className="input-wrapper" style={{ display: 'flex', gap: '0.6rem', maxWidth: '780px', margin: '0 auto', alignItems: 'center' }}>
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
                {listening ? <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: 'white' }} /> : <img src="/Microphone.icon.png" alt="mic" style={{ width: '32px', height: '32px', objectFit: 'contain', opacity: 0.5 }} />}
              </button>
            </div>
            <button onClick={sendMessage} disabled={loading} style={{ width: '38px', height: '38px', borderRadius: '50%', background: loading ? 'rgba(255,255,255,0.06)' : '#e63946', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.9rem' }}>➤</button>
          </div>
        </div>
      </div>
    </div>  
  )
}
