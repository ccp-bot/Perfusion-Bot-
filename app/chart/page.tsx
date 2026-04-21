'use client'

import { useState, useEffect } from 'react'
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

export default function ChartPage() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Partial<CaseRecord>>(EMPTY_CASE)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

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

  async function loadCases() {
    if (!user) return
    setLoading(true)
    const res = await fetch(`/api/cases?userId=${user.id}`)
    const data = await res.json()
    setCases(data.cases || [])
    setLoading(false)
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

    // Strip empty strings to null to avoid type errors in numeric cols
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

  function set<K extends keyof CaseRecord>(key: K, value: CaseRecord[K]) {
    setEditing(prev => ({ ...prev, [key]: value }))
  }

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
        @media (max-width: 768px) {
          .chart-header { flex-direction: column !important; align-items: flex-start !important; gap: 0.75rem !important; }
          .chart-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1.5rem 4rem' }}>
        {/* Header */}
        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => window.location.href = '/'} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>← Home</button>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                <span style={{ color: '#e63946' }}>COR</span> Charting
              </div>
              <div style={{ fontSize: '0.75rem', color: '#4a5568' }}>Case log — private to you</div>
            </div>
          </div>
          {view === 'list' ? (
            <button onClick={startNew} style={{ background: '#e63946', border: 'none', color: 'white', padding: '0.6rem 1rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>+ New Case</button>
          ) : (
            <button onClick={() => { setView('list'); setEditing(EMPTY_CASE) }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.6rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
          )}
        </div>

        {/* PHI disclaimer */}
        <div style={{ background: 'rgba(230,57,70,0.06)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: '10px', padding: '0.6rem 0.9rem', marginBottom: '1.5rem', fontSize: '0.75rem', color: '#f59e9e' }}>
          ⚠ Do not enter patient names, MRN, or date of birth. Use case # or initials only until HIPAA compliance is in place.
        </div>

        {view === 'list' && (
          <>
            {loading ? (
              <div style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>Loading cases...</div>
            ) : cases.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#4a5568' }}>
                <div style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#94a3b8' }}>No cases yet</div>
                <div style={{ fontSize: '0.85rem' }}>Click "+ New Case" to start charting.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {cases.map(c => (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
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
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => startEdit(c)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem' }}>Edit</button>
                      <button onClick={() => deleteCase(c.id)} style={{ background: 'transparent', border: '1px solid rgba(230,57,70,0.3)', color: '#e63946', padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'form' && (
          <>
            {/* Case info */}
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

            {/* Times */}
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
                Totals calculated automatically on save: CPB = {minsBetween(editing.cpb_start, editing.cpb_end) ?? '—'} min · X-Clamp = {minsBetween(editing.xclamp_start, editing.xclamp_end) ?? '—'} min
              </div>
            </div>

            {/* Circuit */}
            <div style={sectionStyle}>
              <div style={sectionTitle}>Circuit</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Oxygenator</label><input style={inputStyle} value={editing.oxygenator || ''} onChange={e => set('oxygenator', e.target.value)} /></div>
                <div><label style={labelStyle}>Arterial Cannula</label><input style={inputStyle} value={editing.arterial_cannula || ''} onChange={e => set('arterial_cannula', e.target.value)} /></div>
                <div><label style={labelStyle}>Venous Cannula</label><input style={inputStyle} value={editing.venous_cannula || ''} onChange={e => set('venous_cannula', e.target.value)} /></div>
                <div><label style={labelStyle}>Prime Volume (mL)</label><input style={inputStyle} type="number" value={editing.prime_volume_ml ?? ''} onChange={e => set('prime_volume_ml', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Prime Composition</label><input style={inputStyle} value={editing.prime_composition || ''} onChange={e => set('prime_composition', e.target.value)} placeholder="e.g. Plasmalyte 1500mL + Heparin 5000u + Mannitol 25g" /></div>
              </div>
            </div>

            {/* Cardioplegia */}
            <div style={sectionStyle}>
              <div style={sectionTitle}>Cardioplegia</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Type</label><input style={inputStyle} value={editing.cardioplegia_type || ''} onChange={e => set('cardioplegia_type', e.target.value)} placeholder="Del Nido, Buckberg, Custodiol" /></div>
                <div><label style={labelStyle}>Total Volume (mL)</label><input style={inputStyle} type="number" value={editing.cardioplegia_volume_ml ?? ''} onChange={e => set('cardioplegia_volume_ml', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
            </div>

            {/* Labs */}
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

            {/* Meds */}
            <div style={sectionStyle}>
              <div style={sectionTitle}>Heparin / Protamine</div>
              <div className="chart-grid">
                <div><label style={labelStyle}>Heparin Total (units)</label><input style={inputStyle} type="number" value={editing.heparin_total_units ?? ''} onChange={e => set('heparin_total_units', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label style={labelStyle}>Protamine (mg)</label><input style={inputStyle} type="number" value={editing.protamine_mg ?? ''} onChange={e => set('protamine_mg', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
            </div>

            {/* Blood products */}
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

            {/* Notes */}
            <div style={sectionStyle}>
              <div style={sectionTitle}>Notes</div>
              <label style={labelStyle}>Case notes</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }} value={editing.notes || ''} onChange={e => set('notes', e.target.value)} />
              <div style={{ marginTop: '0.75rem' }}>
                <label style={labelStyle}>Complications / Events</label>
                <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} value={editing.complications || ''} onChange={e => set('complications', e.target.value)} />
              </div>
            </div>

            {/* Save */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => { setView('list'); setEditing(EMPTY_CASE) }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '0.7rem 1.25rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
              <button onClick={saveCase} disabled={saving} style={{ background: saving ? '#2d3748' : '#e63946', border: 'none', color: 'white', padding: '0.7rem 1.5rem', borderRadius: '10px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                {saving ? 'Saving...' : editing.id ? 'Update Case' : 'Save Case'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
