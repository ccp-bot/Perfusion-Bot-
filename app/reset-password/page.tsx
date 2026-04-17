'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase automatically picks up the recovery token from the URL hash
    // and establishes a session. We listen for that event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if we already have a session (user may have refreshed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleReset() {
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => { window.location.href = '/' }, 2000)
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080b12', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif", overflow: 'hidden', position: 'relative' }}>

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        input::placeholder { color: #4a5568; }
        @media (max-width: 768px) {
          .reset-form { width: 100% !important; max-width: 100% !important; padding: 1rem !important; box-sizing: border-box !important; }
        }
      `}</style>

      {/* Background glow */}
      <div style={{ position: 'absolute', top: '30%', left: '40%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(230,57,70,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="reset-form" style={{ width: '380px', maxWidth: '90%', animation: 'fadeUp 0.6s ease' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
            Reset your <span style={{ color: '#e63946' }}>password</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#4a5568' }}>Enter your new password below</div>
        </div>

        {!sessionReady && !success && (
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
            Verifying reset link...
          </div>
        )}

        {sessionReady && !success && (
          <>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box' }}
            />

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', marginBottom: '1rem', boxSizing: 'border-box' }}
            />

            {error && (
              <div style={{ color: '#e63946', fontSize: '0.78rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(230,57,70,0.08)', borderRadius: '8px', border: '1px solid rgba(230,57,70,0.2)' }}>{error}</div>
            )}

            <button
              onClick={handleReset}
              disabled={loading}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: 'none', background: loading ? '#2d3748' : '#e63946', color: 'white', fontSize: '0.88rem', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '1rem', letterSpacing: '0.02em', transition: 'all 0.15s ease' }}
            >
              {loading ? 'Updating...' : 'Reset Password'}
            </button>
          </>
        )}

        {success && (
          <div style={{ color: '#22c55e', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0.75rem', background: 'rgba(34,197,94,0.08)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)' }}>
            Password updated! Redirecting...
          </div>
        )}

        <div
          onClick={() => { window.location.href = '/login' }}
          style={{ textAlign: 'center', fontSize: '0.8rem', color: '#4a5568', cursor: 'pointer', marginTop: '0.5rem' }}
        >
          Back to <span style={{ color: '#94a3b8', fontWeight: '500' }}>Sign in</span>
        </div>
      </div>
    </div>
  )
}
