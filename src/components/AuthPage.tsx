import React, { useState } from 'react';
import {
  Droplets,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { UserAccount } from '../types';
import { loginAccount, registerAccount, SEED_ACCOUNTS } from '../utils/storage';

interface AuthPageProps {
  onAuthSuccess: (account: UserAccount) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    setTimeout(() => {
      if (mode === 'login') {
        const res = loginAccount(username, password);
        if (res.success && res.user) {
          setSuccessMsg(res.message);
          setTimeout(() => {
            onAuthSuccess(res.user!);
          }, 400);
        } else {
          setErrorMsg(res.message);
          setIsLoading(false);
        }
      } else {
        const res = registerAccount(username, password);
        if (res.success && res.user) {
          setSuccessMsg(res.message);
          setTimeout(() => {
            onAuthSuccess(res.user!);
          }, 600);
        } else {
          setErrorMsg(res.message);
          setIsLoading(false);
        }
      }
    }, 200);
  };

  const handleQuickDemoLogin = (seedUser: UserAccount) => {
    setUsername(seedUser.username);
    setPassword(seedUser.password);
    setErrorMsg(null);
    setSuccessMsg(null);
    const res = loginAccount(seedUser.username, seedUser.password);
    if (res.success && res.user) {
      setSuccessMsg(`Masuk sebagai ${res.user.name}...`);
      setTimeout(() => {
        onAuthSuccess(res.user!);
      }, 300);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-slate-100 flex flex-col justify-center items-center px-4 py-8">
      {/* Decorative ambient background blur */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-200/40 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-10 w-72 h-72 bg-cyan-200/30 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="relative inline-flex items-center justify-center mb-3">
            <div className="absolute inset-0 rounded-2xl bg-sky-300/50 animate-ping opacity-60" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 via-sky-600 to-cyan-500 text-white flex items-center justify-center shadow-xl shadow-sky-500/25">
              <Droplets className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Aiya
          </h1>
          <p className="text-sm font-semibold text-sky-700 mt-1">
            Ingat minum, ingatkan teman.
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Pengingat minum dinamis dengan notifikasi suara air dan fitur saling mengingatkan
          </p>
        </div>

        {/* Main Auth Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 border border-slate-200/80 relative overflow-hidden">
          {/* Subtle top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500" />

          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Daftar Akun
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-2.5 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-2.5 text-xs animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="auth-username"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="auth-username"
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === 'login' ? 'Masukkan username kamu' : 'Pilih username (misal: rina)'}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-sky-500 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-colors"
                />
              </div>
              {mode === 'register' && (
                <p className="text-[11px] text-slate-600 mt-1">
                  Minimal 3 karakter, huruf, angka, atau underscore.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-sky-500 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-[11px] text-slate-600 mt-1">
                  Cukup password sederhana (minimal 3 karakter).
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 rounded-2xl bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white font-bold text-sm shadow-md shadow-sky-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <span>{mode === 'login' ? 'Masuk ke Aiya' : 'Daftar Sekarang'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Accounts */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Coba Akun Demo (Klik untuk masuk langsung):</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SEED_ACCOUNTS.slice(0, 3).map((seed) => (
                <button
                  key={seed.id}
                  type="button"
                  onClick={() => handleQuickDemoLogin(seed)}
                  className="py-2 px-2 text-left rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 bg-slate-50 transition-all text-xs group cursor-pointer"
                >
                  <div className="font-bold text-slate-800 group-hover:text-sky-700">
                    {seed.name}
                  </div>
                  <div className="text-[10px] text-slate-600">
                    {seed.username === 'sari' ? 'Terlambat' : 'Pass: 123'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-600 mt-5">
          Aiya · Sistem Pengingat Minum Dinamis &amp; Lapisan Sosial
        </p>
      </div>
    </div>
  );
};
