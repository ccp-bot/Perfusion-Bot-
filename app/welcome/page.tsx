'use client'

import { useState } from 'react'

// Set this to your real App Store link once the iOS app is live. Empty = the iOS button
// simply scrolls to the contact form ("request access") instead of linking to a dead page.
const APP_STORE_URL = ''

const FEATURES = [
  { icon: '\u{1FA7A}', title: 'Built for perfusion', body: 'Deep expertise across CPB, ECMO, cardioplegia, anticoagulation, blood-gas management, DHCA, pediatrics, and mechanical support — not a generic chatbot.' },
  { icon: '\u{1F4DA}', title: 'Answers from your protocols', body: 'Upload your own protocols, policies, and checklists. COR answers from your documents and cites them by name — auditable, not a black box.' },
  { icon: '\u{1F4D3}', title: 'A logbook that logs itself', body: 'Just say "I have a case." COR builds the entry through chat, lets you review it, and saves it — ready for ABCP export.' },
  { icon: '\u{1F9E0}', title: 'It learns your institution', body: 'Teach it once — "Dr. Smith switched to a 24 Fr cannula" — and it remembers, capturing your team’s know-how instead of losing it.' },
  { icon: '\u{1F512}', title: 'Private by design', body: 'Each hospital’s protocols stay isolated and are never shared with another institution. Built with patient privacy in mind.' },
  { icon: '\u{1F465}', title: 'Aligns your whole team', body: 'A shared institutional brain with owner / admin / perfusionist roles — standardize practice and onboard new perfusionists fast.' },
]

