# SmartSoal AI

Aplikasi generator soal berbasis AI dan fondasi CBT online untuk guru Indonesia.

## Arsitektur
- Frontend statis: GitHub Pages (index.html, styles.css, app.js)
- Backend: Google Apps Script (backend/Code.gs)
- Database: Google Sheets
- AI: OpenAI API atau Gemini API; API key hanya di Script Properties Apps Script.

## Deploy frontend
1. Repo: https://github.com/T-faces/SmartSoal
2. Letakkan index.html, styles.css, dan app.js di root repositori.
3. Settings → Pages → Deploy from a branch → branch Master → /(root).
4. URL: https://t-faces.github.io/SmartSoal/

## Konfigurasi backend
1. Buat Google Sheet baru.
2. Extensions → Apps Script, salin isi backend/Code.gs.
3. Project Settings → Script Properties, atur:
   - SPREADSHEET_ID = ID Google Sheet
   - BOOTSTRAP_KEY = kunci acak sementara untuk membuat admin pertama
   - AI_PROVIDER = gemini atau openai
   - GEMINI_API_KEY = kunci Gemini (jika dipakai)
   - OPENAI_API_KEY = kunci OpenAI (jika dipakai)
4. Jalankan setupDatabase sekali dan berikan izin.
5. Deploy → New deployment → Web app. Execute as: Me. Pilih akses yang sesuai kebijakan sekolah dan salin URL /exec.
6. Buka situs GitHub Pages → Pengaturan, isi URL backend.
7. Untuk membuat admin pertama, isi BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, dan BOOTSTRAP_ADMIN_PASSWORD di Script Properties, lalu jalankan bootstrapAdminFromEditor. BOOTSTRAP_KEY dihapus setelah berhasil.

## Fitur yang sudah ditambahkan
- Peran Admin, Guru, dan Siswa; Admin dapat membuat/mengubah status akun dan mereset password dengan menetapkan password baru.
- Pembuatan ujian dari soal yang ada di bank soal, token ujian, status draf/publikasi, durasi dan jendela waktu opsional.
- Siswa dapat masuk menggunakan token, memulai satu attempt per ujian, mengisi jawaban, autosave, dan mengumpulkan ujian.
- Deadline attempt disimpan oleh backend; backend menolak autosave setelah deadline dan saat pengumpulan setelah deadline memakai jawaban terakhir yang sudah tersimpan.
- Penilaian otomatis untuk soal non-esai dan laporan nilai/status.

## API backend
- GET `?action=health`
- POST `login`, `me`
- POST `list` untuk `questions`, `subjects`, `exams`, `results`, `users` (khusus Admin), dan `attempts` sesuai hak akses
- POST `save`, `remove` untuk bank soal/mapel/ujian sesuai hak akses
- POST `userSave`, `userRemove` (khusus Admin)
- POST `createExam`, `joinExam`, `startAttempt`, `saveAnswers`, `submitExam`, `myExams`, `examStatus`
- POST `generateQuestions`, `settings`

## Memperbarui backend Apps Script
Setiap kali `backend/Code.gs` berubah di GitHub, perubahan tersebut **tidak otomatis** memperbarui project Apps Script Anda. Salin kode terbaru dari repositori ke editor Apps Script, simpan, jalankan `setupDatabase` lagi agar sheet baru `attempts` dibuat, lalu buka **Deploy → Manage deployments → Edit → New version → Deploy**. Gunakan URL Web App `/exec` yang sama jika deployment diperbarui, kemudian tes koneksi dan login lagi.

## Batasan dan pemeriksaan sebelum penggunaan nyata
- Sistem ini merupakan implementasi awal yang perlu diuji pada spreadsheet dan akun sekolah Anda. Belum dilakukan uji integrasi terhadap deployment Apps Script milik pengguna atau uji beban multi-siswa.
- Timer memakai deadline server yang tersimpan, tetapi Apps Script dan Google Sheets bukan infrastruktur ujian berkapasitas tinggi; lakukan uji beban dan rencana pemulihan sebelum ujian penting.
- Esai tidak dinilai otomatis. Penilaian otomatis mengandalkan kecocokan kunci jawaban, sehingga guru wajib meninjau kunci AI dan variasi jawaban.
- Belum tersedia pemulihan password mandiri, rate limiting login, pengawasan proktor, dan analitik lanjutan.
- Jangan menyimpan data siswa sungguhan sebelum peninjauan keamanan, privasi, dan kebijakan sekolah.

**Keamanan:** jangan pernah menaruh API key AI, APP_SECRET, atau password admin di frontend atau repo. GitHub Pages adalah frontend publik; autentikasi dan validasi akses harus dilakukan backend.
