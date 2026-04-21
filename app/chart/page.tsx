'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

type CaseRecord = {
  id: string
  case_number?: string | null
  patient_initials?: string | null
  age?: number | null
  sex?: string | null
  case_date?: string | null
  procedure?: string | null
  surgeon?: string | null
  anesthesiologist?: string | null
  weight_kg?: number | null
  height_cm?: number | null
  bsa?: number | null
  cpb_start?: string | null
  cpb_end?: string | null
  cpb_total_min?: number | null
  xclamp_start?: string | null
  xclamp_end?: string | null
  xclamp_total_min?: number | null
  circ_arrest_min?: number | null
  oxygenator?: string | null
  arterial_cannula?: string | null
  venous_cannula?: string | null
  prime_composition?: string | null
  prime_volume_ml?: number | null
  cardioplegia_type?: string | null
  cardioplegia_volume_ml?: number | null
  pre_hct?: number | null
  pre_act?: number | null
  low_hct?: number | null
  peak_act?: number | null
  post_hct?: number | null
  final_k?: number | null
  final_glucose?: number | null
  heparin_total_units?: number | null
  protamine_mg?: number | null
  prbc_units?: number | null
  ffp_units?: number | null
  platelets_units?: number | null
  cryo_units?: number | null
  cell_saver_ml?: number | null
  uf_volume_ml?: number | null
  urine_output_ml?: number | null
  notes?: string | null
  complications?: string | null
  created_at?: string
}

type CaseEvent = {
  id: string
  case_id: string
  event_time: string
  event_type: string // 'hotkey' | 'vitals' | 'med' | 'cp' | 'blood' | 'abg' | 'note'
  label?: string | null
  details?: Record<string, unknown> | null
  created_at?: string
}

const EMPTY_CASE: Partial<CaseRecord> = {
  case_number: '', patient_initials: '', age: null, sex: '', case_date: new Date().toISOString().slice(0, 10),
  procedure: '', surgeon: '', anesthesiologist: '', weight_kg: null, height_cm: null, bsa: null,
  cpb_start: '', cpb_end: '', xclamp_start: '', xclamp_end: '', circ_arrest_min: null,
  oxygenator: '', arterial_cannula: '', venous_cannula: '', prime_composition: '', prime_volume_ml: null,
  cardioplegia_type: '', cardioplegia_volume_ml: null,
  pre_hct: null, pre_act: null, low_hct: null, peak_act: null, post_hct: null, final_k: null, final_glucose: null,
  heparin_total_units: null, protamine_mg: null,
  prbc_units: 0, ffp_units: 0, platelets_units: 0, cryo_units: 0, cell_saver_ml: 0,
  uf_volume_ml: null, urine_output_ml: null, notes: '', complications: '',
}

const HOTKEYS: { label: string; color?: string }[] = [
  { label: 'Cooling', color: '#3b82f6' },
  { label: 'Rewarming', color: '#ef4444' },
  { label: 'Flow down per SN', color: '#64748b' },
  { label: 'Flow up per SN', color: '#64748b' },
  { label: 'Weaning from CPB', color: '#eab308' },
]

// Labels logged when a primary timer chip is tapped to start/stop.
const PRIMARY_TIMER_LABELS: Record<'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra', { start: string; stop: string }> = {
  cpb: { start: 'On Bypass', stop: 'Off Bypass' },
  xclamp: { start: 'Aortic Clamp On', stop: 'Aortic Clamp Off' },
  dhca: { start: 'DHCA Start', stop: 'DHCA Stop' },
  sacp: { start: 'SACP Start', stop: 'SACP Stop' },
  extra: { start: 'Extra Start', stop: 'Extra Stop' },
}

const COMMON_MEDS = [
  'Epinephrine', 'Norepinephrine', 'Phenylephrine', 'Calcium Chloride',
  'Sodium Bicarbonate', 'Mannitol', 'Lasix (Furosemide)', 'Insulin',
  'Magnesium', 'Vasopressin', 'Lidocaine', 'Heparin', 'Protamine',
]

const CP_TYPES = ['Del Nido', 'Buckberg', 'Custodiol (HTK)', 'Microplegia', 'Other']
const CP_ROUTES = ['Antegrade', 'Retrograde', 'Ostial', 'Aortic Root']
const BLOOD_PRODUCTS = ['PRBC', 'FFP', 'Platelets', 'Cryo', 'Cell Saver']

