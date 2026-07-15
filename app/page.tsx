'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from './lib/supabase'
import CorThinking from './CorThinking'

const CATEGORIES = ['Protocol', 'Case Notes', 'Equipment', 'Policy', 'Logbook', 'Checklists', 'Charting']
const SUPER_OWNER_EMAIL = 'cliftonmarschel@gmail.com'

// Known clinical sources → their official site, so citation chips are clickable.
const SOURCE_LINKS: { [k: string]: string } = {
  'amsect': 'https://www.amsect.org',
  'elso': 'https://www.elso.org',
  'society of thoracic surgeons': 'https://www.sts.org',
  'sts': 'https://www.sts.org',
  'scahq': 'https://www.scahq.org',
  'sca': 'https://www.scahq.org',
  'general perfusion practice': 'https://www.amsect.org/p/cm/ld/fid=1730',
  'general practice': 'https://www.amsect.org/p/cm/ld/fid=1730',
}
function sourceUrl(name: string): string | null {
  const n = name.toLowerCase()
  for (const key in SOURCE_LINKS) if (n.includes(key)) return SOURCE_LINKS[key]
  return null
}
// Pull a trailing "SOURCES: a | b | c" line out of a COR answer → clean text + chips.
function parseSources(content: string): { text: string; sources: string[] } {
  if (!content) return { text: content, sources: [] }
  const idx = content.search(/(^|\n)\s*SOURCES:/i)
  if (idx === -1) return { text: content, sources: [] }
  const before = content.slice(0, idx).trimEnd()
  const after = content.slice(idx).replace(/^\s*\n?/, '')
  const lines = after.split('\n')
  const sources = lines[0].replace(/^\s*SOURCES:\s*/i, '').split('|').map(s => s.trim()).filter(Boolean)
  const rest = lines.slice(1).join('\n').trim()
  return { text: (before + (rest ? '\n' + rest : '')).trim(), sources }
}

// Inline **bold** → styled <strong>.
function renderInline(s: string, keyBase: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={keyBase + i} style={{ color: '#f8fafc', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : <span key={keyBase + i}>{p}</span>
  )
}
// Render a COR answer with light structure: **bold**, bullets, numbered items, and spacing.
function renderRich(text: string) {
  const lines = (text || '').split('\n')
  const out: any[] = []
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t === '') { out.push(<div key={'sp' + i} style={{ height: '0.45rem' }} />); return }
    const bullet = t.match(/^[-•]\s+(.*)$/)
    if (bullet) {
      out.push(
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.28rem', lineHeight: 1.55 }}>
          <span style={{ color: '#e63946', flexShrink: 0, marginTop: '0.05rem' }}>•</span>
          <span>{renderInline(bullet[1], i + '-')}</span>
        </div>
      )
      return
    }
    const numbered = t.match(/^(\d+)\.\s+(.*)$/)
    if (numbered) {
      out.push(
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.28rem', lineHeight: 1.55 }}>
          <span style={{ color: '#e63946', flexShrink: 0, fontWeight: 600, fontSize: '0.82rem' }}>{numbered[1]}.</span>
          <span>{renderInline(numbered[2], i + '-')}</span>
        </div>
      )
      return
    }
    out.push(<div key={i} style={{ marginBottom: '0.35rem', lineHeight: 1.6 }}>{renderInline(t, i + '-')}</div>)
  })
  return out
}

// Format any date string as MM/DD/YYYY (e.g. 06/15/2026). Handles yyyy-mm-dd without timezone drift.
function fmtMDY(s: string): string {
  if (!s) return ''
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[2]}/${m[3]}/${m[1]}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

// Grouped, collapsible sidebar navigation. access: tier1 (everyone) | full (hospital users) |
// owneradmin (owner/admin) | super (platform owner). redirect items leave to another page.
const NAV_GROUPS = [
  { id: 'knowledge', label: 'Knowledge', icon: '\u{1F4DA}', items: [
    { key: 'Protocol', label: 'Protocols', img: '/Protocol.Icon.png', access: 'full', badge: 'unread' },
    { key: 'Policy', label: 'Policy', img: '/Policy.Icon.png', access: 'full', badge: 'unread' },
    { key: 'Checklists', label: 'Checklists', img: '/Checkmark.Icon.png', access: 'full', badge: 'unread' },
    { key: 'GlobalLib', label: 'Global Library', emoji: '\u{1F310}', access: 'super' },
  ] },
  { id: 'mywork', label: 'My Work', icon: '\u{1F5C2}️', items: [
    { key: 'Logbook', label: 'Logbook', img: '/Logbook.icon.png', access: 'tier1' },
    { key: 'Notes', label: 'Notes', img: '/CaseNotes.Icon.png', access: 'tier1' },
    { key: 'History', label: 'History', img: '/History.Icon.png', access: 'tier1' },
  ] },
  { id: 'operations', label: 'Operations', icon: '\u{1FA7A}', items: [
    { key: 'Equipment', label: 'Equipment', img: '/Equipment.Icon.png', access: 'full', badge: 'equipment' },
    { key: 'Charting', label: 'Charting', img: '/Chart.Icon.png', access: 'full', redirect: '/chart' },
    { key: 'Schedule', label: 'Schedule', img: '/Schedule.Icon.png', access: 'full', redirect: '/schedule' },
  ] },
  { id: 'setup', label: 'Setup', icon: '\u{1F6E0}️', items: [
    { key: 'Admin', label: 'Admin', emoji: '⚙️', access: 'owneradmin' },
    { key: 'Templates', label: 'Templates', emoji: '\u{1F4CB}', access: 'owneradmin' },
    { key: 'Users', label: 'Users', emoji: '\u{1F465}', access: 'super' },
    { key: 'Reports', label: 'Reports', emoji: '⚠️', access: 'super', badge: 'reports' },
    { key: 'Brain', label: 'COR Brain', emoji: '\u{1F9E0}', access: 'super' },
  ] },
] as const
const GROUP_OF: Record<string, string> = (() => { const m: Record<string, string> = {}; for (const g of NAV_GROUPS) for (const it of g.items) m[it.key] = g.id; return m })()

// Rotating, perfusion-themed prompts shown in the empty chat input box.
const COR_PLACEHOLDERS = [
  'Pump us for info...',
  "What's pumping through your mind?",
  'Prime your question here...',
  "Don't bypass us — ask away...",
  'Cannulate your curiosity here...',
  "Ask COR — we won't clamp down...",
  'Let your questions flow...',
  'Keep the conversation circulating...',
  "Got a Q? We'll keep it flowing.",
  'Get to the heart of it...',
  "Whatever's on your heart...",
  'Ask COR — straight from the heart...',
  "Spill it — we'll circulate an answer",
  'No question too clotted...',
  'Perfuse us with your questions...',
  "Ask away — we've got the flow",
]

