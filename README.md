# Aiya – Pengingat Minum

Aplikasi web (PWA) pengingat minum air dengan fitur saling mengingatkan antar teman.

## Fitur

- **Pengingat dinamis**: jadwal minum berikutnya dihitung dari saat kamu menekan **"Sudah Minum Sekarang"** (interval bisa diatur).
- **Suara air berulang**: saat waktunya minum, suara air (sungai, tetesan, atau hujan) dan notifikasi sistem muncul, lalu diulang setiap beberapa menit sampai kamu minum. Ada juga jam tenang.
- **Teman**: tambah teman lewat username (perlu persetujuan dua arah), lihat status minum mereka (*Sudah minum*, *Waktunya minum*, *Terlambat*), dan kirim pengingat ke teman yang terlambat.
- **Target harian**: atur target minum per hari dan jumlah sekali minum; lingkaran di Home menunjukkan progres hari ini.
- **Pengingat saat aplikasi ditutup**: notifikasi push dari server tetap muncul walaupun Aiya ditutup.
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
- `npm test`: jalankan tes otomatis (Vitest) untuk logika password, jadwal, riwayat, dan server pengingat

## Struktur

```
src/
  App.tsx              State utama, loop pengingat, sinkronisasi realtime
  components/          Halaman (Home, Teman, Riwayat, Pengaturan, Login) dan modal
  utils/firebase.ts    Semua operasi Firestore
  utils/storage.ts     Cache localStorage, akun, logika teman dan riwayat
  utils/password.ts    Hash password (SHA-256 dengan salt)
  utils/audio.ts       Suara air dan nada notifikasi
  utils/push.ts        Daftar/hapus push notification per perangkat
api/
  auth.ts              Daftar, login, ganti password, hapus akun (cek password di server)
  drink.ts             Catat minum dari tombol "Sudah Minum" di notifikasi
  send-reminders.ts    Endpoint Vercel yang mengirim pengingat (dipanggil cron tiap menit)
firestore.rules        Aturan keamanan Firestore (dipasang lewat Firebase Console)
tests/                 Tes otomatis (Vitest)
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
| `pushSubscriptions` | Alamat push tiap perangkat yang mengaktifkan pengingat latar belakang |

## Login & keamanan

Login tetap pakai username dan password. Password dicek di server (`api/auth.ts`) dan hanya disimpan sebagai hash bergaram di `credentials`. Setelah password cocok, server memberi token Firebase sehingga aplikasi masuk ke **Firebase Authentication** dengan id user Aiya. `firestore.rules` lalu membatasi akses:

- tiap user hanya bisa membaca/mengubah datanya sendiri (pengaturan, status, riwayat, nada, perangkat push);
- teman hanya bisa membaca status minum temannya;
- `credentials` dan `usernames` tertutup untuk aplikasi (hanya server);
- tidak bisa melihat daftar semua akun, hanya mencari satu username.

Untuk menjalankan login di lokal (`npm run dev`), isi `FIREBASE_SERVICE_ACCOUNT` di `.env.local` (satu baris JSON). Endpoint `/api/*` ikut berjalan di server dev.

### Memasang rules (sekali, setelah versi dengan login server ter-deploy)

1. Pastikan **Authentication** sudah diaktifkan (Firebase Console → Authentication → Get started).
2. Deploy dulu versi aplikasi ini ke Vercel dan pastikan login berjalan.
3. Firebase Console → **Firestore Database** → tab **Rules** → hapus isinya, tempel isi `firestore.rules` → **Publish**.
4. Semua perangkat akan diminta **masuk lagi** sekali.

## Pengingat saat aplikasi ditutup (setup sekali)

Cara kerjanya: [cron-job.org](https://cron-job.org) memanggil `/api/send-reminders` tiap menit. Endpoint itu mencari user yang sudah waktunya minum (`statuses.nextAlarmAt`), mengirim push notification ke semua perangkatnya, lalu memajukan jadwal sebesar durasi tunda. Jam tenang tetap dihormati, sesuai zona waktu perangkat.

### 1. Ambil service account Firebase

Firebase Console → ⚙️ **Project settings** → tab **Service accounts** → **Generate new private key**. File JSON akan terunduh. **Jangan pernah commit file ini.**

### 2. Isi Environment Variables di Vercel

Vercel → project Aiya → **Settings** → **Environment Variables**, lalu tambahkan:

| Nama | Isi |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Seluruh isi file JSON dari langkah 1 |
| `VAPID_PUBLIC_KEY` | Dari `.env.local` |
| `VAPID_PRIVATE_KEY` | Dari `.env.local` |
| `CRON_SECRET` | Dari `.env.local` |
| `VAPID_SUBJECT` | URL web Aiya, misal `https://nama-app.vercel.app` |

`.env.local` hanya ada di laptop (diabaikan git). `VAPID_PUBLIC_KEY` harus sama dengan konstanta di `src/utils/push.ts`.

Setelah itu **Redeploy**. Cek dengan membuka `https://nama-app.vercel.app/api/send-reminders`: kalau muncul `Unauthorized`, endpoint sudah jalan.

### 3. Buat cron job

Di cron-job.org → **Create cronjob**:

- **URL**: `https://nama-app.vercel.app/api/send-reminders`
- **Schedule**: every 1 minute
- **Advanced → Headers**: `Authorization` = `Bearer <CRON_SECRET>`

Klik **Test run**. Hasil yang benar berupa JSON `{"ok":true,"due":...,"sent":...}`.

### 4. Aktifkan di tiap perangkat

Buka Aiya → **Pengaturan** → **Pengingat Saat Aplikasi Ditutup** → **Aktifkan** → izinkan notifikasi.

- **Laptop**: agar Aiya terbuka otomatis saat login, buka `chrome://apps` (atau `edge://apps`), klik kanan Aiya → **Start app when you sign in**. Pastikan "Continue running background apps" di pengaturan browser menyala.
- **Android**: matikan optimasi baterai untuk Chrome agar notifikasi tidak tertunda.
- **iPhone**: Aiya harus ditambahkan ke Home Screen dulu (iOS 16.4+).
