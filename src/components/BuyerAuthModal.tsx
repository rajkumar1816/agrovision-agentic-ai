import React, { useState } from 'react';
import { LockKeyhole, Mail, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BuyerAuthModalProps {
  onClose: () => void;
  onAuthenticated: () => void;
}

export const BuyerAuthModal: React.FC<BuyerAuthModalProps> = ({ onClose, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const getAuthErrorMessage = (message: string) => {
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid login credentials')) return 'Invalid email or password.';
    if (normalized.includes('already registered') || normalized.includes('already been registered')) {
      return 'This email is already registered. Please log in instead.';
    }
    if (normalized.includes('password')) return 'Please choose a stronger password with at least 6 characters.';
    if (normalized.includes('email')) return 'Please enter a valid email address.';
    if (normalized.includes('fetch') || normalized.includes('network')) return 'Supabase authentication is temporarily unavailable. Please try again.';
    return 'Unable to complete authentication. Please try again.';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!supabase) {
      setErrorMessage('Buyer authentication is not configured. Add the VITE_SUPABASE settings and restart AgroVision.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { full_name: fullName.trim(), role: 'buyer' } },
          });
    setIsSubmitting(false);

    if (result.error) {
      setErrorMessage(getAuthErrorMessage(result.error.message));
      return;
    }

    if (mode === 'signup' && !result.data.session) {
      setErrorMessage(
        'Your buyer account was created, but email confirmation is currently enabled in Supabase. The project administrator must disable it in Authentication -> Providers -> Email -> Confirm email -> OFF.'
      );
      setMode('login');
      setPassword('');
      return;
    }

    if (result.data.session?.user.user_metadata?.role !== 'buyer') {
      await supabase.auth.signOut();
      setErrorMessage('This account is not registered as a buyer. Please use a buyer account to continue.');
      return;
    }

    onAuthenticated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="buyer-auth-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              {mode === 'login' ? <LockKeyhole className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </div>
            <h2 id="buyer-auth-title" className="text-xl font-extrabold text-stone-950">
              {mode === 'login' ? 'Buyer login required' : 'Create buyer account'}
            </h2>
            <p className="mt-1 text-xs text-stone-600">Sign in securely before buying directly from a farmer.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-xs font-bold">
          <button onClick={() => setMode('login')} className={`rounded-lg py-2 ${mode === 'login' ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}>
            Log in
          </button>
          <button onClick={() => setMode('signup')} className={`rounded-lg py-2 ${mode === 'signup' ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'}`}>
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          {mode === 'signup' && (
            <label className="block text-xs font-semibold text-stone-700">
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} required className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" />
            </label>
          )}
          <label className="block text-xs font-semibold text-stone-700">
            Email address
            <span className="relative mt-1 block">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-xl border border-stone-300 py-2.5 pl-9 pr-3 text-sm" />
            </span>
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" />
          </label>

          {errorMessage && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{errorMessage}</p>}
          {successMessage && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{successMessage}</p>}

          <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400">
            {isSubmitting ? 'Connecting securely...' : mode === 'login' ? 'Log in to continue' : 'Create buyer account'}
          </button>
        </form>
      </div>
    </div>
  );
};