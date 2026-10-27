import React, { useState, useEffect } from 'react';
import { Cloud, Check, X, Sparkles, ExternalLink, AlertCircle, Database, Smartphone } from 'lucide-react';
import {
  getStoredFirebaseConfig,
  saveStoredFirebaseConfig,
  isFirebaseReady,
  FirebaseCustomConfig,
} from '../utils/firebase';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [configText, setConfigText] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const isConnected = isFirebaseReady();

  useEffect(() => {
    const existing = getStoredFirebaseConfig();
    if (existing) {
      setConfigText(JSON.stringify(existing, null, 2));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleParseAndSave = () => {
    setStatusMsg(null);
    try {
      let parsed: Partial<FirebaseCustomConfig> = {};

      // Handle raw JSON or JavaScript object pasted from Firebase console
      const cleaned = configText
        .trim()
        .replace(/const\s+firebaseConfig\s*=\s*/g, '')
        .replace(/;/g, '');

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Try regex extract for JS object format
        const apiKey = configText.match(/apiKey:\s*["']([^"']+)["']/)?.[1];
        const projectId = configText.match(/projectId:\s*["']([^"']+)["']/)?.[1];
        const authDomain = configText.match(/authDomain:\s*["']([^"']+)["']/)?.[1];
        const storageBucket = configText.match(/storageBucket:\s*["']([^"']+)["']/)?.[1];
        const messagingSenderId = configText.match(/messagingSenderId:\s*["']([^"']+)["']/)?.[1];
        const appId = configText.match(/appId:\s*["']([^"']+)["']/)?.[1];

        if (apiKey && projectId) {
          parsed = { apiKey, projectId, authDomain, storageBucket, messagingSenderId, appId };
        } else {
          throw new Error('Format tidak valid');
        }
      }

      if (!parsed.apiKey || !parsed.projectId) {
        setStatusMsg({
          type: 'error',
          text: 'Konfigurasi tidak lengkap. Pastikan memiliki apiKey dan projectId.',
        });
        return;
      }

      const finalConfig: FirebaseCustomConfig = {
        apiKey: parsed.apiKey,
        authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
        projectId: parsed.projectId,
        storageBucket: parsed.storageBucket || `${parsed.projectId}.appspot.com`,
        messagingSenderId: parsed.messagingSenderId || '',
        appId: parsed.appId || '',
      };

      saveStoredFirebaseConfig(finalConfig);
      setStatusMsg({
        type: 'success',
        text: 'Konfigurasi Firebase berhasil disimpan! Memuat ulang aplikasi...',
      });

      setTimeout(() => {
        onConfigUpdated();
        window.location.reload();
      }, 1000);
    } catch {
      setStatusMsg({
        type: 'error',
        text: 'Gagal membaca format konfigurasi. Tempel potongan kode firebaseConfig dari Firebase Console.',
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          aria-label="Tutup dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white flex items-center justify-center">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Sinkronisasi Cloud (HP &amp; Laptop)
            </h2>
          </div>
        </div>

        {/* Status Pill */}
        <div className="mt-3 mb-4">
          {isConnected ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-semibold">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Tersambung ke Cloud Database (Sinkron HP &amp; Laptop Aktif!)</span>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-center gap-2 text-xs font-semibold">
              <Database className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Mode Penyimpanan Lokal (Belum Terhubung ke Database Online)</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          Agar akunmu (seperti <strong>Loifu</strong>) dapat login di HP, laptop, dan perangkat temanmu secara bersamaan, hubungkan ke <strong>Firebase Firestore gratis</strong>.
        </p>

        {/* Step by step quick guide */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2 mb-4">
          <span className="font-bold text-slate-800 block">Langkah Mendapatkan Kunci Gratis (1 Menit):</span>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
            <li>
              Buka{' '}
              <a
                href="https://console.firebase.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 hover:underline font-semibold inline-flex items-center gap-0.5"
              >
                <span>console.firebase.google.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              lalu klik <strong>Add Project</strong> (beri nama <em>Aiya</em>).
            </li>
            <li>
              Di menu kiri, pilih <strong>Build $\rightarrow$ Firestore Database</strong> $\rightarrow$ klik <strong>Create Database</strong> (pilih <em>Test Mode</em>).
            </li>
            <li>
              Klik ikon <strong>Gear (Project Settings)</strong> $\rightarrow$ di bagian bawah (Your Apps), klik ikon web <strong>&lt;/&gt;</strong> $\rightarrow$ salin blok <strong>firebaseConfig</strong>.
            </li>
          </ol>
        </div>

        {/* Textarea Input */}
        <div className="space-y-2 mb-4">
          <label className="block text-xs font-semibold text-slate-700">
            Tempel Kode <code>firebaseConfig</code> di sini:
          </label>
          <textarea
            rows={5}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  projectId: "aiya-app...",\n  ...\n};`}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-sky-500 focus:bg-white"
          />
        </div>

        {statusMsg && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMsg.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleParseAndSave}
            className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simpan &amp; Hubungkan Database</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-slate-600 hover:text-slate-800 text-xs font-medium"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
};
