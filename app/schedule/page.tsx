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

export default function SchedulePage() {
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userGroupId, setUserGroupId] = useState<string | null>(null)
  const [userGroupName, setUserGroupName] = useState<string | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<{[key: string]: string}>({})
  const [shiftTypes, setShiftTypes] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [timeOffRequests, setTimeOffRequests] = useState<any[]>([])
  const [newShiftName, setNewShiftName] = useState('')
  const [newShiftColor, setNewShiftColor] = useState('#3b82f6')
  const [selectedShift, setSelectedShift] = useState<string | null>(null)

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
      // Fetch group
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
  }, [userGroupId, weekStart])

  async function fetchScheduleData() {
    if (!userGroupId) return
    // Fetch members
    const mRes = await fetch(`/api/groups/members?groupId=${userGroupId}`)
    const mData = await mRes.json()
    setMembers(mData.members || [])

    // Fetch shift types
    const stRes = await fetch(`/api/schedule?groupId=${userGroupId}&shiftTypes=true`)
    const stData = await stRes.json()
    setShiftTypes(stData.shiftTypes || [])

    // Fetch schedule entries
    const sRes = await fetch(`/api/schedule?groupId=${userGroupId}&weekStart=${formatDate(weekStart)}`)
    const sData = await sRes.json()
    setEntries(sData.entries || [])

    // Fetch profiles
    const pRes = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: userGroupId })
    })
    const pData = await pRes.json()
    setProfileMap(pData.profiles || {})

    // Fetch time-off requests
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
    // Update local state
    if (shiftType) {
      setEntries(prev => {
        const filtered = prev.filter(e => !(e.user_id === userId && e.date === date))
        return [...filtered, { user_id: userId, user_email: userEmail, date, shift_type: shiftType, group_id: userGroupId }]
      })
    } else {
      setEntries(prev => prev.filter(e => !(e.user_id === userId && e.date === date)))
    }
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

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  // Build 7 days from weekStart
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d)
  }

  function getEntry(userId: string, date: string) {
    return entries.find(e => e.user_id === userId && e.date === date)
  }

  function getShiftColor(name: string): string {
    const st = shiftTypes.find(s => s.name === name)
    return st?.color || '#4a5568'
  }

  if (authLoading) return null

  const isAdmin = userRole === 'owner' || userRole === 'admin'
  const colors = ['#3b82f6', '#22c55e', '#e63946', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#4a5568']

  return (
    <div style={{ minHeight: '100vh', background: '#080b12', color: '#e2e8f0', fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => window.location.href = '/'} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>&larr;</button>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>Schedule</div>
            <div style={{ fontSize: '0.7rem', color: '#e63946', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{userGroupName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={prevWeek} style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>&larr; Prev</button>
          <div style={{ fontSize: '0.85rem', fontWeight: '500', minWidth: '140px', textAlign: 'center' }}>
            {getDateLabel(days[0])} - {getDateLabel(days[6])}
          </div>
          <button onClick={nextWeek} style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}>Next &rarr;</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', padding: '1rem 1.5rem' }}>
        {/* Main calendar grid */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          {/* Shift type selector for admins */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#4a5568', marginRight: '0.3rem' }}>Assign:</span>
              {shiftTypes.map(st => (
                <button
                  key={st.id}
                  onClick={() => setSelectedShift(selectedShift === st.name ? null : st.name)}
                  style={{ padding: '0.3rem 0.7rem', borderRadius: '16px', border: `1px solid ${selectedShift === st.name ? st.color : 'rgba(255,255,255,0.1)'}`, background: selectedShift === st.name ? st.color : 'transparent', color: selectedShift === st.name ? 'white' : st.color, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  {st.name}
                </button>
              ))}
              <button
                onClick={() => setSelectedShift(selectedShift === '__clear__' ? null : '__clear__')}
                style={{ padding: '0.3rem 0.7rem', borderRadius: '16px', border: `1px solid ${selectedShift === '__clear__' ? '#e63946' : 'rgba(255,255,255,0.1)'}`, background: selectedShift === '__clear__' ? 'rgba(230,57,70,0.2)' : 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          )}

          {/* Grid */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#4a5568', fontWeight: '500', width: '140px' }}>Team Member</th>
                {days.map(d => (
                  <th key={formatDate(d)} style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#4a5568', fontWeight: '500' }}>
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
                    {profileMap[member.user_id] || (member.email || '').split('@')[0]}
                  </td>
                  {days.map(d => {
                    const dateStr = formatDate(d)
                    const entry = getEntry(member.user_id, dateStr)
                    const shiftName = entry?.shift_type || ''
                    const color = shiftName ? getShiftColor(shiftName) : 'transparent'

                    return (
                      <td
                        key={dateStr}
                        onClick={() => {
                          if (!isAdmin || !selectedShift) return
                          if (selectedShift === '__clear__') {
                            setScheduleEntry(member.user_id, member.email, dateStr, null)
                          } else {
                            setScheduleEntry(member.user_id, member.email, dateStr, selectedShift)
                          }
                        }}
                        style={{ padding: '0.4rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: isAdmin && selectedShift ? 'pointer' : 'default' }}
                      >
                        {shiftName && (
                          <div style={{ padding: '0.25rem 0.4rem', borderRadius: '6px', background: color + '22', color, fontSize: '0.7rem', fontWeight: '500' }}>
                            {shiftName}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sidebar — shift types + time off requests */}
        <div style={{ width: '240px', flexShrink: 0 }}>
          {/* Shift Types Manager */}
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

          {/* Legend */}
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

          {/* Time-Off Requests */}
          {isAdmin && timeOffRequests.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Time-Off Requests</div>
              {timeOffRequests.map(req => (
                <div key={req.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: '500' }}>{(req.user_id && profileMap[req.user_id]) || req.user_email?.split('@')[0]}</div>
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
