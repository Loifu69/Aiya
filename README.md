# Aiya – Pengingat Minum

Aplikasi web (PWA) pengingat minum air dengan fitur saling mengingatkan antar teman.

## Fitur

- **Pengingat dinamis**: jadwal minum berikutnya dihitung dari saat kamu menekan **"Sudah Minum Sekarang"** (interval bisa diatur).
- **Suara air berulang**: saat waktunya minum, suara air (sungai, tetesan, atau hujan) dan notifikasi sistem muncul, lalu diulang setiap beberapa menit sampai kamu minum. Ada juga jam tenang.
- **Teman**: tambah teman lewat username (perlu persetujuan dua arah), lihat status minum mereka (*Sudah minum*, *Waktunya minum*, *Terlambat*), dan kirim pengingat ke teman yang terlambat.
- **Riwayat**: catatan minum yang tersimpan di cloud, jadi ikut pindah saat ganti perangkat.
- **Bisa di-install** ke HP atau laptop sebagai PWA.

## Teknologi

React 19, TypeScript, Vite, Tailwind CSS 4, Firebase Firestore, dan Web Audio API (suara dibuat langsung di browser). Di-deploy ke Vercel.

## Menjalankan secara lokal

Butuh Node.js.

```bash
npm install
npm run dev
```

Aplikasi berjalan di http://localhost:3000. Di mode dev, halaman Home menampilkan **Simulasi Waktu Cepat** untuk menguji jadwal tanpa menunggu berjam-jam. Simulasi ini tidak muncul di build produksi.

Perintah lain:

- `npm run build`: build produksi ke folder `dist/`
- `npm run lint`: cek tipe TypeScript

## Struktur

```
src/
  App.tsx              State utama, loop pengingat, sinkronisasi realtime
  components/          Halaman (Home, Teman, Riwayat, Pengaturan, Login) dan modal
  utils/firebase.ts    Semua operasi Firestore
  utils/storage.ts     Cache localStorage, akun, logika teman dan riwayat
  utils/password.ts    Hash password (SHA-256 dengan salt)
  utils/audio.ts       Suara air dan nada notifikasi
public/                Manifest PWA, service worker, ikon
```

## Data di Firestore

| Koleksi | Isi |
| --- | --- |
| `accounts` | Profil publik (username, nama, avatar). **Tanpa password.** |
| `credentials` | Hash dan salt password per user |
| `usernames` | Reservasi username agar unik |
| `settings` | Pengaturan per user |
| `statuses` | Status minum (terakhir minum, jadwal berikutnya) |
| `drinkLogs` | Riwayat minum |
| `friendships`, `friendRequests` | Pertemanan dan permintaan pertemanan |
| `nudges` | Pengingat yang dikirim antar teman |

Login cukup pakai username dan password, tanpa Firebase Auth. Password tidak pernah disimpan dalam bentuk asli. Akun lama yang masih menyimpan password polos otomatis dipindahkan ke `credentials` saat dibuka.
