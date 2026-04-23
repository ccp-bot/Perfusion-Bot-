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

type PhaseData = {
  runs: Array<{ start: string; stop?: string; min: number }>
  totalMin: number
  running: boolean
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

const HOTKEYS: { label: string; color?: string; icon?: string }[] = [
  { label: 'Cooling', color: '#3b82f6', icon: '❄️' },
  { label: 'Rewarming', color: '#ef4444', icon: '🔥' },
  { label: 'Flow down per SN', color: '#64748b', icon: '⬇️' },
  { label: 'Flow up per SN', color: '#64748b', icon: '⬆️' },
  { label: 'Weaning from CPB', color: '#eab308', icon: '📉' },
]

// Labels logged when a primary timer chip is tapped to start/stop.
const PRIMARY_TIMER_LABELS: Record<'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra', { start: string; stop: string }> = {
  cpb: { start: 'On Bypass', stop: 'Off Bypass' },
  xclamp: { start: 'Aortic Clamp On', stop: 'Aortic Clamp Off' },
  dhca: { start: 'DHCA Start', stop: 'DHCA Stop' },
  sacp: { start: 'SACP Start', stop: 'SACP Stop' },
  extra: { start: 'Extra Start', stop: 'Extra Stop' },
}

// Primary timers are uniformly green when running; popup timers keep distinct text colors.
const PHASE_COLORS: Record<string, string> = {
  cpb: '#22c55e',
  xclamp: '#22c55e',
  dhca: '#22c55e',
  sacp: '#22c55e',
  extra: '#22c55e',
  cp: '#eab308',         // cardioplegia timer: yellow
  reperfusion: '#f97316', // orange
  cooling: '#3b82f6',     // blue
  rewarming: '#ef4444',   // red
}

const EVENT_TYPE_STYLES: Record<string, { color: string; icon: string }> = {
  hotkey: { color: '#94a3b8', icon: '●' },
  vitals: { color: '#22c55e', icon: '📊' },
  med: { color: '#a855f7', icon: '💊' },
  cp: { color: '#ec4899', icon: '❤️' },
  blood: { color: '#ef4444', icon: '🩸' },
  abg: { color: '#eab308', icon: '🧪' },
  note: { color: '#64748b', icon: '📝' },
  vent: { color: '#06b6d4', icon: '🌬️' },
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

  // Custom modal for alerts and confirms (replaces native window.alert / window.confirm)
  const [modal, setModal] = useState<{
    open: boolean
    title?: string
    message: string
    kind: 'alert' | 'confirm'
    danger?: boolean
    confirmLabel?: string
    resolve?: (value: boolean) => void
  }>({ open: false, message: '', kind: 'alert' })

  function showAlert(message: string, title?: string): Promise<void> {
    return new Promise(resolve => {
      setModal({ open: true, message, title, kind: 'alert', resolve: () => resolve() })
    })
  }
  function showConfirm(message: string, opts?: { title?: string; danger?: boolean; confirmLabel?: string }): Promise<boolean> {
    return new Promise(resolve => {
      setModal({ open: true, message, title: opts?.title, kind: 'confirm', danger: opts?.danger, confirmLabel: opts?.confirmLabel, resolve })
    })
  }
  function closeModal(confirmed: boolean) {
    setModal(m => { m.resolve?.(confirmed); return { ...m, open: false, resolve: undefined } })
  }

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
      await showAlert('Save failed: ' + data.error, 'Could not save case')
      return
    }
    await loadCases()
    setView('list')
    setEditing(EMPTY_CASE)
  }

  async function deleteCase(id: string) {
    if (!user) return
    const ok = await showConfirm('This cannot be undone.', { title: 'Delete this case?', danger: true, confirmLabel: 'Delete' })
    if (!ok) return
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
      await showAlert((data.error || 'Unknown error.'), 'Could not start case')
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
      await showAlert(data.error, 'Failed to log event')
    }
  }

  async function toggleTimer(which: 'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra') {
    const labels = PRIMARY_TIMER_LABELS[which]
    const running = timers[which]?.running ?? false
    await logEvent('hotkey', running ? labels.stop : labels.start)
  }

  async function deleteEvent(id: string) {
    if (!user) return
    const ok = await showConfirm('This will remove it from the timeline.', { title: 'Delete this event?', danger: true, confirmLabel: 'Delete' })
    if (!ok) return
    await fetch(`/api/case-events?id=${id}&userId=${user.id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  async function updateEventNote(id: string, note: string) {
    if (!user) return
    const res = await fetch('/api/case-events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, userId: user.id, note }),
    })
    const data = await res.json()
    if (data.event) {
      setEvents(prev => prev.map(e => e.id === id ? data.event : e))
    }
  }

  function set<K extends keyof CaseRecord>(key: K, value: CaseRecord[K]) {
    setEditing(prev => ({ ...prev, [key]: value }))
  }

  // Derive all phase timers from events. All timers freeze when Off Bypass is clicked.
  const timers = useMemo(() => {
    const findLatest = (label: string) =>
      [...events].reverse().find(e => e.label === label)?.event_time
    const findNextAfter = (label: string, afterIso: string | undefined) => {
      if (!afterIso) return undefined
      const afterMs = new Date(afterIso).getTime()
      return events.find(e => e.label === label && new Date(e.event_time).getTime() > afterMs)?.event_time
    }

    const offBypass = findLatest('Off Bypass')
    const offBypassMs = offBypass ? new Date(offBypass).getTime() : null

    // Multi-run phase: pairs every start with its next stop, sums total time.
    function computePhase(startLabel: string, stopLabel: string): PhaseData | null {
      const runs: Array<{ start: string; stop?: string; min: number }> = []
      let currentStart: string | null = null

      for (const e of events) {
        if (e.label === startLabel) {
          if (!currentStart) currentStart = e.event_time
        } else if (e.label === stopLabel && currentStart) {
          const min = Math.max(0, Math.floor((new Date(e.event_time).getTime() - new Date(currentStart).getTime()) / 60000))
          runs.push({ start: currentStart, stop: e.event_time, min })
          currentStart = null
        }
      }

      let running = false
      if (currentStart) {
        running = true
        const min = Math.max(0, Math.floor((now - new Date(currentStart).getTime()) / 60000))
        runs.push({ start: currentStart, min })
      }

      if (runs.length === 0) return null
      const totalMin = runs.reduce((sum, r) => sum + r.min, 0)
      return { runs, totalMin, running }
    }

    // Single-period timer (start → stop or cap at Off Bypass/now).
    function makeTimer(startIso?: string, stopIso?: string): { running: boolean; min: number } | null {
      if (!startIso) return null
      const start = new Date(startIso).getTime()
      const stopMs = stopIso ? new Date(stopIso).getTime() : null

      if (stopMs && stopMs > start) return { running: false, min: Math.max(0, Math.floor((stopMs - start) / 60000)) }
      if (offBypassMs && offBypassMs > start) return { running: false, min: Math.max(0, Math.floor((offBypassMs - start) / 60000)) }
      return { running: true, min: Math.max(0, Math.floor((now - start) / 60000)) }
    }

    // Multi-run phases
    const cpb = computePhase('On Bypass', 'Off Bypass')
    const xclamp = computePhase('Aortic Clamp On', 'Aortic Clamp Off')
    const dhca = computePhase('DHCA Start', 'DHCA Stop')
    const sacp = computePhase('SACP Start', 'SACP Stop')
    const extra = computePhase('Extra Start', 'Extra Stop')

    // CP Timer: since most recent CP dose event
    const latestCp = [...events].reverse().find(e => e.event_type === 'cp')?.event_time
    const cp = makeTimer(latestCp)

    // Reperfusion: most recent Aortic Clamp Off → Off Bypass
    const reperfusion = makeTimer(findLatest('Aortic Clamp Off'))

    // Cooling: latest Cooling → next Rewarming after it
    const latestCooling = findLatest('Cooling')
    const coolingStop = findNextAfter('Rewarming', latestCooling)
    const cooling = makeTimer(latestCooling, coolingStop)

    // Rewarming: latest Rewarming → next Cooling after it (or Off Bypass)
    const latestRewarming = findLatest('Rewarming')
    const rewarmingStop = findNextAfter('Cooling', latestRewarming)
    const rewarming = makeTimer(latestRewarming, rewarmingStop)

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
        input::placeholder, textarea::placeholder { color: #475569; }
        input:focus, textarea:focus, select:focus { border-color: rgba(230,57,70,0.4) !important; }
        .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }

        /* Custom modal dialog */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.65);
          -webkit-backdrop-filter: blur(6px);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 1rem;
          animation: modalFade 0.15s ease;
        }
        .modal-card {
          background: linear-gradient(180deg, #131924, #0d131e);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 1.4rem 1.6rem 1.2rem;
          max-width: 420px; width: 100%;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(230,57,70,0.05), 0 0 40px rgba(230,57,70,0.06);
          animation: modalPop 0.18s ease-out;
        }
        .modal-title { font-size: 1.02rem; font-weight: 700; color: #e2e8f0; margin-bottom: 0.4rem; letter-spacing: -0.01em; }
        .modal-message { font-size: 0.88rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 1.25rem; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 0.55rem; }
        .modal-btn { padding: 0.58rem 1.15rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: #cbd5e1; cursor: pointer; font-weight: 600; font-size: 0.85rem; font-family: inherit; transition: all 0.15s ease; }
        .modal-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }
        .modal-btn.primary { background: #e63946; border-color: #e63946; color: white; }
        .modal-btn.primary:hover { background: #dc2f3e; border-color: #dc2f3e; box-shadow: 0 0 16px rgba(230,57,70,0.35); }
        .modal-btn.danger { background: #e63946; border-color: #e63946; color: white; }
        .modal-btn.danger:hover { background: #dc2f3e; border-color: #dc2f3e; box-shadow: 0 0 16px rgba(230,57,70,0.35); }
        @keyframes modalFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalPop { from { opacity: 0; transform: scale(0.95) translateY(-6px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        /* Sticky frosted header */
        .live-sticky {
          position: sticky; top: 0; z-index: 10;
          background: linear-gradient(180deg, rgba(8,11,18,0.95) 0%, rgba(8,11,18,0.8) 100%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          backdrop-filter: blur(20px) saturate(180%);
          padding: 0.9rem 0.25rem 0.9rem;
          margin: 0 -0.25rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        /* Section card */
        .live-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015));
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 1.1rem 1.2rem;
          margin-bottom: 1rem;
          box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
        }
        .live-card-title { font-size: 1.15rem; font-weight: 700; color: #e2e8f0; margin-bottom: 1rem; letter-spacing: -0.01em; }

        /* Hotkey pills — one line */
        .hotkey-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.55rem; }
        .hotkey-btn {
          position: relative;
          padding: 0.85rem 0.75rem; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
          color: #e2e8f0; font-size: 0.82rem; font-weight: 600;
          cursor: pointer; transition: all 0.18s ease; text-align: center;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: inherit; min-width: 0;
        }
        .hotkey-btn:hover { background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); transform: translateY(-1px); border-color: rgba(255,255,255,0.14); }
        .hotkey-btn:active { transform: translateY(0); }
        .hotkey-btn > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hotkey-icon { font-size: 1.25rem; line-height: 1; flex-shrink: 0; }

        /* Timer chip base (for static chips — not used by primary anymore) */
        .timer-chip {
          display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 0.55rem 0.95rem; border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          min-width: 110px;
        }

        /* Primary timer chip — tap to toggle */
        .timer-chip-btn {
          cursor: pointer; font-family: inherit;
          transition: all 0.18s ease;
          min-width: 160px; min-height: 92px;
          padding: 1.1rem 1.3rem;
          display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
          border: 1px solid rgba(255,255,255,0.08);
          color: #e2e8f0;
          position: relative; overflow: hidden;
        }
        .timer-chip-btn::before {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          background: radial-gradient(circle at 50% 0%, var(--phase, rgba(255,255,255,0.05)) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.25s ease; pointer-events: none;
        }
        .timer-chip-btn:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.14); }
        .timer-chip-btn:active { transform: translateY(0); }
        .timer-chip-btn .tc-label { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; display: flex; align-items: center; gap: 6px; }
        .timer-chip-btn .tc-value { font-size: 1.65rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .timer-chip-btn .tc-value-placeholder { font-size: 0.82rem; font-weight: 500; color: #475569; }
        .timer-chip-btn .tc-runs { font-size: 0.68rem; color: #94a3b8; font-weight: 500; }

        /* Running state: green text + pulsing border ring */
        .timer-chip-btn.active .tc-value { color: #22c55e; }
        .timer-chip-btn.active .tc-label { color: #22c55e; }
        .timer-chip-btn.active {
          border-color: rgba(34,197,94,0.5) !important;
          animation: chipLivePulse 2.2s ease-in-out infinite;
        }
        @keyframes chipLivePulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(34,197,94,0.35), 0 0 18px rgba(34,197,94,0.08); }
          50%      { box-shadow: 0 0 0 2px rgba(34,197,94,0.7), 0 0 30px rgba(34,197,94,0.25); }
        }

        .pulse-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #22c55e;
          animation: pulseDot 1.6s ease-out infinite;
        }
        @keyframes pulseDot {
          0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); opacity: 1; }
          70% { box-shadow: 0 0 0 9px transparent; opacity: 0.5; }
          100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
        }

        /* Stopped state — stays neutral light gray */
        .timer-chip-btn.stopped .tc-value { color: #cbd5e1; }
        .timer-chip-btn.stopped .tc-label { color: #94a3b8; }

        /* Popup timer chips (secondary row) */
        .timer-pop {
          display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 0.55rem 0.95rem; border-radius: 11px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          min-width: 100px;
          animation: popIn 0.25s ease-out;
        }
        .timer-pop .tp-label { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
        .timer-pop .tp-value { font-size: 1.05rem; font-weight: 800; color: #94a3b8; font-variant-numeric: tabular-nums; margin-top: 2px; }
        .timer-pop.running .tp-label { color: var(--phase, #94a3b8); }
        .timer-pop.running .tp-value { color: var(--phase, #e2e8f0); }
        .timer-pop.running {
          border-color: color-mix(in srgb, var(--phase) 55%, transparent);
          animation: popLivePulse 2.4s ease-in-out infinite;
        }
        @keyframes popLivePulse {
          0%, 100% { box-shadow: 0 0 0 1px color-mix(in srgb, var(--phase) 30%, transparent); }
          50%      { box-shadow: 0 0 0 2px color-mix(in srgb, var(--phase) 60%, transparent), 0 0 18px color-mix(in srgb, var(--phase) 25%, transparent); }
        }
        @keyframes popIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }

        /* Timeline entry */
        .tl-entry {
          display: flex; align-items: flex-start; gap: 0.9rem;
          padding: 0.75rem 0.9rem; border-radius: 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          transition: all 0.15s ease;
        }
        .tl-entry:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
        .tl-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0; background: color-mix(in srgb, var(--tl-color, #64748b) 15%, transparent); border: 1px solid color-mix(in srgb, var(--tl-color, #64748b) 30%, transparent); }
        .tl-time { font-size: 0.8rem; color: #94a3b8; font-variant-numeric: tabular-nums; min-width: 56px; padding-top: 7px; font-weight: 600; }
        .tl-label { font-weight: 600; color: #e2e8f0; font-size: 0.92rem; }
        .tl-details { font-size: 0.75rem; color: #64748b; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 0.6rem; }
        .tl-delete { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #94a3b8; cursor: pointer; font-size: 1rem; padding: 4px 10px; border-radius: 8px; opacity: 0.85; transition: all 0.15s ease; line-height: 1; align-self: center; }
        .tl-delete:hover { opacity: 1; color: #e63946; background: rgba(230,57,70,0.08); border-color: rgba(230,57,70,0.25); }

        /* Sweep / FiO2 sliders (under Extra column) */
        .vent-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005));
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 0.75rem 0.85rem 0.85rem;
          width: 100%;
          display: flex; flex-direction: column; gap: 0.9rem;
        }
        .vent-row { display: flex; flex-direction: column; gap: 0.45rem; }
        .vent-head { display: flex; justify-content: space-between; align-items: baseline; }
        .vent-lbl { font-size: 0.72rem; font-weight: 700; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.06em; }
        .vent-unit { font-size: 0.62rem; color: #64748b; font-weight: 600; letter-spacing: 0.06em; }
        .vent-range {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 8px; border-radius: 4px;
          background: linear-gradient(to right,
            #06b6d4 0%, #06b6d4 var(--pct, 0%),
            rgba(255,255,255,0.1) var(--pct, 0%), rgba(255,255,255,0.1) 100%);
          cursor: pointer; outline: none;
          box-shadow: 0 0 12px rgba(6,182,212,0.15);
        }
        .vent-range::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 22px; height: 22px; border-radius: 50%;
          background: #06b6d4; cursor: pointer;
          border: 3px solid #080b12;
          box-shadow: 0 0 14px rgba(6,182,212,0.6);
        }
        .vent-range::-moz-range-thumb {
          width: 22px; height: 22px; border-radius: 50%;
          background: #06b6d4; cursor: pointer;
          border: 3px solid #080b12;
          box-shadow: 0 0 14px rgba(6,182,212,0.6);
        }
        .vent-range::-moz-range-track {
          height: 8px; border-radius: 4px;
          background: linear-gradient(to right,
            #06b6d4 0%, #06b6d4 var(--pct, 0%),
            rgba(255,255,255,0.1) var(--pct, 0%), rgba(255,255,255,0.1) 100%);
        }
        .vent-head .vent-current { font-size: 0.78rem; font-weight: 700; color: #06b6d4; font-variant-numeric: tabular-nums; }
        .vent-num {
          width: 100%; padding: 0.45rem 0.6rem; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: #e2e8f0; font-size: 0.92rem; font-weight: 600;
          font-variant-numeric: tabular-nums;
          text-align: center; font-family: inherit; outline: none;
          box-sizing: border-box;
        }
        .vent-num:focus { border-color: rgba(6,182,212,0.45); }

        /* Timeline event note input */
        .tl-note-input {
          width: 100%; margin-top: 4px;
          padding: 0.35rem 0.55rem; border-radius: 6px;
          border: 1px solid transparent; background: transparent;
          color: #cbd5e1; font-size: 0.78rem; font-family: inherit;
          transition: all 0.15s ease; outline: none;
        }
        .tl-note-input::placeholder { color: #475569; font-style: italic; }
        .tl-note-input:hover { background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.04); }
        .tl-note-input:focus { background: rgba(255,255,255,0.04); border-color: rgba(230,57,70,0.3); }

        /* Header clock (top-right, live mode) */
        .header-clock { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .header-clock .hc-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; font-weight: 700; }
        .header-clock .hc-value { font-size: 1.05rem; font-weight: 700; color: #e2e8f0; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

        /* Primary columns: each column = one timer chip + its run table */
        .primary-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 0.65rem;
          align-items: start;
        }
        .primary-col { display: flex; flex-direction: column; gap: 0.5rem; }
        .primary-col .timer-chip-btn { width: 100%; min-width: 0; }
        .primary-chips-row .timer-chip-btn { width: 100%; }
        .primary-extras-row { margin-top: 0.5rem; }
        .popup-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.55rem; }

        /* Run history card (inside a column) */
        .run-table-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005));
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 0.6rem 0.75rem 0.7rem;
          width: 100%;
        }
        .rt-title { font-size: 0.7rem; font-weight: 700; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.45rem; padding-bottom: 0.35rem; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 6px; }
        .rt-title-dot { width: 6px; height: 6px; border-radius: 2px; background: var(--phase, #22c55e); }
        .rt-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        .rt-table th { text-align: left; color: #64748b; font-weight: 600; padding: 0.15rem 0.4rem 0.3rem 0; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; }
        .rt-table th:last-child { text-align: right; padding-right: 0; }
        .rt-table td { color: #cbd5e1; padding: 0.22rem 0.4rem 0.22rem 0; font-variant-numeric: tabular-nums; }
        .rt-table td:last-child { text-align: right; font-weight: 600; padding-right: 0; }
        .rt-active { color: #22c55e; font-weight: 600; font-size: 0.64rem; margin-left: 4px; }
        .rt-total td { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.4rem !important; color: #e2e8f0; font-weight: 700; }

        /* Add-entry tab pill */
        .entry-tab {
          padding: 0.55rem 1rem; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: #94a3b8; font-size: 0.82rem; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: all 0.15s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .entry-tab:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .entry-tab.active { background: #e63946; color: white; border-color: #e63946; box-shadow: 0 0 20px rgba(230,57,70,0.3); }

        @media (max-width: 900px) {
          .primary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .hotkey-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 600px) {
          .chart-header { flex-direction: column !important; align-items: flex-start !important; gap: 0.75rem !important; }
          .chart-grid { grid-template-columns: 1fr 1fr !important; }
          .hotkey-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .primary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .timer-chip-btn { min-height: 82px; padding: 0.85rem 0.75rem; }
          .timer-chip-btn .tc-value { font-size: 1.3rem; }
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
          {view === 'live' && (
            <div className="header-clock">
              <div className="hc-label">Clock</div>
              <div className="hc-value">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>
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
            onUpdateEventNote={updateEventNote}
          />
        )}
      </div>

      {/* Custom modal */}
      {modal.open && (
        <div
          className="modal-overlay"
          onClick={() => closeModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            {modal.title && <div className="modal-title">{modal.title}</div>}
            <div className="modal-message">{modal.message}</div>
            <div className="modal-actions">
              {modal.kind === 'confirm' && (
                <button className="modal-btn" onClick={() => closeModal(false)} type="button">Cancel</button>
              )}
              <button
                className={`modal-btn${modal.danger ? ' danger' : modal.kind === 'alert' ? ' primary' : ''}`}
                onClick={() => closeModal(true)}
                type="button"
                autoFocus
              >
                {modal.kind === 'confirm' ? (modal.confirmLabel || 'Confirm') : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ----- Live chart component -----

function LiveChart({
  caseRecord, events, timers, now, activeForm, setActiveForm, onHotkey, onToggleTimer, onAddEvent, onDeleteEvent, onUpdateEventNote,
}: {
  caseRecord: CaseRecord
  events: CaseEvent[]
  timers: {
    cpb: PhaseData | null
    xclamp: PhaseData | null
    cp: { running: boolean; min: number } | null
    reperfusion: { running: boolean; min: number } | null
    cooling: { running: boolean; min: number } | null
    rewarming: { running: boolean; min: number } | null
    sacp: PhaseData | null
    dhca: PhaseData | null
    extra: PhaseData | null
  }
  now: number
  activeForm: 'vitals' | 'med' | 'cp' | 'blood' | 'abg' | 'note' | null
  setActiveForm: (f: 'vitals' | 'med' | 'cp' | 'blood' | 'abg' | 'note' | null) => void
  onHotkey: (label: string) => void
  onToggleTimer: (which: 'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra') => Promise<void>
  onAddEvent: (eventType: string, label: string, details?: Record<string, unknown>) => Promise<void>
  onDeleteEvent: (id: string) => Promise<void>
  onUpdateEventNote: (id: string, note: string) => Promise<void>
}) {
  type PrimaryKey = 'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra'
  const primaryRows: { key: PrimaryKey; label: string; data: PhaseData | null }[] = [
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

  const formatT = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <>
      {/* Sticky frosted top bar with timers */}
      <div className="live-sticky">
        {/* Primary columns: each timer chip stacks over its run-history table */}
        {/* Row 1: primary timer chips */}
        <div className="primary-grid primary-chips-row">
          {primaryRows.map(t => {
            const running = t.data?.running ?? false
            const started = t.data != null
            const value = t.data?.totalMin != null ? `${t.data.totalMin} min` : 'Tap to start'
            const runCount = t.data?.runs.length ?? 0
            const phase = PHASE_COLORS[t.key]
            return (
              <button
                key={t.key}
                onClick={() => onToggleTimer(t.key)}
                className={`timer-chip-btn${running ? ' active' : ''}${started && !running ? ' stopped' : ''}`}
                type="button"
                style={{ ['--phase' as never]: phase }}
              >
                <div className="tc-label">
                  {running && <span className="pulse-dot" />}
                  {t.label}
                </div>
                <div className={t.data != null ? 'tc-value' : 'tc-value-placeholder'}>{value}</div>
                {runCount > 1 && <div className="tc-runs">{runCount} runs</div>}
              </button>
            )
          })}
        </div>

        {/* Row 2: popup timers (appear once triggered) — tight under primary chips */}
        {activePopupRows.length > 0 && (
          <div className="popup-row">
            {activePopupRows.map(t => {
              const phase = PHASE_COLORS[t.key]
              const running = t.data?.running ?? false
              const value = t.data?.min != null ? `${t.data.min} min` : '—'
              return (
                <div key={t.key} className={`timer-pop${running ? ' running' : ''}`} style={{ ['--phase' as never]: phase }}>
                  <div className="tp-label">{t.label}</div>
                  <div className="tp-value">{value}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Row 3: run-history tables and sliders, aligned under their chip columns */}
        {(primaryRows.some(t => (t.data?.runs.length ?? 0) > 0 && t.key !== 'extra') || true) && (
          <div className="primary-grid primary-extras-row">
            {primaryRows.map(t => {
              const phase = PHASE_COLORS[t.key]
              const hasRuns = (t.data?.runs.length ?? 0) > 0 && t.key !== 'extra'
              return (
                <div key={t.key} className="primary-col">
                  {hasRuns && (
                    <div className="run-table-card" style={{ ['--phase' as never]: phase }}>
                      <div className="rt-title">
                        <span className="rt-title-dot" />
                        {t.label}
                      </div>
                      <table className="rt-table">
                        <thead>
                          <tr><th>Start</th><th>Stop</th><th>Duration</th></tr>
                        </thead>
                        <tbody>
                          {t.data!.runs.map((r, i) => (
                            <tr key={i}>
                              <td>{formatT(r.start)}</td>
                              <td>{r.stop ? formatT(r.stop) : '—'}</td>
                              <td>{r.min}m{!r.stop && <span className="rt-active">●</span>}</td>
                            </tr>
                          ))}
                          <tr className="rt-total">
                            <td colSpan={2}>Total</td>
                            <td>{t.data!.totalMin}m</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  {t.key === 'extra' && (
                    <VentSliders events={events} onLog={onAddEvent} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Hotkeys */}
      <div className="live-card">
        <div className="live-card-title">Quick Events</div>
        <div className="hotkey-grid">
          {HOTKEYS.map(hk => (
            <button
              key={hk.label}
              onClick={() => onHotkey(hk.label)}
              className="hotkey-btn"
            >
              {hk.icon && <span className="hotkey-icon" style={{ color: hk.color }} aria-hidden>{hk.icon}</span>}
              <span>{hk.label}</span>
            </button>
          ))}
          <button
            onClick={() => { setActiveForm('note'); setTimeout(() => document.getElementById('quick-note-textarea')?.focus(), 50) }}
            className="hotkey-btn"
            type="button"
          >
            <span className="hotkey-icon" style={{ color: '#a855f7' }} aria-hidden>📝</span>
            <span>Quick Note</span>
          </button>
        </div>
      </div>

      {/* Add-entry tabs */}
      <div className="live-card">
        <div className="live-card-title">Add Entry</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: activeForm ? '1rem' : 0 }}>
          {(['vitals', 'med', 'cp', 'blood', 'abg', 'note'] as const).map(k => {
            const iconMap: Record<string, string> = { vitals: '📊', med: '💊', cp: '❤️', blood: '🩸', abg: '🧪', note: '📝' }
            const labelMap: Record<string, string> = { vitals: 'Vitals', med: 'Medication', cp: 'CP Dose', blood: 'Blood Product', abg: 'ABG', note: 'Note' }
            return (
              <button
                key={k}
                onClick={() => setActiveForm(activeForm === k ? null : k)}
                className={`entry-tab${activeForm === k ? ' active' : ''}`}
                type="button"
              >
                <span aria-hidden>{iconMap[k]}</span>
                <span>{labelMap[k]}</span>
              </button>
            )
          })}
        </div>
        {activeForm === 'vitals' && <VitalsForm onSubmit={(d) => { onAddEvent('vitals', 'Vitals', d); setActiveForm(null) }} />}
        {activeForm === 'med' && <MedForm onSubmit={(d) => { onAddEvent('med', `Med: ${d.name}`, d); setActiveForm(null) }} />}
        {activeForm === 'cp' && <CpForm onSubmit={(d) => { onAddEvent('cp', `CP: ${d.type} ${d.volume}mL ${d.route}`, d); setActiveForm(null) }} />}
        {activeForm === 'blood' && <BloodForm onSubmit={(d) => { onAddEvent('blood', `${d.product} ${d.amount}${d.product === 'Cell Saver' ? 'mL' : 'u'}`, d); setActiveForm(null) }} />}
        {activeForm === 'abg' && <AbgForm onSubmit={(d) => { onAddEvent('abg', 'ABG', d); setActiveForm(null) }} />}
        {activeForm === 'note' && <NoteForm onSubmit={(d) => { onAddEvent('note', 'Note', d); setActiveForm(null) }} />}
      </div>

      {/* Timeline */}
      <div className="live-card">
        <div className="live-card-title">Timeline <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.85rem', marginLeft: '8px' }}>· {events.length} {events.length === 1 ? 'event' : 'events'}</span></div>
        {events.length === 0 ? (
          <div style={{ color: '#475569', fontSize: '0.88rem', padding: '2rem 0', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>⏱️</div>
            No events yet. Tap a timer above or a Quick Event to start logging.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[...events].reverse().map(e => {
              const typeStyle = EVENT_TYPE_STYLES[e.event_type] || EVENT_TYPE_STYLES.hotkey
              const currentNote = (e.details && typeof e.details === 'object' && typeof (e.details as Record<string, unknown>).note === 'string')
                ? ((e.details as Record<string, unknown>).note as string)
                : ''
              return (
                <div key={e.id} className="tl-entry">
                  <div className="tl-time">{new Date(e.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="tl-icon" style={{ ['--tl-color' as never]: typeStyle.color }} aria-hidden>{typeStyle.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tl-label">{e.label}</div>
                    {e.details && <EventDetails details={e.details} />}
                    <EventNote
                      eventId={e.id}
                      initial={currentNote}
                      onSave={onUpdateEventNote}
                    />
                  </div>
                  <button onClick={() => onDeleteEvent(e.id)} className="tl-delete" title="Delete event" aria-label="Delete event">×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function EventDetails({ details }: { details: Record<string, unknown> }) {
  // Skip the "note" key — it renders via EventNote below
  const pairs = Object.entries(details).filter(([k, v]) => k !== 'note' && v !== null && v !== undefined && v !== '')
  if (pairs.length === 0) return null
  return (
    <div className="tl-details">
      {pairs.map(([k, v]) => (
        <span key={k}><span style={{ textTransform: 'capitalize', color: '#94a3b8' }}>{k.replace(/_/g, ' ')}</span> <strong style={{ color: '#cbd5e1' }}>{String(v)}</strong></span>
      ))}
    </div>
  )
}

function VentSliders({
  events, onLog,
}: {
  events: CaseEvent[]
  onLog: (eventType: string, label: string, details?: Record<string, unknown>) => Promise<void>
}) {
  const latestFromEvents = (key: string, fallback: number): number => {
    for (let i = events.length - 1; i >= 0; i--) {
      const d = events[i].details as Record<string, unknown> | null | undefined
      if (d && typeof d[key] === 'number') return d[key] as number
    }
    return fallback
  }
  const initSweep = latestFromEvents('sweep', 0)
  const initFio2 = latestFromEvents('fio2', 21)

  const [sweep, setSweep] = useState<number>(initSweep)
  const [fio2, setFio2] = useState<number>(initFio2)
  useEffect(() => { setSweep(initSweep) }, [initSweep])
  useEffect(() => { setFio2(initFio2) }, [initFio2])

  const commitSweep = (raw: number) => {
    if (isNaN(raw)) return
    const val = Math.max(0, Math.min(11, Math.round(raw * 10) / 10))
    setSweep(val)
    if (val !== initSweep) onLog('vent', `Sweep ${val.toFixed(1)} LPM`, { sweep: val })
  }
  const commitFio2 = (raw: number) => {
    if (isNaN(raw)) return
    const val = Math.max(21, Math.min(100, Math.round(raw)))
    setFio2(val)
    if (val !== initFio2) onLog('vent', `FiO2 ${val}%`, { fio2: val })
  }

  const sweepPct = (Math.max(0, Math.min(11, sweep)) / 11) * 100
  const fio2Pct = ((Math.max(21, Math.min(100, fio2)) - 21) / (100 - 21)) * 100

  return (
    <div className="vent-card">
      <div className="vent-row">
        <div className="vent-head">
          <span className="vent-lbl">Sweep</span>
          <span className="vent-current">{sweep.toFixed(1)} <span className="vent-unit">LPM</span></span>
        </div>
        <input
          type="range"
          min={0}
          max={11}
          step={0.1}
          value={sweep}
          onChange={e => setSweep(Number(e.target.value))}
          onMouseUp={e => commitSweep(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => commitSweep(Number((e.target as HTMLInputElement).value))}
          className="vent-range"
          style={{ ['--pct' as never]: `${sweepPct}%` }}
        />
        <input
          type="number"
          min={0}
          max={11}
          step={0.1}
          value={sweep}
          onChange={e => setSweep(e.target.value === '' ? 0 : Number(e.target.value))}
          onBlur={e => commitSweep(Number(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="vent-num"
        />
      </div>

      <div className="vent-row">
        <div className="vent-head">
          <span className="vent-lbl">FiO₂</span>
          <span className="vent-current">{fio2}<span className="vent-unit">%</span></span>
        </div>
        <input
          type="range"
          min={21}
          max={100}
          step={1}
          value={fio2}
          onChange={e => setFio2(Number(e.target.value))}
          onMouseUp={e => commitFio2(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => commitFio2(Number((e.target as HTMLInputElement).value))}
          className="vent-range"
          style={{ ['--pct' as never]: `${fio2Pct}%` }}
        />
        <input
          type="number"
          min={21}
          max={100}
          step={1}
          value={fio2}
          onChange={e => setFio2(e.target.value === '' ? 21 : Number(e.target.value))}
          onBlur={e => commitFio2(Number(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="vent-num"
        />
      </div>
    </div>
  )
}

function EventNote({ eventId, initial, onSave }: { eventId: string; initial: string; onSave: (id: string, note: string) => void }) {
  const [value, setValue] = useState(initial)
  useEffect(() => { setValue(initial) }, [initial])
  return (
    <input
      type="text"
      className="tl-note-input"
      placeholder="Add note..."
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => { if (value !== initial) onSave(eventId, value) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
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
        id="quick-note-textarea"
        style={{ ...inpStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Type a note..."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log Note</button></div>
    </>
  )
}
