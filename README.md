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

## API awal
- GET ?action=health
- POST {action:"login", email, password}
- POST {action:"me", token}
- POST {action:"list", token, table:"questions"}
- POST {action:"save", token, table:"questions", record:{...}}
- POST {action:"remove", token, table:"questions", id}
- POST {action:"generateQuestions", token, settings:{...}}
- POST {action:"settings", token, settings:{...}}

## Batasan tahap awal
Ini fondasi bertahap, bukan klaim bahwa CBT sudah siap untuk ujian berisiko tinggi. Sebelum penggunaan nyata, lanjutkan implementasi ujian/attempt server-side, timer tervalidasi, autosave, token ujian, penilaian, audit log, pemulihan password, pembatasan percobaan login, dan pengujian keamanan/beban. Jangan menyimpan data siswa sungguhan sebelum peninjauan keamanan dan privasi.

**Keamanan:** jangan pernah menaruh API key AI, APP_SECRET, atau password admin di frontend atau repo. GitHub Pages adalah frontend publik; autentikasi dan validasi akses harus dilakukan backend.
