'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from './lib/supabase'
import CorThinking from './CorThinking'

const CATEGORIES = ['Protocol', 'Case Notes', 'Equipment', 'Policy', 'Logbook', 'Checklists', 'Charting']
const SUPER_OWNER_EMAIL = 'cliftonmarschel@gmail.com'

function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

const SIDEBAR_ITEMS = [
  { key: 'History', emoji: null, image: '/History.Icon.png', label: 'History' },
  { key: 'Logbook', emoji: null, image: '/Logbook.icon.png', label: 'Logbook' },
  { key: 'Notes', emoji: null, image: '/CaseNotes.Icon.png', label: 'Notes' },
  { key: 'Protocol', emoji: null, image: '/Protocol.Icon.png', label: 'Protocol' },
  { key: 'Policy', emoji: null, image: '/Policy.Icon.png', label: 'Policy' },
  { key: 'Equipment', emoji: null, image: '/Equipment.Icon.png', label: 'Equipment' },
  { key: 'Checklists', emoji: null, image: '/Checkmark.Icon.png', label: 'Checklists' },
  { key: 'Charting', emoji: null, image: '/Chart.Icon.png', label: 'Charting' },
  { key: 'Schedule', emoji: null, image: '/Schedule.Icon.png', label: 'Schedule' },
]

