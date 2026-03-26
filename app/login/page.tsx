'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '2.5rem', width: '90%', maxWidth: '400px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
          <img src="/COR-1.PNG" alt="COR" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          <div>
            <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#ffffff' }}>COR</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Cardiovascular Perfusion Assistant</div>
          </div>
        </div>

        <div style={{ fontSize: '1rem', fontWeight: '500', color: '#ffffff', marginBottom: '1.5rem' }}>
          {isSignUp ? 'Create your account' : 'Sign in to your account'}
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #2a2a3a', background: '#0f1117', color: '#e8e8e8', fontSize: '0.9rem', outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box' }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #2a2a3a', background: '#0f1117', color: '#e8e8e8', fontSize: '0.9rem', outline: 'none', marginBottom: '1rem', boxSizing: 'border-box' }}
        />

        {error && (
          <div style={{ color: '#e63946', fontSize: '0.8rem', marginBottom: '1rem' }}>{error}</div>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: 'none', background: loading ? '#4b5563' : '#e63946', color: 'white', fontSize: '0.9rem', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '1rem' }}
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>

        <div
          onClick={() => setIsSignUp(!isSignUp)}
          style={{ textAlign: 'center', fontSize: '0.85rem', color: '#6b7280', cursor: 'pointer' }}
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </div>

      </div>
    </div>
  )
}