export default function Home() {
  const [messages, setMessages] = useState<{role: string, content: string, image?: string}[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [deleteUserTarget, setDeleteUserTarget] = useState<any>(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const [savePreview, setSavePreview] = useState(false)
  const [pendingSummary, setPendingSummary] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [notifPermission, setNotifPermission] = useState<string>('default')
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [nameInput, setNameInput] = useState('')
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
  const [hospitalSwitcherOpen, setHospitalSwitcherOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['knowledge', 'mywork']))
  const [allGroups, setAllGroups] = useState<any[]>([])
  const [groupMembers, setGroupMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('worker')
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [groupName, setGroupName] = useState('')
  const [notifications, setNotifications] = useState<any[]>([])
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; confirmLabel?: string; onConfirm: () => void } | null>(null)
  // Teach / report / reports-review
  const [teachModal, setTeachModal] = useState(false)
  const [teachText, setTeachText] = useState('')
  const [teachSaving, setTeachSaving] = useState(false)
  const [teachStatus, setTeachStatus] = useState('')
  const [reportModal, setReportModal] = useState<{ question: string; answer: string } | null>(null)
  const [reportWrong, setReportWrong] = useState('')
  const [reportAnswer, setReportAnswer] = useState('')
  const [reportSending, setReportSending] = useState(false)
  const [reportStatus, setReportStatus] = useState('')
  const [reportSuggestions, setReportSuggestions] = useState<string[]>([])
  const [reportSuggLoading, setReportSuggLoading] = useState(false)
  const [reports, setReports] = useState<any[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportEdits, setReportEdits] = useState<{ [id: number]: string }>({})
  // COR Brain — global taught knowledge management
  const [globalRules, setGlobalRules] = useState<any[]>([])
  const [globalRulesLoading, setGlobalRulesLoading] = useState(false)
  // Global Library — platform-wide reference docs (IFUs) uploaded by the owner for everyone
  const [globalDocs, setGlobalDocs] = useState<any[]>([])
  const [globalLibLoading, setGlobalLibLoading] = useState(false)
  const [globalUploading, setGlobalUploading] = useState(false)
  // Control Center — one-page view of what's feeding COR, per company or individual
  const [ccMode, setCcMode] = useState<'company' | 'individual'>('company')
  const [ccGroupId, setCcGroupId] = useState<string>('')
  const [ccUserId, setCcUserId] = useState<string>('')
  const [ccData, setCcData] = useState<any>(null)
  const [ccMembers, setCcMembers] = useState<any[]>([])
  const [ccLoading, setCcLoading] = useState(false)
  const [answerTemplates, setAnswerTemplates] = useState<any[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateForm, setTemplateForm] = useState<{ id?: number; topic: string; format: string } | null>(null)
  const [brainFolder, setBrainFolder] = useState('')
  const [brainNewFolder, setBrainNewFolder] = useState('')
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [editRuleText, setEditRuleText] = useState('')
  const [editRuleFolder, setEditRuleFolder] = useState('')
  const [addingRule, setAddingRule] = useState(false)
  // Logbook export (ABCP vs personal) + reusable workplace profiles
  const [exportModal, setExportModal] = useState<null | 'choice' | 'abcp'>(null)
  const [workplaces, setWorkplaces] = useState<any[]>([])
  const [selectedWp, setSelectedWp] = useState('')
  const [wpForm, setWpForm] = useState<any>(null) // non-null = adding/editing a workplace
  const [unreadCounts, setUnreadCounts] = useState<{[key: string]: number}>({})
  const [uploading, setUploading] = useState(false)
  const [manualEntry, setManualEntry] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())
  const [addingNote, setAddingNote] = useState<{[id: number]: string}>({})
  const [checklistFiles, setChecklistFiles] = useState<any[]>([])
  const [checklistUploading, setChecklistUploading] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [inventoryAdding, setInventoryAdding] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [identifyingItem, setIdentifyingItem] = useState(false)
  const [caseEquipMap, setCaseEquipMap] = useState<{[caseType: string]: {itemName: string, quantity: number}[]}>({})
  const [caseTypes] = useState(['AVR', 'MVR', 'CABG', 'Type-A', 'Peds'])
  const [editingCaseType, setEditingCaseType] = useState<string | null>(null)
  const [newEquipItem, setNewEquipItem] = useState('')
  const [newEquipQty, setNewEquipQty] = useState('1')
  const [caseLogExtraMode, setCaseLogExtraMode] = useState(false)
  const [caseLogExtraItems, setCaseLogExtraItems] = useState<{itemName: string, quantity: number}[]>([])
  const [caseLogging, setCaseLogging] = useState(false)
  const [caseLogData, setCaseLogData] = useState<{[key: string]: string}>({})
  const [caseLogMissing, setCaseLogMissing] = useState<string[]>([])
  const [caseLogCurrentField, setCaseLogCurrentField] = useState(0)
  // Conversational case-intake: review card before saving.
  const [caseLogReview, setCaseLogReview] = useState(false)
  const [caseLogDate, setCaseLogDate] = useState('')
  const [caseLogNote, setCaseLogNote] = useState('')
  const [savingCaseIntake, setSavingCaseIntake] = useState(false)
  const [logbookFields, setLogbookFields] = useState<string[]>([])
  const [caseNotesFields, setCaseNotesFields] = useState<string[]>([])
  const [caseForm, setCaseForm] = useState<{[k: string]: string}>({})
  const [caseDate, setCaseDate] = useState('')
  const [caseFolder, setCaseFolder] = useState('')
  const [caseFolderOpen, setCaseFolderOpen] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set())
  const [viewingDoc, setViewingDoc] = useState<{ name: string; content: string; loading: boolean; error?: string; fileUrl?: string | null } | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [draggingCaseId, setDraggingCaseId] = useState<number | null>(null)
  const [caseNote, setCaseNote] = useState('')
  const [notesList, setNotesList] = useState<any[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [openNoteId, setOpenNoteId] = useState<number | 'new' | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteFolder, setNoteFolder] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [currentFolder, setCurrentFolder] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFields, setEditingFields] = useState(false)
  const [newFieldInput, setNewFieldInput] = useState('')
  const [savingCase, setSavingCase] = useState(false)
  const [newLogbookField, setNewLogbookField] = useState('')
  const [newCaseNotesField, setNewCaseNotesField] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const inputBeforeRecordRef = useRef('')
  const liveRecognitionRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const userRef = useRef<any>(null)
  const activePanelRef = useRef<string | null>(null)
  const currentConvIdRef = useRef<number | null>(null)

  // Keep refs in sync
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { activePanelRef.current = activePanel }, [activePanel])
  useEffect(() => { if (user?.id) fetchWorkplaces() }, [user])
  useEffect(() => { setCaseFolder(currentFolder) }, [currentFolder]) // default the case form to the folder you're viewing

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

  // Fetch profile when user is set
  useEffect(() => {
    if (!user) return
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/profile?userId=${user.id}`)
        const data = await res.json()
        if (data.profile?.display_name) {
          setDisplayName(data.profile.display_name)
        } else {
          setShowNamePrompt(true)
        }
      } catch { setShowNamePrompt(true) }
    }
    fetchProfile()
  }, [user])

  async function saveDisplayName() {
    if (!nameInput.trim() || !user) return
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, email: user.email, displayName: nameInput.trim() })
    })
    setDisplayName(nameInput.trim())
    setShowNamePrompt(false)
  }

  // Show the medical/legal + data-sharing consent once per device until acknowledged.
  // Bump this key whenever the consent text materially changes so everyone re-consents once.
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('corConsent_v2')) {
      setShowDisclaimer(true)
    }
  }, [])

  // Rotate the chat input placeholder through COR_PLACEHOLDERS every 5s.
  useEffect(() => {
    setPlaceholderIndex(Math.floor(Math.random() * COR_PLACEHOLDERS.length))
    const id = setInterval(() => {
      setPlaceholderIndex(i => (i + 1) % COR_PLACEHOLDERS.length)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Fetch group membership when user is set
  useEffect(() => {
    if (!user) return
    async function fetchGroup() {
      try {
        const res = await fetch(`/api/groups?userId=${user.id}&email=${encodeURIComponent(user.email)}`)
        const data = await res.json()
        if (data.memberships && data.memberships.length > 0) {
          setAllGroups(data.memberships)
          const m = data.memberships[0]
          setUserRole(m.role)
          setUserGroupId(m.group_id)
          setUserGroupName(m.group?.name || null)
        }
      } catch { /* no group yet */ }
    }
    fetchGroup()
  }, [user])

  // Load logbook/case-note fields: personal (localStorage) override > group template > defaults.
  useEffect(() => {
    const lb = typeof window !== 'undefined' ? localStorage.getItem('cor_logbook_fields') : null
    const cn = typeof window !== 'undefined' ? localStorage.getItem('cor_casenotes_fields') : null
    let personalLb = false, personalCn = false
    try { if (lb) { setLogbookFields(JSON.parse(lb)); personalLb = true } } catch {}
    try { if (cn) { setCaseNotesFields(JSON.parse(cn)); personalCn = true } } catch {}
    if (personalLb && personalCn) return
    async function fetchTemplate() {
      try {
        const res = await fetch(`/api/templates${userGroupId ? `?groupId=${userGroupId}` : ''}`)
        const data = await res.json()
        if (!personalLb) setLogbookFields(data.logbookFields || [])
        if (!personalCn) setCaseNotesFields(data.caseNotesFields || [])
      } catch { /* use defaults */ }
    }
    fetchTemplate()
  }, [userGroupId])

  // Group-only: case equipment mapping.
  useEffect(() => {
    if (!userGroupId) return
    async function fetchCaseEquipment() {
      try {
        const res = await fetch(`/api/case-equipment?groupId=${userGroupId}`)
        const data = await res.json()
        const map: {[k: string]: {itemName: string, quantity: number}[]} = {}
        for (const m of (data.mappings || [])) {
          map[m.case_type] = m.items || []
        }
        setCaseEquipMap(map)
      } catch {}
    }
    fetchCaseEquipment()
  }, [userGroupId])

  // Fetch notifications and poll every 30 seconds
  useEffect(() => {
    if (!user) return
    async function fetchNotifications() {
      try {
        const res = await fetch(`/api/notifications?userId=${user.id}`)
        const data = await res.json()
        const notifs = data.notifications || []
        setNotifications(notifs)
        const counts: {[key: string]: number} = {}
        notifs.filter((n: any) => !n.read).forEach((n: any) => {
          counts[n.category] = (counts[n.category] || 0) + 1
        })
        setUnreadCounts(counts)
      } catch { /* ignore */ }
    }
    fetchNotifications()
    if (user.email === SUPER_OWNER_EMAIL) fetchReports()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [user])

  async function markNotificationsRead(category: string) {
    if (!user || !unreadCounts[category]) return
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, category })
      })
      setUnreadCounts(prev => ({ ...prev, [category]: 0 }))
      setNotifications(prev => prev.map(n => n.category === category ? { ...n, read: true } : n))
    } catch { /* ignore */ }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => setNotifPermission(p))
      }
    }
  }, [])

  function notifyCORDone(preview?: string) {
    // Play a chime sound using Web Audio API
    try {
      const ctx = new AudioContext()
      // First tone
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, ctx.currentTime)
      gain1.gain.setValueAtTime(0.15, ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(ctx.currentTime)
      osc1.stop(ctx.currentTime + 0.3)
      // Second tone (higher, slight delay)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1174, ctx.currentTime + 0.15)
      gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.15)
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(ctx.currentTime + 0.15)
      osc2.stop(ctx.currentTime + 0.5)
    } catch { /* audio not available */ }

    // Browser notification (if tab not focused)
    if (document.hidden && notifPermission === 'granted') {
      try {
        new Notification('COR has responded', {
          body: preview ? preview.slice(0, 100) + (preview.length > 100 ? '...' : '') : 'Your answer is ready.',
          icon: '/COR-1.PNG',
        })
      } catch { /* notification not available */ }
    }
  }

  if (authLoading) return null

  async function autoSaveHistory(currentMessages: {role: string, content: string, image?: string}[]) {
    const currentUser = userRef.current
    if (!currentUser?.id || currentMessages.length < 2) return
    const firstUserMsg = currentMessages.find(m => m.role === 'user')
    const title = firstUserMsg?.content?.slice(0, 60) || 'Conversation'
    try {
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, title, messages: currentMessages, id: currentConvIdRef.current })
      })
      const data = await res.json()
      if (data.error) console.error('Auto-save error:', data.error)
      // Remember this chat's id so later messages update the same entry (one chat = one entry).
      if (data.conversation?.id) currentConvIdRef.current = data.conversation.id
      if (activePanelRef.current === 'History') {
        await fetchHistory()
      }
    } catch (err) {
      console.error('Auto-save failed:', err)
    }
  }

  function switchGroup(membership: any) {
    setUserRole(membership.role)
    setUserGroupId(membership.group_id)
    setUserGroupName(membership.group?.name || null)
    setGroupMembers([])
    setInviteError('')
    setInviteSuccess('')
    fetchGroupMembersFor(membership.group_id)
  }

  async function fetchGroupMembersFor(gId: string) {
    try {
      const res = await fetch(`/api/groups/members?groupId=${gId}`)
      const data = await res.json()
      setGroupMembers(data.members || [])
    } catch { setGroupMembers([]) }
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
    if (user.email !== SUPER_OWNER_EMAIL) {
      setInviteError('Only the platform owner can create groups.')
      return
    }
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email, name: groupName.trim() })
      })
      const data = await res.json()
      if (data.error) {
        setInviteError(data.error)
        return
      }
      if (data.group) {
        setUserRole('owner')
        setUserGroupId(data.group.id)
        setUserGroupName(data.group.name)
        setGroupName('')
        setInviteError('')
        // Refresh groups list
        const gRes = await fetch(`/api/groups?userId=${user.id}&email=${encodeURIComponent(user.email)}`)
        const gData = await gRes.json()
        if (gData.memberships) setAllGroups(gData.memberships)
      }
    } catch { setInviteError('Failed to create group. Check Supabase tables.') }
  }

  async function inviteMember() {
    if (!inviteEmail.trim() || !userGroupId || !user) return
    setInviteError('')
    setInviteSuccess('')
    try {
      const res = await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, groupId: userGroupId, action: 'invite', targetEmail: inviteEmail.trim(), newRole: inviteRole, userEmail: user.email })
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
        body: JSON.stringify({ userId: user.id, groupId: userGroupId, targetEmail: email, userEmail: user.email })
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
        body: JSON.stringify({ userId: user.id, groupId: userGroupId, action: 'change_role', targetEmail: email, newRole, userEmail: user.email })
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
    if (category === 'Checklists') {
      await fetchChecklists()
      return
    }
    if (category === 'Equipment') {
      await fetchInventory()
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

  async function fetchChecklists() {
    if (!userGroupId) return
    setPanelLoading(true)
    try {
      const res = await fetch(`/api/checklists?groupId=${userGroupId}`)
      const data = await res.json()
      setChecklistFiles(data.files || [])
    } catch { setChecklistFiles([]) }
    setPanelLoading(false)
  }

  async function uploadChecklist(file: File) {
    if (!userGroupId || !user) return
    setChecklistUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('groupId', userGroupId)
    formData.append('userId', user.id)
    formData.append('userEmail', user.email)
    formData.append('userRole', userRole || '')
    formData.append('folder', currentFolder || '')
    try {
      const res = await fetch('/api/checklists', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) fetchChecklists()
      else alert(data.error || 'Could not upload checklist. Please try again.')
    } catch {
      alert('Could not upload checklist. Please check your connection and try again.')
    }
    setChecklistUploading(false)
  }

  async function createChecklistFolder() {
    if (!userGroupId || !user) return
    const name = newFolderName.trim().replace(/\//g, '-') // slashes are path separators
    if (!name) return
    const path = currentFolder ? `${currentFolder}/${name}` : name
    try {
      const res = await fetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createFolder', folder: path, groupId: userGroupId, userId: user.id, userEmail: user.email, userRole })
      })
      const data = await res.json()
      if (data.success) { setNewFolderName(''); fetchChecklists() }
      else alert(data.error || 'Could not create folder.')
    } catch { alert('Could not create folder.') }
  }

  async function deleteChecklistFolder(path: string) {
    if (!userGroupId) return
    if (!confirm(`Delete the folder "${path.split('/').pop()}" and everything inside it?`)) return
    try {
      await fetch('/api/checklists', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteFolder', folder: path, groupId: userGroupId, userRole })
      })
      if (currentFolder === path || currentFolder.startsWith(path + '/')) {
        const parent = path.split('/').slice(0, -1).join('/')
        setCurrentFolder(parent)
      }
      fetchChecklists()
    } catch {}
  }

  async function deleteChecklist(id: number) {
    try {
      await fetch('/api/checklists', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userRole })
      })
      setChecklistFiles(prev => prev.filter(f => f.id !== id))
    } catch {}
  }

  async function fetchInventory() {
    if (!userGroupId) return
    setPanelLoading(true)
    try {
      const res = await fetch(`/api/inventory?groupId=${userGroupId}`)
      const data = await res.json()
      setInventoryItems(data.items || [])
    } catch { setInventoryItems([]) }
    setPanelLoading(false)
  }

  async function addInventoryItem() {
    if (!newItemName.trim() || !userGroupId || !user) return
    setInventoryAdding(true)
    try {
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: userGroupId, itemName: newItemName.trim(), quantity: parseInt(newItemQty) || 0, userId: user.id, userRole })
      })
      setNewItemName('')
      setNewItemQty('')
      fetchInventory()
    } catch {}
    setInventoryAdding(false)
  }

  async function updateItemQuantity(id: number, quantity: number) {
    if (!user) return
    await fetch('/api/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, quantity, userId: user.id })
    })
    setInventoryItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i))
  }

  async function deleteInventoryItem(id: number) {
    await fetch('/api/inventory', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, userRole })
    })
    setInventoryItems(prev => prev.filter(i => i.id !== id))
  }

  async function identifyFromPhoto(file: File) {
    setIdentifyingItem(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/inventory/identify', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.itemName) setNewItemName(data.itemName)
    } catch {}
    setIdentifyingItem(false)
  }

  function addEquipToCase(caseType: string) {
    if (!newEquipItem.trim()) return
    const current = caseEquipMap[caseType] || []
    const updated = [...current, { itemName: newEquipItem.trim(), quantity: parseInt(newEquipQty) || 1 }]
    setCaseEquipMap(prev => ({ ...prev, [caseType]: updated }))
    setNewEquipItem('')
    setNewEquipQty('1')
    saveCaseEquipment(caseType, updated)
  }

  function removeEquipFromCase(caseType: string, idx: number) {
    const current = caseEquipMap[caseType] || []
    const updated = current.filter((_: any, i: number) => i !== idx)
    setCaseEquipMap(prev => ({ ...prev, [caseType]: updated }))
    saveCaseEquipment(caseType, updated)
  }

  async function saveCaseEquipment(caseType: string, items: {itemName: string, quantity: number}[]) {
    if (!userGroupId || !user) return
    await fetch('/api/case-equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: userGroupId, caseType, items, userId: user.id, userRole })
    }).catch(() => {})
  }

  async function deductEquipmentForCase(caseType: string) {
    const items = caseEquipMap[caseType] || []
    if (items.length === 0 || !userGroupId) return
    for (const item of items) {
      // Find matching inventory item and reduce quantity
      const match = inventoryItems.find((inv: any) => inv.item_name.toLowerCase() === item.itemName.toLowerCase())
      if (match) {
        const newQty = Math.max(0, (match.quantity || 0) - item.quantity)
        await fetch('/api/inventory', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: match.id, quantity: newQty, userId: user?.id })
        })
      }
    }
    // Refresh inventory
    fetchInventory()
  }

  async function deductExtraItems(extras: {itemName: string, quantity: number}[]) {
    if (!userGroupId) return
    for (const item of extras) {
      const match = inventoryItems.find((inv: any) => inv.item_name.toLowerCase() === item.itemName.toLowerCase())
      if (match) {
        const newQty = Math.max(0, (match.quantity || 0) - item.quantity)
        await fetch('/api/inventory', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: match.id, quantity: newQty, userId: user?.id })
        })
      }
    }
    fetchInventory()
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

  // Styled in-app confirmation (replaces the browser's native confirm popup).
  function askConfirm(message: string, onConfirm: () => void, confirmLabel?: string) {
    setConfirmDialog({ message, confirmLabel, onConfirm })
  }

  // Quickly clear all unpinned conversations (pinned ones are kept).
  function clearUnpinnedConversations() {
    const toDelete = conversations.filter(c => !c.pinned)
    if (toDelete.length === 0) return
    askConfirm(`Clear ${toDelete.length} unpinned conversation${toDelete.length > 1 ? 's' : ''}? Pinned ones stay.`, async () => {
      setConversations(prev => prev.filter(c => c.pinned))
      for (const c of toDelete) {
        try { await fetch('/api/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) }) } catch {}
      }
    }, 'Clear')
  }

  function loadConversation(conv: any) {
    setMessages(conv.messages || [])
    currentConvIdRef.current = conv.id   // keep adding to this same entry
    setActivePanel(null)
  }

  function startNewChat() {
    setMessages([])
    currentConvIdRef.current = null   // next message starts a fresh entry
    setActivePanel(null)
  }

  // ── Teach COR (save a rule at personal / company / global scope) ──
  // Open the exact source document COR cited and show its full text.
  async function openDocument(name: string) {
    setViewingDoc({ name, content: '', loading: true })
    try {
      const res = await fetch(`/api/document?name=${encodeURIComponent(name)}&groupId=${userGroupId || ''}&userId=${user?.id || ''}`)
      const data = await res.json()
      if (!res.ok || data.error) { setViewingDoc({ name, content: '', loading: false, error: data.error || 'Could not open this document.' }); return }
      // Collapse the excessive blank lines that text extraction adds between every line.
      const clean = (data.content || '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
      setViewingDoc({ name, content: clean || '(empty document)', fileUrl: data.fileUrl || null, loading: false })
    } catch { setViewingDoc({ name, content: '', loading: false, error: 'Could not open this document.' }) }
  }

  function openTeachModal() {
    setTeachText(input.trim())
    setTeachStatus('')
    setTeachModal(true)
  }
  async function saveTeaching(scope: 'personal' | 'company' | 'global') {
    if (!teachText.trim() || !user) return
    setTeachSaving(true); setTeachStatus('')
    try {
      const res = await fetch('/api/teach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, text: teachText.trim(), userId: user.id, userEmail: user.email, groupId: userGroupId, userRole })
      })
      const data = await res.json()
      if (!res.ok || data.error) { setTeachStatus(data.error || 'Could not save'); }
      else {
        setTeachStatus(`Saved to ${data.savedTo}. COR will use it.`)
        setTeachText(''); setInput('')
        setTimeout(() => setTeachModal(false), 1200)
      }
    } catch { setTeachStatus('Could not save — try again') }
    setTeachSaving(false)
  }

  // ── Report a wrong COR answer (goes to the platform owner) ──
  function openReportModal(answerIndex: number) {
    const answer = messages[answerIndex]?.content || ''
    let question = ''
    for (let i = answerIndex - 1; i >= 0; i--) { if (messages[i].role === 'user') { question = messages[i].content; break } }
    setReportModal({ question, answer })
    setReportWrong(''); setReportAnswer(''); setReportStatus('')
    // Ask COR to self-check this answer so the user can tap-to-fill what's wrong.
    setReportSuggestions([]); setReportSuggLoading(true)
    fetch('/api/critique', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, answer }) })
      .then(r => r.json())
      .then(d => setReportSuggestions(d.suggestions || []))
      .catch(() => setReportSuggestions([]))
      .finally(() => setReportSuggLoading(false))
  }
  function useReportSuggestion(s: string) {
    setReportWrong(prev => prev.trim() ? `${prev.trim()}\n${s}` : s)
  }
  async function submitReport() {
    if (!reportModal || (!reportWrong.trim() && !reportAnswer.trim())) return
    setReportSending(true); setReportStatus('')
    try {
      const res = await fetch('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, userEmail: user?.email, groupId: userGroupId, question: reportModal.question, corAnswer: reportModal.answer, whatsWrong: reportWrong.trim(), suggestedAnswer: reportAnswer.trim() })
      })
      const data = await res.json()
      if (!res.ok || data.error) { setReportStatus(data.error || 'Could not send'); }
      else { setReportStatus('Sent — thank you!'); setTimeout(() => setReportModal(null), 1100) }
    } catch { setReportStatus('Could not send — try again') }
    setReportSending(false)
  }

  // ── Owner-only: review reports ──
  async function fetchReports() {
    if (user?.email !== SUPER_OWNER_EMAIL) return
    setReportsLoading(true)
    try {
      const res = await fetch(`/api/reports?status=open&email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      setReports(data.reports || [])
    } catch { setReports([]) }
    setReportsLoading(false)
  }
  async function teachGloballyFromReport(r: any) {
    const text = (reportEdits[r.id] ?? (r.suggested_answer || r.whats_wrong) ?? '').trim()
    if (!text || !user) return
    try {
      await fetch('/api/teach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'global', text, userId: user.id, userEmail: user.email })
      })
      await fetch('/api/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, status: 'resolved', email: user.email }) })
      setReports(prev => prev.filter(x => x.id !== r.id))
    } catch { alert('Could not apply this report.') }
  }
  // Apply a report's fix to the reporter's own institution (company scope), not globally.
  async function teachInstitutionFromReport(r: any) {
    const text = (reportEdits[r.id] ?? (r.suggested_answer || r.whats_wrong) ?? '').trim()
    if (!text || !user || !r.group_id) return
    try {
      const res = await fetch('/api/teach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'company', text, groupId: r.group_id, userId: user.id, userEmail: user.email, userRole })
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Could not apply to that institution'); return }
      await fetch('/api/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, status: 'resolved', email: user.email }) })
      setReports(prev => prev.filter(x => x.id !== r.id))
    } catch { alert('Could not apply this report.') }
  }
  async function dismissReport(r: any) {
    if (!user) return
    setReports(prev => prev.filter(x => x.id !== r.id))
    try { await fetch('/api/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, status: 'dismissed', email: user.email }) }) } catch {}
  }

  // ── Control Center: live view of what's feeding COR ──
  const canControlCenter = () => user?.email === SUPER_OWNER_EMAIL || userRole === 'owner' || userRole === 'admin'
  async function fetchControlCenter(groupId: string, uid?: string) {
    if (!user || !groupId) return
    setCcLoading(true)
    try {
      const params = new URLSearchParams({ email: user.email, role: userRole || '', groupId: String(groupId) })
      if (uid) params.set('userId', uid)
      const res = await fetch(`/api/control-center?${params.toString()}`)
      const data = await res.json()
      if (!data.error) setCcData(data)
    } catch { /* ignore */ }
    setCcLoading(false)
  }
  async function fetchCCMembers(groupId: string) {
    try {
      const res = await fetch(`/api/groups/members?groupId=${groupId}`)
      const data = await res.json()
      setCcMembers(data.members || [])
    } catch { setCcMembers([]) }
  }
  function openControlCenter() {
    if (!canControlCenter()) return
    const gid = String(userGroupId || (allGroups[0]?.group_id ?? ''))
    setCcMode('company'); setCcUserId(''); setCcData(null); setCcGroupId(gid)
    if (gid) { fetchControlCenter(gid); fetchCCMembers(gid) }
  }
  function ccSwitchHospital(gid: string) {
    setCcGroupId(gid); setCcUserId(''); setCcData(null)
    fetchControlCenter(gid); fetchCCMembers(gid)
  }
  function ccSetMode(m: 'company' | 'individual') {
    setCcMode(m)
    if (m === 'individual') {
      const first = ccUserId || (ccMembers.find((x: any) => x.user_id)?.user_id || '')
      if (first) { setCcUserId(first); fetchControlCenter(ccGroupId, first) }
    } else {
      fetchControlCenter(ccGroupId)
    }
  }
  function ccSelectPerson(uid: string) { setCcUserId(uid); fetchControlCenter(ccGroupId, uid) }

  // ── Global Library: platform-wide reference docs (IFUs) for every hospital ──
  async function fetchGlobalLibrary() {
    if (user?.email !== SUPER_OWNER_EMAIL) return
    setGlobalLibLoading(true)
    try {
      const res = await fetch(`/api/global-library?email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      setGlobalDocs(data.docs || [])
    } catch { setGlobalDocs([]) }
    setGlobalLibLoading(false)
  }
  async function uploadGlobalDoc(file: File) {
    if (!user || user.email !== SUPER_OWNER_EMAIL) return
    setGlobalUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('category', 'Equipment')
    fd.append('scope', 'global')
    fd.append('userId', user.id)
    fd.append('userEmail', user.email)
    fd.append('userRole', userRole || 'owner')
    fd.append('folder', currentFolder || '')
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.error) fetchGlobalLibrary()
      else alert(data.error || 'Could not upload this document.')
    } catch { alert('Upload failed — check your connection and try again.') }
    setGlobalUploading(false)
  }
  async function createGlobalLibFolder() {
    if (!user || user.email !== SUPER_OWNER_EMAIL) return
    const name = newFolderName.trim().replace(/\//g, '-')
    if (!name) return
    const path = currentFolder ? `${currentFolder}/${name}` : name
    try {
      const res = await fetch('/api/global-library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'createFolder', folder: path, email: user.email }) })
      const data = await res.json()
      if (data.success) { setNewFolderName(''); fetchGlobalLibrary() }
      else alert(data.error || 'Could not create folder.')
    } catch { alert('Could not create folder.') }
  }
  async function deleteGlobalDoc(sourceFile: string) {
    if (!user || user.email !== SUPER_OWNER_EMAIL) return
    if (!confirm(`Delete "${sourceFile}" from the Global Library? It will stop being used for everyone.`)) return
    try {
      await fetch('/api/global-library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, sourceFile }) })
      fetchGlobalLibrary()
    } catch {}
  }
  async function deleteGlobalLibFolder(path: string) {
    if (!user || user.email !== SUPER_OWNER_EMAIL) return
    if (!confirm(`Delete the folder "${path.split('/').pop()}" and everything inside it?`)) return
    try {
      await fetch('/api/global-library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, folder: path }) })
      if (currentFolder === path || currentFolder.startsWith(path + '/')) setCurrentFolder(path.split('/').slice(0, -1).join('/'))
      fetchGlobalLibrary()
    } catch {}
  }

  // ── COR Brain: manage global taught knowledge ──
  async function fetchGlobalRules() {
    if (user?.email !== SUPER_OWNER_EMAIL) return
    setGlobalRulesLoading(true)
    try {
      const res = await fetch(`/api/teach?email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      setGlobalRules(data.rules || [])
    } catch { setGlobalRules([]) }
    setGlobalRulesLoading(false)
  }
  function startEditRule(r: any) {
    setEditingRuleId(r.id)
    setEditRuleText(r.content || '')
    setEditRuleFolder(r.folder || '')
  }
  async function saveRuleEdit() {
    if (editingRuleId == null || !user) return
    try {
      await fetch('/api/teach', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingRuleId, email: user.email, content: editRuleText.trim(), folder: editRuleFolder.trim() })
      })
      setGlobalRules(prev => prev.map(r => r.id === editingRuleId ? { ...r, content: editRuleText.trim(), folder: editRuleFolder.trim() || null } : r))
      setEditingRuleId(null)
    } catch { alert('Could not save the change.') }
  }
  // Create a persistent (sub-)folder in COR Global.
  async function createGlobalFolder() {
    const name = brainNewFolder.trim().replace(/\//g, '-')
    if (!name || !user) return
    const path = brainFolder ? `${brainFolder}/${name}` : name
    try {
      const res = await fetch('/api/teach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'createFolder', folder: path, userId: user.id, userEmail: user.email }) })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Could not create folder'); return }
      setBrainNewFolder('')
      fetchGlobalRules()
    } catch { alert('Could not create folder') }
  }
  // Write a brand-new global rule (into the current folder).
  function startAddRule() { setAddingRule(true); setEditingRuleId(null); setEditRuleText(''); setEditRuleFolder(brainFolder) }
  async function saveNewRule() {
    if (!editRuleText.trim() || !user) return
    try {
      const res = await fetch('/api/teach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'global', text: editRuleText.trim(), folder: editRuleFolder.trim() || null, userId: user.id, userEmail: user.email }) })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Could not save rule'); return }
      setAddingRule(false); setEditRuleText('')
      fetchGlobalRules()
    } catch { alert('Could not save rule') }
  }
  function deleteGlobalFolder(path: string) {
    if (!user) return
    const label = path.split('/').pop()
    askConfirm(`Delete the folder "${label}" and every rule in it? This cannot be undone.`, async () => {
      if (brainFolder === path || brainFolder.startsWith(path + '/')) setBrainFolder(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
      try {
        await fetch('/api/teach', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: path, email: user.email }) })
        fetchGlobalRules()
      } catch { alert('Could not delete folder.') }
    }, 'Delete')
  }
  function deleteGlobalRule(id: number) {
    if (!user) return
    askConfirm('Delete this taught rule from COR? This cannot be undone.', async () => {
      setGlobalRules(prev => prev.filter(r => r.id !== id))
      try { await fetch('/api/teach', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, email: user.email }) }) } catch {}
    }, 'Delete')
  }

  // ── Answer-format templates (owner/admin define the structure for common questions) ──
  async function fetchAnswerTemplates() {
    if (!user) return
    setTemplatesLoading(true)
    try {
      const res = await fetch(`/api/answer-templates?groupId=${userGroupId || ''}&userId=${user.id}`)
      const data = await res.json()
      setAnswerTemplates(data.templates || [])
    } catch { setAnswerTemplates([]) }
    setTemplatesLoading(false)
  }
  async function saveTemplate() {
    if (!templateForm?.topic.trim() || !templateForm?.format.trim() || !user) return
    try {
      const body: any = { topic: templateForm.topic.trim(), format: templateForm.format.trim() }
      let res
      if (templateForm.id) {
        res = await fetch('/api/answer-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: templateForm.id, ...body }) })
      } else {
        res = await fetch('/api/answer-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, groupId: userGroupId || '', userId: user.id, userEmail: user.email, userRole }) })
      }
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Could not save template'); return }
      setTemplateForm(null)
      fetchAnswerTemplates()
    } catch { alert('Could not save template') }
  }
  function deleteTemplate(id: number) {
    askConfirm('Delete this template?', async () => {
      setAnswerTemplates(prev => prev.filter(t => t.id !== id))
      try { await fetch('/api/answer-templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }) } catch {}
    }, 'Delete')
  }

  // ── Workplace profiles (filled once, reused for ABCP export) — synced to the user's account ──
  const EMPTY_WP = { id: '', label: '', hospitalName: '', hospitalStreet: '', hospitalCity: '', hospitalState: '', hospitalZip: '', authorityName: '', authorityTitle: '', authorityPhone: '', authorityEmail: '' }
  async function fetchWorkplaces() {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/workplaces?userId=${user.id}`)
      const data = await res.json()
      setWorkplaces(data.workplaces || [])
    } catch { /* ignore */ }
  }
  async function saveWorkplace() {
    if (!wpForm?.label?.trim() || !user?.id) { if (!wpForm?.label?.trim()) alert('Give this workplace a name (e.g. UC Davis).'); return }
    const { id, ...data } = wpForm
    try {
      const res = await fetch('/api/workplaces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, id: id || null, data })
      })
      const out = await res.json()
      if (!res.ok || out.error) { alert(out.error || 'Could not save workplace'); return }
      await fetchWorkplaces()
      if (out.id) setSelectedWp(out.id)
      setWpForm(null)
    } catch { alert('Could not save workplace — try again') }
  }
  function deleteWorkplace(id: any) {
    if (!user?.id) return
    askConfirm('Delete this workplace?', async () => {
      setWorkplaces(prev => prev.filter(w => w.id !== id))
      if (selectedWp === id) setSelectedWp('')
      try { await fetch('/api/workplaces', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userId: user.id }) }) } catch {}
    }, 'Delete')
  }
  function exportPersonalExcel() {
    const fields = activePanel === 'Logbook' ? ['Surgery Date', ...logbookFields.filter(f => f.toLowerCase() !== 'surgery date')] : activePanel === 'Case Notes' ? caseNotesFields : []
    const params = new URLSearchParams({ userId: user?.id || '', category: activePanel || '', groupId: userGroupId || '', fields: fields.join('||') })
    window.open(`/api/export?${params.toString()}`, '_blank')
    setExportModal(null)
  }
  // Read a "Field: value" out of a logbook entry's stored text.
  function readField(content: string, name: string): string {
    const c = (content || '').replace(/\r/g, '')
    const re = new RegExp('^\\*?\\*?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':?\\*?\\*?\\s*[:]?\\s*(.+)$', 'im')
    const m = c.match(re)
    return m ? m[1].replace(/\*/g, '').trim() : ''
  }
  function exportABCP() {
    const wp = workplaces.find(w => w.id === selectedWp)
    if (!wp) { alert('Pick a workplace first.'); return }
    const cols = ['Date', 'Surgeon', 'CC', 'Hospital Name', 'Hospital Street Address', 'Hospital State', 'Hospital City', 'Hospital Zip Code', 'Authority Name', 'Authority Title', 'Authority Phone Number', 'Authority Email Address']
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const rows = panelEntries.filter((e: any) => e.source_file !== '__folder__' && (e.content || '').trim()).map((e: any) => {
      const c = e.content || ''
      const date = fmtMDY(readField(c, 'Surgery Date') || e.created_at)
      const surgeon = readField(c, 'Surgeon')
      const cc = readField(c, 'Cross-Clamp Time') || readField(c, 'Clamp Time') || readField(c, 'Cross Clamp Time')
      return [date, surgeon, cc, wp.hospitalName, wp.hospitalStreet, wp.hospitalState, wp.hospitalCity, wp.hospitalZip, wp.authorityName, wp.authorityTitle, wp.authorityPhone, wp.authorityEmail]
    })
    const csv = [cols.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'ABCP_Case_Import.csv'; a.click()
    URL.revokeObjectURL(url)
    setExportModal(null)
  }

  function openPanel(key: string) {
    if (activePanel === key) {
      setActivePanel(null)
      return
    }
    setActivePanel(key)
    setOpenNoteId(null)
    setCurrentFolder('')
    // Keep the sidebar group of the opened panel expanded, so you can see where you are.
    if (GROUP_OF[key]) setExpandedGroups(prev => new Set(prev).add(GROUP_OF[key]))
    if (key === 'Users') { fetchAllUsers() } else if (key === 'Reports') { fetchReports() } else if (key === 'ControlCenter') { openControlCenter() } else if (key === 'Brain') { setBrainFolder(''); setEditingRuleId(null); setAddingRule(false); fetchGlobalRules() } else if (key === 'GlobalLib') { fetchGlobalLibrary() } else if (key === 'Templates') { setTemplateForm(null); fetchAnswerTemplates() } else if (key === 'Notes') { fetchNotes() } else { fetchPanel(key) }
    if (key === 'Protocol' || key === 'Policy') {
      markNotificationsRead(key)
    }
  }

  // ── Grouped sidebar helpers ──
  function navVisible(access: string) {
    const isSuper = user?.email === SUPER_OWNER_EMAIL
    const isOwnerAdmin = userRole === 'owner' || userRole === 'admin' || isSuper
    if (access === 'tier1') return true
    if (access === 'full') return hasFullAccess
    if (access === 'owneradmin') return isOwnerAdmin
    if (access === 'super') return isSuper
    return false
  }
  function navBadge(item: any): { n: number, color: string } | null {
    if (item.badge === 'unread' && unreadCounts[item.key] > 0) return { n: unreadCounts[item.key], color: '#e63946' }
    if (item.badge === 'equipment') { const n = inventoryItems.filter((inv: any) => inv.quantity <= 2).length; return n > 0 ? { n, color: '#f59e0b' } : null }
    if (item.badge === 'reports' && reports.length > 0) return { n: reports.length, color: '#e63946' }
    return null
  }
  function onNavItem(item: any) {
    if (item.redirect) { window.location.href = item.redirect; return }
    openPanel(item.key); setSidebarOpen(false)
  }
  function toggleGroup(id: string) {
    setExpandedGroups(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  // Owner-only: load every signed-up user with their tier + signup date.
  async function fetchAllUsers() {
    setUsersLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
      const data = await res.json()
      setAllUsers(data.users || [])
    } catch { setAllUsers([]) }
    setUsersLoading(false)
  }

  // Assign a user (by email) to a hospital group, then refresh the list.
  async function assignUserToGroup(email: string, groupId: string) {
    if (!user || !groupId || !email) return
    try {
      const res = await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, groupId, action: 'invite', targetEmail: email, newRole: 'worker', userEmail: user.email })
      })
      const data = await res.json()
      if (data.success || data.error === 'User is already a member of this group') {
        fetchAllUsers()
      } else {
        alert(data.error || 'Could not assign user to hospital.')
      }
    } catch { alert('Network error.') }
  }

  // Owner-only: remove a user from a hospital (moves them back to the Free tier).
  async function removeUserFromGroup(email: string, groupId: string, groupName: string) {
    if (!user || !groupId || !email) return
    if (!confirm(`Remove ${email} from ${groupName}? They'll go back to the Free tier.`)) return
    try {
      const res = await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, groupId, targetEmail: email, userEmail: user.email })
      })
      const data = await res.json()
      if (data.success) fetchAllUsers()
      else alert(data.error || 'Could not remove user from hospital.')
    } catch { alert('Network error.') }
  }

  // Owner-only: permanently delete another user's account and data.
  async function deleteUserAccount() {
    if (!deleteUserTarget) return
    setDeletingUser(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ targetUserId: deleteUserTarget.id, targetEmail: deleteUserTarget.email })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Could not delete user.'); setDeletingUser(false); return }
      setDeleteUserTarget(null)
      setDeletingUser(false)
      fetchAllUsers()
    } catch { alert('Network error.'); setDeletingUser(false) }
  }

  // Open a clean, printable page for a single case (Case Note or Logbook entry).
  function printEntry(entry: any) {
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) { alert('Please allow pop-ups to print this case.'); return }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const dateStr = new Date(entry.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const body = (entry.content || '').split('\n').map((line: string) => {
      const t = line.replace(/\r/g, '').trim()
      if (!t) return '<div style="height:6px"></div>'
      if (/^-{2,}.*-{2,}$/.test(t)) {
        return `<h3 style="margin:18px 0 6px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:4px">${esc(t.replace(/-/g, '').trim())}</h3>`
      }
      const m = t.match(/^\*\*(.+?):\*\*\s*(.*)$/) || t.match(/^([^:]+):\s+(.*)$/)
      if (m && m[2] !== undefined) {
        return `<div style="margin:4px 0"><strong>${esc(m[1].replace(/\*\*/g, '').trim())}:</strong> ${esc(m[2].trim())}</div>`
      }
      return `<div style="margin:4px 0">${esc(t.replace(/\*\*/g, ''))}</div>`
    }).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Case — ${esc(dateStr)}</title>
      <style>body{font-family:-apple-system,Arial,sans-serif;color:#111;max-width:700px;margin:32px auto;padding:0 24px;line-height:1.5}h1{font-size:20px;margin:0 0 4px}.meta{color:#666;font-size:13px;margin-bottom:20px}@media print{body{margin:0}}</style>
      </head><body>
      <h1>COR Case Record</h1>
      <div class="meta">${esc(dateStr)}${entry.uploaded_by ? ' &middot; ' + esc(entry.uploaded_by) : ''}</div>
      ${body}
      </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { try { w.print() } catch { /* user can print manually */ } }, 350)
  }

  function deletePanelEntry(id: number) {
    askConfirm('Delete this entry? This cannot be undone.', async () => {
      try {
        const res = await fetch('/api/logbook', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, userId: user?.id, userRole })
        })
        const data = await res.json()
        if (!res.ok || data.error) { alert(data.error || 'Could not delete entry.'); return }
        setPanelEntries(prev => prev.filter(e => e.id !== id))
      } catch {
        alert('Could not delete entry. Please try again.')
      }
    }, 'Delete')
  }

  async function uploadFiles(files: File[]) {
    if (!activePanel || !user || files.length === 0) return
    setUploading(true)
    setUploadStatus(`Uploading 0/${files.length}...`)
    let successCount = 0
    let totalChunks = 0
    for (let i = 0; i < files.length; i++) {
      setUploadStatus(`Uploading ${i + 1}/${files.length}: ${files[i].name}`)
      const formData = new FormData()
      formData.append('file', files[i])
      formData.append('category', activePanel)
      formData.append('userId', user.id)
      formData.append('userEmail', user.email)
      formData.append('groupId', userGroupId || '')
      formData.append('userRole', userRole || '')
      formData.append('folder', currentFolder.trim() || '')
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (!data.error) {
          successCount++
          totalChunks += data.chunks || 0
        }
      } catch { /* continue with next file */ }
    }
    setUploadStatus(`Uploaded ${successCount}/${files.length} files (${totalChunks} sections)`)
    fetchPanel(activePanel)
    setUploading(false)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) uploadFiles(files)
  }

  // Delete an entire protocol/policy file (all chunks + archived versions).
  function deleteProtocolFile(sourceFile: string) {
    if (!activePanel) return
    askConfirm(`Delete "${sourceFile}" and all its versions? This cannot be undone.`, async () => {
      try {
        const res = await fetch('/api/logbook', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceFile, category: activePanel, groupId: userGroupId || '', userId: user?.id, userRole })
        })
        const data = await res.json()
        if (!res.ok || data.error) { alert(data.error || 'Could not delete.'); return }
        fetchPanel(activePanel)
      } catch { alert('Could not delete.') }
    }, 'Delete')
  }

  // Move a logbook case into a folder ('' = Unfiled). Optimistic.
  async function moveCaseToFolder(id: number, folder: string) {
    if (!user) return
    setPanelEntries(prev => prev.map(e => e.id === id ? { ...e, folder: folder || null } : e))
    try { await fetch('/api/logbook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userId: user.id, setFolder: folder }) }) } catch { fetchPanel('Logbook') }
  }

  // Create a (persistent) folder/sub-folder in the current panel at the current path.
  async function createCurrentFolder() {
    const name = newFolderName.trim().replace(/\//g, '-')
    if (!name || !user || !activePanel) return
    const path = currentFolder ? `${currentFolder}/${name}` : name
    try {
      const res = await fetch('/api/logbook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createFolder', category: activePanel, folder: path, userId: user.id, groupId: userGroupId || '', userRole })
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Could not create folder'); return }
      setNewFolderName('')
      fetchPanel(activePanel)
    } catch { alert('Could not create folder') }
  }

  // Delete a whole folder and everything nested inside it.
  function deleteProtocolFolder(folder: string) {
    if (!activePanel) return
    const label = folder.split('/').pop()
    askConfirm(`Delete the folder "${label}" and everything in it (including sub-folders)? This cannot be undone.`, async () => {
      try {
        const res = await fetch('/api/logbook', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder, category: activePanel, groupId: userGroupId || '', userId: user?.id, userRole })
        })
        const data = await res.json()
        if (!res.ok || data.error) { alert(data.error || 'Could not delete.'); return }
        // If we were inside the deleted folder (or a child of it), step back to its parent.
        if (currentFolder === folder || currentFolder.startsWith(folder + '/')) {
          setCurrentFolder(folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '')
        }
        fetchPanel(activePanel)
      } catch { alert('Could not delete.') }
    }, 'Delete')
  }

  // Create a (sub)folder under the folder you're currently viewing, and open it.
  function openNewFolder() {
    const name = newFolderName.trim().replace(/\//g, '-') // slashes are path separators
    if (!name) return
    setCurrentFolder(currentFolder ? `${currentFolder}/${name}` : name)
    setNewFolderName('')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) uploadFiles(files)
  }

  // ── Per-user structured case fields (Logbook / Case Notes) ──
  function currentCaseFields(): string[] {
    return activePanel === 'Logbook' ? logbookFields : caseNotesFields
  }
  function persistCaseFields(fields: string[]) {
    if (activePanel === 'Logbook') {
      setLogbookFields(fields)
      try { localStorage.setItem('cor_logbook_fields', JSON.stringify(fields)) } catch {}
    } else {
      setCaseNotesFields(fields)
      try { localStorage.setItem('cor_casenotes_fields', JSON.stringify(fields)) } catch {}
    }
  }
  function addCaseField() {
    const name = newFieldInput.trim()
    if (!name || currentCaseFields().includes(name)) { setNewFieldInput(''); return }
    persistCaseFields([...currentCaseFields(), name])
    setNewFieldInput('')
  }
  function removeCaseField(idx: number) {
    persistCaseFields(currentCaseFields().filter((_, i) => i !== idx))
  }
  async function saveCase() {
    if (!activePanel || !user) return
    const lines: string[] = []
    if (activePanel === 'Logbook' && caseDate) lines.push(`Surgery Date: ${caseDate}`)
    for (const f of currentCaseFields()) { if (f.toLowerCase() === 'surgery date') continue; const v = (caseForm[f] || '').trim(); if (v) lines.push(`${f}: ${v}`) }
    if (activePanel === 'Logbook' && caseNote.trim()) lines.push(`Case Notes: ${caseNote.trim()}`)
    if (lines.length === 0) { setUploadStatus('Fill in at least one field first'); return }
    setSavingCase(true); setUploadStatus('')
    const formData = new FormData()
    formData.append('content', lines.join('\n'))
    formData.append('category', activePanel)
    formData.append('userId', user.id)
    formData.append('userEmail', user.email)
    formData.append('groupId', userGroupId || '')
    formData.append('userRole', userRole || '')
    if (activePanel === 'Logbook') formData.append('folder', caseFolder.trim() || '')
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      let data: any = {}
      try { data = await res.json() } catch { /* non-JSON */ }
      if (!res.ok || data.error) {
        setUploadStatus(data.error || `Save failed (${res.status})`)
      } else {
        setUploadStatus('Case saved')
        setCaseForm({}); setCaseDate(''); setCaseNote('')
        fetchPanel(activePanel)
      }
    } catch (e: any) { setUploadStatus(`Failed to save: ${e?.message || 'network error'}`) }
    setSavingCase(false)
  }

  // ── Notes (free-form, foldered, COR-readable) ──
  async function fetchNotes() {
    if (!user) return
    setNotesLoading(true)
    try {
      const res = await fetch(`/api/notes?userId=${user.id}`)
      const data = await res.json()
      setNotesList(data.notes || [])
    } catch { setNotesList([]) }
    setNotesLoading(false)
  }
  function openNoteEditor(note: any | null) {
    if (note) {
      setOpenNoteId(note.id)
      setNoteTitle(note.title === 'Untitled' ? '' : note.title)
      setNoteBody(note.content || '')
      setNoteFolder(note.folder || '')
    } else {
      setOpenNoteId('new')
      setNoteTitle(''); setNoteBody(''); setNoteFolder('')
    }
  }
  async function saveNote() {
    if (!user || (!noteTitle.trim() && !noteBody.trim())) return
    setSavingNote(true)
    try {
      const isNew = openNoteId === 'new'
      const res = await fetch('/api/notes', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: isNew ? undefined : openNoteId, userId: user.id, title: noteTitle.trim() || 'Untitled', body: noteBody, folder: noteFolder.trim() || null })
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Could not save note.'); setSavingNote(false); return }
      setOpenNoteId(null)
      fetchNotes()
    } catch { alert('Could not save note.') }
    setSavingNote(false)
  }
  function deleteNote(id: number) {
    if (!user) return
    askConfirm('Delete this note? This cannot be undone.', async () => {
    try {
      await fetch('/api/notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userId: user.id }) })
      setOpenNoteId(null)
      fetchNotes()
    } catch { alert('Could not delete note.') }
    }, 'Delete')
  }
  // Quick one-tap delete from the notes list (no confirm dialog) — optimistic.
  async function deleteNoteQuick(id: number) {
    if (!user) return
    setNotesList(prev => prev.filter((n: any) => n.id !== id))
    try {
      await fetch('/api/notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userId: user.id }) })
    } catch { fetchNotes() }
  }
  async function insertNoteDocument(file: File) {
    if (!user) return
    setSavingNote(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', 'Notes')
    formData.append('userId', user.id)
    formData.append('userEmail', user.email)
    formData.append('folder', noteFolder.trim() || '')
    formData.append('userRole', userRole || '')
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Could not insert document.') }
      else fetchNotes()
    } catch { alert('Could not insert document.') }
    setSavingNote(false)
  }

  async function saveManualEntry() {
    if (!manualEntry.trim() || !activePanel || !user) return
    setUploading(true)
    setUploadStatus('')
    const formData = new FormData()
    formData.append('content', manualEntry.trim())
    formData.append('category', activePanel)
    formData.append('userId', user.id)
    formData.append('userEmail', user.email)
    formData.append('groupId', userGroupId || '')
    formData.append('userRole', userRole || '')
    if (activePanel === 'Protocol' || activePanel === 'Policy') formData.append('folder', currentFolder.trim() || '')
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      let data: any = {}
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (!res.ok || data.error) {
        setUploadStatus(data.error || `Save failed (${res.status})`)
      } else {
        setUploadStatus('Entry saved')
        setManualEntry('')
        fetchPanel(activePanel)
      }
    } catch (e: any) { setUploadStatus(`Failed to save: ${e?.message || 'network error'}`) }
    setUploading(false)
  }

  // The field set the intake collects — the user's configured Logbook fields (with a sensible fallback).
  function caseIntakeFields(): string[] {
    // The field list is the single source of truth — COR asks exactly the fields you've configured
    // (Surgery Date is handled separately by the date picker on the review card).
    return logbookFields.length ? logbookFields.filter(f => f.toLowerCase() !== 'surgery date') : ['Patient Initials', 'Surgeon', 'Case Type', 'CPB Time', 'Clamp Time']
  }

  // Conversational case intake. Re-reads the WHOLE conversation each turn so the user can brain-dump
  // ("58yo CABG, 92 min pump, 61 clamp, JD") or answer one at a time. Fills what it can, asks for the
  // rest, then shows an editable review card before anything is saved.
  async function progressCaseIntake(convo: { role: string, content: string }[], known: { [k: string]: string }) {
    const fields = caseIntakeFields()
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'log',
          messages: convo,
          userId: user?.id,
          groupId: userGroupId,
          userEmail: user?.email,
          caseLogMode: 'analyze',
          logbookFields: fields,
          caseNotesFields: [],
        })
      })
      const data = await res.json()
      const found = (data && data.found) || {}
      const merged: { [k: string]: string } = { ...known }
      for (const f of fields) {
        const v = found[f]
        if (v != null && String(v).trim() && String(v).trim().toLowerCase() !== 'n/a') merged[f] = String(v).trim()
      }
      setCaseLogData(merged)
      const missing = fields.filter(f => !(merged[f] && merged[f].trim()))
      setCaseLogMissing(missing)

      if (missing.length === 0) {
        setCaseLogDate(prev => prev || fmtMDY(new Date().toISOString()))
        setCaseLogReview(true)
        setMessages(prev => [...prev, { role: 'assistant', content: `Perfect — I've got the details. Review your case below, edit anything that's off, then tap **Save to Logbook**.` }])
      } else {
        const gotSoFar = fields.filter(f => merged[f])
        const summary = gotSoFar.length > 0
          ? `Got it so far:\n${gotSoFar.map(f => `- **${f}:** ${merged[f]}`).join('\n')}\n\n`
          : ''
        const lead = summary ? '' : `Let's log your case. `
        const ask = missing.length > 1
          ? `${lead}What's the **${missing[0]}**? (You can also just tell me the rest all at once.)`
          : `${lead}Last detail — what's the **${missing[0]}**?`
        setMessages(prev => [...prev, { role: 'assistant', content: `${summary}${ask}` }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry — I hit a snag reading that. Could you tell me the case details again?' }])
    }
    setLoading(false)
  }

  function resetCaseIntake() {
    setCaseLogging(false)
    setCaseLogReview(false)
    setCaseLogData({})
    setCaseLogNote('')
    setCaseLogDate('')
    setCaseLogMissing([])
    setCaseLogCurrentField(0)
  }

  function cancelCaseIntake() {
    resetCaseIntake()
    setMessages(prev => [...prev, { role: 'assistant', content: 'No problem — I’ve cancelled that case log.' }])
  }

  // Save the reviewed case — same format & endpoint as the manual logbook form, so it lands in the
  // Logbook panel and exports to ABCP identically.
  async function finalizeCaseIntake() {
    if (!user) return
    const fields = caseIntakeFields()
    const lines: string[] = []
    if (caseLogDate.trim()) lines.push(`Surgery Date: ${caseLogDate.trim()}`)
    for (const f of fields) {
      const v = (caseLogData[f] || '').trim()
      if (v) lines.push(`${f}: ${v}`)
    }
    if (caseLogNote.trim()) lines.push(`Case Notes: ${caseLogNote.trim()}`)
    if (lines.length === 0) return

    setSavingCaseIntake(true)
    const formData = new FormData()
    formData.append('content', lines.join('\n'))
    formData.append('category', 'Logbook')
    formData.append('userId', user.id)
    formData.append('userEmail', user.email)
    formData.append('groupId', userGroupId || '')
    formData.append('userRole', userRole || '')
    // File it into the folder the Logbook panel is currently showing (so it appears where you're looking).
    const targetFolder = activePanel === 'Logbook' ? (currentFolder || '') : ''
    formData.append('folder', targetFolder)

    let ok = false
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      ok = res.ok && !data.error
      if (!ok) setMessages(prev => [...prev, { role: 'assistant', content: `I couldn't save the case: ${data.error || 'please try again.'}` }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'I couldn’t save the case (network error). Please try again.' }])
    }

    if (ok) {
      const caseType = caseLogData['Case Type'] || caseLogData['case type'] || ''
      const matchedType = caseTypes.find(ct => ct.toLowerCase() === caseType.toLowerCase())
      const where = targetFolder ? ` (in **${targetFolder.split('/').pop()}**)` : ''
      setMessages(prev => [...prev, { role: 'assistant', content: `Saved to your **Logbook**${where} ✓\n\n${lines.map(l => `- ${l}`).join('\n')}` }])
      if (activePanel === 'Logbook') fetchPanel('Logbook')
      resetCaseIntake()

      // Auto-deduct standard equipment for this case type, then offer to add extras.
      if (matchedType && caseEquipMap[matchedType]?.length > 0) {
        await deductEquipmentForCase(matchedType)
        const deductedItems = caseEquipMap[matchedType].map(i => `${i.itemName} x${i.quantity}`).join(', ')
        setMessages(prev => [...prev, { role: 'assistant', content: `Equipment auto-deducted from inventory: ${deductedItems}\n\nDid you use any extra items not in the standard set? Type the item name and quantity, or type "done" to finish.` }])
        setCaseLogExtraMode(true)
      }
    }
    setSavingCaseIntake(false)
  }

  function saveTemplateFields(type: string, fields: string[]) {
    if (!userGroupId || !user) return
    fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: userGroupId, fields, templateType: type, userId: user.id, userRole })
    }).catch(() => {})
  }

  function addLogbookField() {
    if (!newLogbookField.trim()) return
    const updated = [...logbookFields, newLogbookField.trim()]
    setLogbookFields(updated)
    setNewLogbookField('')
    saveTemplateFields('logbook', updated)
  }

  function removeLogbookField(idx: number) {
    const updated = logbookFields.filter((_: string, i: number) => i !== idx)
    setLogbookFields(updated)
    saveTemplateFields('logbook', updated)
  }

  function addCaseNotesField() {
    if (!newCaseNotesField.trim()) return
    const updated = [...caseNotesFields, newCaseNotesField.trim()]
    setCaseNotesFields(updated)
    setNewCaseNotesField('')
    saveTemplateFields('case_notes', updated)
  }

  function removeCaseNotesField(idx: number) {
    const updated = caseNotesFields.filter((_: string, i: number) => i !== idx)
    setCaseNotesFields(updated)
    saveTemplateFields('case_notes', updated)
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

    // If in extra equipment mode after case log
    if (caseLogExtraMode) {
      const text = input.trim().toLowerCase()
      if (text === 'done' || text === 'no' || text === 'none') {
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: input.trim() }, { role: 'assistant', content: 'Got it. Inventory is up to date.' }])
        setCaseLogExtraMode(false)
        setCaseLogExtraItems([])
        return
      }
      // Parse "item name qty" or "item name x qty"
      const match = input.trim().match(/^(.+?)\s+[x]?\s*(\d+)$/i)
      if (match) {
        const itemName = match[1].trim()
        const qty = parseInt(match[2]) || 1
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: input.trim() }])
        await deductExtraItems([{ itemName, quantity: qty }])
        setCaseLogExtraItems(prev => [...prev, { itemName, quantity: qty }])
        setMessages(prev => [...prev, { role: 'assistant', content: `Deducted ${itemName} x${qty} from inventory. Any more? Type item and quantity, or "done" to finish.` }])
      } else {
        // Assume quantity 1
        const itemName = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: itemName }])
        await deductExtraItems([{ itemName, quantity: 1 }])
        setCaseLogExtraItems(prev => [...prev, { itemName, quantity: 1 }])
        setMessages(prev => [...prev, { role: 'assistant', content: `Deducted ${itemName} x1 from inventory. Any more? Type item and quantity, or "done" to finish.` }])
      }
      return
    }

    // If mid case-intake, feed each message back through extraction (supports brain-dumps & one-at-a-time).
    if (caseLogging) {
      const userMsg = input.trim()
      if (!userMsg) return
      setInput('')
      const convo = [...messages, { role: 'user', content: userMsg }]
      setMessages(prev => [...prev, { role: 'user', content: userMsg }])
      await progressCaseIntake(convo, caseLogData)
      return
    }

    // Detect a case-log request in natural language ("I have a case", "log a case", "new case", "log").
    const trimmed = input.trim()
    const t = trimmed.toLowerCase()
    const isCaseTrigger =
      /^(log|log a case|log case|new case|start (a )?case|record (a )?case|enter (a )?case)$/i.test(t) ||
      /\bi (just )?(have|had|did|ran|finished|completed|got) (a|another) case\b(?!\s+of\b)/.test(t) ||
      /\b(log|record|enter|save|add) (a |this |my |another )?case\b(?!\s+of\b)/.test(t) ||
      /\bhelp me (log|record|enter|add) (a |this |my )?case\b(?!\s+of\b)/.test(t)
    if (isCaseTrigger) {
      setInput('')
      const convo = [...messages, { role: 'user', content: trimmed }]
      setMessages(prev => [...prev, { role: 'user', content: trimmed }])
      setCaseLogReview(false)
      setCaseLogData({})
      setCaseLogNote('')
      setCaseLogDate('')
      setCaseLogMissing([])
      setCaseLogging(true)
      await progressCaseIntake(convo, {})
      return
    }

    // Detect export commands
    const exportMatch = input.trim().toLowerCase().match(/^export\s*(logbook|case\s*notes|my\s*cases)?$/i)
    if (exportMatch) {
      const target = exportMatch[1]?.toLowerCase() || ''
      const category = target.includes('case') || target.includes('my') ? 'Case Notes' : 'Logbook'
      setInput('')
      setMessages(prev => [...prev, { role: 'user', content: input.trim() }])
      const params = new URLSearchParams({ userId: user?.id, category, groupId: userGroupId || '' })
      window.open(`/api/export?${params.toString()}`, '_blank')
      setMessages(prev => [...prev, { role: 'assistant', content: `Downloading ${category} as Excel. Check your downloads folder.` }])
      return
    }

    // Detect time-off requests (e.g., "I need Friday off", "request off April 15")
    const timeOffMatch = input.trim().match(/(?:need|request|want|take)\s+(?:off|day off|time off).*?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+\w+))/i)
    if (timeOffMatch && userGroupId) {
      const dateText = timeOffMatch[1]
      const userMsg = input.trim()
      setInput('')
      setMessages(prev => [...prev, { role: 'user', content: userMsg }])
      // Try to parse the date
      let requestDate: Date | null = null
      const lower = dateText.toLowerCase()
      if (lower === 'tomorrow') {
        requestDate = new Date()
        requestDate.setDate(requestDate.getDate() + 1)
      } else {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        const dayIdx = dayNames.indexOf(lower)
        if (dayIdx >= 0) {
          requestDate = new Date()
          const today = requestDate.getDay()
          const diff = (dayIdx - today + 7) % 7 || 7
          requestDate.setDate(requestDate.getDate() + diff)
        } else {
          requestDate = new Date(dateText)
        }
      }
      if (requestDate && !isNaN(requestDate.getTime())) {
        const dateStr = formatDate(requestDate)
        await fetch('/api/time-off', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: userGroupId, userId: user.id, userEmail: user.email, date: dateStr, reason: userMsg })
        })
        setMessages(prev => [...prev, { role: 'assistant', content: `Time-off request submitted for ${requestDate!.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}. Your admin will review it.` }])
        return
      }
    }

    // Detect schedule queries (e.g., "who's on call Saturday", "who is working tomorrow")
    const scheduleQuery = input.trim().match(/(?:who.?s|who is)\s+(?:on call|on|working|off|scheduled)\s+(?:on\s+)?(.+)/i)
    if (scheduleQuery && userGroupId) {
      const dateText = scheduleQuery[1].trim()
      const userMsg = input.trim()
      setInput('')
      setMessages(prev => [...prev, { role: 'user', content: userMsg }])
      // Parse date
      let queryDate: Date | null = null
      const lower = dateText.toLowerCase()
      if (lower === 'today') queryDate = new Date()
      else if (lower === 'tomorrow') { queryDate = new Date(); queryDate.setDate(queryDate.getDate() + 1) }
      else {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        const dayIdx = dayNames.indexOf(lower)
        if (dayIdx >= 0) {
          queryDate = new Date()
          const today = queryDate.getDay()
          const diff = (dayIdx - today + 7) % 7 || 7
          queryDate.setDate(queryDate.getDate() + diff)
        } else {
          queryDate = new Date(dateText)
        }
      }
      if (queryDate && !isNaN(queryDate.getTime())) {
        const dateStr = formatDate(queryDate)
        const monday = getMonday(queryDate)
        const res = await fetch(`/api/schedule?groupId=${userGroupId}&weekStart=${formatDate(monday)}`)
        const data = await res.json()
        const dayEntries = (data.entries || []).filter((e: any) => e.date === dateStr)
        if (dayEntries.length === 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: `No one is scheduled for ${queryDate!.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} yet.` }])
        } else {
          const lines = dayEntries.map((e: any) => `${(e.user_email || '').split('@')[0]} - ${e.shift_type}`)
          setMessages(prev => [...prev, { role: 'assistant', content: `Schedule for ${queryDate!.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}:\n${lines.join('\n')}` }])
        }
        return
      }
    }

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
        body: JSON.stringify({ message: userMessage, messages: messages, userId: user?.id, image: imageToSend, groupId: userGroupId, userEmail: user?.email })
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
        const assistantMsg = { role: 'assistant', content: data.answer, docs: data.usedDocs || [] }
        finalMessages = [...updatedMessages, assistantMsg]
        setMessages(finalMessages)
      }

      // Auto-save to history after every response
      await autoSaveHistory(finalMessages)
      notifyCORDone(data.answer || data.summary)

    } catch {
      const errorMsg = { role: 'assistant', content: 'Error getting response.' }
      const finalMessages = [...updatedMessages, errorMsg]
      setMessages(finalMessages)
      await autoSaveHistory(finalMessages)
      notifyCORDone('Error getting response.')
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
        body: JSON.stringify({ message: '', messages: [], saveMode: true, category: selectedCategory, summaryToSave: pendingSummary, userId: user?.id, groupId: userGroupId, userEmail: user?.email })
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

  async function startListening() {
    // Stop recording if already listening
    if (mediaRecorderRef.current && listening) {
      mediaRecorderRef.current.stop()
      // Stop live preview
      if (liveRecognitionRef.current) {
        try { liveRecognitionRef.current.stop() } catch {}
        liveRecognitionRef.current = null
      }
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      // Save existing input text to append to later
      inputBeforeRecordRef.current = input

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setListening(false)
        mediaRecorderRef.current = null
        // Stop live preview
        if (liveRecognitionRef.current) {
          try { liveRecognitionRef.current.stop() } catch {}
          liveRecognitionRef.current = null
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (audioBlob.size < 1000) return // too short, ignore

        const prefix = inputBeforeRecordRef.current
        setInput((prefix ? prefix + ' ' : '') + 'Transcribing...')
        try {
          const formData = new FormData()
          formData.append('audio', audioBlob, 'recording.webm')
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          const newText = data.text || ''
          setInput(prefix ? (prefix + ' ' + newText).trim() : newText)
        } catch {
          // Restore original input on error
          setInput(prefix)
        }
      }

      mediaRecorder.start()
      setListening(true)

      // Try live preview with browser Speech API (best-effort)
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition()
          recognition.lang = 'en-US'
          recognition.interimResults = true
          recognition.continuous = true
          const savedInput = input
          recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('')
            setInput((savedInput ? savedInput + ' ' : '') + transcript)
          }
          recognition.onerror = () => {} // silently ignore — Whisper is the real transcription
          recognition.onend = () => { liveRecognitionRef.current = null }
          recognition.start()
          liveRecognitionRef.current = recognition
        }
      } catch { /* live preview not available, that's fine */ }
    } catch {
      alert('Microphone access denied. Please allow microphone access in your browser settings.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function deleteAccount() {
    if (!user) return
    setDeletingAccount(true)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Could not delete account.'); setDeletingAccount(false); return }
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch {
      alert('Could not delete account. Please try again.')
      setDeletingAccount(false)
    }
  }

  // Tier 2 = linked to a hospital group (or the super owner). Tier 1 = everyone else.
  const hasFullAccess = !!userGroupId || user?.email === SUPER_OWNER_EMAIL
  const fieldInputStyle = { width: '100%', padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div className="app-root" style={{ display: 'flex', background: '#080b12', color: '#e2e8f0', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif", overflow: 'hidden' }}>

      <style>{`
        @keyframes pulseBar { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes fadeInOut { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.8; } }
        @keyframes bob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes modalIn { from { opacity: 0; transform: translate(-50%, -46%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes panelSlide { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes micGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(230,57,70,0.5); } 50% { box-shadow: 0 0 0 6px rgba(230,57,70,0); } }
        @keyframes barPulse { from { height: 4px; } to { height: 16px; } }
        textarea::placeholder { color: #4a5568; }
        /* Keep the rotating chat placeholder on one line (ellipsis if too long) so it never wraps and looks off-center. Real typed text still wraps/grows. */
        .chat-input::placeholder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .sidebar-btn:hover { background: rgba(255,255,255,0.06) !important; }
        .sidebar-btn.active { background: rgba(230,57,70,0.12) !important; border-color: rgba(230,57,70,0.4) !important; }
        .msg-bubble { animation: fadeUp 0.2s ease; }
        .history-item:hover { background: rgba(255,255,255,0.06) !important; }
        input::placeholder { color: #4a5568; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 2px; }
        .app-root { height: 100vh; height: 100dvh; }
        /* The in-app mic is only useful on desktop (mouse). Phones/tablets use the keyboard's dictation. */
        @media (pointer: coarse) { .desktop-only-mic { display: none !important; } .chat-input { padding-right: 1.1rem !important; } }
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .desktop-sidebar.mobile-open { display: flex !important; position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important; width: 220px !important; z-index: 100 !important; }
          .sidebar-overlay { display: block !important; }
          .mobile-hamburger { display: flex !important; }
          .slide-panel { position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important; width: 100% !important; z-index: 90 !important; }
          .chat-area { padding: calc(env(safe-area-inset-top, 0px) + 3.9rem) 0.9rem 0.5rem !important; }
          .input-bar { padding: 0.5rem 0.75rem calc(0.75rem + env(safe-area-inset-bottom)) !important; }
          .input-wrapper { max-width: 100% !important; }
          .msg-max-width { max-width: 85% !important; font-size: 1rem !important; }
          .idle-gif { width: 280px !important; }
          .idle-container { min-height: 300px !important; }
          .idle-title { font-size: 1.2rem !important; }
        }
      `}</style>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90 }} />}

      {/* DELETE USER CONFIRM (owner removing another user) */}
      {deleteUserTarget && (
        <div onClick={() => !deletingUser && setDeleteUserTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 310, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#0d1117', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '16px', padding: '1.75rem', width: '90%', maxWidth: '360px', animation: 'modalIn 0.2s ease', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.5rem' }}>Delete this user?</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1.5rem', lineHeight: '1.6' }}>This permanently deletes <strong style={{ color: '#e2e8f0' }}>{deleteUserTarget.email}</strong> and all of their data (logbook, case notes, history). This <strong style={{ color: '#e2e8f0' }}>cannot be undone.</strong></div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteUserTarget(null)} disabled={deletingUser} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteUserAccount} disabled={deletingUser} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none', background: '#e63946', color: '#ffffff', fontSize: '0.85rem', fontWeight: '600', cursor: deletingUser ? 'not-allowed' : 'pointer' }}>{deletingUser ? 'Deleting…' : 'Delete user'}</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ACCOUNT CONFIRM */}
      {showDeleteAccount && (
        <div onClick={() => !deletingAccount && setShowDeleteAccount(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 310, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#0d1117', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '16px', padding: '1.75rem', width: '90%', maxWidth: '360px', animation: 'modalIn 0.2s ease', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.5rem' }}>Delete your account?</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1.5rem', lineHeight: '1.6' }}>This permanently deletes your account, your saved logbook, case notes, and conversation history. This <strong style={{ color: '#e2e8f0' }}>cannot be undone.</strong></div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowDeleteAccount(false)} disabled={deletingAccount} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteAccount} disabled={deletingAccount} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none', background: '#e63946', color: '#ffffff', fontSize: '0.85rem', fontWeight: '600', cursor: deletingAccount ? 'not-allowed' : 'pointer' }}>{deletingAccount ? 'Deleting…' : 'Delete forever'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MEDICAL DISCLAIMER (shown once until acknowledged) */}
      {showDisclaimer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
          <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '440px', maxHeight: '85vh', overflowY: 'auto', animation: 'modalIn 0.2s ease' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#e63946' }}>⚠️</span> Before you start
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.65', marginBottom: '1.25rem' }}>
              COR is an <strong style={{ color: '#e2e8f0' }}>informational and educational tool</strong> for trained cardiovascular perfusionists. It does <strong style={{ color: '#e2e8f0' }}>not</strong> provide medical advice, diagnosis, or treatment, and is <strong style={{ color: '#e2e8f0' }}>not a substitute</strong>{' '}for your professional clinical judgment, your institution&apos;s protocols, or applicable standards of care.
              <br /><br />
              AI responses may be inaccurate or incomplete and should be verified against primary sources. Always confirm critical information independently, and never rely on COR for emergency or patient-specific decisions. By continuing, you confirm you are a qualified professional using this tool at your own discretion.
              <br /><br />
              <strong style={{ color: '#e2e8f0' }}>Data &amp; third-party AI.</strong> To generate responses, the questions and text you enter are sent to third-party AI providers — <strong style={{ color: '#e2e8f0' }}>Anthropic (Claude)</strong> and <strong style={{ color: '#e2e8f0' }}>OpenAI</strong> — who process them under their own privacy terms. By tapping &ldquo;I agree,&rdquo; you consent to this processing. See our <a href="/privacy" target="_blank" style={{ color: '#e63946' }}>Privacy Policy</a>.
              <br /><br />
              <strong style={{ color: '#e63946' }}>Do not enter patient-identifying information</strong> (such as full patient names, MRN, or dates of birth). Keep all entries de-identified.
            </div>
            <button
              onClick={() => { localStorage.setItem('corConsent_v2', '1'); setShowDisclaimer(false) }}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: 'none', background: '#e63946', color: '#ffffff', fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', letterSpacing: '0.02em' }}
            >
              I agree
            </button>
          </div>
        </div>
      )}

      {/* LOG OUT CONFIRM */}
      {confirmLogout && (
        <div onClick={() => setConfirmLogout(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.75rem', width: '90%', maxWidth: '340px', animation: 'modalIn 0.2s ease', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.5rem' }}>Log out?</div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.5rem' }}>Are you sure you want to log out of COR?</div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setConfirmLogout(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={signOut} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none', background: '#e63946', color: '#ffffff', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>Log out</button>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ padding: '0.6rem 0.5rem', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* Chat — clears any open panel */}
          <button onClick={() => { setActivePanel(null); setSidebarOpen(false) }} className={`sidebar-btn${activePanel === null ? ' active' : ''}`}
            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', textAlign: 'left' }}>
            <span style={{ fontSize: '1.1rem', width: '30px', textAlign: 'center', flexShrink: 0 }}>&#128172;</span>
            <span style={{ fontSize: '0.84rem', color: activePanel === null ? '#e63946' : '#e2e8f0', fontWeight: activePanel === null ? 600 : 500 }}>Chat</span>
          </button>

          {/* Control Center — owner/admin hub */}
          {(userRole === 'owner' || userRole === 'admin' || user?.email === SUPER_OWNER_EMAIL) && (
            <button onClick={() => { openPanel('ControlCenter'); setSidebarOpen(false) }} className={`sidebar-btn${activePanel === 'ControlCenter' ? ' active' : ''}`}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', textAlign: 'left' }}>
              <span style={{ fontSize: '1.1rem', width: '30px', textAlign: 'center', flexShrink: 0 }}>&#128202;</span>
              <span style={{ fontSize: '0.84rem', color: activePanel === 'ControlCenter' ? '#e63946' : '#e2e8f0', fontWeight: activePanel === 'ControlCenter' ? 600 : 500 }}>Control Center</span>
              {activePanel === 'ControlCenter' && <div style={{ marginLeft: 'auto', width: '4px', height: '4px', borderRadius: '50%', background: '#e63946', flexShrink: 0 }} />}
            </button>
          )}

          {/* Collapsible groups */}
          {NAV_GROUPS.map(group => {
            const items = group.items.filter(it => navVisible(it.access))
            if (items.length === 0) return null
            const open = expandedGroups.has(group.id)
            const hasActive = items.some(it => it.key === activePanel)
            const groupBadge = items.reduce((sum, it) => { const b = navBadge(it); return sum + (b ? b.n : 0) }, 0)
            return (
              <div key={group.id} style={{ marginTop: '0.55rem' }}>
                <button onClick={() => toggleGroup(group.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '0.4rem 0.6rem', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.85rem', width: '18px', textAlign: 'center', flexShrink: 0 }}>{group.icon}</span>
                  <span style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: hasActive ? '#e63946' : '#6b7280', fontWeight: 700, flex: 1, textAlign: 'left' }}>{group.label}</span>
                  {!open && groupBadge > 0 && <span style={{ minWidth: '15px', height: '15px', borderRadius: '8px', background: '#e63946', color: '#fff', fontSize: '0.58rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxSizing: 'border-box' }}>{groupBadge}</span>}
                  <span style={{ fontSize: '0.6rem', color: '#4a5568', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&#9656;</span>
                </button>
                {open && items.map(item => {
                  const active = activePanel === item.key
                  const badge = navBadge(item)
                  return (
                    <button key={item.key} onClick={() => onNavItem(item)} className={`sidebar-btn${active ? ' active' : ''}`}
                      style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 1.05rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', textAlign: 'left' }}>
                      <span style={{ fontSize: '1rem', width: '34px', textAlign: 'center', flexShrink: 0 }}>
                        {(item as any).img ? <img src={(item as any).img} alt={item.label} style={{ width: '34px', height: '34px', objectFit: 'contain', verticalAlign: 'middle' }} /> : (item as any).emoji}
                      </span>
                      <span style={{ fontSize: '0.82rem', color: active ? '#e63946' : '#94a3b8', fontWeight: active ? 600 : 400, flex: 1 }}>{item.label}</span>
                      {badge && <span style={{ minWidth: '16px', height: '16px', borderRadius: '8px', background: badge.color, color: '#fff', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxSizing: 'border-box' }}>{badge.n}</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {userGroupName && (
            allGroups.length > 1 ? (
              <div style={{ position: 'relative', marginBottom: '0.3rem' }}>
                <button onClick={() => setHospitalSwitcherOpen(o => !o)} title="Switch hospital" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.25)', borderRadius: '8px', padding: '0.4rem 0.55rem', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.6rem', color: '#e63946', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userGroupName}</span>
                  <span style={{ fontSize: '0.55rem', color: '#e63946', flexShrink: 0, transform: hospitalSwitcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>&#9662;</span>
                </button>
                {hospitalSwitcherOpen && (
                  <>
                    <div onClick={() => setHospitalSwitcherOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '0.3rem', maxHeight: '260px', overflowY: 'auto', boxShadow: '0 -8px 30px rgba(0,0,0,0.55)' }}>
                      <div style={{ fontSize: '0.56rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.25rem 0.5rem 0.35rem' }}>Switch hospital</div>
                      {allGroups.map((g) => (
                        <button key={g.group_id} onClick={() => { switchGroup(g); setHospitalSwitcherOpen(false); setActivePanel(null) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', borderRadius: '7px', border: 'none', background: g.group_id === userGroupId ? 'rgba(230,57,70,0.14)' : 'transparent', color: g.group_id === userGroupId ? '#fca5a5' : '#cbd5e1', fontSize: '0.75rem', cursor: 'pointer' }} onMouseEnter={e => { if (g.group_id !== userGroupId) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }} onMouseLeave={e => { if (g.group_id !== userGroupId) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.group?.name}</span>
                          {g.group_id === userGroupId && <span style={{ fontSize: '0.7rem', color: '#e63946', flexShrink: 0 }}>&#10003;</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '0.6rem', color: '#e63946', marginBottom: '0.3rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {userGroupName}
              </div>
            )
          )}
          {userRole && (
            <div style={{ fontSize: '0.6rem', color: '#4a5568', marginBottom: '0.3rem', textTransform: 'capitalize' }}>
              {userRole}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: '#e2e8f0', marginBottom: '0.2rem', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName || user?.email?.split('@')[0]}</div>
          <div style={{ fontSize: '0.6rem', color: '#4a5568', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          <button onClick={() => setConfirmLogout(true)} style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: 'none', background: '#e63946', color: '#ffffff', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', letterSpacing: '0.02em' }}>Log out</button>
          <button onClick={() => setShowDeleteAccount(true)} style={{ width: '100%', padding: '0.35rem', marginTop: '0.4rem', borderRadius: '6px', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline' }}>Delete account</button>
        </div>
      </div>

      {/* PANEL */}
      {activePanel && (
        <div className="slide-panel" style={{ width: '300px', background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', flexShrink: 0, animation: 'panelSlide 0.2s ease' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '0.88rem' }}>{activePanel === 'Brain' ? 'COR Brain' : activePanel === 'GlobalLib' ? 'Global Library' : activePanel === 'ControlCenter' ? 'Control Center' : activePanel}</div>
              <div style={{ fontSize: '0.7rem', color: '#4a5568', marginTop: '1px' }}>
                {activePanel === 'History' ? `${conversations.length} conversations` : activePanel === 'Admin' ? `${groupMembers.length} members` : activePanel === 'Users' ? `${allUsers.length} users` : activePanel === 'Reports' ? `${reports.length} open` : activePanel === 'Brain' ? `${globalRules.length} global rules` : activePanel === 'GlobalLib' ? `${globalDocs.filter((d:any)=>!d.isFolder).length} documents` : activePanel === 'ControlCenter' ? "how COR is thinking" : activePanel === 'Templates' ? `${answerTemplates.length} templates` : activePanel === 'Notes' ? `${notesList.length} notes` : activePanel === 'Checklists' ? `${checklistFiles.length} files` : activePanel === 'Equipment' ? `${inventoryItems.length} items` : `${panelEntries.filter((e: any) => e.source_file !== '__folder__').length} saved entries`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {activePanel === 'History' && messages.length > 0 && (
                <button onClick={saveToHistory} disabled={savingHistory} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(230,57,70,0.3)', background: 'rgba(230,57,70,0.1)', color: '#e63946', fontSize: '0.72rem', cursor: 'pointer' }}>
                  {savingHistory ? '...' : '+ Save'}
                </button>
              )}
              {(activePanel === 'Logbook' || activePanel === 'Case Notes') && panelEntries.length > 0 && (
                <button onClick={() => { if (activePanel === 'Logbook') setExportModal('choice'); else exportPersonalExcel() }} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}>
                  &#11015; Excel
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
                {conversations.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                    <button onClick={clearUnpinnedConversations} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline' }}>Clear unpinned</button>
                  </div>
                )}
                {conversations.length > 0 && (() => {
                  const now = new Date()
                  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
                  const startYesterday = startToday - 86400000
                  const pinned: any[] = [], today: any[] = [], yesterday: any[] = [], earlier: any[] = []
                  for (const c of conversations) {
                    if (c.pinned) { pinned.push(c); continue }
                    const t = new Date(c.created_at).getTime()
                    if (t >= startToday) today.push(c)
                    else if (t >= startYesterday) yesterday.push(c)
                    else earlier.push(c)
                  }
                  const sections: [string, any[]][] = []
                  if (pinned.length) sections.push(['📌 Pinned', pinned])
                  if (today.length) sections.push(['Today', today])
                  if (yesterday.length) sections.push(['Yesterday', yesterday])
                  if (earlier.length) sections.push(['Earlier', earlier])
                  return sections.map(([label, items]) => (
                    <div key={label} style={{ marginBottom: '0.65rem' }}>
                      <div style={{ fontSize: '0.64rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem', paddingLeft: '0.1rem' }}>{label}</div>
                      {items.map((conv: any) => (
                        <div key={conv.id} className="history-item" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.5rem 0.6rem', marginBottom: '0.3rem', cursor: 'pointer' }}>
                          <div onClick={() => loadConversation(conv)} style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                          <button onClick={() => pinConversation(conv.id, conv.pinned)} title={conv.pinned ? 'Unpin' : 'Pin'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.72rem', opacity: conv.pinned ? 1 : 0.35, padding: 0, flexShrink: 0 }}>📌</button>
                          <button onClick={() => deleteConversation(conv.id)} title="Delete" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, padding: 0, lineHeight: 1 }}>&#10005;</button>
                        </div>
                      ))}
                    </div>
                  ))
                })()}
              </>
            )}

            {activePanel === 'Users' && (
              <div>
                {usersLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '2rem' }}>Loading users…</div>}
                {!usersLoading && allUsers.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.8rem', marginTop: '2rem' }}>No users have signed up yet.</div>
                )}
                {!usersLoading && allUsers.map((u) => (
                  <div key={u.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '500' }}>{u.name || (u.email || '').split('@')[0]}</div>
                        <div style={{ fontSize: '0.68rem', color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                      </div>
                      {u.email?.toLowerCase() !== SUPER_OWNER_EMAIL && (
                        <button onClick={() => setDeleteUserTarget(u)} title="Delete user" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, padding: '2px' }}>&#128465;</button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.63rem', color: '#4a5568', marginTop: '2px' }}>Joined {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {u.groups && u.groups.length > 0 ? (
                        u.groups.map((g: any, gi: number) => (
                          <span key={gi} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.62rem', color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '6px', padding: '1px 6px', textTransform: 'capitalize' }}>
                            {g.name} · {g.role}
                            {g.groupId && g.role !== 'owner' && (
                              <button onClick={() => removeUserFromGroup(u.email, String(g.groupId), g.name)} title={`Remove from ${g.name} (move to Free tier)`} style={{ background: 'transparent', border: 'none', color: '#22c55e', fontSize: '0.7rem', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.7 }}>&#10005;</button>
                            )}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.62rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '1px 6px' }}>Free (Tier 1)</span>
                      )}
                    </div>
                    {allGroups.length > 0 && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) { assignUserToGroup(u.email, e.target.value); e.target.value = '' } }}
                        style={{ width: '100%', marginTop: '0.5rem', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: '#0d1117', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}
                      >
                        <option value="">+ Assign to hospital…</option>
                        {allGroups.map((g) => (
                          <option key={g.group_id} value={g.group_id}>{g.group?.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'Reports' && (
              <div>
                {reportsLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '2rem' }}>Loading reports…</div>}
                {!reportsLoading && reports.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem', opacity: 0.4 }}>&#9989;</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>No open reports. All clear.</div>
                  </div>
                )}
                {!reportsLoading && reports.map((r: any) => (
                  <div key={r.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.8rem', marginBottom: '0.7rem' }}>
                    <div style={{ fontSize: '0.62rem', color: '#4a5568', marginBottom: '0.4rem' }}>{r.user_email || 'unknown'} · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    {r.question && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.3rem' }}><span style={{ color: '#6b7280' }}>Q:</span> {r.question.slice(0, 160)}</div>}
                    <div style={{ fontSize: '0.78rem', color: '#e2e8f0', marginBottom: '0.45rem' }}><span style={{ color: '#e63946' }}>Wrong:</span> {r.whats_wrong || '—'}</div>
                    <div style={{ fontSize: '0.66rem', color: '#6366f1', marginBottom: '0.25rem' }}>Lesson COR will learn (edit before saving):</div>
                    <textarea
                      value={reportEdits[r.id] ?? (r.suggested_answer || r.whats_wrong) ?? ''}
                      onChange={e => setReportEdits(prev => ({ ...prev, [r.id]: e.target.value }))}
                      rows={3}
                      style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.06)', color: '#e2e8f0', fontSize: '0.76rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45, marginBottom: '0.5rem' }}
                    />
                    {(() => {
                      const hasText = !!(reportEdits[r.id] ?? (r.suggested_answer || r.whats_wrong) ?? '').trim()
                      const instName = allGroups.find((g: any) => String(g.group_id) === String(r.group_id))?.group?.name
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {r.group_id && (
                            <button onClick={() => teachInstitutionFromReport(r)} disabled={!hasText} title="Apply this fix to the reporter's institution only" style={{ flex: '1 1 45%', padding: '0.45rem', borderRadius: '8px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>&#127973; Teach {instName ? instName.split(' ').slice(0, 2).join(' ') : 'their institution'}</button>
                          )}
                          <button onClick={() => teachGloballyFromReport(r)} disabled={!hasText} title="Save this lesson as global knowledge for all companies" style={{ flex: '1 1 45%', padding: '0.45rem', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>&#127758; Teach globally</button>
                          <button onClick={() => dismissReport(r)} style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}>Dismiss</button>
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'ControlCenter' && (() => {
              const c = ccData?.company
              const g = ccData?.global
              const ind = ccData?.individual
              const hospName = allGroups.find((x: any) => String(x.group_id) === String(ccGroupId))?.group?.name || 'this hospital'
              const person = ccMembers.find((m: any) => String(m.user_id) === String(ccUserId))
              const personName = person ? (person.email ? person.email.split('@')[0] : 'Member') : ''
              const selStyle: any = { flex: 1, minWidth: 0, padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#0d1117', color: '#e2e8f0', fontSize: '0.8rem', cursor: 'pointer' }
              const Layer = (n: number, color: string, name: string, sub: string, count: any) => (
                <div key={n + name} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: '0.7rem', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${color}`, borderRadius: '11px', padding: '0.55rem 0.75rem', marginBottom: '0.45rem' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: `2px solid ${color}`, color, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.78rem', background: '#0d1117' }}>{n}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{sub}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color, fontVariantNumeric: 'tabular-nums' }}>{count}</div>
                </div>
              )
              const Tile = (color: string, ico: string, big: any, lab: string, meta: string, target: string) => (
                <div key={lab} onClick={() => target && openPanel(target)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '13px', padding: '0.8rem 0.85rem', cursor: target ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: '0.1rem', minHeight: '96px' }}>
                  <div style={{ fontSize: '1rem' }} dangerouslySetInnerHTML={{ __html: ico }} />
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>{big}</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0' }}>{lab}</div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: 'auto' }}>{meta}</div>
                </div>
              )
              return (
                <>
                  {/* Scope controls */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.6rem 0.7rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ display: 'inline-flex', background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '3px' }}>
                      {(['company', 'individual'] as const).map(m => (
                        <button key={m} onClick={() => ccSetMode(m)} style={{ border: 0, background: ccMode === m ? '#e63946' : 'transparent', color: ccMode === m ? '#fff' : '#94a3b8', fontSize: '0.76rem', fontWeight: 600, padding: '0.35rem 0.75rem', borderRadius: '7px', cursor: 'pointer', textTransform: 'capitalize' }}>{m}</button>
                      ))}
                    </div>
                    <select value={ccGroupId} onChange={e => ccSwitchHospital(e.target.value)} style={selStyle}>
                      {allGroups.map((x: any) => <option key={x.group_id} value={String(x.group_id)}>{x.group?.name}</option>)}
                    </select>
                    {ccMode === 'individual' && (
                      <select value={ccUserId} onChange={e => ccSelectPerson(e.target.value)} style={selStyle}>
                        {ccMembers.filter((m: any) => m.user_id).length === 0 && <option value="">No members yet</option>}
                        {ccMembers.filter((m: any) => m.user_id).map((m: any) => <option key={m.user_id} value={String(m.user_id)}>{(m.email || 'member').split('@')[0]} · {m.role}</option>)}
                      </select>
                    )}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.9rem' }}>
                    Viewing {ccMode === 'company' ? <b style={{ color: '#e2e8f0' }}>{hospName}</b> : <><b style={{ color: '#e2e8f0' }}>{personName || 'a member'}</b> <span style={{ color: '#64748b' }}>· {hospName}</span></>}
                  </div>

                  {ccLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '2rem' }}>Loading…</div>}

                  {!ccLoading && c && (
                    <>
                      <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a5568', marginBottom: '0.6rem' }}>How COR is thinking</div>
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '13px', padding: '0.85rem', marginBottom: '1.4rem' }}>
                        <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e63946' }} />A question comes in…</div>
                        {ccMode === 'company' ? (
                          <>
                            {Layer(1, '#e63946', 'Taught corrections', 'Rules taught to COR — always win', c.corrections)}
                            {Layer(2, '#22c55e', `${hospName.split(' ').slice(0, 2).join(' ')} protocols & policies`, 'Primary source, cited by name', c.protocols + c.policies)}
                            {Layer(3, '#7c83ff', 'Global reference / IFUs', 'Shared platform-wide knowledge', g?.reference ?? 0)}
                            {Layer(4, '#64748b', 'COR’s trained expertise', 'Fallback when nothing above applies', '—')}
                          </>
                        ) : (
                          <>
                            {Layer(1, '#e63946', 'Taught corrections', 'From their hospital + platform', c.corrections)}
                            {Layer(2, '#22c55e', `${hospName.split(' ').slice(0, 2).join(' ')} protocols & policies`, 'Inherited from their hospital', c.protocols + c.policies)}
                            {Layer(3, '#2dd4bf', 'Their personal notes', 'Only this person sees these', ind?.notes ?? 0)}
                            {Layer(4, '#7c83ff', 'Global reference / IFUs', 'Shared platform-wide knowledge', g?.reference ?? 0)}
                            {Layer(5, '#64748b', 'COR’s trained expertise', 'Fallback', '—')}
                          </>
                        )}
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.35rem' }}><span style={{ color: '#22c55e', fontWeight: 700 }}>✓ Cited answer</span> — higher layers win over lower ones.</div>
                      </div>

                      <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a5568', marginBottom: '0.6rem' }}>What’s feeding COR — tap to manage</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                        {ccMode === 'company' ? [
                          Tile('#e63946', '&#9889;', c.corrections, 'Taught corrections', 'authoritative', 'Brain'),
                          Tile('#22c55e', '&#128220;', c.protocols, 'Protocols', 'cited by name', 'Protocol'),
                          Tile('#22c55e', '&#128203;', c.policies, 'Policies', 'institutional', 'Policy'),
                          Tile('#22c55e', '&#9989;', c.checklists, 'Checklists', 'files', 'Checklists'),
                          Tile('#f5a623', '&#129517;', c.templates, 'Answer templates', 'answer formats', 'Templates'),
                          Tile('#7c83ff', '&#127760;', g?.reference ?? 0, 'Global reference', 'IFUs & standards', 'GlobalLib'),
                          Tile('#2dd4bf', '&#128101;', c.team, 'Team members', 'in this hospital', 'Admin'),
                        ] : [
                          Tile('#2dd4bf', '&#128221;', ind?.notes ?? 0, 'Personal notes', 'only they see', 'Notes'),
                          Tile('#2dd4bf', '&#128214;', ind?.cases ?? 0, 'Logbook cases', 'logged by them', 'Logbook'),
                          Tile('#22c55e', '&#128220;', c.protocols + c.policies, 'Hospital knowledge', 'inherited', 'Protocol'),
                          Tile('#e63946', '&#9889;', c.corrections, 'Corrections they get', 'from their hospital', 'Brain'),
                          Tile('#7c83ff', '&#127760;', g?.reference ?? 0, 'Global reference', 'same for everyone', 'GlobalLib'),
                        ]}
                      </div>
                    </>
                  )}
                </>
              )
            })()}

            {activePanel === 'GlobalLib' && (() => {
              const P = currentFolder
              const prefix = P ? P + '/' : ''
              const realDocs = globalDocs.filter((d: any) => !d.isFolder)
              const allFolders = Array.from(new Set(globalDocs.map((d: any) => d.folder).filter(Boolean))) as string[]
              const childSet = new Set<string>()
              for (const f of allFolders) {
                if (!P) { const top = f.split('/')[0]; if (top) childSet.add(top) }
                else if (f !== P && f.startsWith(prefix)) { const seg = f.slice(prefix.length).split('/')[0]; if (seg) childSet.add(P + '/' + seg) }
              }
              const children = Array.from(childSet).sort()
              const directDocs = realDocs.filter((d: any) => (d.folder || '') === P)
              const crumb = (active: boolean) => ({ background: 'transparent', border: 'none', color: active ? '#e2e8f0' : '#e63946', fontSize: '0.82rem', fontWeight: active ? 600 : 400, cursor: 'pointer', padding: 0 })
              return (
                <>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px', padding: '0.6rem 0.75rem', marginBottom: '0.8rem', lineHeight: 1.5 }}>
                    &#127760; Documents here are <strong style={{ color: '#e2e8f0' }}>platform-wide</strong> — every hospital&rsquo;s COR can find and cite them. Best for manufacturer <strong style={{ color: '#e2e8f0' }}>IFUs</strong> and reference standards. A hospital&rsquo;s own protocols still take priority.
                  </div>

                  {/* Breadcrumb + create folder */}
                  <div style={{ marginBottom: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
                      <button onClick={() => setCurrentFolder('')} style={crumb(!P)}>&#128193; All</button>
                      {P && P.split('/').map((seg, i, arr) => {
                        const path = arr.slice(0, i + 1).join('/')
                        return <span key={path} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ color: '#4a5568' }}>/</span><button onClick={() => setCurrentFolder(path)} style={crumb(i === arr.length - 1)}>{seg}</button></span>
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createGlobalLibFolder() }} placeholder={P ? `New sub-folder in ${P.split('/').pop()}…` : '📁 New folder (e.g. Oxygenators, Cannulae)…'} style={fieldInputStyle} />
                      <button onClick={createGlobalLibFolder} disabled={!newFolderName.trim()} style={{ padding: '0.45rem 0.8rem', borderRadius: '8px', border: 'none', background: newFolderName.trim() ? '#e63946' : '#2d3748', color: '#fff', fontSize: '0.75rem', cursor: newFolderName.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, whiteSpace: 'nowrap' }}>Create</button>
                    </div>
                  </div>

                  {/* Upload */}
                  <div style={{ marginBottom: '1rem' }}>
                    <input type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt" multiple onChange={async (e) => { const files = Array.from(e.target.files || []); for (const f of files) await uploadGlobalDoc(f); e.target.value = '' }} style={{ display: 'none' }} id="global-upload" />
                    <label htmlFor="global-upload" onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={async (e) => { e.preventDefault(); setDragOver(false); const files = Array.from(e.dataTransfer.files || []); for (const f of files) await uploadGlobalDoc(f) }} style={{ display: 'block', padding: '0.75rem', borderRadius: '10px', border: `1px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? '#e63946' : 'rgba(255,255,255,0.06)'}`, background: dragOver ? 'rgba(230,57,70,0.08)' : 'rgba(255,255,255,0.02)', textAlign: 'center', cursor: 'pointer', fontSize: '0.78rem', color: '#94a3b8' }}>
                      {globalUploading ? 'Uploading & indexing…' : (P ? `Upload IFUs into “${P.split('/').pop()}”` : 'Upload IFUs / reference docs (PDF, Word, Excel)')}
                    </label>
                  </div>

                  {globalLibLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '1.5rem' }}>Loading…</div>}

                  {!globalLibLoading && children.length === 0 && directDocs.length === 0 && (
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                      <div style={{ fontSize: '1.8rem', marginBottom: '0.6rem', opacity: 0.4 }}>&#127760;</div>
                      <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>{P ? 'This folder is empty.' : 'No global documents yet.'}</div>
                      <div style={{ color: '#4a5568', fontSize: '0.72rem', marginTop: '0.3rem', opacity: 0.7 }}>Upload an IFU above — it becomes searchable for every hospital.</div>
                    </div>
                  )}

                  {/* Sub-folders */}
                  {children.map((childPath: string) => {
                    const name = childPath.split('/').pop()
                    const count = realDocs.filter((d: any) => (d.folder || '') === childPath || (d.folder || '').startsWith(childPath + '/')).length
                    return (
                      <div key={childPath} onClick={() => setCurrentFolder(childPath)} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '0.7rem 0.85rem', marginBottom: '0.55rem', cursor: 'pointer' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <defs><linearGradient id={`glfg${childPath.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient></defs>
                          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={`url(#glfg${childPath.replace(/[^a-z0-9]/gi, '')})`} />
                        </svg>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                          <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '1px' }}>{count} document{count !== 1 ? 's' : ''}</div>
                        </div>
                        <button onClick={ev => { ev.stopPropagation(); deleteGlobalLibFolder(childPath) }} title="Delete folder" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>&#10005;</button>
                        <span style={{ color: '#475569', fontSize: '1.1rem', flexShrink: 0 }}>&#8250;</span>
                      </div>
                    )
                  })}

                  {/* Documents here */}
                  {directDocs.length > 0 && (
                    <div style={{ marginTop: children.length > 0 ? '0.85rem' : 0 }}>
                      {children.length > 0 && <div style={{ fontSize: '0.66rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Documents here</div>}
                      {directDocs.map((d: any) => {
                        const ext = d.source_file?.split('.').pop()?.toLowerCase() || ''
                        const icon = ext === 'pdf' ? '&#128196;' : ext === 'xlsx' || ext === 'xls' || ext === 'csv' ? '&#128202;' : ext === 'doc' || ext === 'docx' ? '&#128209;' : '&#128196;'
                        return (
                          <div key={d.folder + d.source_file} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                            <span style={{ fontSize: '1.2rem', flexShrink: 0, lineHeight: 1.2 }} dangerouslySetInnerHTML={{ __html: icon }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 500, lineHeight: 1.35, wordBreak: 'break-word' }}>{d.source_file}</div>
                              <div style={{ fontSize: '0.64rem', color: '#22c55e', marginTop: '3px' }}>&#127760; Global · {d.chunks} section{d.chunks !== 1 ? 's' : ''} indexed</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end', flexShrink: 0 }}>
                              {d.file_path && <button onClick={() => window.open(d.file_path, '_blank')} style={{ padding: '0.3rem 0.7rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer' }}>Open</button>}
                              <button onClick={() => deleteGlobalDoc(d.source_file)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.7rem', cursor: 'pointer', opacity: 0.7 }}>&#10005; Delete</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}

            {activePanel === 'Brain' && (() => {
              const P = brainFolder
              const prefix = P ? P + '/' : ''
              const active = globalRules.filter((r: any) => r.source_file !== '__folder__')
              const allFolders = Array.from(new Set(globalRules.filter((r: any) => r.folder).map((r: any) => r.folder as string)))
              const childSet = new Set<string>()
              for (const f of allFolders) {
                if (!P) { const top = f.split('/')[0]; if (top) childSet.add(top) }
                else if (f !== P && f.startsWith(prefix)) { const seg = f.slice(prefix.length).split('/')[0]; if (seg) childSet.add(P + '/' + seg) }
              }
              const children = Array.from(childSet).sort()
              const crumb = (a: boolean) => ({ background: 'transparent', border: 'none', color: a ? '#e2e8f0' : '#e63946', fontSize: '0.82rem', fontWeight: a ? 600 : 400, cursor: 'pointer', padding: 0 })
              const rulesHere = active.filter((r: any) => (r.folder || '') === P)
              const ruleCard = (r: any) => editingRuleId === r.id ? (
                <div key={r.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.5rem' }}>
                  <textarea value={editRuleText} onChange={e => setEditRuleText(e.target.value)} rows={3} style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.4rem' }} />
                  <input value={editRuleFolder} onChange={e => setEditRuleFolder(e.target.value)} placeholder="&#128193; Folder (blank = Unfiled)" style={{ ...fieldInputStyle, marginBottom: '0.4rem' }} />
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={saveRuleEdit} style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditingRuleId(null)} style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.74rem', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={r.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: '0.35rem' }}>{r.content}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.6rem', color: '#4a5568' }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button onClick={() => startEditRule(r)} style={{ background: 'transparent', border: 'none', color: '#6366f1', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}>Edit</button>
                      <button onClick={() => deleteGlobalRule(r.id)} title="Delete" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>&#10005;</button>
                    </div>
                  </div>
                </div>
              )
              return (
                <div>
                  {/* breadcrumb */}
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.6rem' }}>
                    <button onClick={() => setBrainFolder('')} style={crumb(!P)}>&#128193; All</button>
                    {P && P.split('/').map((seg, i, arr) => {
                      const path = arr.slice(0, i + 1).join('/')
                      return <span key={path} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ color: '#4a5568' }}>/</span><button onClick={() => setBrainFolder(path)} style={crumb(i === arr.length - 1)}>{seg}</button></span>
                    })}
                  </div>
                  {/* new folder + new rule */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <input value={brainNewFolder} onChange={e => setBrainNewFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createGlobalFolder() }} placeholder={P ? `New sub-folder in ${P.split('/').pop()}…` : '📁 New folder…'} style={fieldInputStyle} />
                    <button onClick={createGlobalFolder} disabled={!brainNewFolder.trim()} style={{ padding: '0.45rem 0.8rem', borderRadius: '8px', border: 'none', background: brainNewFolder.trim() ? '#e63946' : '#2d3748', color: '#fff', fontSize: '0.75rem', cursor: brainNewFolder.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, whiteSpace: 'nowrap' }}>Folder</button>
                  </div>
                  {!addingRule && <button onClick={startAddRule} style={{ width: '100%', padding: '0.55rem', marginBottom: '0.7rem', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#c7d2fe', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>&#43; New rule{P ? ` in ${P.split('/').pop()}` : ''}</button>}
                  {addingRule && (
                    <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.7rem' }}>
                      <div style={{ fontSize: '0.72rem', color: '#c7d2fe', marginBottom: '0.35rem' }}>New global rule — write it specific &amp; self-contained (e.g. &ldquo;For an MVR, never use a three-stage venous cannula — use bicaval&rdquo;).</div>
                      <textarea value={editRuleText} onChange={e => setEditRuleText(e.target.value)} rows={3} autoFocus placeholder="Type the rule COR should always follow…" style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.4rem' }} />
                      <input value={editRuleFolder} onChange={e => setEditRuleFolder(e.target.value)} placeholder="&#128193; Folder (blank = Unfiled)" style={{ ...fieldInputStyle, marginBottom: '0.4rem' }} />
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={saveNewRule} disabled={!editRuleText.trim()} style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: 'none', background: editRuleText.trim() ? '#6366f1' : '#2d3748', color: '#fff', fontSize: '0.74rem', fontWeight: 600, cursor: editRuleText.trim() ? 'pointer' : 'not-allowed' }}>Save rule</button>
                        <button onClick={() => { setAddingRule(false); setEditRuleText('') }} style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.74rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {globalRulesLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '1.5rem' }}>Loading…</div>}
                  {children.map((childPath: string) => {
                    const name = childPath.split('/').pop()
                    const count = active.filter((r: any) => r.folder === childPath || (r.folder || '').startsWith(childPath + '/')).length
                    return (
                      <div key={childPath} onClick={() => setBrainFolder(childPath)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '0.7rem 0.85rem', marginBottom: '0.55rem', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.18)' }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <defs><linearGradient id={`bfg${childPath.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient></defs>
                          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={`url(#bfg${childPath.replace(/[^a-z0-9]/gi, '')})`} />
                        </svg>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                          <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '1px' }}>{count} rule{count !== 1 ? 's' : ''}</div>
                        </div>
                        <button onClick={ev => { ev.stopPropagation(); deleteGlobalFolder(childPath) }} title="Delete folder" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>&#10005;</button>
                        <span style={{ color: '#475569', fontSize: '1.1rem', flexShrink: 0 }}>&#8250;</span>
                      </div>
                    )
                  })}
                  {rulesHere.map(ruleCard)}
                  {!globalRulesLoading && !addingRule && children.length === 0 && rulesHere.length === 0 && (
                    <div style={{ textAlign: 'center', marginTop: '1.5rem', color: '#4a5568', fontSize: '0.78rem' }}>{P ? 'This folder is empty.' : 'Nothing taught globally yet — tap ＋ New rule, or use the Reports screen.'}</div>
                  )}
                </div>
              )
            })()}

            {activePanel === 'Templates' && (
              <div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '0.8rem' }}>Define the answer format for a topic. When someone asks about it, COR structures its reply this way — filling each section from your protocols and knowledge.</div>
                {!templateForm && (
                  <button onClick={() => setTemplateForm({ topic: '', format: '' })} style={{ width: '100%', padding: '0.55rem', marginBottom: '0.8rem', borderRadius: '10px', border: '1px solid rgba(230,57,70,0.4)', background: 'rgba(230,57,70,0.1)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>&#43; New template</button>
                )}
                {templateForm && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(230,57,70,0.4)', borderRadius: '10px', padding: '0.8rem', marginBottom: '0.8rem' }}>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Topic — what question(s) this applies to</div>
                    <input value={templateForm.topic} onChange={e => setTemplateForm(f => f ? { ...f, topic: e.target.value } : f)} placeholder="e.g. Adult case setup" style={{ ...fieldInputStyle, marginBottom: '0.5rem' }} />
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Format — the structure/headings COR should use</div>
                    <textarea value={templateForm.format} onChange={e => setTemplateForm(f => f ? { ...f, format: e.target.value } : f)} rows={9} placeholder={"ROOM SUPPLIES:\n- ...\n\nCPB SETUP:\n- ...\n\nPRIME:\n- ...\n\nCHECKLIST BEFORE GO:\n- ..."} style={{ ...fieldInputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.5rem' }} />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={saveTemplate} disabled={!templateForm.topic.trim() || !templateForm.format.trim()} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: templateForm.topic.trim() && templateForm.format.trim() ? '#e63946' : '#2d3748', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>{templateForm.id ? 'Save changes' : 'Save template'}</button>
                      <button onClick={() => setTemplateForm(null)} style={{ padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
                {templatesLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '1.5rem' }}>Loading…</div>}
                {!templatesLoading && answerTemplates.map((t: any) => (
                  <div key={t.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>&#128203; {t.topic}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.4, maxHeight: '4.5rem', overflow: 'hidden', marginBottom: '0.4rem' }}>{t.format}</div>
                    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => setTemplateForm({ id: t.id, topic: t.topic, format: t.format })} style={{ background: 'transparent', border: 'none', color: '#6366f1', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}>Edit</button>
                      <button onClick={() => deleteTemplate(t.id)} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>&#10005;</button>
                    </div>
                  </div>
                ))}
                {!templatesLoading && answerTemplates.length === 0 && !templateForm && (
                  <div style={{ textAlign: 'center', marginTop: '1.5rem', color: '#4a5568', fontSize: '0.78rem' }}>No templates yet. Tap &#43; New template to create your first one.</div>
                )}
              </div>
            )}

            {activePanel === 'Admin' && (
              <div>
                {/* Group switcher — show all groups for super owner */}
                {allGroups.length > 1 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Switch Group</div>
                    {allGroups.map((g) => (
                      <button
                        key={g.group_id}
                        onClick={() => switchGroup(g)}
                        style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: `1px solid ${g.group_id === userGroupId ? 'rgba(230,57,70,0.4)' : 'rgba(255,255,255,0.06)'}`, background: g.group_id === userGroupId ? 'rgba(230,57,70,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', textAlign: 'left' }}
                      >
                        <span style={{ fontSize: '0.8rem', color: g.group_id === userGroupId ? '#e63946' : '#94a3b8', fontWeight: g.group_id === userGroupId ? '600' : '400' }}>{g.group?.name}</span>
                        <span style={{ fontSize: '0.65rem', color: '#4a5568', textTransform: 'capitalize' }}>{g.role}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Create new group — always visible for super owner */}
                {user?.email === SUPER_OWNER_EMAIL && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Create New Group</div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        value={groupName}
                        onChange={e => setGroupName(e.target.value)}
                        placeholder="Group / Institution name"
                        style={{ flex: 1, padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <button onClick={createGroup} style={{ padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.8rem', fontWeight: '500', cursor: 'pointer', flexShrink: 0 }}>+</button>
                    </div>
                    {inviteError && <div style={{ color: '#e63946', fontSize: '0.72rem', marginTop: '0.4rem' }}>{inviteError}</div>}
                  </div>
                )}

                {/* Group info + invite (if group selected) */}
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

                    {/* Logbook Template Editor */}
                    <div style={{ marginTop: '1.5rem' }}>
                      <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Logbook Template</div>
                      <div style={{ fontSize: '0.68rem', color: '#4a5568', marginBottom: '0.5rem', opacity: 0.7 }}>Shared with the group when a case is logged.</div>
                      {logbookFields.map((field: string, idx: number) => (
                        <div
                          key={field}
                          draggable
                          onDragStart={() => setDragIdx(idx)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => {
                            if (dragIdx === null || dragIdx === idx) return
                            const updated = [...logbookFields]
                            const [moved] = updated.splice(dragIdx, 1)
                            updated.splice(idx, 0, moved)
                            setLogbookFields(updated)
                            saveTemplateFields('logbook', updated)
                            setDragIdx(null)
                          }}
                          onDragEnd={() => setDragIdx(null)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem', cursor: 'grab' }}
                        >
                          <span style={{ color: '#4a5568', fontSize: '0.7rem', padding: '0 2px', userSelect: 'none' }}>&#9776;</span>
                          <div style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: '#94a3b8' }}>{field}</div>
                          <button onClick={() => removeLogbookField(idx)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, padding: '2px' }}>&#10005;</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        <input
                          value={newLogbookField}
                          onChange={e => setNewLogbookField(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addLogbookField()}
                          placeholder="Add a logbook field..."
                          style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                        <button onClick={addLogbookField} style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}>+</button>
                      </div>
                    </div>

                    {/* Case Notes Template Editor */}
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Case Notes Template</div>
                      <div style={{ fontSize: '0.68rem', color: '#4a5568', marginBottom: '0.5rem', opacity: 0.7 }}>Personal to the user — not shared with the group.</div>
                      {caseNotesFields.map((field: string, idx: number) => (
                        <div
                          key={field}
                          draggable
                          onDragStart={() => setDragIdx(idx)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => {
                            if (dragIdx === null || dragIdx === idx) return
                            const updated = [...caseNotesFields]
                            const [moved] = updated.splice(dragIdx, 1)
                            updated.splice(idx, 0, moved)
                            setCaseNotesFields(updated)
                            saveTemplateFields('case_notes', updated)
                            setDragIdx(null)
                          }}
                          onDragEnd={() => setDragIdx(null)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem', cursor: 'grab' }}
                        >
                          <span style={{ color: '#4a5568', fontSize: '0.7rem', padding: '0 2px', userSelect: 'none' }}>&#9776;</span>
                          <div style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: '#94a3b8' }}>{field}</div>
                          <button onClick={() => removeCaseNotesField(idx)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, padding: '2px' }}>&#10005;</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        <input
                          value={newCaseNotesField}
                          onChange={e => setNewCaseNotesField(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addCaseNotesField()}
                          placeholder="Add a case notes field..."
                          style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                        <button onClick={addCaseNotesField} style={{ padding: '0.4rem 0.7rem', borderRadius: '6px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}>+</button>
                      </div>
                    </div>

                    {/* Case Type Equipment Mapping */}
                    <div style={{ marginTop: '1.5rem' }}>
                      <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Equipment Per Case Type</div>
                      <div style={{ fontSize: '0.68rem', color: '#4a5568', marginBottom: '0.5rem', opacity: 0.7 }}>Define default equipment used for each case type. Auto-deducted from inventory when a case is logged.</div>
                      {caseTypes.map((ct: string) => (
                        <div key={ct} style={{ marginBottom: '0.75rem' }}>
                          <button
                            onClick={() => setEditingCaseType(editingCaseType === ct ? null : ct)}
                            style={{ width: '100%', padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: editingCaseType === ct ? 'rgba(230,57,70,0.1)' : 'rgba(255,255,255,0.03)', color: editingCaseType === ct ? '#e63946' : '#94a3b8', fontSize: '0.8rem', fontWeight: '500', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
                          >
                            <span>{ct}</span>
                            <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>{(caseEquipMap[ct] || []).length} items {editingCaseType === ct ? '▲' : '▼'}</span>
                          </button>
                          {editingCaseType === ct && (
                            <div style={{ padding: '0.5rem', borderLeft: '2px solid rgba(230,57,70,0.3)', marginLeft: '0.5rem', marginTop: '0.3rem' }}>
                              {(caseEquipMap[ct] || []).map((item: any, idx: number) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.25rem' }}>
                                  <div style={{ flex: 1, fontSize: '0.75rem', color: '#94a3b8' }}>{item.itemName}</div>
                                  <div style={{ fontSize: '0.72rem', color: '#4a5568', width: '30px', textAlign: 'center' }}>x{item.quantity}</div>
                                  <button onClick={() => removeEquipFromCase(ct, idx)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.65rem', cursor: 'pointer', opacity: 0.6 }}>&#10005;</button>
                                </div>
                              ))}
                              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.3rem' }}>
                                <input value={newEquipItem} onChange={e => setNewEquipItem(e.target.value)} placeholder="Item name" style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.72rem', outline: 'none', boxSizing: 'border-box' }} />
                                <input value={newEquipQty} onChange={e => setNewEquipQty(e.target.value)} type="number" style={{ width: '40px', padding: '0.35rem 0.3rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.72rem', outline: 'none', textAlign: 'center' }} />
                                <button onClick={() => addEquipToCase(ct)} style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.72rem', cursor: 'pointer' }}>+</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activePanel === 'Equipment' && !panelLoading && (
              <>
                {/* Add item — photo or manual */}
                {(userRole === 'owner' || userRole === 'admin') && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      <input
                        type="file"
                        accept="image/*"
                        id="item-photo"
                        style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) identifyFromPhoto(f); e.target.value = '' }}
                      />
                      <label htmlFor="item-photo" style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', textAlign: 'center' }}>
                        {identifyingItem ? 'Identifying...' : 'Snap photo to identify item'}
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        placeholder="Item name"
                        style={{ flex: 1, padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <input
                        value={newItemQty}
                        onChange={e => setNewItemQty(e.target.value)}
                        placeholder="Qty"
                        type="number"
                        style={{ width: '60px', padding: '0.45rem 0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', textAlign: 'center' }}
                      />
                      <button onClick={addInventoryItem} disabled={inventoryAdding || !newItemName.trim()} style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: 'none', background: !newItemName.trim() ? '#2d3748' : '#e63946', color: 'white', fontSize: '0.78rem', cursor: !newItemName.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}>+</button>
                    </div>
                  </div>
                )}

                {inventoryItems.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>&#128230;</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>No inventory items yet.</div>
                  </div>
                )}
                {inventoryItems.map((item) => (
                  <div key={item.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                      <button onClick={() => updateItemQuantity(item.id, Math.max(0, (item.quantity || 0) - 1))} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                      <div style={{ width: '36px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: item.quantity <= 2 ? '#e63946' : item.quantity <= 5 ? '#f59e0b' : '#22c55e' }}>{item.quantity}</div>
                      <button onClick={() => updateItemQuantity(item.id, (item.quantity || 0) + 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                    {(userRole === 'owner' || userRole === 'admin') && (
                      <button onClick={() => deleteInventoryItem(item.id)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, flexShrink: 0 }}>&#10005;</button>
                    )}
                  </div>
                ))}
              </>
            )}

            {activePanel === 'Checklists' && !panelLoading && (() => {
              const isAdmin = userRole === 'owner' || userRole === 'admin'
              const P = currentFolder
              const prefix = P ? P + '/' : ''
              // Folders are encoded as a path prefix in file_name ("Pre-Bypass/Cart.pdf").
              const folderOf = (nm: string) => nm && nm.includes('/') ? nm.slice(0, nm.lastIndexOf('/')) : ''
              const displayNameOf = (nm: string) => nm && nm.includes('/') ? nm.slice(nm.lastIndexOf('/') + 1) : (nm || '')
              // Real files only (drop the empty-folder marker rows).
              const realFiles = checklistFiles.filter((f: any) => displayNameOf(f.file_name) !== '__folder__')
              // Every known folder path (from files + empty-folder markers).
              const allFolders = Array.from(new Set(checklistFiles.map((f: any) => folderOf(f.file_name)).filter(Boolean))) as string[]
              // Direct sub-folders of the folder we're viewing.
              const childSet = new Set<string>()
              for (const f of allFolders) {
                if (!P) { const top = f.split('/')[0]; if (top) childSet.add(top) }
                else if (f !== P && f.startsWith(prefix)) { const seg = f.slice(prefix.length).split('/')[0]; if (seg) childSet.add(P + '/' + seg) }
              }
              const children = Array.from(childSet).sort()
              // Files that live directly at this level.
              const directFiles = realFiles.filter((f: any) => folderOf(f.file_name) === P)
              const crumbStyle = (active: boolean) => ({ background: 'transparent', border: 'none', color: active ? '#e2e8f0' : '#e63946', fontSize: '0.82rem', fontWeight: active ? 600 : 400, cursor: 'pointer', padding: 0 })
              return (
              <>
                {/* Breadcrumb + create-folder — Owner/Admin only */}
                <div style={{ marginBottom: '0.7rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', marginBottom: isAdmin ? '0.5rem' : 0 }}>
                    <button onClick={() => setCurrentFolder('')} style={crumbStyle(!P)}>&#128193; All</button>
                    {P && P.split('/').map((seg, i, arr) => {
                      const path = arr.slice(0, i + 1).join('/')
                      return <span key={path} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ color: '#4a5568' }}>/</span><button onClick={() => setCurrentFolder(path)} style={crumbStyle(i === arr.length - 1)}>{seg}</button></span>
                    })}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createChecklistFolder() }} placeholder={P ? `New sub-folder in ${P.split('/').pop()}…` : '📁 New folder (e.g. Pre-Bypass, ECMO)…'} style={fieldInputStyle} />
                      <button onClick={createChecklistFolder} disabled={!newFolderName.trim()} style={{ padding: '0.45rem 0.8rem', borderRadius: '8px', border: 'none', background: newFolderName.trim() ? '#e63946' : '#2d3748', color: '#fff', fontSize: '0.75rem', cursor: newFolderName.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, whiteSpace: 'nowrap' }}>Create</button>
                    </div>
                  )}
                </div>

                {/* Upload — Owner/Admin only. Files land in the folder you're currently viewing. */}
                {isAdmin && (
                  <div style={{ marginBottom: '1rem' }}>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || [])
                        for (const f of files) await uploadChecklist(f)
                        e.target.value = ''
                      }}
                      style={{ display: 'none' }}
                      id="checklist-upload"
                    />
                    <label
                      htmlFor="checklist-upload"
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={async (e) => {
                        e.preventDefault()
                        setDragOver(false)
                        const files = Array.from(e.dataTransfer.files || [])
                        for (const f of files) await uploadChecklist(f)
                      }}
                      style={{ display: 'block', padding: '0.75rem', borderRadius: '10px', border: `1px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? '#e63946' : 'rgba(255,255,255,0.06)'}`, background: dragOver ? 'rgba(230,57,70,0.08)' : 'rgba(255,255,255,0.02)', textAlign: 'center', cursor: 'pointer', fontSize: '0.78rem', color: '#94a3b8', transition: 'all 0.15s ease' }}
                    >
                      {checklistUploading ? 'Uploading...' : (P ? `Upload into “${P.split('/').pop()}”` : 'Upload or drag files (PDF, Word, Excel, Images)')}
                    </label>
                  </div>
                )}

                {children.length === 0 && directFiles.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>&#128203;</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>{P ? 'This folder is empty.' : 'No checklists yet.'}</div>
                    {isAdmin && <div style={{ color: '#4a5568', fontSize: '0.72rem', marginTop: '0.3rem', opacity: 0.7 }}>{P ? 'Upload a file above, or create a folder inside this one.' : 'Name a folder above, or upload files directly.'}</div>}
                  </div>
                )}

                {/* Sub-folders */}
                {children.map((childPath: string) => {
                  const name = childPath.split('/').pop()
                  const count = realFiles.filter((f: any) => { const fo = folderOf(f.file_name); return fo === childPath || fo.startsWith(childPath + '/') }).length
                  return (
                    <div key={childPath} onClick={() => setCurrentFolder(childPath)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '0.7rem 0.85rem', marginBottom: '0.55rem', cursor: 'pointer', transition: 'transform 0.12s ease, border-color 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.18)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <defs><linearGradient id={`clfg${childPath.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient></defs>
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={`url(#clfg${childPath.replace(/[^a-z0-9]/gi, '')})`} />
                        <path d="M3 9h18v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" fill="#fff" opacity="0.12" />
                      </svg>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                        <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '1px' }}>{count} item{count !== 1 ? 's' : ''}</div>
                      </div>
                      {isAdmin && <button onClick={ev => { ev.stopPropagation(); deleteChecklistFolder(childPath) }} title="Delete folder" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>&#10005;</button>}
                      <span style={{ color: '#475569', fontSize: '1.1rem', flexShrink: 0 }}>&#8250;</span>
                    </div>
                  )
                })}

                {/* Files at this level */}
                {directFiles.length > 0 && (
                  <div style={{ marginTop: children.length > 0 ? '0.85rem' : 0 }}>
                    {children.length > 0 && <div style={{ fontSize: '0.66rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Files here</div>}
                    {directFiles.map((file: any) => {
                      const dispName = displayNameOf(file.file_name)
                      const ext = dispName.split('.').pop()?.toLowerCase() || ''
                      const icon = ext === 'pdf' ? '&#128196;' : ext === 'xlsx' || ext === 'xls' || ext === 'csv' ? '&#128202;' : ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? '&#128247;' : ext === 'doc' || ext === 'docx' ? '&#128209;' : '&#128196;'
                      const who = file.uploaded_by ? file.uploaded_by.split('@')[0] : ''
                      return (
                        <div key={file.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                          <span style={{ fontSize: '1.2rem', flexShrink: 0, lineHeight: 1.2 }} dangerouslySetInnerHTML={{ __html: icon }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 500, lineHeight: 1.35, wordBreak: 'break-word' }}>{dispName}</div>
                            <div style={{ fontSize: '0.65rem', color: '#4a5568', marginTop: '3px' }}>
                              {new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {who && <span> · {who}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end', flexShrink: 0 }}>
                            <button
                              onClick={() => window.open(`/api/checklists/download?id=${file.id}`, '_blank')}
                              style={{ padding: '0.3rem 0.7rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer' }}
                            >Open</button>
                            {isAdmin && (
                              <button onClick={() => deleteChecklist(file.id)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6 }}>&#10005; Delete</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
              )
            })()}

            {activePanel === 'Notes' && (
              <div>
                {notesLoading && <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.82rem', marginTop: '2rem' }}>Loading…</div>}

                {!notesLoading && openNoteId !== null && (
                  <div>
                    <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Title" style={{ ...fieldInputStyle, marginBottom: '0.4rem' }} />
                    <input value={noteFolder} onChange={e => setNoteFolder(e.target.value)} placeholder="Folder (optional)" style={{ ...fieldInputStyle, marginBottom: '0.4rem' }} />
                    <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Write your note…" rows={10} style={{ ...fieldInputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.4rem' }} />
                    {openNoteId === 'new' && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <input type="file" id="note-doc" accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) insertNoteDocument(f); e.target.value = '' }} style={{ display: 'none' }} />
                        <label htmlFor="note-doc" style={{ display: 'block', textAlign: 'center', padding: '0.5rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}>&#128206; …or insert a document (PDF, Word, Excel)</label>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={saveNote} disabled={savingNote} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}>{savingNote ? 'Saving…' : 'Save note'}</button>
                      <button onClick={() => setOpenNoteId(null)} style={{ padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                      {openNoteId !== 'new' && <button onClick={() => deleteNote(openNoteId as number)} style={{ padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(230,57,70,0.3)', background: 'transparent', color: '#e63946', fontSize: '0.75rem', cursor: 'pointer' }}>Delete</button>}
                    </div>
                  </div>
                )}

                {!notesLoading && openNoteId === null && (
                  <div>
                    <button onClick={() => openNoteEditor(null)} style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', marginBottom: '0.75rem' }}>+ New note</button>
                    {notesList.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#4a5568', fontSize: '0.8rem', marginTop: '2rem' }}>No notes yet. Create one above.</div>
                    )}
                    {(() => {
                      const folders: {[k: string]: any[]} = {}
                      for (const n of notesList) { const f = n.folder || 'Unfiled'; (folders[f] = folders[f] || []).push(n) }
                      return Object.keys(folders).sort().map(folderName => (
                        <div key={folderName} style={{ marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>&#128193; {folderName}</div>
                          {folders[folderName].map(n => (
                            <div key={n.id} onClick={() => openNoteEditor(n)} className="history-item" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.6rem 0.7rem', marginBottom: '0.35rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.8rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{n.title}</span>
                              <span style={{ fontSize: '0.6rem', color: '#4a5568', flexShrink: 0 }}>{new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              <button onClick={ev => { ev.stopPropagation(); deleteNoteQuick(n.id) }} title="Delete note" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: '0 0.1rem' }}>&#10005;</button>
                            </div>
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>
            )}

            {(activePanel === 'Logbook' || activePanel === 'Protocol' || activePanel === 'Policy') && !panelLoading && (
              <>
                {/* Folder navigation (Protocol/Policy) — breadcrumb path + create (sub)folder. Visible to everyone for browsing. */}
                {(activePanel === 'Protocol' || activePanel === 'Policy') && (
                  <div style={{ marginBottom: '0.85rem' }}>
                    {/* Breadcrumb path */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', marginBottom: (userRole === 'owner' || userRole === 'admin') ? '0.55rem' : 0 }}>
                      <button onClick={() => setCurrentFolder('')} style={{ background: 'transparent', border: 'none', color: currentFolder ? '#e63946' : '#e2e8f0', fontSize: '0.82rem', fontWeight: currentFolder ? 400 : 600, cursor: currentFolder ? 'pointer' : 'default', padding: 0 }}>&#128193; All folders</button>
                      {currentFolder && currentFolder.split('/').map((seg, i, arr) => {
                        const path = arr.slice(0, i + 1).join('/')
                        const isLast = i === arr.length - 1
                        return (
                          <span key={path} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ color: '#4a5568', fontSize: '0.8rem' }}>/</span>
                            <button onClick={() => { if (!isLast) setCurrentFolder(path) }} style={{ background: 'transparent', border: 'none', color: isLast ? '#e2e8f0' : '#e63946', fontSize: '0.82rem', fontWeight: isLast ? 600 : 400, cursor: isLast ? 'default' : 'pointer', padding: 0 }}>{seg}</button>
                          </span>
                        )
                      })}
                    </div>
                    {/* Create a folder here */}
                    {(userRole === 'owner' || userRole === 'admin') && (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input
                          value={newFolderName}
                          onChange={e => setNewFolderName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') openNewFolder() }}
                          placeholder={currentFolder ? `\u{1F4C1} New folder inside ${currentFolder.split('/').pop()}…` : '\u{1F4C1} Name a new folder…'}
                          style={fieldInputStyle}
                        />
                        <button onClick={openNewFolder} disabled={!newFolderName.trim()} style={{ padding: '0.45rem 0.8rem', borderRadius: '8px', border: 'none', background: newFolderName.trim() ? '#e63946' : '#2d3748', color: '#fff', fontSize: '0.75rem', cursor: newFolderName.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, whiteSpace: 'nowrap' }}>Create</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Add controls — Logbook: anyone. Protocol/Policy: owner/admin, and only once inside a folder. */}
                {(activePanel === 'Logbook' || ((userRole === 'owner' || userRole === 'admin') && !!currentFolder)) && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    style={{ marginBottom: '1rem', padding: '0.75rem', background: dragOver ? 'rgba(230,57,70,0.08)' : 'rgba(255,255,255,0.02)', border: `1px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? '#e63946' : 'rgba(255,255,255,0.06)'}`, borderRadius: '10px', transition: 'all 0.15s ease' }}
                  >
                    {(activePanel === 'Protocol' || activePanel === 'Policy') && currentFolder && (
                      <div style={{ fontSize: '0.7rem', color: '#22c55e', marginBottom: '0.5rem' }}>&#128228; Adding to &ldquo;{currentFolder}&rdquo;</div>
                    )}
                    {activePanel !== 'Logbook' && (
                      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                        <input ref={uploadInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt" multiple onChange={handleUploadFile} style={{ display: 'none' }} />
                        <button onClick={() => uploadInputRef.current?.click()} disabled={uploading} style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>
                          {uploading ? 'Uploading...' : dragOver ? 'Drop file here' : 'Upload or drag file (PDF, Word, Excel)'}
                        </button>
                      </div>
                    )}
                    {activePanel === 'Logbook' ? (
                      editingFields ? (
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Customize your {activePanel} fields</div>
                          {currentCaseFields().map((f, idx) => (
                            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                              <div style={{ flex: 1, padding: '0.35rem 0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: '#94a3b8' }}>{f}</div>
                              <button onClick={() => removeCaseField(idx)} title="Remove field" style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.8rem', cursor: 'pointer' }}>&#10005;</button>
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                            <input value={newFieldInput} onChange={e => setNewFieldInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCaseField()} placeholder="Add a field (e.g. Cannulation)" style={fieldInputStyle} />
                            <button onClick={addCaseField} style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}>+</button>
                          </div>
                          <button onClick={() => setEditingFields(false)} style={{ width: '100%', marginTop: '0.5rem', padding: '0.45rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>Done editing fields</button>
                        </div>
                      ) : (
                        <div>
                          {activePanel === 'Logbook' && (() => {
                            const folderOpts = Array.from(new Set(panelEntries.filter((e: any) => e.folder).map((e: any) => e.folder as string))).sort()
                            return (
                              <div style={{ marginBottom: '0.4rem', position: 'relative' }}>
                                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>Folder</div>
                                <button type="button" onClick={() => setCaseFolderOpen(o => !o)} style={{ ...fieldInputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                                    {caseFolder && <span style={{ color: '#f59e0b' }}>&#128193;</span>}
                                    <span style={{ color: caseFolder ? '#e2e8f0' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caseFolder || 'Unfiled (no folder)'}</span>
                                  </span>
                                  <span style={{ color: '#64748b', fontSize: '0.7rem', transform: caseFolderOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>&#9662;</span>
                                </button>
                                {caseFolderOpen && (
                                  <>
                                    <div onClick={() => setCaseFolderOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '0.3rem', maxHeight: '230px', overflowY: 'auto', boxShadow: '0 12px 34px rgba(0,0,0,0.55)' }}>
                                      {[''].concat(folderOpts).map(opt => (
                                        <button key={opt || '__none__'} type="button" onClick={() => { setCaseFolder(opt); setCaseFolderOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', borderRadius: '7px', border: 'none', background: caseFolder === opt ? 'rgba(230,57,70,0.14)' : 'transparent', color: caseFolder === opt ? '#fca5a5' : '#cbd5e1', fontSize: '0.8rem', cursor: 'pointer' }} onMouseEnter={e => { if (caseFolder !== opt) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }} onMouseLeave={e => { if (caseFolder !== opt) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                                          {opt ? <span style={{ color: '#f59e0b' }}>&#128193;</span> : <span style={{ width: '1rem', display: 'inline-block', textAlign: 'center', color: '#64748b' }}>&#8212;</span>}
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt || 'Unfiled (no folder)'}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )
                          })()}
                          {activePanel === 'Logbook' && (
                            <div style={{ marginBottom: '0.4rem' }}>
                              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>Surgery Date</div>
                              <input type="date" value={caseDate} onChange={e => setCaseDate(e.target.value)} style={fieldInputStyle} />
                            </div>
                          )}
                          {currentCaseFields().filter(f => f.toLowerCase() !== 'surgery date').map((f) => (
                            <div key={f} style={{ marginBottom: '0.4rem' }}>
                              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>{f}</div>
                              <input value={caseForm[f] || ''} onChange={e => setCaseForm(p => ({ ...p, [f]: e.target.value }))} placeholder={f} style={fieldInputStyle} />
                            </div>
                          ))}
                          {activePanel === 'Logbook' && (
                            <div style={{ marginBottom: '0.4rem' }}>
                              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>Case Notes (optional)</div>
                              <textarea value={caseNote} onChange={e => setCaseNote(e.target.value)} placeholder="Any notes about this case…" rows={3} style={{ ...fieldInputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                            <button onClick={saveCase} disabled={savingCase} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.78rem', fontWeight: '600', cursor: savingCase ? 'not-allowed' : 'pointer' }}>{savingCase ? 'Saving…' : 'Save case'}</button>
                            <button onClick={() => setEditingFields(true)} style={{ padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}>&#9998; Fields</button>
                          </div>
                        </div>
                      )
                    ) : null}
                    {uploadStatus && <div style={{ fontSize: '0.7rem', color: uploadStatus.includes('fail') || uploadStatus.includes('error') || uploadStatus.includes('Only') || uploadStatus.includes('Fill') ? '#e63946' : '#22c55e', marginTop: '0.4rem' }}>{uploadStatus}</div>}
                  </div>
                )}

                {activePanel === 'Logbook' && panelEntries.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>&#128195;</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>No {activePanel} entries yet.</div>
                    <div style={{ color: '#4a5568', fontSize: '0.72rem', marginTop: '0.3rem', opacity: 0.7 }}>Upload a file or add a manual entry above.</div>
                  </div>
                )}
                {(activePanel === 'Protocol' || activePanel === 'Policy') && (() => {
                  const isAdmin = userRole === 'owner' || userRole === 'admin'
                  const active = panelEntries.filter((e: any) => !e.archived && e.source_file !== '__folder__')
                  const archived = panelEntries.filter((e: any) => e.archived)
                  const archivedByFile: {[file: string]: any[]} = {}
                  for (const e of archived) { if (e.source_file) { (archivedByFile[e.source_file] = archivedByFile[e.source_file] || []).push(e) } }

                  // Renders the files (and manual text entries) that live in a given folder value.
                  const renderItems = (items: any[]) => {
                    const fileGroups: {[file: string]: any[]} = {}
                    const manual: any[] = []
                    for (const e of items) {
                      if (e.source_file && e.source_file !== 'Manual Entry') { (fileGroups[e.source_file] = fileGroups[e.source_file] || []).push(e) }
                      else manual.push(e)
                    }
                    return (
                      <>
                        {Object.keys(fileGroups).sort().map(file => {
                          const chunks = fileGroups[file]
                          const prev = archivedByFile[file] || []
                          const prevDates = Array.from(new Set(prev.map((v: any) => new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))))
                          return (
                            <div key={file} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>&#128196; {file}</div>
                                  <div style={{ fontSize: '0.65rem', color: '#4a5568', marginTop: '2px' }}>{new Date(chunks[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} &middot; {chunks.length} section{chunks.length > 1 ? 's' : ''}{chunks[0].uploaded_by ? ' · ' + chunks[0].uploaded_by : ''}</div>
                                  {prevDates.length > 0 && <div style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: '3px' }}>Earlier versions (archived, not used by COR): {prevDates.join(', ')}</div>}
                                </div>
                                {isAdmin && (
                                  <button onClick={() => deleteProtocolFile(file)} title="Delete protocol" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>&#10005;</button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {manual.map((e: any) => (
                          <div key={e.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>{e.content?.length > 220 ? e.content.slice(0, 220) + '…' : e.content}</div>
                            {isAdmin && (
                              <button onClick={() => deletePanelEntry(e.id)} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>&#10005;</button>
                            )}
                          </div>
                        ))}
                      </>
                    )
                  }

                  const countItems = (its: any[]) => {
                    const files = new Set(its.filter((e: any) => e.source_file && e.source_file !== 'Manual Entry').map((e: any) => e.source_file)).size
                    const manual = its.filter((e: any) => !e.source_file || e.source_file === 'Manual Entry').length
                    return files + manual
                  }

                  // Direct sub-folders of the folder we're currently viewing.
                  const childSet = new Set<string>()
                  for (const e of active) {
                    const f = (e.folder || '') as string
                    if (!f) continue
                    if (currentFolder === '') childSet.add(f.split('/')[0])
                    else if (f !== currentFolder && f.startsWith(currentFolder + '/')) childSet.add(f.slice(currentFolder.length + 1).split('/')[0])
                  }
                  const subfolders = Array.from(childSet).sort()
                  // Files that live directly at this level (not in a sub-folder).
                  const directFiles = active.filter((e: any) => (e.folder || '') === currentFolder)

                  if (subfolders.length === 0 && directFiles.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>&#128193;</div>
                        <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>{currentFolder ? 'This folder is empty.' : `No ${activePanel.toLowerCase()}s yet.`}</div>
                        {isAdmin && <div style={{ color: '#4a5568', fontSize: '0.72rem', marginTop: '0.3rem', opacity: 0.7 }}>{currentFolder ? 'Upload a file above, or create a folder inside this one.' : 'Name a folder above, then open it and upload files.'}</div>}
                      </div>
                    )
                  }
                  return (
                    <>
                      {subfolders.map((seg: string) => {
                        const path = currentFolder ? `${currentFolder}/${seg}` : seg
                        const under = active.filter((e: any) => (e.folder || '') === path || (e.folder || '').startsWith(path + '/'))
                        const total = countItems(under)
                        return (
                          <div key={path} onClick={() => setCurrentFolder(path)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '0.7rem 0.85rem', marginBottom: '0.55rem', cursor: 'pointer', transition: 'transform 0.12s ease, border-color 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.18)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <defs><linearGradient id={`pfg${path.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient></defs>
                              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={`url(#pfg${path.replace(/[^a-z0-9]/gi, '')})`} />
                              <path d="M3 9h18v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" fill="#fff" opacity="0.12" />
                            </svg>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg}</div>
                              <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '1px' }}>{total} item{total !== 1 ? 's' : ''}</div>
                            </div>
                            {isAdmin && <button onClick={ev => { ev.stopPropagation(); deleteProtocolFolder(path) }} title="Delete folder" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>&#10005;</button>}
                            <span style={{ color: '#475569', fontSize: '1.1rem', flexShrink: 0 }}>&#8250;</span>
                          </div>
                        )
                      })}
                      {directFiles.length > 0 && (
                        <div style={{ marginTop: subfolders.length > 0 ? '0.85rem' : 0 }}>
                          {subfolders.length > 0 && <div style={{ fontSize: '0.66rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Files here</div>}
                          {renderItems(directFiles)}
                        </div>
                      )}
                    </>
                  )
                })()}
                {activePanel === 'Logbook' && (() => {
                  // Solo users manage their own logbook fully; in a company only owner/admin manage folders & deletes.
                  const canManage = !userGroupId || userRole === 'owner' || userRole === 'admin'
                  const P = currentFolder
                  const prefix = P ? P + '/' : ''
                  // All known folder paths (from cases + empty-folder placeholders), then the direct children of P.
                  const allFolders = Array.from(new Set(panelEntries.filter((e: any) => e.folder).map((e: any) => e.folder as string)))
                  const childSet = new Set<string>()
                  for (const f of allFolders) {
                    if (!P) { const top = f.split('/')[0]; if (top) childSet.add(top) }
                    else if (f !== P && f.startsWith(prefix)) { const seg = f.slice(prefix.length).split('/')[0]; if (seg) childSet.add(P + '/' + seg) }
                  }
                  const children = Array.from(childSet).sort()
                  const crumbStyle = (active: boolean) => ({ background: 'transparent', border: 'none', color: active ? '#e2e8f0' : '#e63946', fontSize: '0.82rem', fontWeight: active ? 600 : 400, cursor: 'pointer', padding: 0 })
                  return (
                    <>
                      <div style={{ marginBottom: '0.7rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', marginBottom: canManage ? '0.5rem' : 0 }}>
                          <button onClick={() => setCurrentFolder('')} onDragOver={ev => ev.preventDefault()} onDrop={ev => { ev.preventDefault(); if (draggingCaseId != null) moveCaseToFolder(draggingCaseId, ''); setDraggingCaseId(null); setDragOverFolder(null) }} style={crumbStyle(!P)}>&#128193; All</button>
                          {P && P.split('/').map((seg, i, arr) => {
                            const path = arr.slice(0, i + 1).join('/')
                            return <span key={path} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ color: '#4a5568' }}>/</span><button onClick={() => setCurrentFolder(path)} style={crumbStyle(i === arr.length - 1)}>{seg}</button></span>
                          })}
                        </div>
                        {canManage && (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createCurrentFolder() }} placeholder={P ? `New sub-folder in ${P.split('/').pop()}…` : '📁 New folder (e.g. ECMO, Bypass)…'} style={fieldInputStyle} />
                            <button onClick={createCurrentFolder} disabled={!newFolderName.trim()} style={{ padding: '0.45rem 0.8rem', borderRadius: '8px', border: 'none', background: newFolderName.trim() ? '#e63946' : '#2d3748', color: '#fff', fontSize: '0.75rem', cursor: newFolderName.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, whiteSpace: 'nowrap' }}>Create</button>
                          </div>
                        )}
                      </div>
                      {children.map((childPath: string) => {
                        const name = childPath.split('/').pop()
                        const count = panelEntries.filter((e: any) => e.source_file !== '__folder__' && (e.folder === childPath || (e.folder || '').startsWith(childPath + '/'))).length
                        const isDropHover = dragOverFolder === childPath
                        return (
                          <div
                            key={childPath}
                            onClick={() => setCurrentFolder(childPath)}
                            onDragOver={ev => { ev.preventDefault(); if (dragOverFolder !== childPath) setDragOverFolder(childPath) }}
                            onDragLeave={() => setDragOverFolder(prev => prev === childPath ? null : prev)}
                            onDrop={ev => { ev.preventDefault(); setDragOverFolder(null); if (draggingCaseId != null) moveCaseToFolder(draggingCaseId, childPath); setDraggingCaseId(null) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', background: isDropHover ? 'linear-gradient(135deg, rgba(230,57,70,0.22), rgba(230,57,70,0.08))' : 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))', border: `1px solid ${isDropHover ? '#e63946' : 'rgba(255,255,255,0.08)'}`, borderRadius: '14px', padding: '0.7rem 0.85rem', marginBottom: '0.55rem', cursor: 'pointer', transition: 'transform 0.12s ease, border-color 0.15s ease, box-shadow 0.15s ease', boxShadow: isDropHover ? '0 0 0 3px rgba(230,57,70,0.15)' : '0 1px 2px rgba(0,0,0,0.25)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.18)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; if (!isDropHover) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
                          >
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <defs><linearGradient id={`fg${childPath.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient></defs>
                              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={`url(#fg${childPath.replace(/[^a-z0-9]/gi, '')})`} />
                              <path d="M3 9h18v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" fill="#fff" opacity="0.12" />
                            </svg>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                              <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '1px' }}>{count} case{count !== 1 ? 's' : ''}</div>
                            </div>
                            {canManage && <button onClick={ev => { ev.stopPropagation(); deleteProtocolFolder(childPath) }} title="Delete folder" style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>&#10005;</button>}
                            <span style={{ color: '#475569', fontSize: '1.1rem', flexShrink: 0 }}>&#8250;</span>
                          </div>
                        )
                      })}
                      {canManage && children.length > 0 && panelEntries.some((e: any) => e.source_file !== '__folder__' && (e.folder || '') === P) && (
                        <div style={{ fontSize: '0.62rem', color: '#475569', margin: '0.5rem 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>&#9776; Drag a case onto a folder to file it</div>
                      )}
                    </>
                  )
                })()}
                {activePanel === 'Logbook' && panelEntries.filter((e: any) => e.source_file !== '__folder__' && ((e.folder || '') === currentFolder)).map((entry) => {
                  const isCollapsible = activePanel === 'Logbook'
                  const isExpanded = expandedEntries.has(entry.id)
                  const initialsMatch = entry.content?.match(/\*?\*?Patient Initials:?\*?\*?\s*(.+?)(?:\n|$)/i)
                  const mrn = initialsMatch ? initialsMatch[1].trim() : null
                  const dateMatch = entry.content?.match(/\*?\*?Surgery Date:?\*?\*?\s*(.+?)(?:\n|$)/i)
                  const surgeryDate = dateMatch ? dateMatch[1].trim() : null

                  const canDrag = !userGroupId || userRole === 'owner' || userRole === 'admin'
                  return (
                    <div
                      key={entry.id}
                      draggable={canDrag}
                      onDragStart={ev => { setDraggingCaseId(entry.id); ev.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDraggingCaseId(null); setDragOverFolder(null) }}
                      onClick={() => {
                        if (isCollapsible) {
                          setExpandedEntries(prev => {
                            const next = new Set(prev)
                            if (next.has(entry.id)) next.delete(entry.id)
                            else next.add(entry.id)
                            return next
                          })
                        }
                      }}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.6rem', cursor: isCollapsible ? 'pointer' : 'default', transition: 'all 0.15s ease', opacity: draggingCaseId === entry.id ? 0.4 : 1 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isCollapsible && !isExpanded ? 0 : '0.4rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#4a5568' }}>
                            {fmtMDY(isCollapsible && surgeryDate ? surgeryDate : entry.created_at)}
                            {(() => {
                              const nm = entry.uploaded_by === user?.email ? (displayName || (user?.email || '').split('@')[0]) : (entry.uploaded_by ? entry.uploaded_by.split('@')[0] : '')
                              return nm ? <span style={{ marginLeft: '0.4rem' }}>by {nm}</span> : null
                            })()}
                          </div>
                          {isCollapsible && mrn && (
                            <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '500', marginTop: '2px' }}>Patient: {mrn}</div>
                          )}
                          {!isCollapsible && entry.source_file && entry.source_file !== 'Manual Entry' && (
                            <div style={{ fontSize: '0.65rem', color: '#3b82f6', marginTop: '2px' }}>{entry.source_file}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          {isCollapsible && <span style={{ fontSize: '0.65rem', color: '#4a5568' }}>{isExpanded ? '▲' : '▼'}</span>}
                          {(!userGroupId || userRole === 'owner' || userRole === 'admin') && (
                            <button onClick={(e) => { e.stopPropagation(); deletePanelEntry(entry.id) }} title="Delete" style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, flexShrink: 0 }}>&#10005;</button>
                          )}
                        </div>
                      </div>
                      {(!isCollapsible || isExpanded) && (
                        <>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{entry.content.length > 300 && !isExpanded ? entry.content.slice(0, 300) + '...' : entry.content}</div>
                          {isCollapsible && isExpanded && (
                            <button onClick={(e) => { e.stopPropagation(); printEntry(entry) }} style={{ marginTop: '0.6rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>&#128424; Print this case</button>
                          )}
                          {activePanel === 'Logbook' && isExpanded && entry.user_id === user?.id && (
                            <div
                              style={{ marginTop: '0.6rem' }}
                              onClick={e => e.stopPropagation()}
                              onDragOver={e => e.preventDefault()}
                              onDrop={async (e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const file = e.dataTransfer.files?.[0]
                                if (!file) return
                                const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|webm|mp4|mpeg)$/i.test(file.name)
                                if (!isAudio) return
                                setAddingNote(prev => ({ ...prev, [entry.id]: 'Transcribing audio...' }))
                                try {
                                  const formData = new FormData()
                                  formData.append('audio', file, file.name)
                                  const tRes = await fetch('/api/transcribe', { method: 'POST', body: formData })
                                  const tData = await tRes.json()
                                  const noteText = tData.text || ''
                                  if (noteText) {
                                    const res = await fetch('/api/logbook', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: entry.id, note: noteText, userId: user.id })
                                    })
                                    const data = await res.json()
                                    if (data.success) {
                                      setPanelEntries(prev => prev.map(e => e.id === entry.id ? { ...e, content: data.content } : e))
                                    }
                                  }
                                  setAddingNote(prev => ({ ...prev, [entry.id]: '' }))
                                } catch {
                                  setAddingNote(prev => ({ ...prev, [entry.id]: '' }))
                                }
                              }}
                            >
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input
                                  value={addingNote[entry.id] || ''}
                                  onChange={e => setAddingNote(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                  onKeyDown={async e => {
                                    if (e.key === 'Enter' && addingNote[entry.id]?.trim() && addingNote[entry.id] !== 'Transcribing audio...') {
                                      const res = await fetch('/api/logbook', {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: entry.id, note: addingNote[entry.id].trim(), userId: user.id })
                                      })
                                      const data = await res.json()
                                      if (data.success) {
                                        setPanelEntries(prev => prev.map(e => e.id === entry.id ? { ...e, content: data.content } : e))
                                        setAddingNote(prev => ({ ...prev, [entry.id]: '' }))
                                      }
                                    }
                                  }}
                                  placeholder="Add note or drop audio file..."
                                  style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <button
                                  onClick={async () => {
                                    if (!addingNote[entry.id]?.trim() || addingNote[entry.id] === 'Transcribing audio...') return
                                    const res = await fetch('/api/logbook', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: entry.id, note: addingNote[entry.id].trim(), userId: user.id })
                                    })
                                    const data = await res.json()
                                    if (data.success) {
                                      setPanelEntries(prev => prev.map(e => e.id === entry.id ? { ...e, content: data.content } : e))
                                      setAddingNote(prev => ({ ...prev, [entry.id]: '' }))
                                    }
                                  }}
                                  style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
                                >+</button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* MAIN CHAT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* MOBILE HAMBURGER */}
        <button className="mobile-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: 'none', position: 'absolute', top: 'calc(0.6rem + env(safe-area-inset-top))', left: '0.9rem', zIndex: 50, width: '42px', height: '42px', borderRadius: '10px', background: '#161b24', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 2px 10px rgba(0,0,0,0.4)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '1.45rem' }}>☰</button>

        {/* NEW CHAT — start a fresh conversation (only when a chat is in progress) */}
        {messages.length > 0 && (
          <button onClick={startNewChat} title="Start a new chat" style={{ position: 'absolute', top: 'calc(0.6rem + env(safe-area-inset-top))', right: '0.9rem', zIndex: 50, padding: '0.4rem 0.8rem', borderRadius: '10px', background: '#161b24', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 2px 10px rgba(0,0,0,0.4)', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.78rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>+ New chat</button>
        )}

        <div className="chat-area" style={{ flex: 1, overflowY: 'auto', padding: '3.4rem 2rem 1rem' }}>
          {messages.length === 0 && (
            <div className="idle-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', height: '100%', minHeight: '400px' }}>
              <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
                <div className="idle-title" style={{ fontSize: '1.5rem', fontWeight: '300', color: '#e2e8f0', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>Hello, I am <span style={{ color: '#e63946', fontWeight: '700' }}>COR</span></div>
                <div style={{ fontSize: '0.88rem', color: '#4a5568', lineHeight: '1.6' }}>Your cardiovascular perfusion assistant.<br/>Ask me anything about CPB, ECMO, or perfusion guidelines.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '1rem' }}>
                <div className="idle-gif" style={{ width: '500px', maxWidth: '90vw', aspectRatio: '800 / 375', overflow: 'hidden' }}>
                  <img src="/CORx3Dance.gif" alt="COR dancing" style={{ width: '100%', display: 'block' }} />
                </div>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="msg-bubble" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '0.75rem' }}>
              {m.role === 'assistant' && <img src="/cor-avatar.png" alt="COR" style={{ width: '44px', height: '44px', objectFit: 'contain', marginRight: '8px', flexShrink: 0, marginTop: '2px' }} />}
              <div className="msg-max-width" style={{ maxWidth: '68%', padding: '0.7rem 1rem', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.role === 'user' ? '#e63946' : 'rgba(255,255,255,0.05)', border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.88rem', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>
                {m.image && <img src={m.image} alt="attachment" style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '0.5rem', display: 'block' }} />}
                {m.role === 'assistant' ? (() => {
                  const { text, sources } = parseSources(m.content)
                  return (
                    <>
                      <div style={{ whiteSpace: 'normal' }}>{renderRich(text)}</div>
                      {(() => {
                        const docs: string[] = (m as any).docs || []
                        // COR's cited references, minus the ones that are actually the retrieved files (shown as file chips)
                        // Drop vague self-references to the knowledge base — those are already the green file chips.
                        const isGenericKB = (s: string) => /knowledge base|saved (reference|protocol|note|document|entry)|reference document|your (institution|notes|saved|protocol)|institution.?s (saved )?protocol|institutional (protocol|document|rule)/i.test(s)
                        const refs = sources.filter(s => !isGenericKB(s) && !docs.some(dn => { const b = dn.toLowerCase().replace(/\.[a-z0-9]+$/i, ''); const sl = s.toLowerCase(); return sl.includes(b) || b.includes(sl) }))
                        const question = messages.slice(0, i).reverse().find((mm: any) => mm.role === 'user')?.content || ''
                        const total = docs.length + refs.length
                        if (total === 0) return null
                        const open = expandedSources.has(i)
                        const base = { fontSize: '0.68rem', padding: '0.18rem 0.5rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', textDecoration: 'none', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px', display: 'inline-block' }
                        const linkStyle = { ...base, color: '#93c5fd', borderColor: 'rgba(99,102,241,0.35)', cursor: 'pointer' }
                        return (
                          <div style={{ marginTop: '0.6rem' }}>
                            <button onClick={() => setExpandedSources(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.66rem', cursor: 'pointer', padding: 0 }}>
                              <span>&#128218;</span><span>{total} source{total !== 1 ? 's' : ''}</span><span style={{ fontSize: '0.55rem' }}>{open ? '▲' : '▼'}</span>
                            </button>
                            {open && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                                {docs.map((dn, di) => (
                                  <button key={'doc' + di} onClick={() => openDocument(dn)} title={`Open ${dn}`} style={{ ...base, color: '#86efac', borderColor: 'rgba(34,197,94,0.35)', cursor: 'pointer' }}>&#128196; {dn.replace(/\.[a-z0-9]+$/i, '')}</button>
                                ))}
                                {refs.map((s, si) => {
                                  // Search for the exact source (lands on the specific guideline) rather than a society homepage.
                                  const generic = /^general/i.test(s.trim())
                                  const query = generic && question ? `${question} perfusion guideline` : `${s}${/guideline|standard|elso|amsect|sts|sca/i.test(s) ? '' : ' perfusion'}`
                                  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
                                  return <a key={'ref' + si} href={url} target="_blank" rel="noreferrer" style={linkStyle}>{s} &#8599;</a>
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )
                })() : m.content}
                {m.role === 'assistant' && (
                  <div style={{ marginTop: '0.55rem' }}>
                    <button onClick={() => openReportModal(i)} title="Report a wrong answer to the COR team" style={{ background: 'transparent', border: 'none', fontSize: '0.7rem', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><span style={{ color: '#f59e0b', fontSize: '0.82rem' }}>&#9888;</span><span style={{ color: '#94a3b8' }}>Something&rsquo;s wrong</span></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', paddingLeft: '2px' }}>
              <CorThinking />
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

        {/* Name prompt modal */}
        {showNamePrompt && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 60, backdropFilter: 'blur(4px)' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.75rem', width: '90%', maxWidth: '400px', animation: 'modalIn 0.2s ease' }}>
              <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#ffffff', marginBottom: '0.4rem' }}>Welcome to COR</div>
              <div style={{ fontSize: '0.78rem', color: '#4a5568', marginBottom: '1rem' }}>Enter your name so your team can identify you on schedules and case logs.</div>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveDisplayName()}
                placeholder="Your full name"
                autoFocus
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', marginBottom: '1rem', boxSizing: 'border-box' }}
              />
              <button onClick={saveDisplayName} disabled={!nameInput.trim()} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: 'none', background: !nameInput.trim() ? '#2d3748' : '#e63946', color: 'white', fontSize: '0.88rem', fontWeight: '600', cursor: !nameInput.trim() ? 'not-allowed' : 'pointer' }}>Continue</button>
            </div>
          </div>
        )}

        {/* Case-intake review card — edit before saving to the Logbook */}
        {caseLogReview && (
          <div style={{ padding: '0 1.5rem 0.5rem', background: '#080b12', flexShrink: 0 }}>
            <div style={{ maxWidth: '780px', margin: '0 auto', background: 'linear-gradient(135deg, rgba(230,57,70,0.10), rgba(255,255,255,0.02))', border: '1px solid rgba(230,57,70,0.35)', borderRadius: '16px', padding: '1rem 1.1rem', maxHeight: '52vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#fff' }}>📋 Review your case</div>
                <button onClick={cancelCaseIntake} title="Cancel" style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.8rem' }}>Check the details, fix anything, then save. This lands in your Logbook.</div>

              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>Surgery Date</label>
              <input value={caseLogDate} onChange={e => setCaseLogDate(e.target.value)} placeholder="MM/DD/YYYY" style={{ ...fieldInputStyle, marginBottom: '0.6rem' }} />

              {caseIntakeFields().map((f) => (
                <div key={f} style={{ marginBottom: '0.6rem' }}>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>{f}</label>
                  {f.toLowerCase() === 'case type' ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.2rem' }}>
                      {caseTypes.map(ct => {
                        const active = (caseLogData[f] || '').toLowerCase() === ct.toLowerCase()
                        return <button key={ct} onClick={() => setCaseLogData(prev => ({ ...prev, [f]: ct }))} style={{ padding: '0.3rem 0.7rem', borderRadius: '16px', border: `1px solid ${active ? '#e63946' : 'rgba(255,255,255,0.14)'}`, background: active ? '#e63946' : 'transparent', color: active ? '#fff' : '#94a3b8', fontSize: '0.74rem', cursor: 'pointer' }}>{ct}</button>
                      })}
                    </div>
                  ) : null}
                  <input value={caseLogData[f] || ''} onChange={e => setCaseLogData(prev => ({ ...prev, [f]: e.target.value }))} placeholder={`Enter ${f.toLowerCase()}…`} style={fieldInputStyle} />
                </div>
              ))}

              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>Case Notes (optional)</label>
              <textarea value={caseLogNote} onChange={e => setCaseLogNote(e.target.value)} placeholder="Anything else worth noting…" rows={2} style={{ ...fieldInputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.8rem' }} />

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={finalizeCaseIntake} disabled={savingCaseIntake} style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: 'none', background: savingCaseIntake ? '#2d3748' : '#e63946', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: savingCaseIntake ? 'not-allowed' : 'pointer' }}>{savingCaseIntake ? 'Saving…' : '✓ Save to Logbook'}</button>
                <button onClick={cancelCaseIntake} style={{ padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
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
              <textarea
                className="chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder=""
                rows={1}
                style={{ width: '100%', padding: '0.75rem 3rem 0.75rem 1.1rem', borderRadius: '18px', border: `1px solid ${listening ? 'rgba(230,57,70,0.5)' : 'rgba(255,255,255,0.1)'}`, background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s ease', resize: 'none', overflow: 'hidden', minHeight: '42px', maxHeight: '120px', fontFamily: 'inherit', lineHeight: '1.4' }}
                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' } }}
              />
              {/* Custom placeholder: vertically centered, always one line with an ellipsis — reliable on iOS
                  where a native textarea placeholder would wrap to a second line and look off-center. */}
              {!input && !listening && (
                <div style={{ position: 'absolute', left: '1.1rem', right: '2.8rem', top: '50%', transform: 'translateY(-50%)', color: '#4a5568', fontSize: '0.88rem', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
                  {caseLogExtraMode ? 'Item name + qty (e.g. "Cell Saver tubing 2") or "done"' : caseLogReview ? 'Add more details, or use the card above to save…' : caseLogging ? (caseLogMissing[0] ? `Tell me the ${caseLogMissing[0].toLowerCase()} (or several at once)…` : 'Tell COR about your case…') : COR_PLACEHOLDERS[placeholderIndex]}
                </div>
              )}
              {listening && (
                <div style={{ position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '3px', alignItems: 'center', pointerEvents: 'none' }}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} style={{ width: '3px', borderRadius: '2px', background: '#e63946', animation: `barPulse 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
                  ))}
                  <span style={{ marginLeft: '0.5rem', color: '#4a5568', fontSize: '0.88rem' }}>Recording… tap mic to stop</span>
                </div>
              )}
              <button className="desktop-only-mic" onClick={startListening} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px', borderRadius: '50%', background: listening ? '#e63946' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', animation: listening ? 'micGlow 1.5s ease-in-out infinite' : 'none' }}>
                {listening ? <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: 'white' }} /> : <img src="/Microphone.icon.png" alt="mic" style={{ width: '32px', height: '32px', objectFit: 'contain', opacity: 0.5 }} />}
              </button>
            </div>
            <button onClick={sendMessage} disabled={loading} style={{ width: '38px', height: '38px', borderRadius: '50%', background: loading ? 'rgba(255,255,255,0.06)' : '#e63946', color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.9rem' }}>➤</button>
            <button onClick={openTeachModal} title="Teach COR (save this as a rule)" style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
              <img src="/grad-hat.png" alt="Teach COR" style={{ width: '30px', height: '30px', objectFit: 'contain', display: 'block' }} />
            </button>
          </div>
        </div>
      </div>

      {teachModal && (
        <div onClick={() => setTeachModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', width: '100%', maxWidth: '440px' }}>
            <div style={{ fontSize: '1rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>Teach COR</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>Type a rule or correction and choose who it&rsquo;s for. COR will remember it.</div>
            <textarea value={teachText} onChange={e => setTeachText(e.target.value)} placeholder="e.g. For an MVR we never use a three-stage venous cannula — always bicaval." rows={3} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.4rem' }} />
            {teachStatus && <div style={{ fontSize: '0.75rem', color: teachStatus.startsWith('Saved') ? '#22c55e' : '#e63946', marginBottom: '0.5rem' }}>{teachStatus}</div>}
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.5rem 0 0.4rem' }}>Save this for:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <button onClick={() => saveTeaching('personal')} disabled={teachSaving || !teachText.trim()} style={{ padding: '0.6rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left' }}>&#128100; Just me <span style={{ color: '#4a5568', fontSize: '0.7rem' }}>· private note</span></button>
              {(userRole === 'owner' || userRole === 'admin') && (
                <button onClick={() => saveTeaching('company')} disabled={teachSaving || !teachText.trim()} style={{ padding: '0.6rem', borderRadius: '10px', border: '1px solid rgba(230,57,70,0.4)', background: 'rgba(230,57,70,0.1)', color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left' }}>&#127973; My company{userGroupName ? ` (${userGroupName})` : ''} <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>· whole team is notified</span></button>
              )}
              {user?.email === SUPER_OWNER_EMAIL && (
                <button onClick={() => saveTeaching('global')} disabled={teachSaving || !teachText.trim()} style={{ padding: '0.6rem', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left' }}>&#127758; COR Global <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>· every company on the platform</span></button>
              )}
            </div>
            <button onClick={() => setTeachModal(false)} style={{ width: '100%', marginTop: '0.7rem', padding: '0.5rem', borderRadius: '10px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {reportModal && (
        <div onClick={() => setReportModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', width: '100%', maxWidth: '440px' }}>
            <div style={{ fontSize: '1rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>&#9888; Report a wrong answer</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>This goes to the COR team to review and fix. Thank you!</div>
            {(reportSuggLoading || reportSuggestions.length > 0) && (
              <div style={{ marginBottom: '0.7rem' }}>
                <div style={{ fontSize: '0.68rem', color: '#6366f1', marginBottom: '0.35rem' }}>{reportSuggLoading ? 'COR is double-checking its answer…' : '✨ COR flagged these — tap any to use:'}</div>
                {!reportSuggLoading && reportSuggestions.map((s, idx) => (
                  <button key={idx} onClick={() => useReportSuggestion(s)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.45rem 0.6rem', marginBottom: '0.3rem', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.08)', color: '#c7d2fe', fontSize: '0.76rem', cursor: 'pointer', lineHeight: 1.4 }}>{s}</button>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.2rem' }}>What was wrong?</div>
            <textarea value={reportWrong} onChange={e => setReportWrong(e.target.value)} placeholder="e.g. It listed a three-stage cannula for an MVR — that's never used." rows={2} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.2rem' }}>The correct answer (optional)</div>
            <textarea value={reportAnswer} onChange={e => setReportAnswer(e.target.value)} placeholder="What should COR have said?" rows={2} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.5rem' }} />
            {reportStatus && <div style={{ fontSize: '0.75rem', color: reportStatus.startsWith('Sent') ? '#22c55e' : '#e63946', marginBottom: '0.5rem' }}>{reportStatus}</div>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setReportModal(null)} style={{ flex: 1, padding: '0.55rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitReport} disabled={reportSending || (!reportWrong.trim() && !reportAnswer.trim())} style={{ flex: 1, padding: '0.55rem', borderRadius: '10px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>{reportSending ? 'Sending…' : 'Send report'}</button>
            </div>
          </div>
        </div>
      )}

      {exportModal && (
        <div onClick={() => { setExportModal(null); setWpForm(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', width: '100%', maxWidth: '460px', maxHeight: '85vh', overflowY: 'auto' }}>
            {exportModal === 'choice' && (
              <>
                <div style={{ fontSize: '1rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.25rem' }}>Export your logbook</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.9rem' }}>Who is this for?</div>
                <button onClick={() => setExportModal('abcp')} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.7rem 0.8rem', marginBottom: '0.5rem', borderRadius: '10px', border: '1px solid rgba(230,57,70,0.4)', background: 'rgba(230,57,70,0.1)', color: '#e2e8f0', fontSize: '0.85rem', cursor: 'pointer' }}>&#128203; For ABCP <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>· official case-import format</span></button>
                <button onClick={exportPersonalExcel} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.7rem 0.8rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: '0.85rem', cursor: 'pointer' }}>&#128100; Just for me <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>· full Excel spreadsheet</span></button>
                <button onClick={() => setExportModal(null)} style={{ width: '100%', marginTop: '0.7rem', padding: '0.5rem', borderRadius: '10px', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
              </>
            )}
            {exportModal === 'abcp' && !wpForm && (
              <>
                <div style={{ fontSize: '1rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.25rem' }}>&#128203; ABCP export</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '0.8rem' }}>Pick which workplace this is for. Hospital &amp; program-authority info is filled once here and added to every export automatically.</div>
                {workplaces.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.7rem' }}>No workplaces yet — add one to get started.</div>
                ) : (
                  workplaces.map(w => (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem', marginBottom: '0.4rem', borderRadius: '10px', border: `1px solid ${selectedWp === w.id ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: selectedWp === w.id ? 'rgba(230,57,70,0.08)' : 'rgba(255,255,255,0.03)' }}>
                      <button onClick={() => setSelectedWp(w.id)} style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer' }}>{selectedWp === w.id ? '◉' : '○'} {w.label} <span style={{ color: '#4a5568', fontSize: '0.68rem' }}>{w.hospitalCity}{w.hospitalState ? ', ' + w.hospitalState : ''}</span></button>
                      <button onClick={() => setWpForm(w)} style={{ background: 'transparent', border: 'none', color: '#6366f1', fontSize: '0.72rem', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => deleteWorkplace(w.id)} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer' }}>&#10005;</button>
                    </div>
                  ))
                )}
                <button onClick={() => setWpForm({ ...EMPTY_WP })} style={{ width: '100%', padding: '0.5rem', marginTop: '0.3rem', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.15)', background: 'transparent', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer' }}>&#43; Add a workplace</button>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                  <button onClick={() => setExportModal('choice')} style={{ flex: 1, padding: '0.55rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>Back</button>
                  <button onClick={exportABCP} disabled={!selectedWp} style={{ flex: 1, padding: '0.55rem', borderRadius: '10px', border: 'none', background: selectedWp ? '#e63946' : '#2d3748', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: selectedWp ? 'pointer' : 'not-allowed' }}>Download ABCP file</button>
                </div>
              </>
            )}
            {exportModal === 'abcp' && wpForm && (
              <>
                <div style={{ fontSize: '1rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.6rem' }}>{wpForm.id ? 'Edit workplace' : 'Add a workplace'}</div>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Workplace name</div>
                <input value={wpForm.label} onChange={e => setWpForm((p: any) => ({ ...p, label: e.target.value }))} placeholder="e.g. UC Davis Medical Center" style={{ ...fieldInputStyle, marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.62rem', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0.3rem 0' }}>Hospital</div>
                <input value={wpForm.hospitalName} onChange={e => setWpForm((p: any) => ({ ...p, hospitalName: e.target.value }))} placeholder="Hospital name" style={{ ...fieldInputStyle, marginBottom: '0.35rem' }} />
                <input value={wpForm.hospitalStreet} onChange={e => setWpForm((p: any) => ({ ...p, hospitalStreet: e.target.value }))} placeholder="Street address" style={{ ...fieldInputStyle, marginBottom: '0.35rem' }} />
                <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem' }}>
                  <input value={wpForm.hospitalCity} onChange={e => setWpForm((p: any) => ({ ...p, hospitalCity: e.target.value }))} placeholder="City" style={fieldInputStyle} />
                  <input value={wpForm.hospitalState} onChange={e => setWpForm((p: any) => ({ ...p, hospitalState: e.target.value }))} placeholder="State" style={{ ...fieldInputStyle, maxWidth: '80px' }} />
                  <input value={wpForm.hospitalZip} onChange={e => setWpForm((p: any) => ({ ...p, hospitalZip: e.target.value }))} placeholder="Zip" style={{ ...fieldInputStyle, maxWidth: '90px' }} />
                </div>
                <div style={{ fontSize: '0.62rem', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0.5rem 0 0.3rem' }}>Program authority (contact)</div>
                <input value={wpForm.authorityName} onChange={e => setWpForm((p: any) => ({ ...p, authorityName: e.target.value }))} placeholder="Authority name" style={{ ...fieldInputStyle, marginBottom: '0.35rem' }} />
                <input value={wpForm.authorityTitle} onChange={e => setWpForm((p: any) => ({ ...p, authorityTitle: e.target.value }))} placeholder="Title" style={{ ...fieldInputStyle, marginBottom: '0.35rem' }} />
                <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem' }}>
                  <input value={wpForm.authorityPhone} onChange={e => setWpForm((p: any) => ({ ...p, authorityPhone: e.target.value }))} placeholder="Phone" style={fieldInputStyle} />
                  <input value={wpForm.authorityEmail} onChange={e => setWpForm((p: any) => ({ ...p, authorityEmail: e.target.value }))} placeholder="Email" style={fieldInputStyle} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setWpForm(null)} style={{ flex: 1, padding: '0.55rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveWorkplace} style={{ flex: 1, padding: '0.55rem', borderRadius: '10px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Save workplace</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmDialog && (
        <div onClick={() => setConfirmDialog(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.4rem', width: '100%', maxWidth: '380px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '1.1rem' }}>&#9888;</span>
              <span style={{ fontSize: '0.95rem', color: '#e2e8f0', fontWeight: 600 }}>Are you sure?</span>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: 1.55, marginBottom: '1.1rem' }}>{confirmDialog.message}</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#e2e8f0', fontSize: '0.84rem', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn() }} style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: 'none', background: '#e63946', color: '#fff', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>{confirmDialog.confirmLabel || 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {viewingDoc && (
        <div onClick={() => setViewingDoc(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', width: '100%', maxWidth: viewingDoc.fileUrl ? '900px' : '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <span style={{ fontSize: '1.1rem' }}>&#128196;</span>
                <span style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewingDoc.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                {viewingDoc.fileUrl && <a href={viewingDoc.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#93c5fd' }}>Download</a>}
                <button onClick={() => setViewingDoc(null)} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '1rem', cursor: 'pointer' }}>&#10005;</button>
              </div>
            </div>
            {(() => {
              if (viewingDoc.loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading document…</div>
              if (viewingDoc.error) return <div style={{ padding: '1.5rem', color: '#e63946', fontSize: '0.85rem' }}>{viewingDoc.error}</div>
              const ext = (viewingDoc.name.split('.').pop() || '').toLowerCase()
              const url = viewingDoc.fileUrl
              if (url) {
                if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return <div style={{ padding: '1rem', overflowY: 'auto' }}><img src={url} alt={viewingDoc.name} style={{ maxWidth: '100%', borderRadius: '8px' }} /></div>
                if (ext === 'pdf') return <iframe src={url} title={viewingDoc.name} style={{ width: '100%', height: '70vh', border: 'none', background: '#fff' }} />
                if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return <iframe src={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`} title={viewingDoc.name} style={{ width: '100%', height: '70vh', border: 'none', background: '#fff' }} />
              }
              // No stored original (older upload) — show the clean extracted text.
              return <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{viewingDoc.content}</div>
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