export default function ChartPage() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [view, setView] = useState<'list' | 'form' | 'live'>('list')
  const [editing, setEditing] = useState<Partial<CaseRecord>>(EMPTY_CASE)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  // Live chart state
  const [liveCase, setLiveCase] = useState<CaseRecord | null>(null)
  const [events, setEvents] = useState<CaseEvent[]>([])
  const [now, setNow] = useState(Date.now())
  const [activeForm, setActiveForm] = useState<'vitals' | 'med' | 'cp' | 'blood' | 'abg' | 'note' | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        window.location.href = '/login'
      } else {
        setUser({ id: session.user.id, email: session.user.email })
        setAuthLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) loadCases()
  }, [user])

  // Clock tick for live timers
  useEffect(() => {
    if (view !== 'live') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [view])

  async function loadCases() {
    if (!user) return
    setLoading(true)
    const res = await fetch(`/api/cases?userId=${user.id}`)
    const data = await res.json()
    setCases(data.cases || [])
    setLoading(false)
  }

  async function loadEvents(caseId: string) {
    if (!user) return
    const res = await fetch(`/api/case-events?caseId=${caseId}&userId=${user.id}`)
    const data = await res.json()
    setEvents(data.events || [])
  }

  function minsBetween(start?: string | null, end?: string | null): number | null {
    if (!start || !end) return null
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null
    let diff = (eh * 60 + em) - (sh * 60 + sm)
    if (diff < 0) diff += 24 * 60
    return diff
  }

  async function saveCase() {
    if (!user) return
    setSaving(true)

    const payload: Record<string, unknown> = { ...editing }
    payload.userId = user.id
    payload.userEmail = user.email
    payload.cpb_total_min = minsBetween(editing.cpb_start, editing.cpb_end)
    payload.xclamp_total_min = minsBetween(editing.xclamp_start, editing.xclamp_end)

    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = null
    }

    const isEdit = !!editing.id
    const res = await fetch('/api/cases', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? { ...payload, id: editing.id } : payload),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) {
      alert('Save failed: ' + data.error)
      return
    }
    await loadCases()
    setView('list')
    setEditing(EMPTY_CASE)
  }

  async function deleteCase(id: string) {
    if (!user) return
    if (!confirm('Delete this case? This cannot be undone.')) return
    await fetch(`/api/cases?id=${id}&userId=${user.id}`, { method: 'DELETE' })
    await loadCases()
  }

  function startNew() {
    setEditing({ ...EMPTY_CASE })
    setView('form')
  }

  function startEdit(c: CaseRecord) {
    setEditing({ ...c })
    setView('form')
  }

  async function startLive(c: CaseRecord) {
    setLiveCase(c)
    setEvents([])
    setView('live')
    await loadEvents(c.id)
  }

  async function quickStartCase() {
    if (!user) return
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        userEmail: user.email,
        case_date: new Date().toISOString().slice(0, 10),
        procedure: 'Untitled case',
      }),
    })
    const data = await res.json()
    if (data.error || !data.case) {
      alert('Could not start case: ' + (data.error || 'unknown'))
      return
    }
    setCases(prev => [data.case, ...prev])
    await startLive(data.case)
  }

  async function logEvent(eventType: string, label: string, details?: Record<string, unknown>) {
    if (!user || !liveCase) return
    const res = await fetch('/api/case-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId: liveCase.id,
        userId: user.id,
        eventType,
        label,
        details: details || null,
      }),
    })
    const data = await res.json()
    if (data.event) {
      setEvents(prev => [...prev, data.event])
    } else if (data.error) {
      alert('Failed to log: ' + data.error)
    }
  }

  async function toggleTimer(which: 'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra') {
    const labels = PRIMARY_TIMER_LABELS[which]
    const running = timers[which]?.running ?? false
    await logEvent('hotkey', running ? labels.stop : labels.start)
  }

  async function deleteEvent(id: string) {
    if (!user) return
    if (!confirm('Delete this event?')) return
    await fetch(`/api/case-events?id=${id}&userId=${user.id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  function set<K extends keyof CaseRecord>(key: K, value: CaseRecord[K]) {
    setEditing(prev => ({ ...prev, [key]: value }))
  }

  // Derive all phase timers from events. All timers freeze when Off Bypass is clicked.
  const timers = useMemo(() => {
    const findLatest = (label: string) =>
      [...events].reverse().find(e => e.label === label)?.event_time
    const findEarliest = (label: string) =>
      events.find(e => e.label === label)?.event_time
    const findNextAfter = (label: string, afterIso: string | undefined) => {
      if (!afterIso) return undefined
      const afterMs = new Date(afterIso).getTime()
      return events.find(e => e.label === label && new Date(e.event_time).getTime() > afterMs)?.event_time
    }

    const offBypass = findLatest('Off Bypass')
    const offBypassMs = offBypass ? new Date(offBypass).getTime() : null

    function makeTimer(startIso?: string, stopIso?: string): { running: boolean; min: number } | null {
      if (!startIso) return null
      const start = new Date(startIso).getTime()
      const stopMs = stopIso ? new Date(stopIso).getTime() : null

      if (stopMs && stopMs > start) return { running: false, min: Math.max(0, Math.floor((stopMs - start) / 60000)) }
      if (offBypassMs && offBypassMs > start) return { running: false, min: Math.max(0, Math.floor((offBypassMs - start) / 60000)) }
      return { running: true, min: Math.max(0, Math.floor((now - start) / 60000)) }
    }

    // CPB: first On Bypass → Off Bypass
    const cpb = makeTimer(findEarliest('On Bypass'), findLatest('Off Bypass'))

    // X-Clamp: most recent clamp on / clamp off pair
    const clampOn = findLatest('Aortic Clamp On')
    const clampOff = findLatest('Aortic Clamp Off')
    const xclamp = makeTimer(clampOn, clampOff)

    // CP Timer: since most recent CP dose (any cp event)
    const latestCp = [...events].reverse().find(e => e.event_type === 'cp')?.event_time
    const cp = makeTimer(latestCp)

    // Reperfusion: most recent Aortic Clamp Off → Off Bypass
    const reperfusion = makeTimer(clampOff)

    // Cooling: latest Cooling → next Rewarming after it
    const latestCooling = findLatest('Cooling')
    const coolingStop = findNextAfter('Rewarming', latestCooling)
    const cooling = makeTimer(latestCooling, coolingStop)

    // Rewarming: latest Rewarming → next Cooling after it (or Off Bypass)
    const latestRewarming = findLatest('Rewarming')
    const rewarmingStop = findNextAfter('Cooling', latestRewarming)
    const rewarming = makeTimer(latestRewarming, rewarmingStop)

    // SACP: latest pair
    const sacp = makeTimer(findLatest('SACP Start'), findLatest('SACP Stop'))

    // DHCA: latest pair
    const dhca = makeTimer(findLatest('DHCA Start'), findLatest('DHCA Stop'))

    // Extra: generic user-driven timer (tap to start/stop)
    const extra = makeTimer(findLatest('Extra Start'), findLatest('Extra Stop'))

    return { cpb, xclamp, cp, reperfusion, cooling, rewarming, sacp, dhca, extra }
  }, [events, now])

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.7rem', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box'
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: '0.3rem', display: 'block'
  }
  const sectionStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem'
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: '0.85rem', fontWeight: 600, color: '#e63946',
    marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em'
  }

  if (authLoading) {
    return <div style={{ color: '#94a3b8', padding: '2rem', background: '#080b12', minHeight: '100vh' }}>Loading...</div>
  }

  return (
    <div style={{ background: '#080b12', minHeight: '100vh', color: '#e2e8f0', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      <style>{`
        input::placeholder, textarea::placeholder { color: #4a5568; }
        input:focus, textarea:focus, select:focus { border-color: rgba(230,57,70,0.4) !important; }
        .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
        .hotkey-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.6rem; }
        .hotkey-btn { padding: 0.9rem 0.75rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); color: #e2e8f0; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease; text-align: center; }
        .hotkey-btn:hover { background: rgba(255,255,255,0.08); transform: translateY(-1px); }
        .hotkey-btn:active { transform: translateY(0); }
        .timer-chip { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.5rem 0.9rem; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); min-width: 100px; }
        .timer-chip.active { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); }
        .timer-chip.stopped { background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.06); }
        .timer-chip-btn { cursor: pointer; font-family: inherit; transition: all 0.15s ease; min-width: 110px; padding: 0.6rem 1rem; }
        .timer-chip-btn:hover { background: rgba(255,255,255,0.08); transform: translateY(-1px); }
        .timer-chip-btn.active:hover { background: rgba(34,197,94,0.18); }
        .timer-chip-btn:active { transform: translateY(0); }
        @media (max-width: 768px) {
          .chart-header { flex-direction: column !important; align-items: flex-start !important; gap: 0.75rem !important; }
          .chart-grid { grid-template-columns: 1fr 1fr !important; }
          .hotkey-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1.5rem 4rem' }}>
        {/* Header */}
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => { if (view === 'live' || view === 'form') { setView('list'); setEditing(EMPTY_CASE); setLiveCase(null) } else { window.location.href = '/' } }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
              ← {view === 'list' ? 'Home' : 'Back'}
            </button>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                <span style={{ color: '#e63946' }}>COR</span> Charting
              </div>
              <div style={{ fontSize: '0.75rem', color: '#4a5568' }}>
                {view === 'live' && liveCase ? `${liveCase.procedure || 'Case'} · ${liveCase.case_date || ''}` : 'Case log — private to you'}
              </div>
            </div>
          </div>
          {view === 'list' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={quickStartCase} style={{ background: '#22c55e', border: 'none', color: 'white', padding: '0.6rem 1rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>⚡ Quick Start</button>
              <button onClick={startNew} style={{ background: '#e63946', border: 'none', color: 'white', padding: '0.6rem 1rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>+ New Case</button>
            </div>
          )}
          {view === 'form' && (
            <button onClick={() => { setView('list'); setEditing(EMPTY_CASE) }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.6rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
          )}
        </div>

        {/* PHI disclaimer (hidden during live to save space) */}
        {view !== 'live' && (
          <div style={{ background: 'rgba(230,57,70,0.06)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: '10px', padding: '0.6rem 0.9rem', marginBottom: '1.5rem', fontSize: '0.75rem', color: '#f59e9e' }}>
            ⚠ Do not enter patient names, MRN, or date of birth. Use case # or initials only until HIPAA compliance is in place.
          </div>
        )}

        {/* LIST VIEW */}
        {view === 'list' && (
          <>
            {loading ? (
              <div style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>Loading cases...</div>
            ) : cases.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#4a5568' }}>
                <div style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#94a3b8' }}>No cases yet</div>
                <div style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>Hit Quick Start to begin charting right now, or create a full case first.</div>
                <button onClick={quickStartCase} style={{ background: '#22c55e', border: 'none', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>⚡ Quick Start Case</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {cases.map(c => (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>
                          {c.procedure || 'Untitled procedure'}
                        </div>
                        {c.case_date && <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{c.case_date}</div>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {c.case_number && <span>Case #{c.case_number}</span>}
                        {c.patient_initials && <span>{c.patient_initials}</span>}
                        {c.surgeon && <span>Dr. {c.surgeon}</span>}
                        {c.cpb_total_min != null && <span>CPB {c.cpb_total_min}min</span>}
                        {c.xclamp_total_min != null && <span>XC {c.xclamp_total_min}min</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button onClick={() => startLive(c)} style={{ background: '#22c55e', border: 'none', color: 'white', padding: '0.45rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>● Live Chart</button>
                      <button onClick={() => startEdit(c)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem' }}>Edit</button>
                      <button onClick={() => deleteCase(c.id)} style={{ background: 'transparent', border: '1px solid rgba(230,57,70,0.3)', color: '#e63946', padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* FORM VIEW (unchanged summary form) */}
        {view === 'form' && (
          <>
            <div style={sectionStyle}>
              <div style={sectionTitle}>Case Info</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Case #</label><input style={inputStyle} value={editing.case_number || ''} onChange={e => set('case_number', e.target.value)} /></div>
                <div><label style={labelStyle}>Patient Initials</label><input style={inputStyle} maxLength={5} value={editing.patient_initials || ''} onChange={e => set('patient_initials', e.target.value)} placeholder="e.g. J.D." /></div>
                <div><label style={labelStyle}>Date</label><input style={inputStyle} type="date" value={editing.case_date || ''} onChange={e => set('case_date', e.target.value)} /></div>
                <div><label style={labelStyle}>Age</label><input style={inputStyle} type="number" value={editing.age ?? ''} onChange={e => set('age', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Sex</label>
                  <select style={inputStyle} value={editing.sex || ''} onChange={e => set('sex', e.target.value)}>
                    <option value="">—</option><option value="M">M</option><option value="F">F</option><option value="O">Other</option>
                  </select>
                </div>
                <div><label style={labelStyle}>Weight (kg)</label><input style={inputStyle} type="number" step="0.1" value={editing.weight_kg ?? ''} onChange={e => set('weight_kg', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Height (cm)</label><input style={inputStyle} type="number" step="0.1" value={editing.height_cm ?? ''} onChange={e => set('height_cm', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>BSA (m²)</label><input style={inputStyle} type="number" step="0.01" value={editing.bsa ?? ''} onChange={e => set('bsa', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Procedure</label><input style={inputStyle} value={editing.procedure || ''} onChange={e => set('procedure', e.target.value)} placeholder="e.g. CABG x3, AVR, MVR, Type-A" /></div>
                <div><label style={labelStyle}>Surgeon</label><input style={inputStyle} value={editing.surgeon || ''} onChange={e => set('surgeon', e.target.value)} /></div>
                <div><label style={labelStyle}>Anesthesiologist</label><input style={inputStyle} value={editing.anesthesiologist || ''} onChange={e => set('anesthesiologist', e.target.value)} /></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Bypass Times</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>CPB Start</label><input style={inputStyle} type="time" value={editing.cpb_start || ''} onChange={e => set('cpb_start', e.target.value)} /></div>
                <div><label style={labelStyle}>CPB End</label><input style={inputStyle} type="time" value={editing.cpb_end || ''} onChange={e => set('cpb_end', e.target.value)} /></div>
                <div><label style={labelStyle}>X-Clamp On</label><input style={inputStyle} type="time" value={editing.xclamp_start || ''} onChange={e => set('xclamp_start', e.target.value)} /></div>
                <div><label style={labelStyle}>X-Clamp Off</label><input style={inputStyle} type="time" value={editing.xclamp_end || ''} onChange={e => set('xclamp_end', e.target.value)} /></div>
                <div><label style={labelStyle}>Circ Arrest (min)</label><input style={inputStyle} type="number" value={editing.circ_arrest_min ?? ''} onChange={e => set('circ_arrest_min', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                Totals calculated on save: CPB = {minsBetween(editing.cpb_start, editing.cpb_end) ?? '—'} min · X-Clamp = {minsBetween(editing.xclamp_start, editing.xclamp_end) ?? '—'} min
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Circuit</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Oxygenator</label><input style={inputStyle} value={editing.oxygenator || ''} onChange={e => set('oxygenator', e.target.value)} /></div>
                <div><label style={labelStyle}>Arterial Cannula</label><input style={inputStyle} value={editing.arterial_cannula || ''} onChange={e => set('arterial_cannula', e.target.value)} /></div>
                <div><label style={labelStyle}>Venous Cannula</label><input style={inputStyle} value={editing.venous_cannula || ''} onChange={e => set('venous_cannula', e.target.value)} /></div>
                <div><label style={labelStyle}>Prime Volume (mL)</label><input style={inputStyle} type="number" value={editing.prime_volume_ml ?? ''} onChange={e => set('prime_volume_ml', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Prime Composition</label><input style={inputStyle} value={editing.prime_composition || ''} onChange={e => set('prime_composition', e.target.value)} /></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Cardioplegia</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Type</label><input style={inputStyle} value={editing.cardioplegia_type || ''} onChange={e => set('cardioplegia_type', e.target.value)} /></div>
                <div><label style={labelStyle}>Total Volume (mL)</label><input style={inputStyle} type="number" value={editing.cardioplegia_volume_ml ?? ''} onChange={e => set('cardioplegia_volume_ml', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Labs</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Pre HCT</label><input style={inputStyle} type="number" step="0.1" value={editing.pre_hct ?? ''} onChange={e => set('pre_hct', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Pre ACT</label><input style={inputStyle} type="number" value={editing.pre_act ?? ''} onChange={e => set('pre_act', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Low HCT on CPB</label><input style={inputStyle} type="number" step="0.1" value={editing.low_hct ?? ''} onChange={e => set('low_hct', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Peak ACT</label><input style={inputStyle} type="number" value={editing.peak_act ?? ''} onChange={e => set('peak_act', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Post HCT</label><input style={inputStyle} type="number" step="0.1" value={editing.post_hct ?? ''} onChange={e => set('post_hct', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Final K+</label><input style={inputStyle} type="number" step="0.1" value={editing.final_k ?? ''} onChange={e => set('final_k', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Final Glucose</label><input style={inputStyle} type="number" value={editing.final_glucose ?? ''} onChange={e => set('final_glucose', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Heparin / Protamine</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Heparin Total (units)</label><input style={inputStyle} type="number" value={editing.heparin_total_units ?? ''} onChange={e => set('heparin_total_units', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Protamine (mg)</label><input style={inputStyle} type="number" value={editing.protamine_mg ?? ''} onChange={e => set('protamine_mg', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Blood Products & Volumes</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>PRBC (units)</label><input style={inputStyle} type="number" value={editing.prbc_units ?? 0} onChange={e => set('prbc_units', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>FFP (units)</label><input style={inputStyle} type="number" value={editing.ffp_units ?? 0} onChange={e => set('ffp_units', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Platelets (units)</label><input style={inputStyle} type="number" value={editing.platelets_units ?? 0} onChange={e => set('platelets_units', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Cryo (units)</label><input style={inputStyle} type="number" value={editing.cryo_units ?? 0} onChange={e => set('cryo_units', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Cell Saver (mL)</label><input style={inputStyle} type="number" value={editing.cell_saver_ml ?? 0} onChange={e => set('cell_saver_ml', e.target.value === '' ? 0 : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>UF Volume (mL)</label><input style={inputStyle} type="number" value={editing.uf_volume_ml ?? ''} onChange={e => set('uf_volume_ml', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Urine Output (mL)</label><input style={inputStyle} type="number" value={editing.urine_output_ml ?? ''} onChange={e => set('urine_output_ml', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Notes</div>
              <label style={labelStyle}>Case notes</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }} value={editing.notes || ''} onChange={e => set('notes', e.target.value)} />
              <div style={{ marginTop: '0.75rem' }}>
                <label style={labelStyle}>Complications / Events</label>
                <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} value={editing.complications || ''} onChange={e => set('complications', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => { setView('list'); setEditing(EMPTY_CASE) }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.7rem 1.25rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
              <button onClick={saveCase} disabled={saving} style={{ background: saving ? '#2d3748' : '#e63946', border: 'none', color: 'white', padding: '0.7rem 1.5rem', borderRadius: '10px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                {saving ? 'Saving...' : editing.id ? 'Update Case' : 'Save Case'}
              </button>
            </div>
          </>
        )}

        {/* LIVE VIEW */}
        {view === 'live' && liveCase && (
          <LiveChart
            caseRecord={liveCase}
            events={events}
            timers={timers}
            now={now}
            activeForm={activeForm}
            setActiveForm={setActiveForm}
            onHotkey={(label) => logEvent('hotkey', label)}
            onToggleTimer={toggleTimer}
            onAddEvent={logEvent}
            onDeleteEvent={deleteEvent}
          />
        )}
      </div>
    </div>
  )
}

// ----- Live chart component -----

function LiveChart({
  caseRecord, events, timers, now, activeForm, setActiveForm, onHotkey, onToggleTimer, onAddEvent, onDeleteEvent,
}: {
  caseRecord: CaseRecord
  events: CaseEvent[]
  timers: {
    cpb: { running: boolean; min: number } | null
    xclamp: { running: boolean; min: number } | null
    cp: { running: boolean; min: number } | null
    reperfusion: { running: boolean; min: number } | null
    cooling: { running: boolean; min: number } | null
    rewarming: { running: boolean; min: number } | null
    sacp: { running: boolean; min: number } | null
    dhca: { running: boolean; min: number } | null
    extra: { running: boolean; min: number } | null
  }
  now: number
  activeForm: 'vitals' | 'med' | 'cp' | 'blood' | 'abg' | 'note' | null
  setActiveForm: (f: 'vitals' | 'med' | 'cp' | 'blood' | 'abg' | 'note' | null) => void
  onHotkey: (label: string) => void
  onToggleTimer: (which: 'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra') => Promise<void>
  onAddEvent: (eventType: string, label: string, details?: Record<string, unknown>) => Promise<void>
  onDeleteEvent: (id: string) => Promise<void>
}) {
  const clockStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  type PrimaryKey = 'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra'
  const primaryRows: { key: PrimaryKey; label: string; data: { running: boolean; min: number } | null }[] = [
    { key: 'cpb', label: 'CPB', data: timers.cpb },
    { key: 'xclamp', label: 'X-Clamp', data: timers.xclamp },
    { key: 'dhca', label: 'DHCA', data: timers.dhca },
    { key: 'sacp', label: 'SACP', data: timers.sacp },
    { key: 'extra', label: 'Extra', data: timers.extra },
  ]

  const popupRows: { key: string; label: string; data: { running: boolean; min: number } | null }[] = [
    { key: 'cp', label: 'CP Timer', data: timers.cp },
    { key: 'reperfusion', label: 'Reperfusion', data: timers.reperfusion },
    { key: 'cooling', label: 'Cooling', data: timers.cooling },
    { key: 'rewarming', label: 'Rewarming', data: timers.rewarming },
  ]
  const activePopupRows = popupRows.filter(p => p.data)

  return (
    <>
      {/* Sticky top bar with timers */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#080b12', paddingBottom: '0.75rem', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Primary clickable timer chips */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div className="timer-chip">
            <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clock</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{clockStr}</div>
          </div>
          {primaryRows.map(t => {
            const running = t.data?.running ?? false
            const started = t.data != null
            const value = t.data?.min != null ? `${t.data.min} min` : 'Tap to start'
            return (
              <button
                key={t.key}
                onClick={() => onToggleTimer(t.key)}
                className={`timer-chip timer-chip-btn${running ? ' active' : ''}${started && !running ? ' stopped' : ''}`}
                type="button"
              >
                <div style={{ fontSize: '0.68rem', color: running ? '#22c55e' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {running && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />}
                  {t.label}
                </div>
                <div style={{ fontSize: t.data?.min != null ? '1rem' : '0.72rem', fontWeight: 700, color: t.data?.min != null ? '#e2e8f0' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              </button>
            )
          })}
        </div>
        {/* Popup timers (appear once triggered) */}
        {activePopupRows.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
            {activePopupRows.map(t => {
              const running = t.data?.running ?? false
              const value = t.data?.min != null ? `${t.data.min} min` : '—'
              return (
                <div key={t.key} className={`timer-chip${running ? ' active' : ''}`}>
                  <div style={{ fontSize: '0.66rem', color: running ? '#22c55e' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Hotkeys */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e63946', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quick Events</div>
        <div className="hotkey-grid">
          {HOTKEYS.map(hk => (
            <button
              key={hk.label}
              onClick={() => onHotkey(hk.label)}
              className="hotkey-btn"
              style={{ borderLeft: `3px solid ${hk.color || '#94a3b8'}` }}
            >
              {hk.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add-entry tabs */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: activeForm ? '1rem' : 0 }}>
          {(['vitals', 'med', 'cp', 'blood', 'abg', 'note'] as const).map(k => (
            <button
              key={k}
              onClick={() => setActiveForm(activeForm === k ? null : k)}
              style={{ padding: '0.5rem 0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: activeForm === k ? '#e63946' : 'rgba(255,255,255,0.04)', color: activeForm === k ? 'white' : '#94a3b8', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}
            >
              + {k === 'cp' ? 'CP Dose' : k === 'abg' ? 'ABG' : k}
            </button>
          ))}
        </div>
        {activeForm === 'vitals' && <VitalsForm onSubmit={(d) => { onAddEvent('vitals', 'Vitals', d); setActiveForm(null) }} />}
        {activeForm === 'med' && <MedForm onSubmit={(d) => { onAddEvent('med', `Med: ${d.name}`, d); setActiveForm(null) }} />}
        {activeForm === 'cp' && <CpForm onSubmit={(d) => { onAddEvent('cp', `CP: ${d.type} ${d.volume}mL ${d.route}`, d); setActiveForm(null) }} />}
        {activeForm === 'blood' && <BloodForm onSubmit={(d) => { onAddEvent('blood', `${d.product} ${d.amount}${d.product === 'Cell Saver' ? 'mL' : 'u'}`, d); setActiveForm(null) }} />}
        {activeForm === 'abg' && <AbgForm onSubmit={(d) => { onAddEvent('abg', 'ABG', d); setActiveForm(null) }} />}
        {activeForm === 'note' && <NoteForm onSubmit={(d) => { onAddEvent('note', 'Note', d); setActiveForm(null) }} />}
      </div>

      {/* Timeline */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e63946', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Timeline ({events.length})</div>
        {events.length === 0 ? (
          <div style={{ color: '#4a5568', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>No events yet. Tap a hotkey or add-entry button to log.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[...events].reverse().map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.55rem 0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', minWidth: '70px' }}>
                  {new Date(e.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ flex: 1, fontSize: '0.85rem', color: '#e2e8f0' }}>
                  <div style={{ fontWeight: 500 }}>{e.label}</div>
                  {e.details && <EventDetails details={e.details} />}
                </div>
                <button onClick={() => onDeleteEvent(e.id)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }} title="Delete">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function EventDetails({ details }: { details: Record<string, unknown> }) {
  const pairs = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (pairs.length === 0) return null
  return (
    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {pairs.map(([k, v]) => (
        <span key={k}><span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>: {String(v)}</span>
      ))}
    </div>
  )
}

// ----- Quick-add forms -----

const formStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', alignItems: 'end'
}
const inpStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box'
}
const lblStyle: React.CSSProperties = {
  fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem', display: 'block'
}
const submitStyle: React.CSSProperties = {
  padding: '0.55rem 1rem', borderRadius: '8px', border: 'none', background: '#e63946', color: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer'
}

function VitalsForm({ onSubmit }: { onSubmit: (d: Record<string, unknown>) => void }) {
  const [v, setV] = useState<Record<string, string>>({})
  const upd = (k: string, val: string) => setV(prev => ({ ...prev, [k]: val }))
  const submit = () => {
    const clean: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) if (val !== '') clean[k] = val
    onSubmit(clean)
    setV({})
  }
  return (
    <>
      <div style={formStyle}>
        <div><label style={lblStyle}>MAP</label><input style={inpStyle} inputMode="decimal" value={v.map || ''} onChange={e => upd('map', e.target.value)} /></div>
        <div><label style={lblStyle}>CVP</label><input style={inpStyle} inputMode="decimal" value={v.cvp || ''} onChange={e => upd('cvp', e.target.value)} /></div>
        <div><label style={lblStyle}>Flow L/min</label><input style={inpStyle} inputMode="decimal" value={v.flow || ''} onChange={e => upd('flow', e.target.value)} /></div>
        <div><label style={lblStyle}>Temp Blood</label><input style={inpStyle} inputMode="decimal" value={v.temp_blood || ''} onChange={e => upd('temp_blood', e.target.value)} /></div>
        <div><label style={lblStyle}>Temp Bladder</label><input style={inpStyle} inputMode="decimal" value={v.temp_bladder || ''} onChange={e => upd('temp_bladder', e.target.value)} /></div>
        <div><label style={lblStyle}>SvO2</label><input style={inpStyle} inputMode="decimal" value={v.svo2 || ''} onChange={e => upd('svo2', e.target.value)} /></div>
        <div><label style={lblStyle}>HCT</label><input style={inpStyle} inputMode="decimal" value={v.hct || ''} onChange={e => upd('hct', e.target.value)} /></div>
        <div><label style={lblStyle}>ACT</label><input style={inpStyle} inputMode="decimal" value={v.act || ''} onChange={e => upd('act', e.target.value)} /></div>
        <div><label style={lblStyle}>FiO2</label><input style={inpStyle} inputMode="decimal" value={v.fio2 || ''} onChange={e => upd('fio2', e.target.value)} /></div>
        <div><label style={lblStyle}>Sweep</label><input style={inpStyle} inputMode="decimal" value={v.sweep || ''} onChange={e => upd('sweep', e.target.value)} /></div>
        <div><label style={lblStyle}>Urine</label><input style={inpStyle} inputMode="decimal" value={v.urine || ''} onChange={e => upd('urine', e.target.value)} /></div>
      </div>
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log Vitals</button></div>
    </>
  )
}

function MedForm({ onSubmit }: { onSubmit: (d: { name: string; dose: string; unit: string }) => void }) {
  const [name, setName] = useState('')
  const [custom, setCustom] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState('mcg')
  const submit = () => {
    const finalName = name === '__custom' ? custom : name
    if (!finalName) return
    onSubmit({ name: finalName, dose, unit })
    setName(''); setCustom(''); setDose('')
  }
  return (
    <>
      <div style={formStyle}>
        <div>
          <label style={lblStyle}>Med</label>
          <select style={inpStyle} value={name} onChange={e => setName(e.target.value)}>
            <option value="">—</option>
            {COMMON_MEDS.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="__custom">Other...</option>
          </select>
        </div>
        {name === '__custom' && (
          <div><label style={lblStyle}>Name</label><input style={inpStyle} value={custom} onChange={e => setCustom(e.target.value)} /></div>
        )}
        <div><label style={lblStyle}>Dose</label><input style={inpStyle} inputMode="decimal" value={dose} onChange={e => setDose(e.target.value)} /></div>
        <div>
          <label style={lblStyle}>Unit</label>
          <select style={inpStyle} value={unit} onChange={e => setUnit(e.target.value)}>
            <option>mcg</option><option>mg</option><option>g</option><option>units</option><option>mL</option><option>mEq</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log Med</button></div>
    </>
  )
}

function CpForm({ onSubmit }: { onSubmit: (d: { type: string; volume: string; route: string; temp: string }) => void }) {
  const [type, setType] = useState(CP_TYPES[0])
  const [volume, setVolume] = useState('')
  const [route, setRoute] = useState(CP_ROUTES[0])
  const [temp, setTemp] = useState('')
  const submit = () => {
    if (!volume) return
    onSubmit({ type, volume, route, temp })
    setVolume(''); setTemp('')
  }
  return (
    <>
      <div style={formStyle}>
        <div>
          <label style={lblStyle}>Type</label>
          <select style={inpStyle} value={type} onChange={e => setType(e.target.value)}>
            {CP_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label style={lblStyle}>Volume mL</label><input style={inpStyle} inputMode="decimal" value={volume} onChange={e => setVolume(e.target.value)} /></div>
        <div>
          <label style={lblStyle}>Route</label>
          <select style={inpStyle} value={route} onChange={e => setRoute(e.target.value)}>
            {CP_ROUTES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div><label style={lblStyle}>Temp °C</label><input style={inpStyle} inputMode="decimal" value={temp} onChange={e => setTemp(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log CP Dose</button></div>
    </>
  )
}

function BloodForm({ onSubmit }: { onSubmit: (d: { product: string; amount: string }) => void }) {
  const [product, setProduct] = useState(BLOOD_PRODUCTS[0])
  const [amount, setAmount] = useState('')
  const submit = () => {
    if (!amount) return
    onSubmit({ product, amount })
    setAmount('')
  }
  return (
    <>
      <div style={formStyle}>
        <div>
          <label style={lblStyle}>Product</label>
          <select style={inpStyle} value={product} onChange={e => setProduct(e.target.value)}>
            {BLOOD_PRODUCTS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div><label style={lblStyle}>{product === 'Cell Saver' ? 'mL' : 'Units'}</label><input style={inpStyle} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log Blood Product</button></div>
    </>
  )
}

function AbgForm({ onSubmit }: { onSubmit: (d: Record<string, unknown>) => void }) {
  const [v, setV] = useState<Record<string, string>>({})
  const upd = (k: string, val: string) => setV(prev => ({ ...prev, [k]: val }))
  const submit = () => {
    const clean: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) if (val !== '') clean[k] = val
    onSubmit(clean)
    setV({})
  }
  return (
    <>
      <div style={formStyle}>
        <div><label style={lblStyle}>pH</label><input style={inpStyle} inputMode="decimal" value={v.ph || ''} onChange={e => upd('ph', e.target.value)} /></div>
        <div><label style={lblStyle}>pCO2</label><input style={inpStyle} inputMode="decimal" value={v.pco2 || ''} onChange={e => upd('pco2', e.target.value)} /></div>
        <div><label style={lblStyle}>pO2</label><input style={inpStyle} inputMode="decimal" value={v.po2 || ''} onChange={e => upd('po2', e.target.value)} /></div>
        <div><label style={lblStyle}>HCO3</label><input style={inpStyle} inputMode="decimal" value={v.hco3 || ''} onChange={e => upd('hco3', e.target.value)} /></div>
        <div><label style={lblStyle}>BE</label><input style={inpStyle} inputMode="decimal" value={v.be || ''} onChange={e => upd('be', e.target.value)} /></div>
        <div><label style={lblStyle}>K+</label><input style={inpStyle} inputMode="decimal" value={v.k || ''} onChange={e => upd('k', e.target.value)} /></div>
        <div><label style={lblStyle}>iCa</label><input style={inpStyle} inputMode="decimal" value={v.ica || ''} onChange={e => upd('ica', e.target.value)} /></div>
        <div><label style={lblStyle}>HCT</label><input style={inpStyle} inputMode="decimal" value={v.hct || ''} onChange={e => upd('hct', e.target.value)} /></div>
        <div><label style={lblStyle}>HGB</label><input style={inpStyle} inputMode="decimal" value={v.hgb || ''} onChange={e => upd('hgb', e.target.value)} /></div>
        <div><label style={lblStyle}>Glucose</label><input style={inpStyle} inputMode="decimal" value={v.glucose || ''} onChange={e => upd('glucose', e.target.value)} /></div>
        <div><label style={lblStyle}>Lactate</label><input style={inpStyle} inputMode="decimal" value={v.lactate || ''} onChange={e => upd('lactate', e.target.value)} /></div>
        <div><label style={lblStyle}>SvO2</label><input style={inpStyle} inputMode="decimal" value={v.svo2 || ''} onChange={e => upd('svo2', e.target.value)} /></div>
      </div>
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log ABG</button></div>
    </>
  )
}

function NoteForm({ onSubmit }: { onSubmit: (d: { text: string }) => void }) {
  const [text, setText] = useState('')
  const submit = () => {
    if (!text.trim()) return
    onSubmit({ text })
    setText('')
  }
  return (
    <>
      <textarea
        style={{ ...inpStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Type a note..."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log Note</button></div>
    </>
  )
}
