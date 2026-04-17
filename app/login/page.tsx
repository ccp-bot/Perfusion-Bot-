'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleResetPassword() {
    if (!email) {
      setError('Enter your email address first')
      return
    }
    setResetLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
    setResetLoading(false)
  }

  async function handleAuth() {
    setLoading(true)
    setError('')

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    } else {
      window.location.href = '/'
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080b12', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif", overflow: 'hidden', position: 'relative' }}>

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        input::placeholder { color: #4a5568; }
        @media (max-width: 768px) {
          .login-layout { flex-direction: column !important; gap: 1rem !important; padding: 1rem !important; }
          .login-cor { max-width: 180px !important; }
          .login-form { width: 100% !important; max-width: 100% !important; padding: 0 !important; box-sizing: border-box !important; }
          .login-title { font-size: 1.3rem !important; }
          .login-subtitle { font-size: 0.75rem !important; }
        }
      `}</style>

      {/* Background glow effects */}
      <div style={{ position: 'absolute', top: '20%', left: '30%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(230,57,70,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '25%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Main layout - COR on left, form on right */}
      <div className="login-layout" style={{ display: 'flex', alignItems: 'center', gap: '0rem', width: '90%', maxWidth: '1000px', animation: 'fadeUp 0.6s ease' }}>

        {/* COR waving */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
            <img
              src="/LittleCorWave.gif"
              alt="COR waving"
              className="login-cor"
              style={{ width: '100%', maxWidth: '450px', animation: 'none', filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.15))' }}
            />
           </div>

        {/* Login form */}
        <div className="login-form" style={{ width: '360px', maxWidth: '100%', flexShrink: 0, boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div className="login-title" style={{ fontSize: '2rem', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
              Welcome to <span style={{ color: '#e63946' }}>COR</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#4a5568' }}>Cardiovascular Perfusion AI Assistant</div>
          </div>

          <div style={{ fontSize: '0.82rem', fontWeight: '500', color: '#94a3b8', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {isSignUp ? 'Create your account' : 'Sign in to continue'}
          </div>

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box', transition: 'border-color 0.2s ease' }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', marginBottom: '1rem', boxSizing: 'border-box', transition: 'border-color 0.2s ease' }}
          />

          {error && (
            <div style={{ color: '#e63946', fontSize: '0.78rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(230,57,70,0.08)', borderRadius: '8px', border: '1px solid rgba(230,57,70,0.2)' }}>{error}</div>
          )}

          <button
            onClick={handleAuth}
            disabled={loading}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: 'none', background: loading ? '#2d3748' : '#e63946', color: 'white', fontSize: '0.88rem', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '1rem', letterSpacing: '0.02em', transition: 'all 0.15s ease' }}
          >
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>

          {resetSent && (
            <div style={{ color: '#22c55e', fontSize: '0.78rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(34,197,94,0.08)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
              Password reset email sent! Check your inbox.
            </div>
          )}

          {!isSignUp && (
            <div
              onClick={resetLoading ? undefined : handleResetPassword}
              style={{ textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8', cursor: resetLoading ? 'not-allowed' : 'pointer', marginBottom: '0.75rem', transition: 'color 0.15s ease' }}
            >
              {resetLoading ? 'Sending...' : 'Forgot password?'}
            </div>
          )}

          <div
            onClick={() => { setIsSignUp(!isSignUp); setResetSent(false); setError('') }}
            style={{ textAlign: 'center', fontSize: '0.8rem', color: '#4a5568', cursor: 'pointer', transition: 'color 0.15s ease' }}
          >
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <span style={{ color: '#94a3b8', fontWeight: '500' }}>{isSignUp ? 'Sign in' : 'Sign up'}</span>
          </div>
        </div>

      </div>
    </div>
  )
}