export default function Welcome() {
  const [form, setForm] = useState({ name: '', email: '', org: '', message: '' })
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setSending(true)
    try {
      const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (res.ok && data.success) setDone(true)
      else setErr(data.error || 'Something went wrong. Please try again.')
    } catch { setErr('Network error — please try again.') }
    setSending(false)
  }

  const scrollToContact = () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="cor-lp">
      <style>{`
        .cor-lp{--bg:#080b12;--panel:#0d1117;--line:rgba(255,255,255,.08);--ink:#e9eef6;--soft:#9aa7b9;--faint:#5c6879;--accent:#e63946;
          background:var(--bg);color:var(--ink);min-height:100vh;
          font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;}
        .cor-lp *{box-sizing:border-box}
        .lp-wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem}
        .lp-nav{display:flex;align-items:center;justify-content:space-between;padding:1rem 0}
        .lp-brand{display:flex;align-items:center;gap:.55rem}
        .lp-brand img{width:38px;height:38px;object-fit:contain}
        .lp-brand b{font-size:1.05rem;letter-spacing:.04em}
        .lp-signin{color:var(--soft);text-decoration:none;font-size:.85rem;border:1px solid var(--line);border-radius:9px;padding:.45rem .85rem}
        .lp-signin:hover{color:var(--ink);border-color:rgba(255,255,255,.2)}
        .lp-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:2rem;align-items:center;padding:2.5rem 0 2rem}
        .lp-eyebrow{color:var(--accent);font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-bottom:1rem}
        .lp-hero h1{font-size:clamp(2.1rem,5vw,3.3rem);line-height:1.05;letter-spacing:-.025em;font-weight:800;margin:0 0 1rem;text-wrap:balance}
        .lp-hero h1 .r{color:var(--accent)}
        .lp-hero p{font-size:1.08rem;color:var(--soft);max-width:34em;margin:0 0 1.6rem}
        .lp-cta{display:flex;gap:.7rem;flex-wrap:wrap}
        .btn{border:none;border-radius:12px;padding:.8rem 1.3rem;font-size:.9rem;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:.5rem}
        .btn-primary{background:var(--accent);color:#fff}
        .btn-primary:hover{background:#c9202e}
        .btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
        .btn-ghost:hover{border-color:rgba(255,255,255,.25)}
        .lp-hero-art{display:flex;justify-content:center}
        .lp-hero-art img{width:100%;max-width:360px;object-fit:contain;filter:drop-shadow(0 20px 50px rgba(0,0,0,.6))}
        .lp-strip{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:.9rem 0;color:var(--faint);font-size:.8rem;letter-spacing:.02em;text-align:center}
        .lp-strip b{color:var(--soft);font-weight:600}
        .lp-section{padding:3rem 0}
        .lp-section h2{font-size:clamp(1.5rem,3.5vw,2rem);letter-spacing:-.02em;margin:0 0 .5rem;text-wrap:balance}
        .lp-section .sub{color:var(--soft);margin:0 0 2rem;max-width:40em}
        .lp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}
        .lp-card{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:1.25rem}
        .lp-card .ic{font-size:1.5rem;margin-bottom:.6rem}
        .lp-card h3{margin:0 0 .35rem;font-size:1.05rem}
        .lp-card p{margin:0;color:var(--soft);font-size:.9rem}
        .lp-vs{background:linear-gradient(135deg,rgba(230,57,70,.08),transparent 60%),var(--panel);border:1px solid var(--line);border-radius:18px;padding:2rem}
        .lp-vs ul{list-style:none;margin:1rem 0 0;padding:0;display:grid;gap:.7rem}
        .lp-vs li{display:flex;gap:.7rem;color:var(--soft);font-size:.95rem}
        .lp-vs li b{color:var(--ink)}
        .lp-vs .ck{color:var(--accent);font-weight:800}
        .lp-contact{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:2rem;max-width:560px;margin:0 auto}
        .lp-contact h2{margin-top:0}
        .lp-field{width:100%;padding:.75rem .9rem;border-radius:11px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--ink);font-size:.92rem;font-family:inherit;outline:none;margin-bottom:.65rem}
        .lp-field:focus{border-color:rgba(230,57,70,.5)}
        textarea.lp-field{resize:vertical;min-height:96px}
        .lp-note{color:var(--faint);font-size:.75rem;margin-top:.4rem}
        .lp-err{color:#fca5a5;font-size:.82rem;margin-bottom:.5rem}
        .lp-done{text-align:center;padding:1.5rem 0}
        .lp-done .big{font-size:2.2rem}
        .lp-foot{border-top:1px solid var(--line);padding:1.5rem 0 2.5rem;color:var(--faint);font-size:.78rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem}
        .lp-foot a{color:var(--soft);text-decoration:none}
        .lp-disc{color:var(--faint);font-size:.72rem;max-width:60em;margin:1.5rem auto 0;text-align:center;line-height:1.6}
        @media (max-width:760px){.lp-hero{grid-template-columns:1fr;text-align:center}.lp-hero p{margin-left:auto;margin-right:auto}.lp-cta{justify-content:center}.lp-hero-art{order:-1}}
      `}</style>

      <div className="lp-wrap">
        <nav className="lp-nav">
          <div className="lp-brand"><img src="/RotatingHeart.gif" alt="COR" /><b>COR</b></div>
          <a className="lp-signin" href="/">Sign in</a>
        </nav>

        <header className="lp-hero">
          <div>
            <div className="lp-eyebrow">Cardiovascular Perfusion AI</div>
            <h1>The AI built for <span className="r">perfusionists</span>.</h1>
            <p>Ask anything from CPB to ECMO and get answers grounded in real sources — including your own hospital&rsquo;s protocols. COR even logs your cases through chat and exports them for ABCP. Like a senior perfusionist and your entire protocol binder, in your pocket.</p>
            <div className="lp-cta">
              <button className="btn btn-primary" onClick={scrollToContact}>Request access</button>
              {APP_STORE_URL
                ? <a className="btn btn-ghost" href={APP_STORE_URL} target="_blank" rel="noreferrer">&#63743; Download on iOS</a>
                : <button className="btn btn-ghost" onClick={scrollToContact}>&#63743; Get the iOS app</button>}
            </div>
          </div>
          <div className="lp-hero-art"><img src="/CORx3Dance.gif" alt="COR robots" /></div>
        </header>
      </div>

      <div className="lp-strip"><b>CPB</b> &middot; <b>ECMO</b> &middot; <b>Cardioplegia</b> &middot; <b>Anticoagulation</b> &middot; <b>Pediatrics</b> &middot; <b>Mechanical support</b></div>

      <div className="lp-wrap">
        <section className="lp-section">
          <h2>Everything a perfusionist needs, in one place</h2>
          <p className="sub">COR combines deep perfusion expertise with your institution&rsquo;s own knowledge — and the day-to-day tools around it.</p>
          <div className="lp-grid">
            {FEATURES.map(f => (
              <div className="lp-card" key={f.title}>
                <div className="ic">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="lp-vs">
            <h2 style={{ margin: 0 }}>Why COR beats &ldquo;just using ChatGPT&rdquo;</h2>
            <ul>
              <li><span className="ck">&#10003;</span><span><b>Specialized, not general</b> — perfusion-first, not a jack-of-all-trades.</span></li>
              <li><span className="ck">&#10003;</span><span><b>Grounded in your protocols</b>, with citations — not made-up answers.</span></li>
              <li><span className="ck">&#10003;</span><span><b>Private per institution</b> — your knowledge stays yours.</span></li>
              <li><span className="ck">&#10003;</span><span><b>Purpose-built tools</b> — logbook, ABCP export, equipment, scheduling.</span></li>
            </ul>
          </div>
        </section>

        <section className="lp-section" id="contact">
          <div className="lp-contact">
            {done ? (
              <div className="lp-done">
                <div className="big">&#127881;</div>
                <h2>Thanks — we&rsquo;ll be in touch.</h2>
                <p style={{ color: 'var(--soft)' }}>Your message reached the COR team. We&rsquo;ll reach out to <b style={{ color: 'var(--ink)' }}>{form.email}</b> shortly.</p>
              </div>
            ) : (
              <>
                <h2>Get COR for you or your team</h2>
                <p className="sub" style={{ marginBottom: '1.2rem' }}>Tell us a bit about you and we&rsquo;ll set you up — individual perfusionist or whole department.</p>
                {err && <div className="lp-err">{err}</div>}
                <form onSubmit={submit}>
                  <input className="lp-field" placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  <input className="lp-field" type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                  <input className="lp-field" placeholder="Hospital / organization (optional)" value={form.org} onChange={e => setForm({ ...form, org: e.target.value })} />
                  <textarea className="lp-field" placeholder="Anything you&rsquo;d like us to know? (optional)" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={sending} type="submit">{sending ? 'Sending…' : 'Request access'}</button>
                  <div className="lp-note">We&rsquo;ll only use your email to contact you about COR.</div>
                </form>
              </>
            )}
          </div>

          <p className="lp-disc">COR is an educational and decision-support tool for licensed perfusion professionals. It supports a trained clinician&rsquo;s own judgment and is not a medical device or a source of regulated diagnosis or treatment. Always confirm guidance against your institution&rsquo;s protocols and the patient&rsquo;s care team.</p>
        </section>

        <footer className="lp-foot">
          <span>&copy; {new Date().getFullYear()} COR &middot; Cardiovascular Perfusion AI</span>
          <span><a href="/">Sign in</a> &nbsp;&middot;&nbsp; <a href="/privacy">Privacy</a> &nbsp;&middot;&nbsp; <a href="/terms">Terms</a></span>
        </footer>
      </div>
    </div>
  )
}
