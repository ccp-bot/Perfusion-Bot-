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
  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [currentDate, setCurrentDate] = useState(new Date())

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
    if (view === 'day') {
      start = formatDate(currentDate)
    } else if (view === 'week') {
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

  async function saveShiftConfigs(configs: any, rules: string) {
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
    if (view === 'day') d.setDate(d.getDate() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
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

  // Build days for current view
  let viewDays: Date[] = []
  if (view === 'day') {
    viewDays = [currentDate]
  } else if (view === 'week') {
    const mon = getMonday(currentDate)
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(d.getDate() + i); viewDays.push(d) }
  } else {
    const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const startDay = getMonday(firstOfMonth)
    for (let i = 0; i < 42; i++) { const d = new Date(startDay); d.setDate(d.getDate() + i); viewDays.push(d) }
  }

  // Header label
  let headerLabel = ''
  if (view === 'day') headerLabel = getFullDateLabel(currentDate)
  else if (view === 'week') headerLabel = `${getDateLabel(viewDays[0])} - ${getDateLabel(viewDays[6])}`
  else headerLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={{ minHeight: '100vh', background: '#080b12', color: '#e2e8f0', fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => window.location.href = '/'} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>&larr;</button>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>Schedule</div>
            <div style={{ fontSize: '0.7rem', color: '#e63946', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{userGroupName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* View tabs */}
          {(['day', 'week', 'month'] as const).map(v => (
            <button key={v} onClick={() => { setView(v); setCurrentDate(new Date()) }} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', border: `1px solid ${view === v ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: view === v ? 'rgba(230,57,70,0.15)' : 'rgba(255,255,255,0.04)', color: view === v ? '#e63946' : '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', textTransform: 'capitalize', fontWeight: view === v ? '600' : '400' }}>{v}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>&larr;</button>
          <div style={{ fontSize: '0.85rem', fontWeight: '500', minWidth: '160px', textAlign: 'center' }}>{headerLabel}</div>
          <button onClick={() => navigate(1)} style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>&rarr;</button>
          <button onClick={() => setCurrentDate(new Date())} style={{ padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>Today</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', padding: '1rem 1.5rem' }}>
        {/* Main content */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          {/* Shift type selector for admins */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#4a5568', marginRight: '0.3rem' }}>Assign:</span>
              {shiftTypes.map(st => (
                <button key={st.id} onClick={() => setSelectedShift(selectedShift === st.name ? null : st.name)} style={{ padding: '0.3rem 0.7rem', borderRadius: '16px', border: `1px solid ${selectedShift === st.name ? st.color : 'rgba(255,255,255,0.1)'}`, background: selectedShift === st.name ? st.color : 'transparent', color: selectedShift === st.name ? 'white' : st.color, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s ease' }}>{st.name}</button>
              ))}
              <button onClick={() => setSelectedShift(selectedShift === '__clear__' ? null : '__clear__')} style={{ padding: '0.3rem 0.7rem', borderRadius: '16px', border: `1px solid ${selectedShift === '__clear__' ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: selectedShift === '__clear__' ? 'rgba(230,57,70,0.2)' : 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>Clear</button>
            </div>
          )}

          {/* DAY VIEW */}
          {view === 'day' && (
            <div>
              <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>On Duty Today</div>
              {members.map(member => {
                const entry = getEntry(member.user_id, formatDate(currentDate), member.email)
                const name = getMemberName(member)
                const shiftName = entry?.shift_type || ''
                const color = shiftName ? getShiftColor(shiftName) : ''
                return (
                  <div
                    key={member.user_id || member.email}
                    onClick={() => {
                      if (!isAdmin || !selectedShift) return
                      setScheduleEntry(member.user_id, member.email, formatDate(currentDate), selectedShift === '__clear__' ? null : selectedShift)
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', marginBottom: '0.5rem', cursor: isAdmin && selectedShift ? 'pointer' : 'default' }}
                  >
                    <div style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: '500' }}>{name}</div>
                    {shiftName ? (
                      <div style={{ padding: '0.3rem 0.75rem', borderRadius: '16px', background: color + '22', color, fontSize: '0.78rem', fontWeight: '500' }}>{shiftName}</div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: '#4a5568' }}>Not scheduled</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* WEEK VIEW */}
          {view === 'week' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#4a5568', fontWeight: '500', width: '140px' }}>Team</th>
                  {viewDays.map(d => (
                    <th key={formatDate(d)} style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', color: formatDate(d) === todayStr ? '#e63946' : '#4a5568', fontWeight: '500' }}>
                      <div>{getDayName(d)}</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{getDateLabel(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.user_id || member.email}>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.78rem' }}>
                      {getMemberName(member)}
                    </td>
                    {viewDays.map(d => {
                      const dateStr = formatDate(d)
                      const entry = getEntry(member.user_id, dateStr, member.email)
                      const shiftName = entry?.shift_type || ''
                      const color = shiftName ? getShiftColor(shiftName) : 'transparent'
                      return (
                        <td key={dateStr} onClick={() => { if (!isAdmin || !selectedShift) return; setScheduleEntry(member.user_id, member.email, dateStr, selectedShift === '__clear__' ? null : selectedShift) }} style={{ padding: '0.4rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: isAdmin && selectedShift ? 'pointer' : 'default', background: dateStr === todayStr ? 'rgba(230,57,70,0.04)' : 'transparent' }}>
                          {shiftName && <div style={{ padding: '0.25rem 0.3rem', borderRadius: '6px', background: color + '22', color, fontSize: '0.68rem', fontWeight: '500' }}>{shiftName}</div>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* MONTH VIEW */}
          {view === 'month' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', overflow: 'hidden' }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} style={{ padding: '0.4rem', textAlign: 'center', fontSize: '0.7rem', color: '#4a5568', fontWeight: '500', background: '#0d1117' }}>{d}</div>
              ))}
              {viewDays.map(d => {
                const dateStr = formatDate(d)
                const isCurrentMonth = d.getMonth() === currentDate.getMonth()
                const isToday = dateStr === todayStr
                const dayEntries = getEntriesForDate(dateStr)
                return (
                  <div key={dateStr} style={{ minHeight: '70px', padding: '0.3rem', background: isToday ? 'rgba(230,57,70,0.06)' : '#080b12', opacity: isCurrentMonth ? 1 : 0.3 }}>
                    <div style={{ fontSize: '0.7rem', color: isToday ? '#e63946' : '#4a5568', fontWeight: isToday ? '600' : '400', marginBottom: '0.2rem' }}>{d.getDate()}</div>
                    {dayEntries.slice(0, 3).map((e: any, i: number) => {
                      const color = getShiftColor(e.shift_type)
                      const name = emailProfileMap[e.user_email] || profileMap[e.user_id] || (e.user_email || '').split('@')[0]
                      return (
                        <div key={i} style={{ fontSize: '0.55rem', padding: '1px 3px', borderRadius: '3px', background: color + '22', color, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name.split(' ')[0]}
                        </div>
                      )
                    })}
                    {dayEntries.length > 3 && <div style={{ fontSize: '0.5rem', color: '#4a5568' }}>+{dayEntries.length - 3}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: '240px', flexShrink: 0 }}>
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
                        weeks: 6,
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
                {generating ? 'Generating...' : 'Generate 6-Week Schedule'}
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
    </div>
  )
}