// Tier 1 (no hospital group): only these knowledge-base icons are available.
// Tier 2 (linked to a hospital group) and the super owner see everything.
const TIER1_ITEMS = ['History', 'Logbook', 'Notes']

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
  const [allGroups, setAllGroups] = useState<any[]>([])
  const [groupMembers, setGroupMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('worker')
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [groupName, setGroupName] = useState('')
  const [notifications, setNotifications] = useState<any[]>([])
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
  const [logbookFields, setLogbookFields] = useState<string[]>([])
  const [caseNotesFields, setCaseNotesFields] = useState<string[]>([])
  const [caseForm, setCaseForm] = useState<{[k: string]: string}>({})
  const [caseDate, setCaseDate] = useState('')
  const [caseNote, setCaseNote] = useState('')
  const [notesList, setNotesList] = useState<any[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [openNoteId, setOpenNoteId] = useState<number | 'new' | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteFolder, setNoteFolder] = useState('')
  const [savingNote, setSavingNote] = useState(false)
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

  // Show the medical/legal disclaimer once per device until acknowledged.
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('corDisclaimerAccepted')) {
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
        body: JSON.stringify({ userId: currentUser.id, title, messages: currentMessages })
      })
      const data = await res.json()
      if (data.error) console.error('Auto-save error:', data.error)
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
    try {
      const res = await fetch('/api/checklists', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) fetchChecklists()
    } catch {}
    setChecklistUploading(false)
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
    setOpenNoteId(null)
    if (key === 'Users') { fetchAllUsers() } else if (key === 'Notes') { fetchNotes() } else { fetchPanel(key) }
    if (key === 'Protocol' || key === 'Policy') {
      markNotificationsRead(key)
    }
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

  async function deletePanelEntry(id: number) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this entry? This cannot be undone.')) return
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
    for (const f of currentCaseFields()) { const v = (caseForm[f] || '').trim(); if (v) lines.push(`${f}: ${v}`) }
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
  async function deleteNote(id: number) {
    if (!user || !window.confirm('Delete this note? This cannot be undone.')) return
    try {
      await fetch('/api/notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userId: user.id }) })
      setOpenNoteId(null)
      fetchNotes()
    } catch { alert('Could not delete note.') }
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

  async function startCaseLog() {
    if (!user) return
    setCaseLogging(true)
    setCaseLogData({})
    setCaseLogCurrentField(0)
    setMessages(prev => [...prev, { role: 'user', content: 'log' }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'log',
          messages,
          userId: user.id,
          groupId: userGroupId,
          userEmail: user.email,
          caseLogMode: 'analyze',
          logbookFields,
          caseNotesFields,
        })
      })
      const data = await res.json()
      if (data.caseLogAnalysis) {
        const found = data.found || {}
        const missing = data.missing || [...logbookFields, ...caseNotesFields]
        setCaseLogData(found)
        setCaseLogMissing(missing)
        setCaseLogCurrentField(0)

        if (missing.length === 0) {
          // All fields found in conversation — finalize
          await finalizeCaseLog(found)
        } else {
          // Ask first missing question
          const foundSummary = Object.keys(found).length > 0
            ? `I found the following from our conversation:\n${Object.entries(found).map(([k, v]) => `- **${k}:** ${v}`).join('\n')}\n\nI still need a few more details.\n\n`
            : ''
          setMessages(prev => [...prev, { role: 'assistant', content: `${foundSummary}**${missing[0]}?**` }])
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error starting case log.' }])
      setCaseLogging(false)
    }
    setLoading(false)
  }

  async function handleCaseLogAnswer() {
    if (!input.trim()) return
    const answer = input.trim()
    const field = caseLogMissing[caseLogCurrentField]
    setInput('')

    const updatedData = { ...caseLogData, [field]: answer }
    setCaseLogData(updatedData)
    setMessages(prev => [...prev, { role: 'user', content: answer }])

    const nextIdx = caseLogCurrentField + 1
    if (nextIdx >= caseLogMissing.length) {
      // All questions answered — finalize
      setLoading(true)
      await finalizeCaseLog(updatedData)
      setLoading(false)
    } else {
      setCaseLogCurrentField(nextIdx)
      setMessages(prev => [...prev, { role: 'assistant', content: `**${caseLogMissing[nextIdx]}?**` }])
    }
  }

  async function finalizeCaseLog(data: {[key: string]: string}) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '',
          messages: [],
          userId: user?.id,
          groupId: userGroupId,
          userEmail: user?.email,
          caseLogMode: 'finalize',
          caseLogData: data,
          logbookFields,
          caseNotesFields,
        })
      })
      const result = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: result.answer || 'Case logged.' }])

      // Auto-deduct equipment based on case type
      const caseType = data['Case Type'] || data['case type'] || ''
      const matchedType = caseTypes.find(ct => ct.toLowerCase() === caseType.toLowerCase())
      if (matchedType && caseEquipMap[matchedType]?.length > 0) {
        await deductEquipmentForCase(matchedType)
        const deductedItems = caseEquipMap[matchedType].map(i => `${i.itemName} x${i.quantity}`).join(', ')
        setMessages(prev => [...prev, { role: 'assistant', content: `Equipment auto-deducted from inventory: ${deductedItems}\n\nDid you use any extra items not in the standard set? Type the item name and quantity, or type "done" to finish.` }])
        setCaseLogExtraMode(true)
        setCaseLogging(false)
        setCaseLogCurrentField(0)
        setCaseLogMissing([])
        return
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error saving case log.' }])
    }
    setCaseLogging(false)
    setCaseLogCurrentField(0)
    setCaseLogMissing([])
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

    // If in case logging mode, handle as answer to current question
    if (caseLogging) {
      await handleCaseLogAnswer()
      return
    }

    // Detect "log" command
    if (input.trim().toLowerCase() === 'log') {
      setInput('')
      await startCaseLog()
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
        const assistantMsg = { role: 'assistant', content: data.answer }
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
        @media (pointer: coarse) { .desktop-only-mic { display: none !important; } }
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .desktop-sidebar.mobile-open { display: flex !important; position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important; width: 220px !important; z-index: 100 !important; }
          .sidebar-overlay { display: block !important; }
          .mobile-hamburger { display: flex !important; }
          .slide-panel { position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important; width: 100% !important; z-index: 90 !important; }
          .chat-area { padding: 1rem 0.75rem 0.5rem !important; }
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
              COR is an <strong style={{ color: '#e2e8f0' }}>informational and educational tool</strong> for trained cardiovascular perfusionists. It does <strong style={{ color: '#e2e8f0' }}>not</strong> provide medical advice, diagnosis, or treatment, and is <strong style={{ color: '#e2e8f0' }}>not a substitute</strong> for your professional clinical judgment, your institution&apos;s protocols, or applicable standards of care.
              <br /><br />
              AI responses may be inaccurate or incomplete. Always verify critical information independently, and never rely on COR for emergency or patient-specific decisions. By continuing, you confirm you are a qualified professional using this tool at your own discretion.
            </div>
            <button
              onClick={() => { localStorage.setItem('corDisclaimerAccepted', '1'); setShowDisclaimer(false) }}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: 'none', background: '#e63946', color: '#ffffff', fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', letterSpacing: '0.02em' }}
            >
              I understand and agree
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
        <div style={{ padding: '0.75rem 0.5rem', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: '0.6rem', color: '#4a5568', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: '0.5rem' }}>Knowledge Base</div>
          {SIDEBAR_ITEMS.filter(item => hasFullAccess || TIER1_ITEMS.includes(item.key)).map(item => (
            <button
              key={item.key}
              onClick={() => { if (item.key === 'Schedule') { window.location.href = '/schedule'; return } if (item.key === 'Charting') { window.location.href = '/chart'; return } openPanel(item.key); setSidebarOpen(false) }}
              className={`sidebar-btn${activePanel === item.key ? ' active' : ''}`}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s ease', marginBottom: '2px', textAlign: 'left' }}
            >
              <span style={{ fontSize: '1rem', width: '50px', textAlign: 'center', flexShrink: 0 }}>
                {item.image
                  ? <img src={item.image} alt={item.label} style={{ width: '50px', height: '50px', objectFit: 'contain', verticalAlign: 'middle' }} />
                  : item.emoji}
              </span>
              <span style={{ fontSize: '0.82rem', color: activePanel === item.key ? '#e63946' : '#94a3b8', fontWeight: activePanel === item.key ? '600' : '400', position: 'relative' }}>
                {item.label}
                {unreadCounts[item.key] > 0 && (
                  <span style={{ position: 'absolute', top: '-6px', right: '-16px', minWidth: '16px', height: '16px', borderRadius: '8px', background: '#e63946', color: 'white', fontSize: '0.6rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxSizing: 'border-box' }}>{unreadCounts[item.key]}</span>
                )}
                {item.key === 'Equipment' && inventoryItems.filter((inv: any) => inv.quantity <= 2).length > 0 && (
                  <span style={{ position: 'absolute', top: '-6px', right: '-16px', minWidth: '16px', height: '16px', borderRadius: '8px', background: '#f59e0b', color: 'white', fontSize: '0.6rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxSizing: 'border-box' }}>{inventoryItems.filter((inv: any) => inv.quantity <= 2).length}</span>
                )}
              </span>
              {activePanel === item.key && !unreadCounts[item.key] && <div style={{ marginLeft: 'auto', width: '4px', height: '4px', borderRadius: '50%', background: '#e63946', flexShrink: 0 }} />}
            </button>
          ))}
          {(userRole === 'owner' || userRole === 'admin' || (!userRole && user?.email === SUPER_OWNER_EMAIL)) && (
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
              {user?.email === SUPER_OWNER_EMAIL && (
                <button
                  onClick={() => { openPanel('Users'); setSidebarOpen(false) }}
                  className={`sidebar-btn${activePanel === 'Users' ? ' active' : ''}`}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s ease', marginBottom: '2px', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '1.2rem', width: '50px', textAlign: 'center', flexShrink: 0 }}>&#128101;</span>
                  <span style={{ fontSize: '0.82rem', color: activePanel === 'Users' ? '#e63946' : '#94a3b8', fontWeight: activePanel === 'Users' ? '600' : '400' }}>Users</span>
                  {activePanel === 'Users' && <div style={{ marginLeft: 'auto', width: '4px', height: '4px', borderRadius: '50%', background: '#e63946', flexShrink: 0 }} />}
                </button>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
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
              <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '0.88rem' }}>{activePanel}</div>
              <div style={{ fontSize: '0.7rem', color: '#4a5568', marginTop: '1px' }}>
                {activePanel === 'History' ? `${conversations.length} conversations` : activePanel === 'Admin' ? `${groupMembers.length} members` : activePanel === 'Users' ? `${allUsers.length} users` : activePanel === 'Notes' ? `${notesList.length} notes` : activePanel === 'Checklists' ? `${checklistFiles.length} files` : activePanel === 'Equipment' ? `${inventoryItems.length} items` : `${panelEntries.length} saved entries`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {activePanel === 'History' && messages.length > 0 && (
                <button onClick={saveToHistory} disabled={savingHistory} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(230,57,70,0.3)', background: 'rgba(230,57,70,0.1)', color: '#e63946', fontSize: '0.72rem', cursor: 'pointer' }}>
                  {savingHistory ? '...' : '+ Save'}
                </button>
              )}
              {(activePanel === 'Logbook' || activePanel === 'Case Notes') && panelEntries.length > 0 && (
                <button onClick={() => {
                  const fields = activePanel === 'Logbook' ? ['Surgery Date', ...logbookFields] : activePanel === 'Case Notes' ? caseNotesFields : []
                  const params = new URLSearchParams({ userId: user?.id, category: activePanel!, groupId: userGroupId || '', fields: fields.join('||') })
                  window.open(`/api/export?${params.toString()}`, '_blank')
                }} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}>
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
                          <span key={gi} style={{ fontSize: '0.62rem', color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '6px', padding: '1px 6px', textTransform: 'capitalize' }}>{g.name} · {g.role}</span>
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

            {activePanel === 'Checklists' && !panelLoading && (
              <>
                {/* Upload — Owner/Admin only */}
                {(userRole === 'owner' || userRole === 'admin') && (
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
                      {checklistUploading ? 'Uploading...' : 'Upload or drag files (PDF, Word, Excel, Images)'}
                    </label>
                  </div>
                )}

                {checklistFiles.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>&#128203;</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>No checklists uploaded yet.</div>
                  </div>
                )}
                {checklistFiles.map((file) => {
                  const ext = file.file_name?.split('.').pop()?.toLowerCase() || ''
                  const icon = ext === 'pdf' ? '&#128196;' : ext === 'xlsx' || ext === 'xls' || ext === 'csv' ? '&#128202;' : ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? '&#128247;' : '&#128196;'
                  return (
                    <div key={file.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.2rem' }} dangerouslySetInnerHTML={{ __html: icon }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.file_name}</div>
                        <div style={{ fontSize: '0.65rem', color: '#4a5568', marginTop: '2px' }}>
                          {new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {file.uploaded_by && <span> by {file.uploaded_by}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => window.open(`/api/checklists/download?id=${file.id}`, '_blank')}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0 }}
                      >Open</button>
                      {(userRole === 'owner' || userRole === 'admin') && (
                        <button onClick={() => deleteChecklist(file.id)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.75rem', cursor: 'pointer', opacity: 0.6, flexShrink: 0 }}>&#10005;</button>
                      )}
                    </div>
                  )
                })}
              </>
            )}

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
                              <span style={{ fontSize: '0.8rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                              <span style={{ fontSize: '0.6rem', color: '#4a5568', flexShrink: 0 }}>{new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
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
                {/* Add controls — Logbook/Case Notes: anyone (their own cases). Protocol/Policy: owner/admin only. */}
                {(activePanel === 'Logbook' || userRole === 'owner' || userRole === 'admin') && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    style={{ marginBottom: '1rem', padding: '0.75rem', background: dragOver ? 'rgba(230,57,70,0.08)' : 'rgba(255,255,255,0.02)', border: `1px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? '#e63946' : 'rgba(255,255,255,0.06)'}`, borderRadius: '10px', transition: 'all 0.15s ease' }}
                  >
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      <input ref={uploadInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt" multiple onChange={handleUploadFile} style={{ display: 'none' }} />
                      <button onClick={() => uploadInputRef.current?.click()} disabled={uploading} style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>
                        {uploading ? 'Uploading...' : dragOver ? 'Drop file here' : 'Upload or drag file (PDF, Word, Excel)'}
                      </button>
                    </div>
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
                          {activePanel === 'Logbook' && (
                            <div style={{ marginBottom: '0.4rem' }}>
                              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>Surgery Date</div>
                              <input type="date" value={caseDate} onChange={e => setCaseDate(e.target.value)} style={fieldInputStyle} />
                            </div>
                          )}
                          {currentCaseFields().map((f) => (
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
                    ) : (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input
                          value={manualEntry}
                          onChange={e => setManualEntry(e.target.value)}
                          placeholder="Type a manual entry..."
                          style={{ flex: 1, padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                        <button onClick={saveManualEntry} disabled={uploading || !manualEntry.trim()} style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: 'none', background: !manualEntry.trim() ? '#2d3748' : '#e63946', color: 'white', fontSize: '0.78rem', cursor: !manualEntry.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}>+</button>
                      </div>
                    )}
                    {uploadStatus && <div style={{ fontSize: '0.7rem', color: uploadStatus.includes('fail') || uploadStatus.includes('error') || uploadStatus.includes('Only') || uploadStatus.includes('Fill') ? '#e63946' : '#22c55e', marginTop: '0.4rem' }}>{uploadStatus}</div>}
                  </div>
                )}

                {panelEntries.length === 0 && (
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.4 }}>&#128195;</div>
                    <div style={{ color: '#4a5568', fontSize: '0.8rem' }}>No {activePanel} entries yet.</div>
                    {(activePanel === 'Logbook' || userRole === 'owner' || userRole === 'admin') && <div style={{ color: '#4a5568', fontSize: '0.72rem', marginTop: '0.3rem', opacity: 0.7 }}>Upload a file or add a manual entry above.</div>}
                  </div>
                )}
                {panelEntries.map((entry) => {
                  const isCollapsible = activePanel === 'Logbook'
                  const isExpanded = expandedEntries.has(entry.id)
                  const mrnMatch = entry.content?.match(/\*?\*?MRN:?\*?\*?\s*(.+?)(?:\n|$)/i)
                  const mrn = mrnMatch ? mrnMatch[1].trim() : null
                  const dateMatch = entry.content?.match(/\*?\*?Surgery Date:?\*?\*?\s*(.+?)(?:\n|$)/i)
                  const surgeryDate = dateMatch ? dateMatch[1].trim() : null

                  return (
                    <div
                      key={entry.id}
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
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.6rem', cursor: isCollapsible ? 'pointer' : 'default', transition: 'all 0.15s ease' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isCollapsible && !isExpanded ? 0 : '0.4rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#4a5568' }}>
                            {isCollapsible && surgeryDate ? surgeryDate : new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {entry.uploaded_by && <span style={{ marginLeft: '0.4rem' }}>by {entry.uploaded_by}</span>}
                          </div>
                          {isCollapsible && mrn && (
                            <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: '500', marginTop: '2px' }}>MRN: {mrn}</div>
                          )}
                          {!isCollapsible && entry.source_file && entry.source_file !== 'Manual Entry' && (
                            <div style={{ fontSize: '0.65rem', color: '#3b82f6', marginTop: '2px' }}>{entry.source_file}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          {isCollapsible && <span style={{ fontSize: '0.65rem', color: '#4a5568' }}>{isExpanded ? '▲' : '▼'}</span>}
                          {(userRole === 'owner' || userRole === 'admin' || entry.user_id === user?.id) && (
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
        <button className="mobile-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: 'none', position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 50, width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '1.1rem' }}>☰</button>

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
              {m.role === 'assistant' && <img src="/icon.app.png" alt="COR" style={{ width: '44px', height: '44px', objectFit: 'contain', marginRight: '8px', flexShrink: 0, marginTop: '2px' }} />}
              <div className="msg-max-width" style={{ maxWidth: '68%', padding: '0.7rem 1rem', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.role === 'user' ? '#e63946' : 'rgba(255,255,255,0.05)', border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.88rem', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>
                {m.image && <img src={m.image} alt="attachment" style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '0.5rem', display: 'block' }} />}
                {m.content}
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
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder={listening ? 'Recording... click mic to stop' : caseLogExtraMode ? 'Item name + qty (e.g. "Cell Saver tubing 2") or "done"' : caseLogging ? `Answer: ${caseLogMissing[caseLogCurrentField] || ''}...` : COR_PLACEHOLDERS[placeholderIndex]}
                rows={1}
                style={{ width: '100%', padding: '0.75rem 3rem 0.75rem 1.1rem', borderRadius: '18px', border: `1px solid ${listening ? 'rgba(230,57,70,0.5)' : 'rgba(255,255,255,0.1)'}`, background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s ease', resize: 'none', overflow: 'hidden', minHeight: '42px', maxHeight: '120px', fontFamily: 'inherit', lineHeight: '1.4' }}
                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' } }}
              />
              {listening && (
                <div style={{ position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '3px', alignItems: 'center' }}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} style={{ width: '3px', borderRadius: '2px', background: '#e63946', animation: `barPulse 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
                  ))}
                </div>
              )}
              <button className="desktop-only-mic" onClick={startListening} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', width: '30px', height: '30px', borderRadius: '50%', background: listening ? '#e63946' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', animation: listening ? 'micGlow 1.5s ease-in-out infinite' : 'none' }}>
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
