'use client'

import { Fragment, useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

type CaseRecord = {
  id: string
  case_number?: string | null
  patient_initials?: string | null        // last name
  patient_first_name?: string | null      // first name
  age?: number | null
  sex?: string | null
  case_date?: string | null
  procedure?: string | null               // displayed as "Case Type"
  allergies?: string | null
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
  user_email?: string | null
  equipment?: Record<string, { name: string; number: string }> | null
}

const EQUIPMENT_SLOTS: Array<{ key: string; label: string }> = [
  { key: 'pump_pack', label: 'Pump Pack' },
  { key: 'oxygenator', label: 'Oxygenator' },
  { key: 'arterial_cannula', label: 'Arterial Cannula' },
  { key: 'venous_cannula', label: 'Venous Cannula' },
  { key: 'cardioplegia_cannula', label: 'Cardioplegia Cannula' },
  { key: 'hemoconcentrator', label: 'Hemoconcentrator' },
  { key: 'bypass_machine', label: 'Bypass Machine' },
  { key: 'cell_saver_machine', label: 'Cell Saver Machine' },
  { key: 'heater_cooler', label: 'Heater/Cooler' },
]

type EquipmentTemplate = {
  id: string
  name: string
  equipment: Record<string, { name: string; number: string }>
}

type PhaseData = {
  runs: Array<{ start: string; stop?: string; min: number; startId: string; stopId?: string }>
  totalMin: number
  running: boolean
}

type CaseEvent = {
  id: string
  case_id: string
  event_time: string
  event_type: string // 'hotkey' | 'vitals' | 'med' | 'cp' | 'blood' | 'volume' | 'abg' | 'note'
  label?: string | null
  details?: Record<string, unknown> | null
  created_at?: string
}

const EMPTY_CASE: Partial<CaseRecord> = {
  case_number: '', patient_initials: '', patient_first_name: '', age: null, sex: '', case_date: new Date().toISOString().slice(0, 10),
  procedure: '', allergies: '', surgeon: '', anesthesiologist: '', weight_kg: null, height_cm: null, bsa: null,
  cpb_start: '', cpb_end: '', xclamp_start: '', xclamp_end: '', circ_arrest_min: null,
  oxygenator: '', arterial_cannula: '', venous_cannula: '', prime_composition: '', prime_volume_ml: null,
  cardioplegia_type: '', cardioplegia_volume_ml: null,
  pre_hct: null, pre_act: null, low_hct: null, peak_act: null, post_hct: null, final_k: null, final_glucose: null,
  heparin_total_units: null, protamine_mg: null,
  prbc_units: 0, ffp_units: 0, platelets_units: 0, cryo_units: 0, cell_saver_ml: 0,
  uf_volume_ml: null, urine_output_ml: null, notes: '', complications: '',
}

type TimerKey = 'cpb' | 'xclamp' | 'dhca' | 'sacp' | 'extra' | 'rcp' | 'muf'

const HOTKEYS: { label: string; color?: string; icon?: string; timerKey?: TimerKey }[] = [
  // Single-shot quick events
  { label: 'Cooling', color: '#3b82f6', icon: '❄️' },
  { label: 'Rewarming', color: '#ef4444', icon: '🔥' },
  { label: 'Flow down per SN', color: '#64748b', icon: '⬇️' },
  { label: 'Flow up per SN', color: '#64748b', icon: '⬆️' },
  { label: 'Weaning from CPB', color: '#eab308', icon: '📉' },
  // Timer-toggle quick events — start/stop a run every tap, show a chip + log
  { label: 'DHCA', color: '#22c55e', icon: '⏱️', timerKey: 'dhca' },
  { label: 'SACP', color: '#22c55e', icon: '⏱️', timerKey: 'sacp' },
  { label: 'RCP', color: '#22c55e', icon: '⏱️', timerKey: 'rcp' },
  { label: 'MUF', color: '#22c55e', icon: '⏱️', timerKey: 'muf' },
  { label: 'Extra', color: '#22c55e', icon: '⏱️', timerKey: 'extra' },
]

// Labels logged when a primary timer chip is tapped to start/stop.
const PRIMARY_TIMER_LABELS: Record<TimerKey, { start: string; stop: string }> = {
  cpb: { start: 'On Bypass', stop: 'Off Bypass' },
  xclamp: { start: 'Aortic Clamp On', stop: 'Aortic Clamp Off' },
  dhca: { start: 'DHCA Start', stop: 'DHCA Stop' },
  sacp: { start: 'SACP Start', stop: 'SACP Stop' },
  extra: { start: 'Extra Start', stop: 'Extra Stop' },
  rcp: { start: 'RCP Start', stop: 'RCP Stop' },
  muf: { start: 'MUF Start', stop: 'MUF Stop' },
}

// Primary timers are uniformly green when running; popup timers keep distinct text colors.
const PHASE_COLORS: Record<string, string> = {
  cpb: '#22c55e',
  xclamp: '#22c55e',
  dhca: '#22c55e',
  sacp: '#22c55e',
  extra: '#22c55e',
  rcp: '#22c55e',
  muf: '#22c55e',
  cp: '#eab308',         // cardioplegia timer: yellow
  reperfusion: '#f97316', // orange
  cooling: '#3b82f6',     // blue
  rewarming: '#ef4444',   // red
}

const EVENT_TYPE_STYLES: Record<string, { color: string; icon: string }> = {
  hotkey: { color: '#94a3b8', icon: '⏱️' },
  vitals: { color: '#22c55e', icon: '📊' },
  med: { color: '#a855f7', icon: '💊' },
  cp: { color: '#ec4899', icon: '❤️' },
  blood: { color: '#ef4444', icon: '🩸' },
  volume: { color: '#06b6d4', icon: '💧' },
  abg: { color: '#eab308', icon: '🧪' },
  note: { color: '#64748b', icon: '📝' },
  vent: { color: '#06b6d4', icon: '🌬️' },
}

// Label-specific icon overrides for hotkey-type events (so Cooling/Rewarming
// use their own pictograms instead of the generic stopwatch).
const HOTKEY_LABEL_ICONS: Record<string, string> = {
  'Cooling': '❄️',
  'Rewarming': '🔥',
  'Flow down per SN': '⬇️',
  'Flow up per SN': '⬆️',
  'Weaning from CPB': '📉',
}

// Preferred display order for event detail keys; unknown keys fall to the end.
const DETAIL_KEY_ORDER = [
  'name', 'dose', 'unit',
  'type', 'volume', 'route', 'temp',
  'product', 'amount',
  'fluid',
  'map', 'cvp', 'flow', 'temp_blood', 'temp_bladder', 'svo2', 'hct', 'act', 'fio2', 'sweep', 'urine',
  'ph', 'pco2', 'po2', 'hco3', 'be', 'k', 'ica', 'hgb', 'glucose', 'lactate',
  'text',
]

// Detail keys to hide per event type because they are already in the title.
// e.g. "Med: Epinephrine" repeats `name`; "PRBC 1u" repeats `product`/`amount`.
const REDUNDANT_DETAIL_KEYS: Record<string, string[]> = {
  med: ['name', 'dose', 'unit'],
  blood: ['product', 'amount'],
  cp: ['type', 'volume'],
  volume: ['fluid', 'amount'],
  vent: ['sweep', 'fio2'],
}

const COMMON_MEDS = [
  'Epinephrine', 'Norepinephrine', 'Phenylephrine', 'Calcium Chloride',
  'Sodium Bicarbonate', 'Mannitol', 'Lasix (Furosemide)', 'Insulin',
  'Magnesium', 'Vasopressin', 'Lidocaine', 'Heparin', 'Protamine',
]

const CP_TYPES = ['Del Nido', 'Buckberg', 'Custodiol (HTK)', 'Microplegia', 'Other']
const CP_ROUTES = ['Antegrade', 'Retrograde', 'Ostial', 'Aortic Root']
const BLOOD_PRODUCTS = ['PRBC', 'FFP', 'Platelets', 'Cryo', 'Cell Saver']
const VOLUME_FLUIDS = ['Normosol', 'Plasmalyte', 'Albumin', '0.9% Normal Saline', '0.45% Half Normal Saline', 'Lactated Ringers']

// Render the timeline label from details when we can produce a nicer format
// than the stored label (applies retroactively to historical events).
function displayEventLabel(e: CaseEvent): string {
  const d = (e.details && typeof e.details === 'object') ? e.details as Record<string, unknown> : null
  if (e.event_type === 'med' && d) {
    const name = typeof d.name === 'string' ? d.name : null
    const dose = d.dose != null && d.dose !== '' ? String(d.dose) : null
    const unit = typeof d.unit === 'string' ? d.unit : ''
    if (name && dose) return `${name}- ${dose}${unit}`
    if (name) return name
  }
  if (e.event_type === 'cp' && d) {
    const type = typeof d.type === 'string' ? d.type : null
    const volume = d.volume != null && d.volume !== '' ? String(d.volume) : null
    if (type && volume) return `CP: ${type} ${volume}ml`
  }
  return e.label || ''
}

export default function ChartPage() {
  const [user, setUser] = useState<{ id: string; email?: string; name?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [view, setView] = useState<'list' | 'form' | 'live'>('list')
  const [editing, setEditing] = useState<Partial<CaseRecord>>(EMPTY_CASE)
  const [saving, setSaving] = useState(false)
  // When true, saving/cancelling the form returns to the live view of the
  // current live case instead of going to the list.
  const [editingReturnsToLive, setEditingReturnsToLive] = useState(false)
  const [loading, setLoading] = useState(false)

  // Live chart state
  const [liveCase, setLiveCase] = useState<CaseRecord | null>(null)
  const [events, setEvents] = useState<CaseEvent[]>([])
  const [now, setNow] = useState(Date.now())
  const [activeForm, setActiveForm] = useState<'vitals' | 'med' | 'cp' | 'blood' | 'volume' | 'abg' | 'note' | null>(null)
  const [equipmentTemplates, setEquipmentTemplates] = useState<EquipmentTemplate[]>([])

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
        const meta = session.user.user_metadata as Record<string, unknown> | undefined
        const name =
          (typeof meta?.full_name === 'string' ? meta.full_name : undefined) ||
          (typeof meta?.name === 'string' ? meta.name : undefined) ||
          session.user.email?.split('@')[0]
        setUser({ id: session.user.id, email: session.user.email, name })
        setAuthLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      loadCases()
      loadEquipmentTemplates()
    }
  }, [user])

  async function loadEquipmentTemplates() {
    if (!user) return
    const res = await fetch(`/api/equipment-templates?userId=${user.id}`)
    const data = await res.json()
    setEquipmentTemplates(data.templates || [])
  }

  async function saveEquipmentTemplate(name: string, equipment: Record<string, { name: string; number: string }>) {
    if (!user) return
    const res = await fetch('/api/equipment-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, userEmail: user.email, name, equipment }),
    })
    const data = await res.json()
    if (data.error) { await showAlert('Save failed: ' + data.error, 'Could not save template'); return }
    loadEquipmentTemplates()
  }

  async function deleteEquipmentTemplate(id: string) {
    if (!user) return
    const ok = await showConfirm('Delete this equipment template?', { title: 'Delete template?', danger: true, confirmLabel: 'Delete' })
    if (!ok) return
    await fetch(`/api/equipment-templates?id=${id}&userId=${user.id}`, { method: 'DELETE' })
    loadEquipmentTemplates()
  }

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
    if (editingReturnsToLive && data.case) {
      // Came from the live chart — return to it with fresh case data.
      setLiveCase(data.case)
      setView('live')
      setEditingReturnsToLive(false)
    } else {
      setView('list')
    }
    setEditing(EMPTY_CASE)
  }

  async function deleteCase(id: string) {
    if (!user) return
    const ok = await showConfirm('This cannot be undone.', { title: 'Delete this case?', danger: true, confirmLabel: 'Delete' })
    if (!ok) return
    await fetch(`/api/cases?id=${id}&userId=${user.id}`, { method: 'DELETE' })
    await loadCases()
  }

  async function updateCase(patches: Partial<CaseRecord>) {
    if (!user || !liveCase) return
    const caseId = liveCase.id
    setLiveCase(prev => prev ? { ...prev, ...patches } : prev)
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, ...patches } : c))
    const res = await fetch('/api/cases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: caseId, userId: user.id, ...patches }),
    })
    const data = await res.json()
    if (data.error) {
      await showAlert('Save failed: ' + data.error, 'Could not update case')
    }
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

  function openLiveCaseDetails() {
    if (!liveCase) return
    setEditing({ ...liveCase })
    setEditingReturnsToLive(true)
    setView('form')
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

  async function toggleTimer(which: TimerKey) {
    const labels = PRIMARY_TIMER_LABELS[which]
    const running = timers[which]?.running ?? false
    await logEvent('hotkey', running ? labels.stop : labels.start)

    // Coming off bypass stops everything: close out any other running primary
    // or quick-event timer so nothing keeps counting past CPB end.
    if (which === 'cpb' && running) {
      const others: Array<Exclude<TimerKey, 'cpb'>> = ['xclamp', 'dhca', 'sacp', 'extra', 'rcp', 'muf']
      for (const o of others) {
        if (timers[o]?.running) {
          await logEvent('hotkey', PRIMARY_TIMER_LABELS[o].stop)
        }
      }
    }
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

  async function updateEventTime(id: string, eventTime: string) {
    if (!user) return
    const res = await fetch('/api/case-events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, userId: user.id, eventTime }),
    })
    const data = await res.json()
    if (data.error) {
      await showAlert(data.error, 'Could not update time')
      return
    }
    if (data.event) {
      setEvents(prev => {
        const next = prev.map(e => e.id === id ? data.event : e)
        return next.sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
      })
    }
  }

  async function deleteRun(startId: string, stopId?: string) {
    if (!user) return
    const ok = await showConfirm('This removes the start and stop events for this run.', { title: 'Delete this run?', danger: true, confirmLabel: 'Delete' })
    if (!ok) return
    const ids = stopId ? [startId, stopId] : [startId]
    await Promise.all(ids.map(id => fetch(`/api/case-events?id=${id}&userId=${user.id}`, { method: 'DELETE' })))
    setEvents(prev => prev.filter(e => !ids.includes(e.id)))
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
      const runs: Array<{ start: string; stop?: string; min: number; startId: string; stopId?: string }> = []
      let currentStart: string | null = null
      let currentStartId: string | null = null

      for (const e of events) {
        if (e.label === startLabel) {
          if (!currentStart) { currentStart = e.event_time; currentStartId = e.id }
        } else if (e.label === stopLabel && currentStart && currentStartId) {
          const min = Math.max(0, Math.floor((new Date(e.event_time).getTime() - new Date(currentStart).getTime()) / 60000))
          runs.push({ start: currentStart, stop: e.event_time, min, startId: currentStartId, stopId: e.id })
          currentStart = null
          currentStartId = null
        }
      }

      let running = false
      if (currentStart && currentStartId) {
        running = true
        const min = Math.max(0, Math.floor((now - new Date(currentStart).getTime()) / 60000))
        runs.push({ start: currentStart, min, startId: currentStartId })
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
    const rcp = computePhase('RCP Start', 'RCP Stop')
    const muf = computePhase('MUF Start', 'MUF Stop')

    // CP Timer: counts from the most recent CP dose event. Freezes when the
    // cross clamp comes off (or when Off Bypass hits, via makeTimer's default).
    const latestCp = [...events].reverse().find(e => e.event_type === 'cp')?.event_time
    const cpStop = findNextAfter('Aortic Clamp Off', latestCp)
    const cp = makeTimer(latestCp, cpStop)

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

    return { cpb, xclamp, cp, reperfusion, cooling, rewarming, sacp, dhca, extra, rcp, muf }
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
        /* Quick Event timer button — running state */
        .hotkey-btn.hotkey-active {
          border-color: rgba(34,197,94,0.55);
          background: linear-gradient(180deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03));
          color: #22c55e;
          box-shadow: 0 0 0 1px rgba(34,197,94,0.25), 0 0 16px rgba(34,197,94,0.12);
        }
        .hotkey-btn.hotkey-active:hover { background: linear-gradient(180deg, rgba(34,197,94,0.14), rgba(34,197,94,0.05)); }

        /* Timer chip base (for static chips — not used by primary anymore) */
        .timer-chip {
          display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 0.55rem 0.95rem; border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          min-width: 110px;
        }

        /* Primary timer chip — tap to toggle. Horizontal: [LABEL | value] */
        .timer-chip-btn {
          cursor: pointer; font-family: inherit;
          transition: all 0.18s ease;
          min-width: 0; min-height: 68px;
          padding: 0.75rem 1rem;
          display: flex; flex-direction: row; align-items: center; justify-content: flex-start;
          gap: 0.95rem;
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
          border: 1px solid rgba(255,255,255,0.08);
          color: #e2e8f0;
          position: relative; overflow: hidden;
          width: 100%; text-align: left;
        }
        .timer-chip-btn::before {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          background: radial-gradient(circle at 50% 0%, var(--phase, rgba(255,255,255,0.05)) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.25s ease; pointer-events: none;
        }
        .timer-chip-btn:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.14); }
        .timer-chip-btn:active { transform: translateY(0); }
        .timer-chip-btn .tc-label {
          font-size: 1.05rem; font-weight: 800; letter-spacing: 0.04em;
          text-transform: uppercase; color: #cbd5e1;
          display: flex; align-items: center; gap: 7px;
          padding-right: 0.9rem;
          border-right: 2px solid rgba(255,255,255,0.18);
          line-height: 1; flex-shrink: 0;
          white-space: nowrap;
          transition: color 0.18s ease, border-color 0.18s ease;
        }
        .timer-chip-btn .tc-value {
          font-size: 1.55rem; font-weight: 800; letter-spacing: -0.01em;
          font-variant-numeric: tabular-nums; line-height: 1;
          flex-shrink: 0;
          transition: color 0.18s ease;
        }
        .timer-chip-btn .tc-value-placeholder {
          font-size: 0.9rem; font-weight: 500; color: #475569; font-style: italic;
          flex-shrink: 0;
        }

        /* Running state: green text + divider + pulsing border ring */
        .timer-chip-btn.active .tc-value { color: #22c55e; }
        .timer-chip-btn.active .tc-label { color: #22c55e; border-right-color: rgba(34,197,94,0.45); }
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

        /* Stopped state — shadowed so completed runs recede visually */
        .timer-chip-btn.stopped { opacity: 0.62; }
        .timer-chip-btn.stopped:hover { opacity: 1; }
        .timer-chip-btn.stopped .tc-value { color: #cbd5e1; }
        .timer-chip-btn.stopped .tc-label { color: #94a3b8; border-right-color: rgba(148,163,184,0.2); }

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
          display: flex; align-items: center; gap: 0.9rem;
          padding: 0.7rem 0.9rem; border-radius: 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          transition: all 0.15s ease;
        }
        .tl-entry:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
        .tl-icon {
          width: 46px; height: 46px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.45rem; line-height: 1; flex-shrink: 0;
          background: color-mix(in srgb, var(--tl-color, #64748b) 18%, transparent);
          border: 1px solid color-mix(in srgb, var(--tl-color, #64748b) 45%, transparent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--tl-color, #64748b) 8%, transparent);
          color: var(--tl-color, #94a3b8);
        }
        .tl-time { font-size: 0.82rem; color: #94a3b8; font-variant-numeric: tabular-nums; min-width: 60px; font-weight: 600; }
        .tl-title-row { display: flex; align-items: center; gap: 0.45rem; flex-wrap: nowrap; min-width: 0; }
        .tl-label { font-weight: 700; color: #e2e8f0; font-size: 0.95rem; letter-spacing: 0.01em; flex-shrink: 0; }
        .tl-sep { color: #475569; font-weight: 500; flex-shrink: 0; user-select: none; }
        .tl-duration {
          font-size: 0.95rem; font-weight: 700; color: #e2e8f0;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.01em; flex-shrink: 0;
        }
        .tl-details { font-size: 0.75rem; color: #64748b; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 0.6rem; }
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

        /* Timeline event note input — inline after the label */
        .tl-note-input {
          flex: 1; min-width: 0;
          padding: 0.22rem 0.5rem; border-radius: 6px;
          border: 1px solid transparent; background: transparent;
          color: #cbd5e1; font-size: 0.85rem; font-family: inherit;
          font-style: italic;
          transition: all 0.15s ease; outline: none;
        }
        .tl-note-input::placeholder { color: #475569; font-style: italic; }
        .tl-note-input:hover { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.05); }
        .tl-note-input:focus { background: rgba(255,255,255,0.05); border-color: rgba(230,57,70,0.3); font-style: normal; color: #e2e8f0; }

        /* Header clock (top-right, live mode) */
        .header-clock { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .header-clock .hc-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; font-weight: 700; }
        .header-clock .hc-value { font-size: 1.05rem; font-weight: 700; color: #e2e8f0; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
        .header-clock .hc-date { font-size: 0.72rem; color: #64748b; font-weight: 500; letter-spacing: 0.02em; margin-top: 2px; }

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

        /* Editable run time cell */
        .rt-time-btn {
          background: transparent; border: 1px solid transparent;
          color: #cbd5e1; font-family: inherit; font-size: inherit;
          padding: 1px 5px; border-radius: 5px; cursor: pointer;
          font-variant-numeric: tabular-nums;
          transition: all 0.12s ease;
        }
        .rt-time-btn:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.08); color: #fff; }
        .rt-time-placeholder {
          background: transparent; border: 1px dashed rgba(255,255,255,0.1);
          color: #475569; font-family: inherit; font-size: inherit;
          padding: 1px 5px; border-radius: 5px; cursor: pointer;
          transition: all 0.12s ease;
        }
        .rt-time-placeholder:hover { color: #94a3b8; border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.03); }
        .rt-time-input {
          background: rgba(230,57,70,0.08);
          border: 1px solid rgba(230,57,70,0.4);
          color: #fff; font-family: inherit; font-size: inherit;
          padding: 1px 4px; border-radius: 5px; outline: none;
          font-variant-numeric: tabular-nums;
          width: 74px;
        }
        .rt-time-input::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
        .rt-row-delete {
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          color: #64748b; cursor: pointer;
          padding: 0 6px; border-radius: 5px; font-size: 0.85rem;
          line-height: 1.4; font-family: inherit;
          transition: all 0.12s ease;
          opacity: 0.6;
        }
        .rt-row-delete:hover { opacity: 1; color: #e63946; border-color: rgba(230,57,70,0.35); background: rgba(230,57,70,0.08); }
        .rt-table th.rt-actions-col, .rt-table td.rt-actions-col { width: 24px; text-align: right !important; padding-right: 0 !important; }

        /* Add-entry tab pill — sized to match .hotkey-btn */
        .entry-tab {
          padding: 0.85rem 0.75rem; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
          color: #e2e8f0; font-size: 0.82rem; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: all 0.18s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .entry-tab > span:first-child { font-size: 1.25rem; line-height: 1; flex-shrink: 0; }
        .entry-tab:hover { background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); transform: translateY(-1px); border-color: rgba(255,255,255,0.14); }
        .entry-tab:active { transform: translateY(0); }
        .entry-tab.active { background: #e63946; color: white; border-color: #e63946; box-shadow: 0 0 20px rgba(230,57,70,0.3); }

        /* Patient info stack (live mode) — no box outline, stacked rows */
        .patient-bar {
          display: flex; flex-direction: column; gap: 0.1rem;
          padding: 0.35rem 0.3rem;
          background: transparent; border: none; box-shadow: none;
        }
        .pb-row {
          display: flex; align-items: center; gap: 0.35rem;
          flex-wrap: wrap;
          min-height: 28px;
        }
        .pb-label {
          font-size: 0.66rem; color: #64748b; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          flex-shrink: 0;
        }
        .pb-unit  { font-size: 0.7rem; color: #64748b; font-weight: 500; margin-left: -2px; }
        .pb-sep   { color: #334155; font-weight: 600; padding: 0 0.15rem; }
        .pb-comma { color: #64748b; font-weight: 600; margin-left: -3px; }
        .pb-input {
          background: transparent; border: 1px solid transparent;
          border-radius: 6px; padding: 2px 6px;
          color: #e2e8f0; font-size: 0.95rem; font-weight: 600;
          font-family: inherit; outline: none;
          font-variant-numeric: tabular-nums;
          min-width: 0;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .pb-input:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
        .pb-input:focus { background: rgba(255,255,255,0.06); border-color: rgba(230,57,70,0.4); color: #fff; }
        .pb-input::placeholder { color: #475569; font-style: italic; font-weight: 500; }
        .pb-input[type=number] { -moz-appearance: textfield; width: 58px; text-align: right; }
        .pb-input::-webkit-outer-spin-button,
        .pb-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pb-input.flex { flex: 1; min-width: 140px; }
        .pb-input.name { width: 150px; }
        .pb-open-details {
          background: transparent; border: 1px solid rgba(255,255,255,0.1);
          color: #94a3b8; font-family: inherit; font-size: 0.72rem;
          font-weight: 600; letter-spacing: 0.02em;
          padding: 4px 10px; border-radius: 8px; cursor: pointer;
          transition: all 0.15s ease;
        }
        .pb-open-details:hover {
          color: #e2e8f0; background: rgba(230,57,70,0.08);
          border-color: rgba(230,57,70,0.35);
        }

        /* Vent bar (stacked Sweep + FiO2 sliders) */
        .vent-bar {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.55rem;
          padding: 0.75rem 0.95rem;
          background: linear-gradient(180deg, rgba(6,182,212,0.06), rgba(6,182,212,0.01));
          border: 1px solid rgba(6,182,212,0.2);
          border-radius: 14px;
          box-shadow: 0 0 32px rgba(6,182,212,0.04), 0 1px 0 rgba(255,255,255,0.03) inset;
        }
        .vent-bar-row {
          display: grid;
          grid-template-columns: 90px 1fr 60px;
          align-items: center;
          gap: 0.7rem;
        }
        .vent-bar-lbl { display: flex; flex-direction: column; gap: 2px; }
        .vent-bar-lbl .vb-name {
          font-size: 0.68rem; font-weight: 700; color: #94a3b8;
          text-transform: uppercase; letter-spacing: 0.1em;
        }
        .vent-bar-lbl .vb-cur {
          font-size: 1.35rem; font-weight: 800; color: #06b6d4;
          font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
        }
        .vent-bar-lbl .vb-cur .vb-unit {
          font-size: 0.65rem; color: #64748b; margin-left: 4px; font-weight: 600;
        }

        /* 3-column live layout with right-side header rows (patient + vent span cols 2-3) */
        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(0, 0.6fr) minmax(0, 0.6fr);
          grid-template-rows: auto auto 1fr;
          gap: 0.75rem 1rem;
          align-items: start;
        }
        .col-main {
          grid-column: 1;
          grid-row: 1 / span 3;
          display: flex; flex-direction: column; gap: 0;
          min-width: 0;
        }
        .col-main .live-card:first-child { margin-top: 0; }
        .col-main .live-card:last-child { margin-bottom: 0; }
        .patient-bar { grid-column: 2 / span 2; grid-row: 1; }
        .vent-bar { grid-column: 2 / span 2; grid-row: 2; }

        /* Right side row 3 — timer+log pairs. Each timer chip is immediately
           followed by its own run-history log table in the adjacent cell. */
        .timer-rows {
          grid-column: 2 / span 2; grid-row: 3;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
          gap: 0.55rem 0.6rem;
          align-content: start;
          position: sticky; top: 1rem;
          min-width: 0;
        }
        /* Cells that span both columns (Extra chip, popup-timer row) */
        .tr-full { grid-column: 1 / span 2; }
        /* Compact placeholder shown in the log cell before a timer has any runs */
        .tr-log-empty {
          display: flex; align-items: center; justify-content: center;
          color: #475569; font-size: 0.72rem;
          padding: 0.5rem 0.7rem;
          border: 1px dashed rgba(255,255,255,0.06);
          border-radius: 12px;
          background: rgba(255,255,255,0.01);
          font-style: italic;
          min-width: 0;
        }
        .popup-row { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.2rem; }

        /* Automatic derived timers row — 4 squareish chips under the phase
           timers. Always visible. Running chips use their own phase color
           (yellow / orange / blue / red); idle or empty chips are shadowed. */
        .popup-row-bar {
          grid-column: 1 / span 2;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.5rem;
          margin-top: 0.35rem;
        }
        .popup-chip {
          display: flex; flex-direction: column;
          align-items: flex-start; justify-content: center;
          padding: 0.75rem 0.85rem;
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.012));
          border: 1px solid rgba(255,255,255,0.08);
          gap: 7px;
          min-height: 78px;
          position: relative;
          transition: opacity 0.18s ease, border-color 0.18s ease;
          min-width: 0;
        }
        .popup-chip .pc-label {
          font-size: 0.7rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: #94a3b8;
          display: flex; align-items: center; gap: 6px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 100%;
        }
        .popup-chip .pc-value {
          font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em;
          color: #cbd5e1; font-variant-numeric: tabular-nums; line-height: 1;
        }
        .popup-chip .pc-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--phase);
          flex-shrink: 0;
          animation: pulseDot 1.6s ease-out infinite;
        }
        /* Idle — triggered at least once but not running right now */
        .popup-chip.idle { opacity: 0.55; }
        /* Empty — never triggered this case */
        .popup-chip.empty { opacity: 0.3; }
        .popup-chip.empty .pc-value { color: #475569; }
        /* Running — light up in the timer's phase color */
        .popup-chip.running {
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--phase) 10%, transparent),
            color-mix(in srgb, var(--phase) 3%, transparent));
          border-color: color-mix(in srgb, var(--phase) 55%, transparent);
          animation: popupChipLive 2.4s ease-in-out infinite;
        }
        .popup-chip.running .pc-label { color: var(--phase); }
        .popup-chip.running .pc-value { color: var(--phase); }
        @keyframes popupChipLive {
          0%, 100% { box-shadow: 0 0 0 1px color-mix(in srgb, var(--phase) 30%, transparent); }
          50%      { box-shadow: 0 0 0 2px color-mix(in srgb, var(--phase) 60%, transparent),
                                 0 0 22px color-mix(in srgb, var(--phase) 22%, transparent); }
        }

        @media (max-width: 1100px) {
          .main-grid { grid-template-columns: 1fr; grid-template-rows: auto; }
          .col-main, .patient-bar, .vent-bar, .timer-rows {
            grid-column: 1; grid-row: auto;
          }
          .timer-rows { position: static; }
        }
        @media (max-width: 700px) {
          .patient-bar { grid-template-columns: 1fr 1fr; gap: 0.4rem; }
          .patient-field { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.4rem; }
          .vent-bar { grid-template-columns: 1fr; gap: 0.6rem; }
        }

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
          .vent-bar-row { grid-template-columns: 95px 1fr 60px; gap: 0.6rem; }
        }
      `}</style>

      <div style={{ maxWidth: view === 'live' ? '1600px' : '1200px', margin: '0 auto', padding: '1.5rem 1.5rem 4rem' }}>
        {/* Header */}
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => {
              if (view === 'form' && editingReturnsToLive) {
                setView('live'); setEditing(EMPTY_CASE); setEditingReturnsToLive(false)
              } else if (view === 'live' || view === 'form') {
                setView('list'); setEditing(EMPTY_CASE); setLiveCase(null); setEditingReturnsToLive(false)
              } else {
                window.location.href = '/'
              }
            }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
              ← {view === 'list' ? 'Home' : 'Back'}
            </button>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                <span style={{ color: '#e63946' }}>COR</span> Charting
              </div>
              {user?.name && (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{user.name}</div>
              )}
            </div>
          </div>
          {view === 'list' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={quickStartCase} style={{ background: '#22c55e', border: 'none', color: 'white', padding: '0.6rem 1rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>⚡ Quick Start</button>
              <button onClick={startNew} style={{ background: '#e63946', border: 'none', color: 'white', padding: '0.6rem 1rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>+ New Case</button>
            </div>
          )}
          {view === 'form' && (
            <button onClick={() => {
              if (editingReturnsToLive) { setView('live'); setEditingReturnsToLive(false) }
              else setView('list')
              setEditing(EMPTY_CASE)
            }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.6rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
          )}
          {view === 'live' && (
            <div className="header-clock">
              <div className="hc-value">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
              <div className="hc-date">{new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          )}
        </div>

        {/* PHI disclaimer (hidden during live to save space) */}
        {view !== 'live' && (
          <div style={{ background: 'rgba(230,57,70,0.06)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: '10px', padding: '0.6rem 0.9rem', marginBottom: '1.5rem', fontSize: '0.75rem', color: '#f59e9e' }}>
            ⚠ This app is not yet HIPAA compliant. Avoid storing real patient data until BAAs and compliance safeguards are in place.
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
                {[...cases].sort((a, b) => {
                  const ad = a.case_date || a.created_at || ''
                  const bd = b.case_date || b.created_at || ''
                  return bd.localeCompare(ad)
                }).map(c => {
                  const perfusionist = (c.user_email || user?.email || '').split('@')[0] || user?.name || ''
                  return (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                        {c.case_date && <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>{c.case_date}</div>}
                        {perfusionist && <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{perfusionist}</div>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{c.procedure || 'Untitled procedure'}</span>
                        {c.case_number && <span>MRN {c.case_number}</span>}
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
                  )
                })}
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
                <div><label style={labelStyle}>MRN</label><input style={inputStyle} value={editing.case_number || ''} onChange={e => set('case_number', e.target.value)} /></div>
                <div><label style={labelStyle}>Patient Last Name</label><input style={inputStyle} value={editing.patient_initials || ''} onChange={e => set('patient_initials', e.target.value)} placeholder="e.g. Smith" /></div>
                <div><label style={labelStyle}>Patient First Name</label><input style={inputStyle} value={editing.patient_first_name || ''} onChange={e => set('patient_first_name', e.target.value)} placeholder="e.g. John" /></div>
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
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Case Type</label><input style={inputStyle} value={editing.procedure || ''} onChange={e => set('procedure', e.target.value)} placeholder="e.g. CABG x3, AVR, MVR, Type-A" /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Allergies</label><input style={inputStyle} value={editing.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. None known, PCN, Latex" /></div>
                <div><label style={labelStyle}>Surgeon</label><input style={inputStyle} value={editing.surgeon || ''} onChange={e => set('surgeon', e.target.value)} /></div>
                <div><label style={labelStyle}>Anesthesiologist</label><input style={inputStyle} value={editing.anesthesiologist || ''} onChange={e => set('anesthesiologist', e.target.value)} /></div>
              </div>
            </div>

            <EquipmentSection
              equipment={editing.equipment || {}}
              onChange={(eq) => setEditing(prev => ({ ...prev, equipment: eq }))}
              templates={equipmentTemplates}
              onSaveTemplate={saveEquipmentTemplate}
              onDeleteTemplate={deleteEquipmentTemplate}
              showAlert={showAlert}
              inputStyle={inputStyle}
            />

            <div style={sectionStyle}>
              <div style={sectionTitle}>Heparin / Protamine</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Heparin Total (units)</label><input style={inputStyle} type="number" value={editing.heparin_total_units ?? ''} onChange={e => set('heparin_total_units', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Protamine (mg)</label><input style={inputStyle} type="number" value={editing.protamine_mg ?? ''} onChange={e => set('protamine_mg', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => {
                if (editingReturnsToLive) { setView('live'); setEditingReturnsToLive(false) }
                else setView('list')
                setEditing(EMPTY_CASE)
              }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.7rem 1.25rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
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
            onUpdateEventTime={updateEventTime}
            onDeleteRun={deleteRun}
            onUpdateCase={updateCase}
            onOpenDetails={openLiveCaseDetails}
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
  caseRecord, events, timers, now, activeForm, setActiveForm, onHotkey, onToggleTimer, onAddEvent, onDeleteEvent, onUpdateEventNote, onUpdateEventTime, onDeleteRun, onUpdateCase, onOpenDetails,
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
    rcp: PhaseData | null
    muf: PhaseData | null
  }
  now: number
  activeForm: 'vitals' | 'med' | 'cp' | 'blood' | 'volume' | 'abg' | 'note' | null
  setActiveForm: (f: 'vitals' | 'med' | 'cp' | 'blood' | 'volume' | 'abg' | 'note' | null) => void
  onHotkey: (label: string) => void
  onToggleTimer: (which: TimerKey) => Promise<void>
  onAddEvent: (eventType: string, label: string, details?: Record<string, unknown>) => Promise<void>
  onDeleteEvent: (id: string) => Promise<void>
  onUpdateEventNote: (id: string, note: string) => Promise<void>
  onUpdateEventTime: (id: string, eventTime: string) => Promise<void>
  onDeleteRun: (startId: string, stopId?: string) => Promise<void>
  onUpdateCase: (patches: Partial<CaseRecord>) => Promise<void>
  onOpenDetails: () => void
}) {
  type PrimaryKey = TimerKey

  // Pinned primary timers: chips always render, log only once there are runs.
  const pinnedRows: { key: PrimaryKey; label: string; data: PhaseData | null }[] = [
    { key: 'cpb', label: 'CPB', data: timers.cpb },
    { key: 'xclamp', label: 'X-Clamp', data: timers.xclamp },
  ]

  // Quick-event phase timers (DHCA/SACP/RCP/MUF/Extra): lazy — only appear
  // once they have been triggered. Running ones sort above stopped ones.
  const phaseExtraRows = ([
    { key: 'dhca' as PrimaryKey, label: 'DHCA', data: timers.dhca },
    { key: 'sacp' as PrimaryKey, label: 'SACP', data: timers.sacp },
    { key: 'rcp' as PrimaryKey, label: 'RCP', data: timers.rcp },
    { key: 'muf' as PrimaryKey, label: 'MUF', data: timers.muf },
    { key: 'extra' as PrimaryKey, label: 'Extra', data: timers.extra },
  ])
    .filter((r): r is { key: PrimaryKey; label: string; data: PhaseData } => r.data != null)
    .sort((a, b) => (b.data.running ? 1 : 0) - (a.data.running ? 1 : 0))

  // Automatic derived timers (CP / Reperfusion / Cooling / Rewarming): always
  // render as a 4-column compact bar underneath the phase rows. Non-clickable
  // — they react to other events. Running ones sort to the left.
  const autoTimers = ([
    { key: 'cp', label: 'CP Timer', data: timers.cp },
    { key: 'reperfusion', label: 'Reperfusion', data: timers.reperfusion },
    { key: 'cooling', label: 'Cooling', data: timers.cooling },
    { key: 'rewarming', label: 'Rewarming', data: timers.rewarming },
  ] as const).slice().sort((a, b) => (b.data?.running ? 1 : 0) - (a.data?.running ? 1 : 0))

  const formatT = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  // Map each stop-event id → duration in minutes (paired with its preceding start).
  // Renders inline on the timeline so e.g. "Off Bypass" shows the CPB run length.
  const stopDurations = useMemo(() => {
    const map: Record<string, number> = {}
    const pairs: Array<[string, string]> = [
      ['On Bypass', 'Off Bypass'],
      ['Aortic Clamp On', 'Aortic Clamp Off'],
      ['DHCA Start', 'DHCA Stop'],
      ['SACP Start', 'SACP Stop'],
      ['Extra Start', 'Extra Stop'],
      ['RCP Start', 'RCP Stop'],
      ['MUF Start', 'MUF Stop'],
    ]
    for (const [startLabel, stopLabel] of pairs) {
      let currentStart: number | null = null
      for (const e of events) {
        if (e.label === startLabel) {
          if (currentStart == null) currentStart = new Date(e.event_time).getTime()
        } else if (e.label === stopLabel && currentStart != null) {
          const min = Math.max(0, Math.floor((new Date(e.event_time).getTime() - currentStart) / 60000))
          map[e.id] = min
          currentStart = null
        }
      }
    }
    return map
  }, [events])

  return (
    <>
      {/* Main grid — col 1 spans all rows; patient + vent bars span cols 2-3 */}
      <div className="main-grid">
        {/* Column 1 — Quick Events, Add Entry, Timeline (full height) */}
        <div className="col-main">
          <div className="live-card">
            <div className="live-card-title">Quick Events</div>
            <div className="hotkey-grid">
              {HOTKEYS.map(hk => {
                const running = hk.timerKey ? timers[hk.timerKey]?.running : false
                return (
                  <button
                    key={hk.label}
                    onClick={() => hk.timerKey ? onToggleTimer(hk.timerKey) : onHotkey(hk.label)}
                    className={`hotkey-btn${running ? ' hotkey-active' : ''}`}
                    type="button"
                  >
                    {running && <span className="pulse-dot" style={{ marginRight: '2px' }} />}
                    {hk.icon && <span className="hotkey-icon" style={{ color: hk.color }} aria-hidden>{hk.icon}</span>}
                    <span>{hk.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="live-card">
            <div className="live-card-title">Add Entry</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: activeForm ? '1rem' : 0 }}>
              {(['vitals', 'med', 'cp', 'blood', 'volume', 'abg', 'note'] as const).map(k => {
                const iconMap: Record<string, string> = { vitals: '📊', med: '💊', cp: '❤️', blood: '🩸', volume: '💧', abg: '🧪', note: '📝' }
                const labelMap: Record<string, string> = { vitals: 'Vitals', med: 'Medication', cp: 'CP Dose', blood: 'Blood Product', volume: 'Volume', abg: 'ABG', note: 'Note' }
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
            {activeForm === 'med' && <MedForm onSubmit={(d) => { onAddEvent('med', `${d.name}- ${d.dose}${d.unit}`, d); setActiveForm(null) }} />}
            {activeForm === 'cp' && <CpForm onSubmit={(d) => { onAddEvent('cp', `CP: ${d.type} ${d.volume}ml`, d); setActiveForm(null) }} />}
            {activeForm === 'blood' && <BloodForm onSubmit={(d) => { onAddEvent('blood', `${d.product} ${d.amount}${d.product === 'Cell Saver' ? 'mL' : 'u'}`, d); setActiveForm(null) }} />}
            {activeForm === 'volume' && <VolumeForm onSubmit={(d) => { onAddEvent('volume', `${d.fluid}- ${d.amount}mL`, d); setActiveForm(null) }} />}
            {activeForm === 'abg' && <AbgForm onSubmit={(d) => { onAddEvent('abg', 'ABG', d); setActiveForm(null) }} />}
            {activeForm === 'note' && <NoteForm onSubmit={(d) => { onAddEvent('note', 'Note', d); setActiveForm(null) }} />}
          </div>

          <div className="live-card">
            <div className="live-card-title">Timeline <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.85rem', marginLeft: '8px' }}>· {events.length} {events.length === 1 ? 'event' : 'events'}</span></div>
            {events.length === 0 ? (
              <div style={{ color: '#475569', fontSize: '0.88rem', padding: '2rem 0', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>⏱️</div>
                No events yet. Tap a timer or a Quick Event to start logging.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[...events].reverse().map(e => {
                  const typeStyle = EVENT_TYPE_STYLES[e.event_type] || EVENT_TYPE_STYLES.hotkey
                  const labelIcon = e.event_type === 'hotkey' && e.label ? HOTKEY_LABEL_ICONS[e.label] : undefined
                  const displayIcon = labelIcon || typeStyle.icon
                  const currentNote = (e.details && typeof e.details === 'object' && typeof (e.details as Record<string, unknown>).note === 'string')
                    ? ((e.details as Record<string, unknown>).note as string)
                    : ''
                  return (
                    <div key={e.id} className="tl-entry">
                      <div className="tl-time">
                        <EditableRunTime value={e.event_time} onCommit={(iso) => onUpdateEventTime(e.id, iso)} />
                      </div>
                      <div className="tl-icon" style={{ ['--tl-color' as never]: typeStyle.color }} aria-hidden>{displayIcon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tl-title-row">
                          <span className="tl-label">{displayEventLabel(e)}</span>
                          <span className="tl-sep">:</span>
                          {stopDurations[e.id] != null && (
                            <span className="tl-duration">{stopDurations[e.id]}min</span>
                          )}
                          <EventNote eventId={e.id} initial={currentNote} onSave={onUpdateEventNote} />
                        </div>
                        {e.details && <EventDetails details={e.details} eventType={e.event_type} />}
                      </div>
                      <button onClick={() => onDeleteEvent(e.id)} className="tl-delete" title="Delete event" aria-label="Delete event">×</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right side — Row 1: Patient info stack (no box) */}
        <div className="patient-bar">
          {/* MRN */}
          <div className="pb-row">
            <span className="pb-label">MRN:</span>
            <InlineEdit
              value={caseRecord.case_number || ''}
              placeholder="—"
              onCommit={(v) => onUpdateCase({ case_number: v || null })}
            />
          </div>
          {/* Last, First */}
          <div className="pb-row">
            <InlineEdit
              className="name"
              value={caseRecord.patient_initials || ''}
              placeholder="Last"
              onCommit={(v) => onUpdateCase({ patient_initials: v || null })}
            />
            <span className="pb-comma">,</span>
            <InlineEdit
              className="name"
              value={caseRecord.patient_first_name || ''}
              placeholder="First"
              onCommit={(v) => onUpdateCase({ patient_first_name: v || null })}
            />
          </div>
          {/* Ht · Wt · BSA */}
          <div className="pb-row">
            <span className="pb-label">Ht:</span>
            <InlineEdit
              value={caseRecord.height_cm != null ? String(caseRecord.height_cm) : ''}
              placeholder="—"
              numeric
              onCommit={(v) => onUpdateCase({ height_cm: v === '' ? null : Number(v) })}
            />
            <span className="pb-unit">cm</span>
            <span className="pb-sep">·</span>
            <span className="pb-label">Wt:</span>
            <InlineEdit
              value={caseRecord.weight_kg != null ? String(caseRecord.weight_kg) : ''}
              placeholder="—"
              numeric
              onCommit={(v) => onUpdateCase({ weight_kg: v === '' ? null : Number(v) })}
            />
            <span className="pb-unit">kg</span>
            <span className="pb-sep">·</span>
            <span className="pb-label">BSA:</span>
            <InlineEdit
              value={caseRecord.bsa != null ? String(caseRecord.bsa) : ''}
              placeholder="—"
              numeric
              onCommit={(v) => onUpdateCase({ bsa: v === '' ? null : Number(v) })}
            />
            <span className="pb-unit">m²</span>
          </div>
          {/* Case Type */}
          <div className="pb-row">
            <span className="pb-label">Case Type:</span>
            <InlineEdit
              className="flex"
              value={caseRecord.procedure || ''}
              placeholder="—"
              onCommit={(v) => onUpdateCase({ procedure: v || null })}
            />
          </div>
          {/* Allergies */}
          <div className="pb-row">
            <span className="pb-label">Allergies:</span>
            <InlineEdit
              className="flex"
              value={caseRecord.allergies || ''}
              placeholder="None known"
              onCommit={(v) => onUpdateCase({ allergies: v || null })}
            />
          </div>
          {/* Open full case details (opens the New Case form pre-filled) */}
          <div className="pb-row" style={{ marginTop: '0.2rem' }}>
            <button type="button" className="pb-open-details" onClick={onOpenDetails}>
              Open full case details →
            </button>
          </div>
        </div>

        {/* Right side — Row 2: Ventilation bar spans cols 2-3 */}
        <VentBar events={events} onLog={onAddEvent} />

        {/* Right side — Row 3: chip + log pairs (each chip next to its own log).
            Pinned timers always render. Everything else lazy-renders once it
            has data, with running timers floating above stopped ones. Popup
            timers (CP / Reperfusion / Cooling / Rewarming) are derived and
            have no editable log, so they render as a single chip spanning
            both columns. */}
        <div className="timer-rows">
          {/* Automatic derived timers pinned at the top. 4 compact chips in
              their own row bar; always visible. Running ones flow left,
              stopped/untriggered shadow out on the right. Not clickable. */}
          <div className="popup-row-bar">
            {autoTimers.map(t => {
              const running = t.data?.running ?? false
              const hasData = t.data != null
              const min = t.data?.min ?? 0
              return (
                <div
                  key={t.key}
                  className={`popup-chip${running ? ' running' : hasData ? ' idle' : ' empty'}`}
                  style={{ ['--phase' as never]: PHASE_COLORS[t.key] }}
                  aria-label={`${t.label} timer`}
                >
                  <div className="pc-label">
                    {running && <span className="pc-dot" />}
                    {t.label}
                  </div>
                  <div className="pc-value">{hasData ? `${min} min` : '—'}</div>
                </div>
              )
            })}
          </div>

          {pinnedRows.map(t => {
            const running = t.data?.running ?? false
            const started = t.data != null
            const value = t.data?.totalMin != null ? `${t.data.totalMin} min` : 'Tap to start'
            const phase = PHASE_COLORS[t.key]
            const hasRuns = (t.data?.runs.length ?? 0) > 0
            return (
              <Fragment key={t.key}>
                <button
                  onClick={() => onToggleTimer(t.key)}
                  className={`timer-chip-btn${running ? ' active' : ''}${started && !running ? ' stopped' : ''}`}
                  type="button"
                  style={{ ['--phase' as never]: phase }}
                >
                  <span className="tc-label">
                    {running && <span className="pulse-dot" />}
                    {t.label}
                  </span>
                  <span className={t.data != null ? 'tc-value' : 'tc-value-placeholder'}>{value}</span>
                </button>
                {hasRuns ? (
                  <PhaseLogCard
                    label={t.label}
                    phase={phase}
                    data={t.data!}
                    onUpdateEventTime={onUpdateEventTime}
                    onDeleteRun={onDeleteRun}
                    formatT={formatT}
                  />
                ) : (
                  <div className="tr-log-empty">No runs yet</div>
                )}
              </Fragment>
            )
          })}

          {phaseExtraRows.map(t => {
            const running = t.data.running
            const value = `${t.data.totalMin} min`
            const hasRuns = t.data.runs.length > 0
            const phase = PHASE_COLORS[t.key]
            return (
              <Fragment key={t.key}>
                <button
                  onClick={() => onToggleTimer(t.key)}
                  className={`timer-chip-btn${running ? ' active' : ''}${!running ? ' stopped' : ''}`}
                  type="button"
                  style={{ ['--phase' as never]: phase }}
                >
                  <span className="tc-label">
                    {running && <span className="pulse-dot" />}
                    {t.label}
                  </span>
                  <span className="tc-value">{value}</span>
                </button>
                {hasRuns ? (
                  <PhaseLogCard
                    label={t.label}
                    phase={phase}
                    data={t.data}
                    onUpdateEventTime={onUpdateEventTime}
                    onDeleteRun={onDeleteRun}
                    formatT={formatT}
                  />
                ) : (
                  <div className="tr-log-empty">No runs yet</div>
                )}
              </Fragment>
            )
          })}

        </div>
      </div>
    </>
  )
}

function EventDetails({ details, eventType }: { details: Record<string, unknown>; eventType?: string }) {
  // Skip the "note" key — it renders via EventNote inline with the title.
  // Also skip keys that are already represented in the event title
  // (e.g. `name` on a med, `product`/`amount` on a blood event) so the
  // second line is not redundant. Sort by DETAIL_KEY_ORDER so meds read
  // Dose → Unit (jsonb returns keys alphabetically).
  const redundant = eventType ? (REDUNDANT_DETAIL_KEYS[eventType] || []) : []
  const pairs = Object.entries(details).filter(([k, v]) =>
    k !== 'note' && !redundant.includes(k) && v !== null && v !== undefined && v !== ''
  )
  pairs.sort(([a], [b]) => {
    const ai = DETAIL_KEY_ORDER.indexOf(a)
    const bi = DETAIL_KEY_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  if (pairs.length === 0) return null
  return (
    <div className="tl-details">
      {pairs.map(([k, v]) => {
        const display = k === 'temp' ? `${String(v)}C` : String(v)
        return (
          <span key={k}>
            <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</span> {display}
          </span>
        )
      })}
    </div>
  )
}

function VentBar({
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
    <div className="vent-bar">
      <div className="vent-bar-row">
        <div className="vent-bar-lbl">
          <span className="vb-name">Sweep</span>
          <span className="vb-cur">{sweep.toFixed(1)}<span className="vb-unit">LPM</span></span>
        </div>
        <input
          type="range"
          min={0} max={11} step={0.1}
          value={sweep}
          onChange={e => setSweep(Number(e.target.value))}
          onMouseUp={e => commitSweep(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => commitSweep(Number((e.target as HTMLInputElement).value))}
          className="vent-range"
          style={{ ['--pct' as never]: `${sweepPct}%` }}
        />
        <input
          type="number"
          min={0} max={11} step={0.1}
          value={sweep}
          onChange={e => setSweep(e.target.value === '' ? 0 : Number(e.target.value))}
          onBlur={e => commitSweep(Number(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="vent-num"
        />
      </div>
      <div className="vent-bar-row">
        <div className="vent-bar-lbl">
          <span className="vb-name">FiO₂</span>
          <span className="vb-cur">{fio2}<span className="vb-unit">%</span></span>
        </div>
        <input
          type="range"
          min={21} max={100} step={1}
          value={fio2}
          onChange={e => setFio2(Number(e.target.value))}
          onMouseUp={e => commitFio2(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => commitFio2(Number((e.target as HTMLInputElement).value))}
          className="vent-range"
          style={{ ['--pct' as never]: `${fio2Pct}%` }}
        />
        <input
          type="number"
          min={21} max={100} step={1}
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

function PhaseLogCard({
  label, phase, data, onUpdateEventTime, onDeleteRun, formatT,
}: {
  label: string
  phase: string
  data: PhaseData
  onUpdateEventTime: (id: string, iso: string) => Promise<void>
  onDeleteRun: (startId: string, stopId?: string) => Promise<void>
  formatT: (iso?: string) => string
}) {
  return (
    <div className="run-table-card" style={{ ['--phase' as never]: phase }}>
      <div className="rt-title">
        <span className="rt-title-dot" />
        {label}
      </div>
      <table className="rt-table">
        <thead>
          <tr>
            <th>Start</th>
            <th>Stop</th>
            <th>Duration</th>
            <th className="rt-actions-col" aria-label="Delete" />
          </tr>
        </thead>
        <tbody>
          {data.runs.map((r, i) => (
            <tr key={r.startId || i}>
              <td>
                <EditableRunTime value={r.start} onCommit={(iso) => onUpdateEventTime(r.startId, iso)} />
              </td>
              <td>
                {r.stop && r.stopId ? (
                  <EditableRunTime value={r.stop} onCommit={(iso) => onUpdateEventTime(r.stopId!, iso)} />
                ) : (
                  <span style={{ color: '#475569' }}>—</span>
                )}
              </td>
              <td>{r.min}m{!r.stop && <span className="rt-active">●</span>}</td>
              <td className="rt-actions-col">
                <button
                  className="rt-row-delete"
                  onClick={() => onDeleteRun(r.startId, r.stopId)}
                  title="Delete this run"
                  aria-label="Delete run"
                  type="button"
                >×</button>
              </td>
            </tr>
          ))}
          <tr className="rt-total">
            <td colSpan={2}>Total</td>
            <td colSpan={2}>{data.totalMin}m</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// formatT is used by both PhaseLogCard (via prop) and inline renderers.

function EditableRunTime({ value, onCommit }: { value: string; onCommit: (iso: string) => void }) {
  const [editing, setEditing] = useState(false)
  const orig = useMemo(() => new Date(value), [value])
  const displayTime = orig.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const hhmm = `${String(orig.getHours()).padStart(2, '0')}:${String(orig.getMinutes()).padStart(2, '0')}`

  if (!editing) {
    return (
      <button type="button" className="rt-time-btn" onClick={() => setEditing(true)} title="Click to edit">
        {displayTime}
      </button>
    )
  }
  return (
    <input
      type="time"
      defaultValue={hhmm}
      autoFocus
      className="rt-time-input"
      onBlur={(e) => {
        setEditing(false)
        const newHhmm = e.target.value
        if (!newHhmm || newHhmm === hhmm) return
        const [h, m] = newHhmm.split(':').map(Number)
        if (isNaN(h) || isNaN(m)) return
        const next = new Date(orig)
        next.setHours(h, m)
        onCommit(next.toISOString())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setEditing(false) }
      }}
    />
  )
}

function InlineEdit({
  value, placeholder, numeric, className, onCommit,
}: {
  value: string
  placeholder?: string
  numeric?: boolean
  className?: string
  onCommit: (v: string) => void
}) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <input
      className={`pb-input${className ? ` ${className}` : ''}`}
      type={numeric ? 'number' : 'text'}
      inputMode={numeric ? 'decimal' : 'text'}
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
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

function VolumeForm({ onSubmit }: { onSubmit: (d: { fluid: string; amount: string }) => void }) {
  const [fluid, setFluid] = useState(VOLUME_FLUIDS[0])
  const [amount, setAmount] = useState('')
  const submit = () => {
    if (!amount) return
    onSubmit({ fluid, amount })
    setAmount('')
  }
  return (
    <>
      <div style={formStyle}>
        <div>
          <label style={lblStyle}>Fluid</label>
          <select style={inpStyle} value={fluid} onChange={e => setFluid(e.target.value)}>
            {VOLUME_FLUIDS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div><label style={lblStyle}>Amount (mL)</label><input style={inpStyle} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}><button onClick={submit} style={submitStyle}>Log Volume</button></div>
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

function EquipmentSection({
  equipment, onChange, templates, onSaveTemplate, onDeleteTemplate, showAlert, inputStyle,
}: {
  equipment: Record<string, { name: string; number: string }>
  onChange: (eq: Record<string, { name: string; number: string }>) => void
  templates: EquipmentTemplate[]
  onSaveTemplate: (name: string, eq: Record<string, { name: string; number: string }>) => Promise<void>
  onDeleteTemplate: (id: string) => Promise<void>
  showAlert: (msg: string, title?: string) => Promise<void>
  inputStyle: React.CSSProperties
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftNumber, setDraftNumber] = useState('')
  const [savingTpl, setSavingTpl] = useState(false)
  const [tplName, setTplName] = useState('')
  const [showTplMenu, setShowTplMenu] = useState(false)

  const openEdit = (key: string) => {
    const current = equipment[key]
    setDraftName(current?.name || '')
    setDraftNumber(current?.number || '')
    setEditingKey(key)
  }
  const cancelEdit = () => {
    setEditingKey(null)
    setDraftName('')
    setDraftNumber('')
  }
  const commitEdit = () => {
    if (!editingKey) return
    if (!draftName.trim() && !draftNumber.trim()) { cancelEdit(); return }
    onChange({ ...equipment, [editingKey]: { name: draftName.trim(), number: draftNumber.trim() } })
    cancelEdit()
  }
  const clearSlot = (key: string) => {
    const next = { ...equipment }
    delete next[key]
    onChange(next)
  }

  const commitSaveTemplate = async () => {
    const trimmed = tplName.trim()
    if (!trimmed) return
    if (Object.keys(equipment).length === 0) {
      await showAlert('Add at least one piece of equipment before saving as a template.', 'Empty template')
      return
    }
    await onSaveTemplate(trimmed, equipment)
    setSavingTpl(false)
    setTplName('')
  }

  const applyTemplate = (tpl: EquipmentTemplate) => {
    onChange({ ...tpl.equipment })
    setShowTplMenu(false)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e63946', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Equipment</div>
        <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
          <button type="button" onClick={() => { setSavingTpl(s => !s); setShowTplMenu(false) }}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.35rem 0.7rem', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}>
            Save Template
          </button>
          <button type="button" onClick={() => { setShowTplMenu(m => !m); setSavingTpl(false) }}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.35rem 0.7rem', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}>
            Load Template ▾
          </button>
          {showTplMenu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.35rem', minWidth: '220px', zIndex: 50, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              {templates.length === 0 ? (
                <div style={{ padding: '0.6rem 0.8rem', color: '#64748b', fontSize: '0.78rem' }}>No saved templates yet.</div>
              ) : templates.map(tpl => (
                <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem' }}>
                  <button type="button" onClick={() => applyTemplate(tpl)}
                    style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: '#e2e8f0', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>
                    {tpl.name}
                  </button>
                  <button type="button" onClick={() => onDeleteTemplate(tpl.id)} title="Delete template"
                    style={{ background: 'transparent', border: '1px solid rgba(230,57,70,0.3)', color: '#e63946', padding: '0.2rem 0.55rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {savingTpl && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
          <input autoFocus style={{ ...inputStyle, flex: 1 }} placeholder="Template name (e.g. Standard Adult Pack)"
            value={tplName} onChange={e => setTplName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSaveTemplate(); if (e.key === 'Escape') { setSavingTpl(false); setTplName('') } }} />
          <button type="button" onClick={commitSaveTemplate}
            style={{ background: '#e63946', border: 'none', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
          <button type="button" onClick={() => { setSavingTpl(false); setTplName('') }}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.55rem 1rem', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {EQUIPMENT_SLOTS.map(slot => {
          const val = equipment[slot.key]
          const isEditing = editingKey === slot.key
          return (
            <div key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.25rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ minWidth: '180px', fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 500 }}>{slot.label}</div>
              {isEditing ? (
                <div style={{ display: 'flex', gap: '0.5rem', flex: 1, alignItems: 'center' }}>
                  <input autoFocus style={{ ...inputStyle, flex: 2 }} placeholder="Name" value={draftName} onChange={e => setDraftName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }} />
                  <input style={{ ...inputStyle, flex: 1 }} placeholder="Number" value={draftNumber} onChange={e => setDraftNumber(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }} />
                  <button type="button" onClick={commitEdit}
                    style={{ background: '#22c55e', border: 'none', color: 'white', padding: '0.45rem 0.8rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button type="button" onClick={cancelEdit}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : val ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                  <button type="button" onClick={() => openEdit(slot.key)}
                    style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: '0.85rem', cursor: 'pointer', padding: '0.25rem 0' }}>
                    <span style={{ fontWeight: 600 }}>{val.name || '(no name)'}</span>
                    {val.number && <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}>#{val.number}</span>}
                  </button>
                  <button type="button" onClick={() => clearSlot(slot.key)} title="Clear"
                    style={{ background: 'transparent', border: '1px solid rgba(230,57,70,0.25)', color: '#e63946', padding: '0.25rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>×</button>
                </div>
              ) : (
                <button type="button" onClick={() => openEdit(slot.key)}
                  style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', padding: '0.35rem 0.8rem', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
                  + Add
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
