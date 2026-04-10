'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getDayName(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function getDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getFullDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}


export default function SchedulePage() {
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userGroupId, setUserGroupId] = useState<string | null>(null)
  const [userGroupName, setUserGroupName] = useState<string | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<{[key: string]: string}>({})
  const [emailProfileMap, setEmailProfileMap] = useState<{[email: string]: string}>({})
  const [shiftTypes, setShiftTypes] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [timeOffRequests, setTimeOffRequests] = useState<any[]>([])
  const [newShiftName, setNewShiftName] = useState('')
  const [newShiftColor, setNewShiftColor] = useState('#3b82f6')
  const [generating, setGenerating] = useState(false)
  const [generateStatus, setGenerateStatus] = useState('')
  const [shiftConfigs, setShiftConfigs] = useState<{[shiftName: string]: { eligible: string[], perDay: number, rules: string }}>({})
  const [generalRules, setGeneralRules] = useState('')
  const [setWeeksCount, setSetWeeksCount] = useState(6)
  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(new Date())
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printScope, setPrintScope] = useState<'group' | 'mine'>('group')
  const [printMonth, setPrintMonth] = useState<'current' | 'next'>('current')
  const [printShifts, setPrintShifts] = useState<string[]>([])
  const [isPrinting, setIsPrinting] = useState(false)
  const [printEntries, setPrintEntries] = useState<any[]>([])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) { window.location.href = '/login' }
      else { setUser(session.user); setAuthLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    async function init() {
      const gRes = await fetch(`/api/groups?userId=${user.id}&email=${encodeURIComponent(user.email)}`)
      const gData = await gRes.json()
      if (gData.memberships?.length > 0) {
        const m = gData.memberships[0]
        setUserRole(m.role)
        setUserGroupId(m.group_id)
        setUserGroupName(m.group?.name || '')
      }
    }
    init()
  }, [user])

  useEffect(() => {
    if (!userGroupId) return
    fetchScheduleData()
  }, [userGroupId, currentDate, view])

  async function fetchScheduleData() {
    if (!userGroupId) return

    const mRes = await fetch(`/api/groups/members?groupId=${userGroupId}`)
    const mData = await mRes.json()
    setMembers(mData.members || [])

    const stRes = await fetch(`/api/schedule?groupId=${userGroupId}&shiftTypes=true`)
    const stData = await stRes.json()
    setShiftTypes(stData.shiftTypes || [])
    setGeneralRules(stData.generalRules || '')
    setSetWeeksCount(stData.setWeeks || 6)

    // Load saved shift configs
    const loadedConfigs: {[k: string]: { eligible: string[], perDay: number, rules: string }} = {}
    for (const st of (stData.shiftTypes || [])) {
      loadedConfigs[st.name] = {
        eligible: st.eligible || [],
        perDay: st.per_day || 1,
        rules: st.rules || '',
      }
    }
    setShiftConfigs(loadedConfigs)

    // Determine date range based on view
    let start: string
    if (view === 'week') {
      start = formatDate(getMonday(currentDate))
    } else {
      start = formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))
    }

    if (view === 'month') {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 7)
      let allEntries: any[] = []
      let ws = getMonday(monthStart)
      while (ws < monthEnd) {
        const r = await fetch(`/api/schedule?groupId=${userGroupId}&weekStart=${formatDate(ws)}`)
        const d = await r.json()
        allEntries = [...allEntries, ...(d.entries || [])]
        ws = new Date(ws)
        ws.setDate(ws.getDate() + 7)
      }
      setEntries(allEntries)
    } else {
      const sData = await (await fetch(`/api/schedule?groupId=${userGroupId}&weekStart=${start}`)).json()
      setEntries(sData.entries || [])
    }

    const pRes = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: userGroupId })
    })
    const pData = await pRes.json()
    setProfileMap(pData.profiles || {})
    setEmailProfileMap(pData.emailProfiles || {})

    const toRes = await fetch(`/api/time-off?groupId=${userGroupId}&pending=true`)
    const toData = await toRes.json()
    setTimeOffRequests(toData.requests || [])
  }

  async function setScheduleEntry(userId: string, userEmail: string, date: string, shiftType: string | null) {
    if (userRole !== 'owner' && userRole !== 'admin') return
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: userGroupId, userId, userEmail, date, shiftType, userRole })
    })
    if (shiftType) {
      setEntries(prev => {
        const filtered = prev.filter(e => !(e.user_email === userEmail && e.date === date))
        return [...filtered, { user_id: userId, user_email: userEmail, date, shift_type: shiftType, group_id: userGroupId }]
      })
    } else {
      setEntries(prev => prev.filter(e => !(e.user_email === userEmail && e.date === date)))
    }
  }

  async function saveShiftConfigs(configs: any, rules: string, swCount?: number) {
    if (!userGroupId) return
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: userGroupId,
        action: 'save_shift_configs',
        userRole,
        shiftTypeName: configs,
        shiftTypeColor: rules,
        setWeeks: swCount ?? setWeeksCount,
      })
    })
  }

  async function addShiftType() {
    if (!newShiftName.trim() || !userGroupId) return
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: userGroupId, action: 'add_shift_type', shiftTypeName: newShiftName.trim(), shiftTypeColor: newShiftColor, userRole, sortOrder: shiftTypes.length })
    })
    setNewShiftName('')
    fetchScheduleData()
  }

  async function deleteShiftType(id: number) {
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: userGroupId, action: 'delete_shift_type', shiftTypeName: id, userRole })
    })
    fetchScheduleData()
  }

  async function handleTimeOff(id: number, status: string) {
    await fetch('/api/time-off', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, userRole })
    })
    setTimeOffRequests(prev => prev.filter(r => r.id !== id))
  }

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate)
    if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCurrentDate(d)
  }

  function getMemberName(member: any): string {
    return emailProfileMap[member.email] || profileMap[member.user_id] || (member.email || '').split('@')[0]
  }

  function getEntry(userId: string, date: string, email?: string) {
    // Match by email first (most reliable), fall back to user_id only if non-null
    if (email) {
      const byEmail = entries.find(e => e.date === date && e.user_email === email)
      if (byEmail) return byEmail
    }
    if (userId) {
      return entries.find(e => e.date === date && e.user_id === userId)
    }
    return undefined
  }

  function getShiftColor(name: string): string {
    return shiftTypes.find(s => s.name === name)?.color || '#4a5568'
  }

  function getEntriesForDate(date: string) {
    return entries.filter(e => e.date === date)
  }

  if (authLoading) return null

  const isAdmin = userRole === 'owner' || userRole === 'admin'
  const colors = ['#3b82f6', '#22c55e', '#e63946', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#4a5568']
  const todayStr = formatDate(new Date())

  // Calculate the "set" cutoff date — entries before this are locked in
  const setCutoff = new Date()
  setCutoff.setDate(setCutoff.getDate() + setWeeksCount * 7)
  const setCutoffStr = formatDate(setCutoff)

  function isSet(dateStr: string): boolean {
    return dateStr <= setCutoffStr
  }

  // Build days for current view
  let viewDays: Date[] = []
  if (view === 'week') {
    const mon = getMonday(currentDate)
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(d.getDate() + i); viewDays.push(d) }
  } else {
    const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const startDay = getMonday(firstOfMonth)
    for (let i = 0; i < 42; i++) { const d = new Date(startDay); d.setDate(d.getDate() + i); viewDays.push(d) }
  }

  // Header label
  let headerLabel = ''
  if (view === 'week') headerLabel = `${getDateLabel(viewDays[0])} - ${getDateLabel(viewDays[6])}`
  else headerLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #080b12 0%, #0a0e17 100%)', color: '#e2e8f0', fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: '1rem', backdropFilter: 'blur(12px)', background: 'rgba(8,11,18,0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginRight: 'auto' }}>
          <button onClick={() => window.location.href = '/'} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer', borderRadius: '10px', padding: '0.4rem 0.6rem', transition: 'all 0.15s ease' }}>&larr;</button>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1.15rem', letterSpacing: '-0.01em' }}>Schedule</div>
            <div style={{ fontSize: '0.7rem', color: '#e63946', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{userGroupName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>&larr;</button>
          <button onClick={() => { setPickerMonth(currentDate); setShowDatePicker(!showDatePicker) }} style={{ fontSize: '0.85rem', fontWeight: '500', minWidth: '160px', textAlign: 'center', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: '0.3rem 0.5rem', borderRadius: '6px' }}>{headerLabel}</button>
          <button onClick={() => navigate(1)} style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>&rarr;</button>
          <button onClick={() => setCurrentDate(new Date())} style={{ padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>Today</button>
          {(['week', 'month'] as const).map(v => (
            <button key={v} onClick={() => { setView(v); setCurrentDate(new Date()) }} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', border: `1px solid ${view === v ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: view === v ? 'rgba(230,57,70,0.15)' : 'rgba(255,255,255,0.04)', color: view === v ? '#e63946' : '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', textTransform: 'capitalize', fontWeight: view === v ? '600' : '400' }}>{v}</button>
          ))}

          {/* Mini Calendar Date Picker */}
          {showDatePicker && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.75rem', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer', padding: '0.2rem 0.5rem' }}>&larr;</button>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e2e8f0' }}>{pickerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer', padding: '0.2rem 0.5rem' }}>&rarr;</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                  <div key={d} style={{ fontSize: '0.6rem', color: '#4a5568', padding: '0.2rem', fontWeight: '500' }}>{d}</div>
                ))}
                {(() => {
                  const firstOfMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1)
                  const startDay = getMonday(firstOfMonth)
                  const days: Date[] = []
                  for (let i = 0; i < 42; i++) { const d = new Date(startDay); d.setDate(d.getDate() + i); days.push(d) }
                  const today = formatDate(new Date())
                  const selected = formatDate(currentDate)
                  return days.map((d, i) => {
                    const ds = formatDate(d)
                    const isCurrentMonth = d.getMonth() === pickerMonth.getMonth()
                    const isToday = ds === today
                    const isSelected = ds === selected
                    return (
                      <button key={i} onClick={() => { setCurrentDate(d); setShowDatePicker(false) }} style={{ padding: '0.3rem', fontSize: '0.7rem', borderRadius: '6px', border: isSelected ? '1px solid #e63946' : '1px solid transparent', background: isSelected ? 'rgba(230,57,70,0.2)' : isToday ? 'rgba(255,255,255,0.08)' : 'transparent', color: isSelected ? '#e63946' : isCurrentMonth ? '#e2e8f0' : '#4a5568', cursor: 'pointer', fontWeight: isToday ? '600' : '400' }}>
                        {d.getDate()}
                      </button>
                    )
                  })
                })()}
              </div>
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => { setPrintShifts(shiftTypes.map(s => s.name)); setShowPrintModal(true) }} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer' }}>Print</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', padding: '1rem 1.5rem' }}>
        {/* Main content */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          {/* Shift type selector for admins */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', marginRight: '0.3rem', fontWeight: '500', letterSpacing: '0.03em' }}>Assign:</span>
              {shiftTypes.map(st => (
                <button key={st.id} onClick={() => setSelectedShift(selectedShift === st.name ? null : st.name)} style={{ padding: '0.35rem 0.8rem', borderRadius: '20px', border: `1.5px solid ${selectedShift === st.name ? st.color : 'rgba(255,255,255,0.08)'}`, background: selectedShift === st.name ? st.color : 'rgba(255,255,255,0.03)', color: selectedShift === st.name ? 'white' : st.color, fontSize: '0.73rem', cursor: 'pointer', transition: 'all 0.2s ease', fontWeight: selectedShift === st.name ? '600' : '400', backdropFilter: 'blur(8px)', boxShadow: selectedShift === st.name ? `0 2px 12px ${st.color}33` : 'none' }}>{st.name}</button>
              ))}
              <button onClick={() => setSelectedShift(selectedShift === '__clear__' ? null : '__clear__')} style={{ padding: '0.35rem 0.8rem', borderRadius: '20px', border: `1.5px solid ${selectedShift === '__clear__' ? '#e63946' : 'rgba(255,255,255,0.08)'}`, background: selectedShift === '__clear__' ? 'rgba(230,57,70,0.15)' : 'rgba(255,255,255,0.03)', color: selectedShift === '__clear__' ? '#e63946' : '#64748b', fontSize: '0.73rem', cursor: 'pointer', transition: 'all 0.2s ease' }}>Clear</button>
            </div>
          )}

          {/* WEEK VIEW */}
          {view === 'week' && (
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontWeight: '600', width: '140px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team</th>
                    {viewDays.map(d => {
                      const isToday = formatDate(d) === todayStr
                      return (
                        <th key={formatDate(d)} style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', color: isToday ? '#e63946' : '#64748b', fontWeight: '600', fontSize: '0.72rem', position: 'relative' }}>
                          <div style={{ fontSize: '0.7rem', letterSpacing: '0.03em' }}>{getDayName(d)}</div>
                          <div style={{ fontSize: isToday ? '0.85rem' : '0.68rem', marginTop: '2px', opacity: isToday ? 1 : 0.6, fontWeight: isToday ? '700' : '400', color: isToday ? '#e63946' : '#94a3b8' }}>{d.getDate()}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member, mi) => (
                    <tr key={member.user_id || member.email} style={{ transition: 'background 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.8rem', fontWeight: '500' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `linear-gradient(135deg, ${colors[mi % colors.length]}44, ${colors[mi % colors.length]}22)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '700', color: colors[mi % colors.length], border: `1px solid ${colors[mi % colors.length]}33`, flexShrink: 0 }}>{getMemberName(member).charAt(0).toUpperCase()}</div>
                          <span>{getMemberName(member)}</span>
                        </div>
                      </td>
                      {viewDays.map(d => {
                        const dateStr = formatDate(d)
                        const entry = getEntry(member.user_id, dateStr, member.email)
                        const shiftName = entry?.shift_type || ''
                        const color = shiftName ? getShiftColor(shiftName) : 'transparent'
                        const isToday = dateStr === todayStr
                        return (
                          <td key={dateStr} onClick={() => { if (!isAdmin || !selectedShift) return; setScheduleEntry(member.user_id, member.email, dateStr, selectedShift === '__clear__' ? null : selectedShift) }} style={{ padding: '0.35rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: isAdmin && selectedShift ? 'pointer' : 'default', background: isToday ? 'rgba(230,57,70,0.03)' : 'transparent', borderLeft: isToday ? '1px solid rgba(230,57,70,0.1)' : '1px solid transparent', borderRight: isToday ? '1px solid rgba(230,57,70,0.1)' : '1px solid transparent' }}>
                            {shiftName && <div style={{ padding: '0.3rem 0.25rem', borderRadius: '8px', background: `linear-gradient(135deg, ${color}${isSet(dateStr) ? '28' : '10'}, ${color}${isSet(dateStr) ? '15' : '08'})`, color, fontSize: '0.7rem', fontWeight: '600', opacity: isSet(dateStr) ? 1 : 0.45, border: isSet(dateStr) ? `1px solid ${color}25` : `1px dashed ${color}30`, boxShadow: isSet(dateStr) ? `0 1px 4px ${color}15` : 'none', transition: 'all 0.15s ease' }}>{shiftName}</div>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* MONTH VIEW */}
          {view === 'month' && (
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} style={{ padding: '0.6rem', textAlign: 'center', fontSize: '0.72rem', color: '#64748b', fontWeight: '600', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
                ))}
                {viewDays.map(d => {
                  const dateStr = formatDate(d)
                  const isCurrentMonth = d.getMonth() === currentDate.getMonth()
                  const isToday = dateStr === todayStr
                  const dayEntries = getEntriesForDate(dateStr)
                  return (
                    <div key={dateStr} style={{ minHeight: '80px', padding: '0.4rem', background: isToday ? 'rgba(230,57,70,0.05)' : 'transparent', opacity: isCurrentMonth ? 1 : 0.25, borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: isToday ? '22px' : 'auto', height: isToday ? '22px' : 'auto', borderRadius: isToday ? '50%' : '0', background: isToday ? '#e63946' : 'transparent', color: isToday ? 'white' : '#64748b', fontSize: '0.72rem', fontWeight: isToday ? '700' : '400', marginBottom: '0.25rem' }}>{d.getDate()}</div>
                      {dayEntries.slice(0, 3).map((e: any, i: number) => {
                        const color = getShiftColor(e.shift_type)
                        const name = emailProfileMap[e.user_email] || profileMap[e.user_id] || (e.user_email || '').split('@')[0]
                        return (
                          <div key={i} style={{ fontSize: '0.55rem', padding: '2px 4px', borderRadius: '4px', background: `linear-gradient(135deg, ${color}${isSet(dateStr) ? '25' : '10'}, ${color}${isSet(dateStr) ? '12' : '05'})`, color, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '600', opacity: isSet(dateStr) ? 1 : 0.45, border: isSet(dateStr) ? `1px solid ${color}20` : `1px dashed ${color}25` }}>
                            {name.split(' ')[0]}
                          </div>
                        )
                      })}
                      {dayEntries.length > 3 && <div style={{ fontSize: '0.5rem', color: '#64748b', fontWeight: '500' }}>+{dayEntries.length - 3}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: '260px', flexShrink: 0, background: 'rgba(255,255,255,0.015)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '1rem', backdropFilter: 'blur(12px)', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
          {isAdmin && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Shift Types</div>
              {shiftTypes.map(st => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: st.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: '0.78rem', color: '#94a3b8' }}>{st.name}</div>
                  <button onClick={() => deleteShiftType(st.id)} style={{ background: 'transparent', border: 'none', color: '#4a5568', fontSize: '0.65rem', cursor: 'pointer', opacity: 0.6 }}>&#10005;</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem' }}>
                <input value={newShiftName} onChange={e => setNewShiftName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addShiftType()} placeholder="New shift..." style={{ flex: 1, padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }} />
                <select value={newShiftColor} onChange={e => setNewShiftColor(e.target.value)} style={{ padding: '0.35rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: '#0d1117', color: newShiftColor, fontSize: '0.75rem', cursor: 'pointer' }}>
                  {colors.map(c => <option key={c} value={c} style={{ color: c }}>&#9632;</option>)}
                </select>
                <button onClick={addShiftType} style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>+</button>
              </div>
            </div>
          )}

          {/* Auto-Generate Schedule */}
          {isAdmin && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Configure Shifts</div>
              <div style={{ fontSize: '0.68rem', color: '#4a5568', marginBottom: '0.5rem', opacity: 0.7 }}>Set eligible members and rules for each shift type.</div>

              {shiftTypes.map(st => {
                const config = shiftConfigs[st.name] || { eligible: [], perDay: 1, rules: '' }
                return (
                  <div key={st.id} style={{ marginBottom: '0.75rem', padding: '0.6rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '3px', background: st.color }} />
                      <div style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: '500', flex: 1 }}>{st.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.65rem', color: '#4a5568' }}>#/day:</span>
                        <input
                          type="number"
                          value={config.perDay}
                          onChange={e => setShiftConfigs(prev => ({ ...prev, [st.name]: { ...config, perDay: parseInt(e.target.value) || 1 } }))}
                          style={{ width: '35px', padding: '0.2rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.7rem', outline: 'none', textAlign: 'center' }}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#4a5568', marginBottom: '0.3rem' }}>Eligible:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.4rem' }}>
                      {members.map(m => {
                        const name = getMemberName(m)
                        const isSelected = config.eligible.includes(name)
                        return (
                          <button
                            key={m.user_id || m.email}
                            onClick={() => {
                              const updated = isSelected
                                ? config.eligible.filter((n: string) => n !== name)
                                : [...config.eligible, name]
                              setShiftConfigs(prev => ({ ...prev, [st.name]: { ...config, eligible: updated } }))
                            }}
                            style={{ padding: '0.2rem 0.45rem', borderRadius: '12px', border: `1px solid ${isSelected ? st.color : 'rgba(255,255,255,0.08)'}`, background: isSelected ? st.color + '22' : 'transparent', color: isSelected ? st.color : '#4a5568', fontSize: '0.65rem', cursor: 'pointer' }}
                          >{name}</button>
                        )
                      })}
                    </div>
                    <input
                      value={config.rules}
                      onChange={e => setShiftConfigs(prev => ({ ...prev, [st.name]: { ...config, rules: e.target.value } }))}
                      placeholder="Rules for this shift..."
                      style={{ width: '100%', padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.7rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                )
              })}

              <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.75rem', marginBottom: '0.4rem' }}>General Rules</div>
              <textarea
                value={generalRules}
                onChange={e => setGeneralRules(e.target.value)}
                placeholder={"e.g., No more than 3 consecutive call days\nRotate weekends evenly\nEveryone gets 2 days off per week"}
                rows={3}
                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.72rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4' }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', color: '#e2e8f0', fontWeight: '500' }}>Set schedule</div>
                  <div style={{ fontSize: '0.6rem', color: '#4a5568' }}>Weeks locked in as final</div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={setWeeksCount}
                  onChange={e => setSetWeeksCount(Math.max(1, Math.min(26, parseInt(e.target.value) || 6)))}
                  style={{ width: '40px', padding: '0.25rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.65rem', color: '#4a5568' }}>wks</span>
              </div>

              <button
                onClick={async () => {
                  setGenerateStatus('Saving...')
                  try {
                    await saveShiftConfigs(shiftConfigs, generalRules)
                    setGenerateStatus('Configuration saved!')
                    setTimeout(() => setGenerateStatus(''), 2000)
                  } catch { setGenerateStatus('Failed to save') }
                }}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer', marginTop: '0.5rem', marginBottom: '0.5rem' }}
              >Save Configuration</button>

              <button
                onClick={async () => {
                  if (!userGroupId || generating) return
                  // Save configs first
                  await saveShiftConfigs(shiftConfigs, generalRules)
                  // Validate at least one shift has eligible members
                  const hasConfig = Object.values(shiftConfigs).some((c: any) => c.eligible.length > 0)
                  if (!hasConfig) { setGenerateStatus('Select eligible members for at least one shift.'); return }

                  setGenerating(true)
                  setGenerateStatus('COR is building the schedule...')
                  try {
                    const toRes = await fetch(`/api/time-off?groupId=${userGroupId}`)
                    const toData = await toRes.json()
                    const approvedOff = (toData.requests || [])
                      .filter((r: any) => r.status === 'approved')
                      .map((r: any) => ({ name: emailProfileMap[r.user_email] || profileMap[r.user_id] || r.user_email?.split('@')[0], date: r.date }))

                    const memberList = members.map(m => ({
                      name: getMemberName(m),
                      userId: m.user_id,
                      email: m.email,
                    }))

                    const res = await fetch('/api/schedule/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        groupId: userGroupId,
                        userRole,
                        members: memberList,
                        shiftTypes,
                        timeOffDates: approvedOff,
                        startDate: formatDate(new Date()),
                        weeks: 26,
                      })
                    })
                    const data = await res.json()
                    if (data.success) {
                      setGenerateStatus(`Done! ${data.entriesGenerated} entries created.`)
                      fetchScheduleData()
                    } else {
                      setGenerateStatus(data.error || 'Failed to generate')
                    }
                  } catch { setGenerateStatus('Error generating schedule') }
                  setGenerating(false)
                }}
                disabled={generating}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: 'none', background: generating ? '#2d3748' : '#e63946', color: 'white', fontSize: '0.78rem', fontWeight: '500', cursor: generating ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}
              >
                {generating ? 'Generating...' : 'Generate 6-Month Schedule'}
              </button>
              {generateStatus && <div style={{ fontSize: '0.7rem', color: generateStatus.includes('Done') ? '#22c55e' : generateStatus.includes('COR') ? '#f59e0b' : '#e63946', marginTop: '0.4rem' }}>{generateStatus}</div>}
            </div>
          )}

          {!isAdmin && shiftTypes.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Legend</div>
              {shiftTypes.map(st => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: st.color, flexShrink: 0 }} />
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{st.name}</div>
                </div>
              ))}
            </div>
          )}

          {isAdmin && timeOffRequests.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Time-Off Requests</div>
              {timeOffRequests.map(req => (
                <div key={req.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: '500' }}>{emailProfileMap[req.user_email] || (req.user_id && profileMap[req.user_id]) || req.user_email?.split('@')[0]}</div>
                  <div style={{ fontSize: '0.7rem', color: '#4a5568', marginTop: '2px' }}>{new Date(req.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  {req.reason && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '3px' }}>{req.reason}</div>}
                  <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                    <button onClick={() => handleTimeOff(req.id, 'approved')} style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: 'none', background: '#22c55e', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => handleTimeOff(req.id, 'denied')} style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}>Deny</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Print Options Modal */}
      {showPrintModal && (() => {
        const now = new Date()
        const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        const nextMonthLabel = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPrintModal(false)}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', width: '360px', maxWidth: '90vw' }}>
              <div style={{ fontSize: '1rem', fontWeight: '600', color: '#e2e8f0', marginBottom: '1rem' }}>Print Schedule</div>

              <div style={{ fontSize: '0.75rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Show</div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {(['group', 'mine'] as const).map(s => (
                  <button key={s} onClick={() => setPrintScope(s)} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: `1px solid ${printScope === s ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: printScope === s ? 'rgba(230,57,70,0.15)' : 'rgba(255,255,255,0.04)', color: printScope === s ? '#e63946' : '#94a3b8', fontSize: '0.8rem', cursor: 'pointer', fontWeight: printScope === s ? '600' : '400' }}>{s === 'group' ? 'Group Schedule' : 'My Schedule'}</button>
                ))}
              </div>

              <div style={{ fontSize: '0.75rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Month</div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button onClick={() => setPrintMonth('current')} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: `1px solid ${printMonth === 'current' ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: printMonth === 'current' ? 'rgba(230,57,70,0.15)' : 'rgba(255,255,255,0.04)', color: printMonth === 'current' ? '#e63946' : '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', fontWeight: printMonth === 'current' ? '600' : '400' }}>{currentMonthLabel}</button>
                <button onClick={() => setPrintMonth('next')} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: `1px solid ${printMonth === 'next' ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: printMonth === 'next' ? 'rgba(230,57,70,0.15)' : 'rgba(255,255,255,0.04)', color: printMonth === 'next' ? '#e63946' : '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', fontWeight: printMonth === 'next' ? '600' : '400' }}>{nextMonthLabel}</button>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Shifts to include</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '1.25rem' }}>
                {shiftTypes.map(st => {
                  const included = printShifts.includes(st.name)
                  return (
                    <button key={st.id} onClick={() => setPrintShifts(prev => included ? prev.filter(n => n !== st.name) : [...prev, st.name])} style={{ padding: '0.3rem 0.6rem', borderRadius: '12px', border: `1px solid ${included ? st.color : 'rgba(255,255,255,0.08)'}`, background: included ? st.color + '22' : 'transparent', color: included ? st.color : '#4a5568', fontSize: '0.72rem', cursor: 'pointer' }}>{st.name}</button>
                  )
                })}
              </div>

              <button
                onClick={async () => {
                  setShowPrintModal(false)
                  // Fetch all entries for the selected month
                  const target = printMonth === 'current' ? new Date() : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
                  const monthStart = new Date(target.getFullYear(), target.getMonth(), 1)
                  const monthEnd = new Date(target.getFullYear(), target.getMonth() + 1, 7)
                  let allEntries: any[] = []
                  let ws = getMonday(monthStart)
                  while (ws < monthEnd) {
                    const r = await fetch(`/api/schedule?groupId=${userGroupId}&weekStart=${formatDate(ws)}`)
                    const d = await r.json()
                    allEntries = [...allEntries, ...(d.entries || [])]
                    ws = new Date(ws)
                    ws.setDate(ws.getDate() + 7)
                  }
                  setPrintEntries(allEntries)
                  setIsPrinting(true)
                  setTimeout(() => { window.print(); setIsPrinting(false) }, 400)
                }}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
              >Print Schedule</button>
            </div>
          </div>
        )
      })()}

      {/* Print Layout — month calendar grid, 1 page landscape */}
      {isPrinting && (() => {
        const target = printMonth === 'current' ? new Date() : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
        const monthStart = new Date(target.getFullYear(), target.getMonth(), 1)
        const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        const startDay = getMonday(monthStart)
        const calDays: Date[] = []
        for (let i = 0; i < 42; i++) { const d = new Date(startDay); d.setDate(d.getDate() + i); calDays.push(d) }
        // Trim to 5 or 6 weeks
        const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0)
        const weeksNeeded = Math.ceil((calDays.findIndex(d => d > lastDayOfMonth)) / 7) || 6
        const displayDays = calDays.slice(0, weeksNeeded * 7)
        const weeks: Date[][] = []
        for (let i = 0; i < displayDays.length; i += 7) weeks.push(displayDays.slice(i, i + 7))

        const myMember = members.find(m => m.user_id === user?.id) || members.find(m => m.email === user?.email)
        const printMembers = printScope === 'mine' && myMember
          ? [myMember]
          : members

        function getPrintEntry(email: string, date: string) {
          return printEntries.find(e => e.user_email === email && e.date === date)
        }

        return (
          <div id="print-schedule" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 300, overflow: 'auto', padding: '0.3in 0.4in', color: '#000', fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif" }}>
            {/* Header with COR robot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '0.15in' }}>
              <img src="/COR-1.PNG" alt="COR" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16pt', fontWeight: '700', color: '#111' }}>
                  {printScope === 'mine' ? 'My Schedule' : 'Team Schedule'} — {monthLabel}
                </div>
                <div style={{ fontSize: '9pt', color: '#e63946', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{userGroupName}</div>
              </div>
              <img src="/COR-1.PNG" alt="COR" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
            </div>

            {/* Month calendar grid */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                    <th key={d} style={{ padding: '4px', textAlign: 'center', borderBottom: '2px solid #333', fontWeight: '600', color: '#333', fontSize: '8pt', width: `${100/7}%` }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map(d => {
                      const ds = formatDate(d)
                      const isCurrentMonth = d.getMonth() === monthStart.getMonth()
                      const isToday = ds === todayStr
                      // Get all member entries for this day
                      const dayShifts = printMembers
                        .map(m => {
                          const entry = getPrintEntry(m.email, ds)
                          if (!entry || !printShifts.includes(entry.shift_type)) return null
                          return { name: getMemberName(m), shift: entry.shift_type, color: getShiftColor(entry.shift_type) }
                        })
                        .filter(Boolean) as { name: string; shift: string; color: string }[]

                      return (
                        <td key={ds} style={{ border: '1px solid #ccc', padding: '2px 3px', verticalAlign: 'top', height: printScope === 'mine' ? '60px' : '80px', opacity: isCurrentMonth ? 1 : 0.3, background: isToday ? '#fff5f5' : 'white' }}>
                          <div style={{ fontSize: '8pt', fontWeight: isToday ? '700' : '500', color: isToday ? '#e63946' : '#333', marginBottom: '2px' }}>{d.getDate()}</div>
                          {dayShifts.map((s, i) => (
                            <div key={i} style={{ fontSize: '6pt', padding: '1px 3px', borderRadius: '2px', background: s.color + '22', color: s.color, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '600', border: `1px solid ${s.color}33` }}>
                              {printScope === 'mine' ? s.shift : `${s.name.split(' ')[0]} — ${s.shift}`}
                            </div>
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '0.1in', fontSize: '6.5pt', color: '#999' }}>
              <span>Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <span>—</span>
              <span>COR Perfusion Bot</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
