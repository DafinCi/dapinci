# DapinCi --- Product Specification v2

> **Catatan untuk repo publik:** dokumen ini mencatat migrasi dari salinan kerja
> privat. Path seperti `NotchBuddy/`, `design/`, `docs/`, dan
> `windows/screenshots/` merujuk ke salinan itu, bukan ke isi repository ini.

> **Status:** Draft v2 — hasil diskusi, verifikasi kode, dan keputusan yang
> ditetapkan. Siap dipakai sebagai dasar implementasi.\
> **Revisi:** v1 → v2 (lihat §0)\
> **Tanggal:** 11 Oktober 2026\
> **Platform utama:** Windows\
> **Fondasi:** Repository Coucou yang sudah ada, khususnya implementasi
> `windows/`\
> **Arah produk:** Personal Desktop Companion\
> **Interaksi utama:** Companion-first dengan panel/workspace yang dapat
> diperluas\
> **Identitas:** produk `DapinCi`, pemilik `DafinCi`, package/identifier
> `dapinci` (§15)

------------------------------------------------------------------------

## 0. Ringkasan Perubahan v1 → v2

v2 tidak mengubah arah produk. Yang berubah adalah **ketepatan**: setiap
deliverable sekarang dipetakan ke kode yang benar-benar ada, dan enam
keputusan yang tadinya terbuka sudah ditetapkan.

| # | Perubahan | Alasan |
| - | --------- | ------ |
| 1 | Ditambahkan **§17 Status Aktual Implementasi** | v1 tidak membedakan mana yang sudah ada dan mana yang belum, sehingga berisiko membangun ulang fitur yang sudah jalan |
| 2 | **§5 Batas MVP** ditulis ulang: setiap item bertanda `[ADA]`, `[SEBAGIAN]`, atau `[BELUM]` | Fondasi chat (7 provider, model picker, UI chat, Markdown) sudah ada; yang benar-benar kosong hanya persistensi, cancel, DeepSeek, dan Spotify |
| 3 | **§6** dikonkretkan: DeepSeek = **Opsi 1 (non-streaming)**, menyentuh tepat 3 file | Mesin streaming memang ada, tetapi hanya di jalur OpenAI-compatible/lokal (§17) |
| 4 | **§7** diubah dari "pertimbangkan/evaluasi" menjadi keputusan penyimpanan yang sudah diambil | Jawabannya sudah ada di kode (keyring lewat `secrets.rs`, JSON lewat `platform::*_dir()`); tidak perlu dievaluasi lagi |
| 5 | Ditambahkan **§18 Spotify di Windows (Opsi B — Web API)** lengkap dengan link dokumentasi resmi | Permintaan baru; dan penting dicatat bahwa lapisan UI/dance/tes Spotify sudah ada, yang kosong hanya sumber datanya di Rust |
| 6 | **§4.3** tidak lagi menunda keputusan window (sudah ditetapkan: ikuti Coucou sekarang, panel bisa ditutup/dibuka) | Keputusan Anda |
| 7 | **§10 Roadmap** diganti menjadi rencana implementasi per fase (Fase 0–8) dengan prasyarat, uji wajib, kriteria sukses, dan kondisi berhenti | v1 masih berupa daftar deliverable, belum bisa dieksekusi |
| 8 | **§11**, **§12**, **§16** disesuaikan dengan keenam keputusan | Termasuk menambahkan risiko OAuth/kuota Spotify yang tidak ada di v1 |
| 9 | Ditambahkan **Lampiran A (kontrak internal)** dan **Lampiran B (dependency lintas direktori)** | Supaya rebranding tidak pernah dilakukan sebagai global search-and-replace |
| 10 | **SOUNDS_DIR dipindah ke dalam `windows/`** (`windows/sounds/`, 29 WAV orisinal), suffix `New` dihapus dari semua nama suara, dan string hint Settings dipindah ke `extra.json` | `windows/` jadi mandiri untuk build dan runtime; nama suara yang terlihat user tidak lagi berbunyi `peekNew` |
| 11 | Karakter diberi nama **ipin** (huruf kecil): 4 string UI (+9 bahasa), nama di label balasan chat, prompt sistem, judul window, serta label/page/modul window desktop (`ipin.html`, `src/ipin/`) ikut berganti | Nama aplikasi saja tidak cukup — karakter juga harus jadi milik kita; skema settings yang sudah tersimpan sengaja **tidak** disentuh |
| 12 | Sisa **Mochi** di kode dibereskan: identifier (`DesktopIpinController`, `drawIpin`, `State.ipinOnDesktop`, `DesktopIpinPref`), seluruh komentar, judul window, dan 4 baris log. Pesan deny hook jadi `Denied from DapinCi` | Menutup tahap 1–3; yang sengaja tetap bernama "mochi" hanya kunci settings yang sudah tertulis di disk |
| 13 | **Fase 6a dan 6c:** `windows/README.md` ditulis ulang (fakta diperbaiki, dua bagian dihapus, enam bagian baru), `README.md` root diganti README DapinCi, `CLAUDE.md` diganti panduan DapinCi, issue template dibersihkan | Dokumentasi bukan hanya salah merek tetapi juga **salah fakta** akibat pekerjaan kita sendiri; dan `CLAUDE.md` lama menyuruh agen AI mempertahankan identitas upstream |
| 14 | **Fase 6d (NSIS) selesai** — dipasang, dipasang ulang, di-uninstall, dan dipasang lagi di mesin pemilik proyek; tiga temuan dicatat (publisher `github`, kunci registry tertinggal, entri hook yatim) | Uji installer adalah satu-satunya cara menemukan hal seperti "Publisher: github" dan membuktikan relay benar-benar ikut terkirim |
| 15 | **Temuan 6d #1 diperbaiki**: `bundle.publisher: "DafinCi"` di `tauri.conf.json`; siklus pasang/uninstall diulang penuh untuk membuktikannya. Ditambah bagian **Uninstalling** di `windows/README.md` (apa yang dihapus, apa yang bertahan, dan entri hook yang sengaja dibiarkan) | "Publisher: github" adalah cacat yang terlihat pengguna di Apps & features; perilaku uninstaller yang meninggalkan entri hook perlu terdokumentasi supaya tidak disalahpahami sebagai bug |

**Cara membaca dokumen ini:** §1–§9 adalah spesifikasi produk; §10–§16
adalah eksekusi dan tata kelola; §17–§18 adalah rujukan teknis hasil
verifikasi kode; Lampiran A–B adalah daftar hal yang tidak boleh diubah
sembarangan.

## 1. Ringkasan Produk

**DapinCi adalah personal desktop companion yang menghubungkan AI,
komunikasi, dan tindakan desktop dalam satu pengalaman yang selalu mudah
diakses.**

DapinCi dikembangkan dari repository Coucou yang sudah ada. Coucou tetap
menjadi fondasi teknis dan sumber referensi; DapinCi memperluas tujuan
produk dari pendamping AI coding agent menjadi companion untuk aktivitas
sehari-hari di laptop.

DapinCi bukan sekadar chatbot yang ditempelkan pada desktop, dan bukan
pula pengganti semua aplikasi Windows. Tujuannya adalah mengurangi
perpindahan konteks dan menyediakan satu titik masuk untuk meminta
bantuan AI, melihat komunikasi yang relevan, dan menjalankan aksi yang
jelas batas izinnya.

### Pernyataan produk

> DapinCi is a personal desktop companion that connects your AI,
> communications, and everyday workflows in one place.

### Prinsip utama

1.  **Companion-first:** karakter kecil menjadi entry point; panel yang
    lebih luas menangani pekerjaan serius.
2.  **Local-first where practical:** data dan preferensi disimpan lokal
    bila masuk akal; pengiriman ke layanan cloud harus jelas bagi
    pengguna.
3.  **Modular:** provider AI dan integrasi desktop dipisahkan agar dapat
    dikembangkan tanpa rewrite besar.
4.  **User-controlled:** aksi yang sensitif memerlukan izin atau
    konfirmasi yang sesuai.
5.  **Non-destructive:** pertahankan fitur Coucou yang masih berguna;
    jangan menghapus direktori platform lain hanya demi fokus Windows.
6.  **Asset-independent:** aset karakter, ikon, suara, dan animasi harus
    dapat diganti tanpa mengubah logika fitur.
7.  **Evidence-based development:** periksa kode dan jalankan validasi
    sebelum menyimpulkan suatu fitur tersedia atau berfungsi.

------------------------------------------------------------------------

## 2. Posisi Produk dan Pilar Utama

DapinCi memiliki tiga pilar yang setara dalam visi jangka panjang.

### 2.1 AI

-   Chat dengan DeepSeek sebagai provider pertama.
-   Dukungan provider/model lain secara bertahap.
-   Streaming respons, riwayat percakapan, dan status request yang
    jelas.
-   Konteks yang sengaja diberikan pengguna, misalnya teks yang dipilih
    atau clipboard.
-   Instruksi personal dan preferensi AI.

### 2.2 Connect

-   Menampilkan atau menghubungkan notifikasi aplikasi komunikasi.
-   Membuka konteks percakapan dari notifikasi bila didukung.
-   Balasan cepat hanya setelah jalur integrasi yang sah, stabil, dan
    didukung diverifikasi.
-   Kontrol aplikasi mana yang boleh terhubung dan informasi apa yang
    boleh diproses.

### 2.3 Control

-   Global keyboard shortcut untuk memanggil/menyembunyikan companion.
-   Quick actions sederhana, misalnya membuka aplikasi atau memproses
    teks yang dipilih.
-   Otomasi terbatas dengan izin eksplisit.
-   Integrasi Windows yang modular agar kegagalan satu integrasi tidak
    merusak seluruh aplikasi.

Ketiga pilar tidak harus dibangun sekaligus. MVP berfokus pada AI,
sementara struktur produk tidak boleh menghalangi penambahan Connect dan
Control.

------------------------------------------------------------------------

## 3. Target Pengguna dan Skenario Utama

### Target awal

Pengguna Windows yang ingin memiliki satu companion personal untuk
mengakses AI dengan cepat dan secara bertahap menghubungkannya ke
workflow desktop.

### Skenario prioritas

1.  Pengguna menekan global shortcut atau mengeklik karakter DapinCi.
2.  Panel chat terbuka dan siap digunakan.
3.  Pengguna memilih percakapan atau memulai percakapan baru.
4.  Pengguna mengirim prompt ke DeepSeek.
5.  Respons ditampilkan secara streaming.
6.  Percakapan disimpan secara lokal sesuai kebijakan penyimpanan yang
    ditentukan.
7.  Pengguna menutup panel; companion tetap tersedia tanpa menghentikan
    aplikasi.
8.  Pada fase berikutnya, pengguna dapat mengirim teks terpilih ke AI
    atau mengambil tindakan dari notifikasi yang didukung.

### Skenario Spotify (ditambahkan di v2, keputusan §15)

1.  Pengguna menyalakan pil Spotify dan menghubungkan akun Spotify
    lewat alur OAuth di Settings.
2.  Pil menampilkan track yang sedang diputar; kartunya menampilkan
    cover, progres, shuffle, repeat, dan volume.
3.  Pengguna mengontrol playback dari kartu (play/pause, next,
    previous, seek, volume, shuffle, repeat).
4.  Selama musik diputar pada pil yang dinyatakan, karakter menari.
5.  Saat tidak ada perangkat aktif atau akun bukan Premium, aplikasi
    tetap menampilkan status dan menjelaskan kenapa kontrol tidak
    tersedia — bukan gagal diam-diam.

### Non-goals MVP

-   Menggantikan WhatsApp, browser, atau aplikasi desktop lain.
-   Menjalankan shell command secara bebas atas nama pengguna.
-   Mengotomasi semua aplikasi tanpa izin.
-   Sinkronisasi cloud untuk seluruh data personal.
-   Sistem plugin pihak ketiga.
-   Membuat ulang seluruh identitas visual sebelum alur utama berfungsi.

------------------------------------------------------------------------

## 4. Model Interaksi: Companion-first

### 4.1 Companion

Karakter kecil selalu mudah dipanggil dan berfungsi sebagai entry point.

Perilaku yang diinginkan:

-   Klik karakter membuka panel utama.
-   Global shortcut membuka atau menyembunyikan panel.
-   Status visual memberi indikasi sederhana: idle, memproses, respons
    tersedia, error, atau membutuhkan perhatian.
-   Companion tidak boleh mengambil fokus atau menutupi pekerjaan tanpa
    alasan.
-   Perilaku saat startup, minimisasi, taskbar, tray, topmost, dan
    multi-monitor harus mengikuti temuan audit arsitektur Windows yang
    ada.

### 4.2 Panel chat

Panel menyediakan:

-   Daftar atau pemilih percakapan.
-   Area pesan.
-   Input pesan dan tombol kirim.
-   Indikator streaming/loading.
-   Tombol stop/cancel saat request berjalan.
-   Pemilihan provider/model yang tersedia.
-   Error yang dapat dipahami pengguna dan opsi mencoba kembali.
-   Akses ke pengaturan dasar.

### 4.3 Workspace/pengaturan

Workspace yang lebih luas dapat menyediakan:

-   Pengaturan provider dan kredensial.
-   Riwayat percakapan.
-   Preferensi personal.
-   Konfigurasi shortcut.
-   Pengaturan privasi dan integrasi.
-   Status fitur/integrasi.

**Keputusan implementasi window (DITETAPKAN di v2):** ikuti arsitektur
Coucou sekarang apa adanya, dengan syarat panel bisa ditutup dan dibuka
kembali. Yang dimaksud, berdasarkan kode aktual:

-   **Window `island`** dideklarasikan di `tauri.conf.json` (label
    `island`, 240 × 6 px, `decorations: false`, `transparent: true`,
    `alwaysOnTop: true`, `skipTaskbar: true`, `focus: false`,
    `dragDropEnabled: false`). Saat tertutup, window tidak di-hide
    melainkan **dikecilkan menjadi strip 6 px** di tepi atas layar
    (`set_collapsed` → `island::apply_geometry`); membuka kembali
    mengembalikan ukuran penuh. Ini yang membuat "tutup" tidak pernah
    kehilangan hook, tray, atau state.
-   **Window `settings`** dibuat di kode saat startup dalam keadaan
    tersembunyi (`create_settings_window` di `lib.rs`) dan hanya
    di-`show`/`hide`; tombol close di-intercept menjadi `hide`
    (`WindowEvent::CloseRequested` → `prevent_close`). Alasannya
    tercatat di kode: WebView2 hanya mengizinkan satu environment per
    aplikasi, sehingga window yang dibuat belakangan berisiko blank.
-   **Window `ipin`** (karakter di desktop) dibuat di `desktop.rs`
    (label `ipin`, 120 px) dan di Windows **tidak pernah di-hide**,
    hanya dipindahkan ke posisi parkir `(-32000, -32000)`.
-   State buka/tutup ditangani oleh FSM di `src/island/fsm.ts`
    (`hidden` / `petit` / `home` / `coucou`), dengan `Esc` menutup,
    tray → Open membuka, dan `Ctrl+Alt+N` sebagai toggle.

**Konsekuensi untuk DapinCi:** tidak ada window baru, tidak ada
mekanisme overlay baru, dan tidak ada perubahan pada
`additionalBrowserArgs` (komentar di `lib.rs` memperingatkan bahwa
perbedaan argumen antar-window membuat window kedua blank tanpa error).
Panel chat tetap menjadi salah satu view di dalam island, seperti
sekarang.

------------------------------------------------------------------------

## 5. Batas MVP

Penanda status mengacu pada §17 (hasil verifikasi kode):
`[ADA]` = sudah jalan di `windows/`; `[SEBAGIAN]` = sebagian sudah ada;
`[BELUM]` = belum ada sama sekali.

### P0 --- harus ada untuk MVP

1.  **Audit arsitektur dan baseline aplikasi Windows.** `[SEBAGIAN]` —
    audit read-only sudah selesai (§17, §18, Lampiran A–B). Yang belum:
    menjalankan baseline build/test/pack yang sebenarnya (Fase 1).
2.  **Companion dapat membuka/menutup panel tanpa menghentikan proses.**
    `[ADA]` — collapse/expand island, `Esc`, tray → Open, `Ctrl+Alt+N`,
    dan `set_collapsed` sudah ada (§4.3). Tidak ada pekerjaan baru; hanya
    perlu diuji ulang (Fase 1).
3.  **Chat DeepSeek melalui API.** `[BELUM]` — lapisan chat dan 7
    provider sudah ada, DeepSeek belum. Menyentuh tepat 3 file (§6,
    Fase 4).
4.  **Input API key dan penyimpanan rahasia yang aman.** `[ADA]` untuk
    mekanismenya (Windows Credential Manager lewat `secrets.rs` +
    allow-list `KNOWN_KEYS`). `[BELUM]` hanya entri kuncinya:
    `deepseek-api-key` dan kunci Spotify wajib didaftarkan (§6, §18).
5.  **Riwayat percakapan lokal.** `[BELUM]` — `chat.rs` murni in-memory.
    Rancangan ada di §7, dikerjakan di Fase 3.
6.  **Loading, timeout, error, pembatalan, dan request gagal.**
    `[SEBAGIAN]` — loading/error/timeout sudah ada untuk 7 provider;
    **pembatalan (Stop) belum ada** (tidak ada `chat_cancel` di antara
    70 command terdaftar). Dikerjakan di Fase 3.
7.  **Global shortcut.** `[ADA]` — lebih lengkap daripada yang
    dibayangkan v1: recorder, status *In use* / *Used twice*, dan deteksi
    tabrakan AltGr per layout keyboard. Tidak ada pekerjaan baru.
8.  **Streaming respons.** `[SEBAGIAN]` — sudah ada untuk Ollama, LM
    Studio, dan server OpenAI-compatible (SSE di `local_chat.rs`),
    tetapi **tidak** untuk provider cloud termasuk DeepSeek. Status
    dinaikkan menjadi **P1**, bukan P0 (alasan di bawah).
9.  **Spotify di Windows.** `[SEBAGIAN]` — UI, kartu, dance, dan tesnya
    sudah ada dan platform-agnostic; yang kosong hanya sumber data di
    Rust. Ditetapkan Opsi B (Web API) — §18, Fase 5.
10. **Tidak merusak fitur Coucou yang sudah ada.** Kondisi yang dijaga
    oleh smoke test regresi (Fase 1) dan diulang di setiap fase.
11. **Pengujian untuk alur chat dan persistensi.** `[SEBAGIAN]` — 24
    file tes Node + tes Rust per modul sudah ada; tes persistensi dan
    cancel belum ada dan wajib ditambahkan di Fase 3.

**Catatan penting soal streaming (konsekuensi keputusan yang disadari).**
Dengan Opsi 1, DeepSeek — provider utama DapinCi — menjawab utuh
sekaligus, sementara Ollama/LM Studio justru streaming. Mesin streaming
sudah ada di `local_chat.rs` (pembaca SSE, event `chat-delta`, filter
blok `<think>`, throttle 15 fps), sehingga menaikkan DeepSeek ke jalur
itu nanti bukan pekerjaan dari nol. Karena itu streaming provider cloud
dijadikan **item pertama di P1**: biaya rendah, manfaat langsung pada
provider utama.

### P1 --- sesudah alur utama stabil

-   **Streaming untuk provider cloud**, memakai klien SSE yang sudah ada
    — prioritas pertama di P1.
-   Provider AI tambahan (pola tabel `PROVIDERS` sudah tersedia).
-   Pengiriman teks pilihan/clipboard secara eksplisit.
-   Instruksi personal.
-   Quick actions terbatas.
-   Pengaturan perilaku companion.
-   Fondasi notifikasi yang modular.

### P2 --- sesudah validasi teknis

-   Integrasi notifikasi Windows yang lebih lengkap.
-   Membuka percakapan dari notifikasi.
-   Balasan langsung melalui integrasi yang didukung.
-   Otomasi desktop dengan izin dan konfirmasi.
-   Personalisasi visual lanjutan.
-   **Rename identifier internal berisiko** (nama relay + 3 marker, nama
    pipe/socket) — Lampiran A, Fase 7.
-   **Penggantian aset Coucou dengan aset orisinal** — prasyarat
    publikasi, Fase 8.

### Sengaja ditunda

-   Eksekusi perintah sistem secara bebas.
-   Akses diam-diam ke isi aplikasi atau clipboard.
-   Sinkronisasi semua data ke cloud.
-   Sistem plugin umum.
-   Penggantian massal nama/identifier internal Coucou.
-   Pemisahan repository atau penghapusan direktori platform.
-   **Klarifikasi v2:** larangan "penggantian massal" tetap berlaku.
    Rename internal yang terkendali (Fase 7) bukan penggantian massal,
    karena setiap nama punya daftar situs yang harus berubah bersamaan
    (Lampiran A) dan diverifikasi dengan tes.

------------------------------------------------------------------------

## 6. AI Provider Layer

### Bentuk yang sudah ada (jangan dibangun ulang)

Lapisan provider bukan pekerjaan MVP; ia sudah ada dan dipakai:

-   `src-tauri/src/chat.rs` — orkestrasi: `send()` memilih provider dan
    `models()` mengambil daftar model.
-   `src-tauri/src/claude.rs` — Anthropic.
-   `src-tauri/src/openai_compat.rs` — tabel `PROVIDERS` untuk OpenAI,
    Google AI, dan OpenRouter, satu klien untuk ketiganya. Jawaban diambil
    dari `choices[0].message.content` (`reply_text`).
-   `src-tauri/src/local_chat.rs` — Ollama, LM Studio, dan server
    OpenAI-compatible milik pengguna; **satu-satunya jalur yang streaming
    saat ini**.
-   `src/core/providers.ts` — sisi halaman: 7 entri `PROVIDERS`, model
    picker, `activeModel()`, `visibleProviders()`, `pickModel()`.
-   `src/views/chat.ts` + `src/views/markdown.ts` — UI chat dan Markdown.

Kontrak provider minimal yang diminta v1 sudah terpenuhi oleh struktur
ini. **Jangan** membuat abstraksi provider baru.

### Provider pertama: DeepSeek — keputusan v2: Opsi 1 (non-streaming)

DeepSeek ditambahkan sebagai entri ke-8 pada tabel provider yang sudah
ada. Endpoint DeepSeek kompatibel dengan format OpenAI, sehingga ia masuk
ke `openai_compat.rs`.

**Tiga file yang disentuh (dan tidak lebih):**

1.  `src-tauri/src/openai_compat.rs` — satu entri `Provider` (`id`,
    `name`, `base_url`, `key`, `models_path`, `default_model`,
    `not_chat`, `max_tokens_field`).
2.  `src/core/providers.ts` — satu entri `ProviderDef`, plus id baru pada
    union `ProviderId`.
3.  `src-tauri/src/secrets.rs` — **wajib**: tambahkan `deepseek-api-key`
    ke `KNOWN_KEYS`. Tanpa ini `secret_set` menolak dengan `unknown key`
    dan pengguna tidak akan tahu penyebabnya.

**Wajib diverifikasi saat implementasi (belum terverifikasi):**

-   Apakah DeepSeek menyediakan endpoint `/models` yang kompatibel.
    `chat.rs` menyusun daftar model dari `models_path`; bila tidak
    tersedia, dibutuhkan daftar model statis sebagai fallback.
-   Nama field batas token: OpenAI memakai `max_completion_tokens`,
    provider kompatibel umumnya `max_tokens`. Nilainya per-provider dan
    harus dikonfirmasi dari dokumentasi resmi saat implementasi.
-   Nama model default yang benar pada saat implementasi (harga dan nama
    model DeepSeek dapat berubah).

**Sengaja tidak dikerjakan di Opsi 1:**

-   Streaming DeepSeek (diangkat ke P1, §5).
-   `reasoning_content` tidak ditampilkan sebagai jawaban; jalur
    non-streaming memang tidak mengambil field itu.

### Keamanan kredensial (keputusan v2 — mekanismenya sudah ada)

v1 meminta "evaluasi Windows Credential Manager/OS keyring". Jawabannya
sudah ada di repo dan dipakai semua provider sekarang:

-   `src-tauri/src/secrets.rs` — `Entry::new(SERVICE, key)` lewat crate
    `keyring` (fitur `windows-native`), service `fr.louisraille.coucou`.
-   Hanya 13 nama kunci yang diterima (`KNOWN_KEYS`); nama di luar daftar
    ditolak. Setiap kunci baru **harus** didaftarkan di sini.
-   Halaman hanya bisa menanyakan keberadaan kunci (`secret_present`),
    tidak pernah membacanya; nilainya tidak melintasi IPC.
-   Pola menyimpan nilai majemuk sebagai satu JSON string sudah ada:
    kunci server kustom disimpan sebagai `{ url, key }` (`BoundKey` di
    `local_chat.rs`) dan hanya dikirim ke alamat itu. Pola ini dipakai
    kembali untuk token Spotify (§18).

### Kontrak provider minimal

Tetap seperti v1, tetapi kini sebagai deskripsi sistem yang sudah ada:
mengirim riwayat, memilih model, menerima respons (streaming pada jalur
yang mendukung), membatalkan request, dan mengembalikan error
terstruktur.

### Streaming dan request lifecycle

-   Streaming dipakai pada jalur yang mendukungnya (lokal) dan menjadi
    target P1 untuk provider cloud.
-   Penggabungan chunk, respons kosong, koneksi terputus, timeout, dan
    rate limit sudah ditangani di jalur streaming; jalur non-streaming
    mengembalikan jawaban utuh atau error.
-   **Mencegah respons percakapan lama masuk ke percakapan lain** sudah
    punya fondasinya: `epoch` di `chat.rs` dinaikkan setiap reset dan
    jawaban yang tiba setelahnya dibuang. Ini yang dipakai untuk Stop
    (§7).
-   Jangan menampilkan reasoning/internal field sebagai jawaban biasa
    tanpa keputusan produk yang jelas.

------------------------------------------------------------------------

## 7. Penyimpanan, Persistensi Percakapan, dan Privasi

### Temuan (bukti kode, bukan asumsi)

Tidak ada database di repository ini. Yang sudah ada:

| Data | Lokasi | Sumber |
| ---- | ------ | ------ |
| Preferensi | `settings.json` di `config_dir()` = `%APPDATA%\Coucou` | `settings.rs:138` |
| Riwayat recap | `recap.json` di `local_dir()` = `%LOCALAPPDATA%\Coucou` | `recap.rs:688` |
| Log | `coucou.log`, direset di atas ~1 MB | `log.rs:15,23` |
| Berkas yang di-drop | `inbox/` di `local_dir()` | `files.rs:23` |
| Suara kustom | `sounds/` di `config_dir()` | `sounds.rs:19` |
| Status line sebelumnya | `statusline-previous.json` di samping relay | `hooks.rs:242` |
| Cache plan usage di halaman | `localStorage`, satu kunci saja | `views/usage.ts:64,77` |
| **Riwayat percakapan** | **tidak ada** — hanya memori proses | `chat.rs:49-63` |

Penting: `%APPDATA%\Coucou` dan `%LOCALAPPDATA%\Coucou` ditulis literal di
`platform/windows.rs`, **tidak** diturunkan dari `productName` atau
`identifier`. Jadi mengganti nama produk tidak otomatis memindahkan data
pengguna — itu keputusan terpisah (Lampiran A, Fase 7).

### Keputusan: riwayat percakapan sebagai JSON di `local_dir()`

-   Berkas `conversations.json` di `platform::local_dir()`, berdampingan
    dengan `recap.json` — konsisten dengan pola yang sudah ada.
-   Penulisan aman mengikuti pola yang sudah dipakai repo: tulis ke
    berkas sementara lalu `rename` (alasannya dijelaskan di komentar
    `hooks.rs:406-408`: pembaca tidak pernah melihat berkas separuh jadi).
-   Batas ukuran mengikuti pola `log.rs:23` (reset di atas ~1 MB),
    ditambah batas jumlah percakapan.
-   Yang disimpan: metadata percakapan, pesan pengguna dan assistant, dan
    provider/model per percakapan. **Tidak** menyimpan API key (sudah di
    keyring) dan tidak menyimpan isi berkas yang di-drop (hanya nama).
-   Format: **netral** (`{ role, content }`), bukan format wire provider
    mana pun — `chat.rs` memang sudah memelihara dua representasi
    (`native` + `plain`) dan `plain` dirancang untuk berpindah provider.
-   Penghapusan: harus ada aksi eksplisit "hapus percakapan" dan "hapus
    semua riwayat".

### Pembatalan (Stop) — `[BELUM]`

-   Belum ada command apa pun untuk ini. Rancangan: satu command
    `chat_cancel` yang menaikkan `epoch`, sehingga jawaban yang sedang
    dalam perjalanan dibuang saat tiba — pola yang sudah terbukti pada
    `Chat::reset`.
-   Pada jalur non-streaming efeknya adalah "batalkan dan buang
    hasilnya". Setelah streaming cloud (P1) dipasang, tombol yang sama
    menghentikan stream yang sedang terlihat.
-   UI: tombol Stop tampil selama request berjalan dan hilang setelah
    selesai; ini bagian dari view chat yang sudah ada.

### Kebijakan data

-   Jelaskan kapan pesan dikirim ke provider cloud: hanya ketika
    pengguna menekan kirim.
-   Jangan mengirim clipboard, teks terpilih, notifikasi, atau berkas
    secara otomatis tanpa tindakan pengguna. Perilaku ini sudah berlaku:
    konteks berkas/window hanya ikut pada turn pertama dan hanya atas
    tindakan pengguna.
-   Hindari mencatat prompt, respons, API key, dan konten sensitif ke
    log. Log yang ada mencatat peristiwa (hook, keputusan, poller), bukan
    isi percakapan — pertahankan itu.
-   Tentukan apakah percakapan dapat dihapus dan bagaimana (lihat di
    atas).
-   Jangan menjanjikan enkripsi menyeluruh bila belum dibuktikan.

------------------------------------------------------------------------

## 8. Arsitektur Konseptual

Ini adalah batas tanggung jawab yang diinginkan, bukan instruksi untuk
langsung memindahkan file atau membuat banyak package.

### Companion UI

Tanggung jawab:

-   Karakter dan status visual.
-   Panel chat.
-   Input dan tampilan respons.
-   Navigasi percakapan.
-   Pengaturan yang terlihat pengguna.

### Personal Assistant Core

Tanggung jawab:

-   Orkestrasi chat.
-   Pemilihan provider/model.
-   Lifecycle request dan streaming.
-   Persistensi percakapan.
-   Preferensi dan instruksi personal.
-   Validasi aksi serta kebijakan konfirmasi.

### Integration Adapters

Tanggung jawab:

-   Provider AI.
-   Global shortcut.
-   Windows notifications.
-   Clipboard/text selection.
-   Quick actions.
-   Integrasi agent Coucou yang sudah ada.

Adapter harus memiliki batas kegagalan yang jelas. Kegagalan integrasi
notifikasi, misalnya, tidak boleh membuat AI chat tidak dapat digunakan.

### Windows/Tauri boundary

Sebelum implementasi, identifikasi mana yang harus berjalan di
TypeScript/frontend dan mana yang membutuhkan Rust/native Windows.
Jangan memindahkan logika ke backend atau frontend hanya berdasarkan
preferensi; pilih berdasarkan kebutuhan keamanan, kemampuan API, dan
arsitektur yang sudah ada.

### Pemetaan ke modul yang benar-benar ada (v2)

Batas tanggung jawab di atas tidak perlu diciptakan; padanannya sudah ada
di repository:

| Batas tanggung jawab | Modul nyata |
| -------------------- | ----------- |
| Companion UI | `src/main.ts`, `src/island/*` (island.ts, fsm.ts, hooks.ts, shortcuts.ts, integrations.ts, desktop.ts), `src/views/*`, `src/ipin/*`, `src/settings/*`, `src/style.css`, tiga entry HTML |
| Personal Assistant Core | `src-tauri/src/chat.rs` (orkestrasi), `claude.rs`, `openai_compat.rs`, `local_chat.rs` (provider), `secrets.rs` (kredensial), `settings.rs` (preferensi) — **ditambah** modul baru untuk persistensi percakapan (nama belum ditetapkan) |
| Integration Adapters | `integrations.rs` + `github.rs` (service), `spotify.rs` (perlu sumber Windows, §18), `shortcuts.rs`, `tray.rs`, `sounds.rs`, dan jalur agent hook: `pipe.rs` + `hook/` |
| Windows/native | `platform/mod.rs` dengan `windows.rs` (Win32, WebView2, WMI-free), `webview_drop.rs`, `desktop.rs` |

Aturan pembagian yang dipakai repo dan harus dipertahankan:

-   **Kunci API dan token tidak pernah melintasi IPC**, dan berkas tidak
   pernah dibaca dari halaman: semuanya di Rust (`secrets.rs`,
  `chat.rs`).
-   **Halaman tidak boleh mengambil gambar dari internet.** CSP di
   `tauri.conf.json` hanya mengizinkan `img-src 'self' data: blob:`,
   sehingga cover Spotify **wajib** diambil di Rust lalu dikirim sebagai
   data URL — pola yang sudah dipakai jalur MPRIS lewat event
   `spotify-artwork`.
-   **Listener jaringan lokal bisa dibuat tanpa crate baru**: fitur
   `net` pada `tokio` sudah aktif di `src-tauri/Cargo.toml`, sehingga
   server loopback untuk redirect OAuth (§18) dapat memakai
   `tokio::net::TcpListener`.

------------------------------------------------------------------------

## 9. Memanfaatkan Repository Coucou

### Yang dipertahankan

-   Direktori macOS, Linux, dan bagian repository lainnya tetap ada.
-   Windows menjadi target utama pengembangan.
-   Kode macOS digunakan untuk mempelajari perilaku atau fitur yang
    lebih matang.
-   Fitur Coucou, hook, dan integrasi agent tetap dipertahankan kecuali
    ada alasan teknis yang terbukti.

### Cara memakai macOS sebagai referensi

Untuk setiap fitur yang ingin diadopsi:

1.  Identifikasi perilaku dan user flow pada implementasi macOS.
2.  Cari file dan komponen sumbernya.
3.  Pisahkan logika produk dari API khusus macOS.
4.  Periksa apakah fitur serupa sudah ada di implementasi Windows.
5.  Rancang implementasi Windows yang sesuai.
6.  Tambahkan tes dan verifikasi regresi.

Jangan menyalin kode platform-specific secara langsung tanpa memahami
dependensinya.

### Internal contract yang harus diperlakukan hati-hati

Audit dan jaga konsistensi pada:

-   Named pipe antara backend dan hook.
-   Nama executable hook dan marker kepemilikan.
-   Deteksi agent dan file konfigurasi plugin.
-   Marker file yang dihasilkan aplikasi.
-   Direktori penyimpanan pengguna.
-   Identifier keyring.
-   Payload integrasi.
-   Installer/uninstaller dan jalur cleanup.

Hindari global search-and-replace untuk semua string `Coucou`. Branding
UI, protokol internal, dan identifier penyimpanan merupakan kategori
berbeda. **Daftar konkret setiap nama beserta lokasinya ada di
Lampiran A**, dan itulah satu-satunya rujukan yang boleh dipakai saat
mengganti nama — bukan pencarian teks.

### Aset sementara

Aset Coucou boleh dipertahankan untuk pengembangan lokal sejauh sesuai
dengan lisensinya. Pisahkan referensi aset dari logika agar aset dapat
diganti nanti.

**Suara sudah orisinal.** 29 WAV dirender oleh `scripts/render-sounds.py`
dan tinggal di `windows/sounds/` dengan nama polos (`finish.wav`), jadi
`windows/` tidak lagi meminjam folder Mac dan nama yang terlihat user tidak
lagi berbunyi `peekNew`. Sisi Mac sengaja **tidak** disentuh:
`SoundEngine.soundNames`, `NotchBuddy/Resources/sounds/*New.wav`,
`project.yml`, `PhoneLink.swift`, dan `SettingsView.swift` tetap memakai
suffix `New`. Akibatnya nama berkas suara **berbeda antara dua aplikasi**
untuk konten yang sama — divergensi yang diterima, bukan bug. Karena
publikasi nanti memakai repo baru tanpa history yang isinya hanya
`windows/`, divergensi ini tidak ikut terkirim.

Sebelum redistribusi publik, baca lisensi source code dan lisensi aset
secara terpisah. Pertahankan atribusi dan pemberitahuan upstream yang
diwajibkan. Jangan menganggap seluruh aset otomatis dilisensikan sama
dengan source code.

------------------------------------------------------------------------

## 10. Rencana Implementasi per Fase

Aturan umum:

-   Satu fase = satu cabang dan satu rangkaian commit kecil. Setiap fase
    punya **kriteria sukses** dan **kondisi berhenti**.
-   Jangan menggabungkan dua fase yang menyentuh kontrak internal
    berbeda (Lampiran A).
-   Urutan disusun dari yang paling aman dan paling mudah dipulihkan.
    Ringkasnya: **(0) baseline → (1) buktikan build → (2) rebranding
    identitas → (3) persistensi & Stop → (4) DeepSeek → (5) Spotify →
    (6) hardening → (7) rename internal & aset orisinal → (8)
    publikasi.**
-   Alasan rebranding identitas dikerjakan lebih awal: ia perubahan
    paling berisiko rendah (tidak menyentuh satu pun kontrak internal),
    dan setelah selesai semua pengujian berikutnya memakai nama final —
    sehingga tidak ada pekerjaan yang harus diuji dua kali.

### Fase 0 --- Kondisi awal dan pencatatan Git

-   **Tujuan:** titik pulih yang pasti sebelum menyentuh apa pun.
-   **Cakupan file:** tidak ada (hanya Git dan catatan).
-   **Prasyarat:** tidak ada.
-   **Langkah:** catat `git status --porcelain` dan `git remote -v`;
    catat empat nilai versi (`tauri.conf.json`, `package.json`,
    `Cargo.toml`, `Cargo.lock`); catat `node -v`, `npm -v`, `cargo -V`,
    `rustc -V`; buat tag baseline dan cabang kerja; **commit direktori
    `plans/`** karena saat ini belum dilacak Git (jadi tidak ada riwayat
    file ini).
-   **Risiko:** rendah.
-   **Uji wajib:** — (tidak ada eksekusi kode).
-   **Kriteria sukses:** tag/cabang ada, nilai baseline tercatat,
    `plans/` masuk ke Git.
-   **Berhenti bila:** ada perubahan lokal yang tidak Anda ketahui
    asalnya.

### Fase 1 --- Verifikasi baseline dan penetapan smoke test regresi

-   **Tujuan:** membuktikan pohon asli membangun, menguji, dan memaketkan
    sebelum ada perubahan — dan menetapkan daftar "tidak boleh rusak".
-   **Cakupan file:** hanya artefak build (`windows/dist`,
    `windows/target`, `windows/release`).
-   **Prasyarat:** Fase 0.
-   **Langkah:** `npm ci`, `npx tsc --noEmit`, `npm test`,
    `cargo build --release -p coucou-hook`, `cargo test --workspace
    --locked`, `npm run pack`, `npm run tauri dev`. Lalu jalankan smoke
    test manual dan catat hasilnya: (a) island muncul serta bisa
    ditutup/dibuka, (b) menu tray lengkap, (c) Settings terbuka,
    (d) suara berbunyi, (e) hook Claude Code terpasang dan kartu
    approval muncul, (f) shortcut global bekerja, (g) recap terbuka.
-   **Risiko:** `npm run pack` butuh unduhan toolchain NSIS/WiX.
-   **Uji wajib:** seluruh perintah di atas; `dist/sounds/*.wav`
    berjumlah 29; `windows/release/` berisi dua installer.
-   **Kriteria sukses:** semua lulus **tanpa mengubah kode**; hasilnya
    dicatat sebagai baseline.
-   **Berhenti bila:** ada kegagalan pada pohon yang belum disentuh —
    perbaiki lingkungan dulu (MSVC, WebView2, atau versi Node).

### Fase 2 --- Rebranding identitas

**SELESAI.** Dikerjakan sebagai dua langkah supaya perubahan metadata
yang murah tidak tercampur dengan perubahan teks yang menyentuh
generator dan puluhan call site.

#### Fase 2a --- metadata dan teks yang bukan hasil generator

-   **Status:** selesai (commit `f67dd20`, 10 file).
-   **Cakupan:** `tauri.conf.json` (`productName` = DapinCi, `identifier`
    = `io.github.dafinci.dapinci`, copyright, deskripsi bundle, judul
    window island), `package.json` (nama paket `dapinci`), `index.html`,
    `settings.html`, `src/settings/main.ts` (header merek, literal),
    `src-tauri/src/tray.rs` (tooltip + id tray), `src/recap/share.ts`
    (footer gambar recap), `scripts/pack.mjs` (nama artefak Windows),
    `.github/workflows/windows.yml` (nama artifact, path upload, judul
    rilis).
-   **Temuan yang sudah diverifikasi (jangan diambil dari asumsi):**
    binary release **tetap `coucou.exe`** setelah `productName` berubah
    menjadi DapinCi. Tauri menamai binary dari nama crate, bukan dari
    `productName`; hanya installer dan nama terpasang yang memakai
    `productName` (`DapinCi_0.3.0_x64-setup.exe`). Karena itu path
    artefak portable di `windows.yml` tidak berubah. Catatan ini sudah
    ditulis sebagai komentar di workflow itu sendiri, dan akan berubah
    bersama nama crate di Fase 7.
-   **Risiko (tetap berlaku):** `identifier` mengubah folder user-data
    WebView2 sehingga `localStorage` (satu kunci) ter-reset — tidak
    berbahaya. Nama entri autostart mengikuti nama aplikasi; bila
    autostart pernah aktif, entri lama bisa tertinggal. DapinCi
    terpasang **berdampingan** dengan Coucou, bukan sebagai upgrade.
    Direktori data pengguna tidak ikut berpindah (masih
    `%APPDATA%\Coucou`; itu Fase 7).

#### Fase 2b --- teks merek di dalam lapisan terjemahan

-   **Status:** selesai (commit `8255344`, 18 file).
-   **Kenapa bukan cari-ganti biasa:** `i18n.test.mjs` menuntut (a)
    `strings.json` persis sama dengan hasil `generate(katalog Mac)` dan
    (b) setiap string yang dipakai kode ada di tabel, lengkap di sepuluh
    bahasa. Karena kunci tabel adalah teks Inggrisnya sendiri, mengganti
    merek berarti mengubah kunci — jadi satu-satunya cara yang konsisten
    adalah menggantinya di generator.
-   **Cara yang dipakai:** `scripts/gen-strings.mjs` mendapat fungsi
    `brand()` yang mengganti kata `Coucou` menjadi `DapinCi` (batas kata,
    peka huruf besar/kecil) pada kunci **dan** nilai, di semua bahasa;
    `extra.json` dikenai substitusi teks yang sama; lalu 23 call site
    (`t`, `tf`, `n_`) di TypeScript dan Rust mengikuti, ditambah string
    yang memang tidak diterjemahkan: nama berkas recap mingguan, header
    `User-Agent` integrasi, pesan status Codex, baris log, dan judul
    window Settings.
-   **Yang sengaja TIDAK diganti, dan alasannya:**
    -   `coucou` huruf kecil (90 kemunculan): bagian dari path dan nama
        berkas milik relay — `coucou-hook`, `plugins/coucou.js`,
        `copilot/hooks/coucou.json`, `~/.claude/coucou/nb-hook`. Berubah
        di Fase 7 bersama berkasnya (Lampiran A).
    -   `GENERATED` (`agents.rs`) dan isi berkas plugin yang dihasilkan:
        penanda kepemilikan yang dibaca saat memperbarui/menghapus
        berkas milik kita. Fase 7.
    -   Nama karakter: **selesai**. Karakter bernama **ipin**; 4 string UI
        (+9 bahasa), nama di label balasan chat, prompt sistem, judul
        window, dan label/page/modul window desktop semuanya berganti.
    -   Direktori data, service keyring, nama crate, nama pipe, identifier
        Linux: Fase 7 (Lampiran A).
-   **Verifikasi:** `npx tsc --noEmit` bersih; **361/361** tes Node;
    **243** tes Rust; `npm run pack` menghasilkan
    `DapinCi-Windows-*.exe` dan `*.msi`; setelah substitusi, tabel i18n
    tidak lagi memuat kata `Coucou` (0) dan jumlah kunci tetap 401
    (tidak ada kunci yang bertabrakan).

**Sisa untuk Fase 8:** dokumentasi (`README.md`, `windows/README.md`,
`CLAUDE.md`, `docs/*.html`), `linux/arch/*`, komentar provenance di dalam
kode, serta aset (screenshot, suara, ikon, karakter).

### Fase 3 --- Persistensi percakapan dan Stop/cancel

**SELESAI** (commit `9e3a7c8`, 9 file: 1 baru, 8 diubah).

-   **Tujuan:** menutup dua gap P0 yang benar-benar belum ada di kode.
-   **Kepemilikan data (ditetapkan):** halaman memiliki **isi** transkrip
    dan menyimpannya setelah setiap turn — pertanyaan disimpan sebelum
    jawabannya ada, sehingga crash atau Stop meninggalkan pertanyaan,
    bukan chat kosong. Rust memiliki **berkasnya**: `conversations.json`
    di `local_dir()`, bentuk datanya, batasnya, dan cara menulisnya.
    Halaman tidak pernah menyentuh jalur berkas.
-   **Modul baru `src-tauri/src/history.rs`:** daftar percakapan (terbaru
    dulu), `save_current`, `start_new`, `delete`, `clear`, `current_turns`
    (untuk restore), dengan batas 20 percakapan / 400 pesan per percakapan
    / 20 000 karakter per pesan / 1 MB per berkas; berkas rusak dibaca
    sebagai riwayat kosong, bukan kesalahan. Penulisan memakai ulang
    helper tulis-lalu-rename milik `config_file::replace` (yang kini
    `pub(crate)`) — jadi hanya ada satu implementasi penulisan atomik.
-   **Restore saat launch:** `Chat::restore(history::current_turns())` di
    `lib.rs` setup mengisi `plain` di `chat.rs`, sehingga percakapan yang
    tampil di layar adalah percakapan yang dilanjutkan model. `native`
    dibiarkan kosong dan tanpa pemilik, jadi `begin()` pertama
    mengisinya — jalur konversi antar-provider yang sudah ada.
-   **"New chat" tidak menghapus apa pun:** `chat_reset` tetap menaikkan
    epoch (konteks model) dan sekarang juga mengarsipkan percakapan yang
    sedang tampil lewat `history::start_new()`.
-   **Stop:** command `chat_cancel` menaikkan epoch, sehingga jawaban yang
    mendarat setelahnya ditolak `commit`. Di halaman, tombol kirim
    berubah menjadi Stop selama jawaban berjalan (ikon `stop` baru,
    judul memakai kunci "Cancel" yang sudah ada di katalog — tidak ada
    terjemahan baru yang dibuat), dan `ticket` internal membuang jawaban
    yang datang terlambat sehingga tidak pernah masuk transkrip.
-   **Pemilih riwayat: SELESAI menyusul, commit `77e99af`.** Fase 3
    sengaja berhenti di API (`chat_history`, `chat_save`, `chat_delete`,
    `chat_clear`) dan meninggalkan layarnya; itu ditutup sekarang, sesuai
    §4.2. Tombol di kartu chat membuka daftar: tiap baris dinamai pesan
    pertama yang ditanyakan di percakapan itu, diberi tanggal, ditandai
    kalau ia yang sedang tampil, dan bisa dihapus per baris. Membukanya
    bukan sekadar menampilkan teksnya: `chat_open` memindahkan percakapan
    itu ke depan arsip **dan** mengembalikan turnnya ke model lewat
    `Chat::adopt`, sehingga jawaban berikutnya melanjutkan percakapan itu
    — bukan mulai dari nol.
    `adopt` menggantikan `restore`: ia menaikkan epoch (jawaban yang
    masih di jalan mendarat di percakapan asalnya) dan, tidak seperti
    `restore`, ia **tidak** menolak mengganti konteks yang ada — justru
    itulah yang dibutuhkan saat membuka percakapan lain.
    Dua string baru (`History`, `No conversations yet.`) lengkap di
    sepuluh bahasa. "Hapus semua riwayat" belum ada tombolnya: command
    `chat_clear` sudah siap, tapi menghapus seluruh riwayat butuh langkah
    konfirmasi yang belum kita rancang — lebih baik tidak ada tombol
    daripada tombol yang menghapus tanpa bertanya.
    Verifikasi: `tsc` bersih, **367/367** tes Node (empat tes baru: daftar
    terurut dan bertanda, membuka, menghapus, keadaan kosong), **272**
    tes Rust, `npm run pack` hijau.
-   **Keterbatasan yang disadari:** pesan panjang dipotong 20 000
    karakter di berkas; provider/model tidak disimpan per percakapan
    (percakapan yang dipulihkan memakai provider/model dari Settings saat
    itu) — keduanya disengaja untuk menjaga berkas dan bentuk datanya
    sederhana.
-   **Verifikasi:** `npx tsc --noEmit` bersih; **363/363** tes Node (dua
    tes baru: Stop membuang jawaban yang terlambat, dan transkrip
    dipulihkan lalu disimpan setiap turn); **251** tes Rust (8 tes baru
    untuk `history`, termasuk batas dan berkas rusak); `npm run pack`
    hijau.
-   **Belum diverifikasi (butuh aplikasi berjalan):** tutup → buka →
    riwayat utuh, dan tombol Stop di UI nyata. Itu bagian verifikasi
    manual.

### Fase 4 --- Provider DeepSeek (Opsi 1, non-streaming)

**SELESAI** (commit `3cb962a`, 6 file).

-   **Koreksi terhadap rencana awal: empat tempat, bukan tiga.** Selain
    `openai_compat.rs`, `providers.ts`, dan allow-list `secrets.rs`,
    provider cloud juga harus terdaftar di `CLOUD` pada
    `src/settings/main.ts` — tanpa itu tidak ada tempat mengetik kunci di
    Settings, dan aplikasi hanya akan bilang "API key missing". Kedua
    tempat itu sekarang punya penjaga: tes Rust yang sudah ada
    menegaskan setiap key provider ada di `KNOWN_KEYS`, dan `CLOUD`
    diberi komentar bahwa provider baru di `providers.ts` harus muncul di
    sana.
-   **Nilai yang dipakai:** base `https://api.deepseek.com/v1`, key
    `deepseek-api-key`, model default `deepseek-chat`,
    `models_path = "models"`, `max_tokens_field = "max_tokens"`,
    filter `not_chat = ["embed"]`.
    **BELUM TERVERIFIKASI terhadap API hidup:** base URL, id model, dan
    nama field token — ketiganya dari dokumentasi, dan itu ditulis apa
    adanya sebagai komentar di tabel provider. Kegagalan paling ringan
    (model default salah) bisa ditutup oleh picker: daftar dari `/models`
    yang menang. Kegagalan terburuk adalah error 400 dari API bila nama
    field token salah.
-   **Posisi di picker: setelah Anthropic, bukan pertama.** `providerDef()`
    jatuh ke entri pertama untuk id yang tidak dikenal (settings.json dari
    versi lain), dan fallback itu selama ini Claude; menaruh DeepSeek di
    posisi pertama akan diam-diam mengubah perilaku itu. Urutan chip
    menjadi Anthropic, DeepSeek, Google, OpenAI, OpenRouter.
-   **Tes yang ikut disesuaikan:** daftar id PROVIDERS dan urutan
    `visibleProviders` di `tests/providers.test.mjs`, satu assertion baru
    untuk `prefer` DeepSeek (memilih `deepseek-chat` di antara dua model
    yang ditawarkan), dan tes pemilih di `tests/chat.test.mjs` yang
    sebelumnya memilih chip **berdasarkan indeks** — sekarang memilih
    berdasarkan nama, supaya menambah provider tidak pernah menggeser
    target tes itu.
-   **Verifikasi:** `npx tsc --noEmit` bersih; **363/363** tes Node;
    **251** tes Rust; `npm run pack` hijau.
-   **Sisa untuk verifikasi manual (butuh kunci DeepSeek sungguhan):**
    simpan kunci di Settings → Chat providers, pilih DeepSeek di pemilih
    model, kirim satu pesan, terima jawaban. Yang belum terbukti adalah
    perilaku endpoint DeepSeek sendiri, bukan pengkabelannya.
-   **Ditunda (opsional):** pil `ai_deepseek` di katalog pil. Presedennya
    sudah ada — OpenRouter adalah provider chat yang juga **tidak** punya
    pil dan tetap bisa dipakai — dan katalog pil adalah kontrak yang
    di-port dari Mac, jadi menambah pil adalah keputusan produk, bukan
    syarat agar chat berfungsi.

### Fase 5 --- Spotify di Windows (Opsi B, Web API)

Dibagi lima langkah kecil yang masing-masing bisa diuji sendiri:

-   **5a — PoC OAuth. SELESAI (kode) — commit `08fbe50`.** Modul baru
    `src-tauri/src/spotify_auth.rs`: verifier + challenge S256, URL
    authorize, socket loopback yang menerima balikan browser (state
    diperiksa sebelum kode diteruskan), penukaran kode sebagai form post
    **tanpa client secret**, dan satu pembacaan `/me/player` untuk
    membuktikan tokennya benar-benar bekerja. Port `8765` dan jalur
    `/callback` adalah konstanta: Spotify mencocokkan redirect URI persis,
    jadi nilai ini hanya boleh berubah bersama dashboard.
    **Delapan tes lulus tanpa menyentuh Spotify**, termasuk vektor
    contoh RFC 7636, socket loopback sungguhan, pemeriksaan state yang
    salah, dan body token exchange yang dibaca dari soket buatan sendiri.
    Dua dependency langsung ditambahkan (`sha2`, `getrandom`) pada versi
    yang **sudah ada di pohon** lewat reqwest dan rustls — lockfile
    bertambah dua baris dan tidak ada paket baru yang diunduh; `base64url`
    ditulis tangan seperti `claude.rs` sudah menulis base64.
    **Pembuktian online: LULUS** (11 Oktober 2026, dijalankan dengan
    Client ID sungguhan). Bukti yang tercatat: kode OAuth 366 karakter
    diterima di `127.0.0.1:8765/callback` — jadi **redirect URI di
    dashboard persis sama dengan yang dibangun kode**; kode ditukar jadi
    access token (259 karakter) **dan refresh token**; `expires_in` =
    3600 detik; kedua scope diberikan; `GET /me/player` menjawab **204**
    alias tokennya benar-benar berlaku. Sebelumnya Client ID juga
    diverifikasi terpisah lewat endpoint token (ID dikenal → balasan
    `invalid_grant`, sedangkan ID palsu → `invalid_client`), supaya tidak
    ada salah ketik yang ikut terbukti.

    Catatan untuk 5b/5c: **Spotify mengembalikan scope dalam urutannya
    sendiri** (`user-modify-playback-state user-read-playback-state`),
    jadi scope tidak boleh dibandingkan sebagai string literal. Tes itu
    sengaja `#[ignore]` karena butuh Client ID dan browser; dijalankan
    dengan tangan:

    ```powershell
    cd C:\projects\dapinci\windows
    $env:DAPINCI_SPOTIFY_CLIENT_ID = "<client id>"
    cargo test -p coucou --lib the_whole_login -- --ignored --nocapture
    ```

    Tes itu tidak mencetak nilai token, hanya jumlah karakternya,
    keberadaan refresh token, `expires_in`, `scope`, dan status
    `/me/player`. Token dari percobaan pembuktian itu tidak disimpan —
    semuanya hidup hanya di dalam proses tes, jadi login sekali lagi akan
    diperlukan saat 5b selesai.
    Catatan scope: `user-read-currently-playing` sengaja **tidak**
    diminta — Spotify sudah memasukkannya ke `user-read-playback-state`,
    dan endpoint yang dipakai adalah `/me/player`.
-   **5b — Penyimpanan token. SELESAI — commit `ec43702`.** Bagian
    **Spotify** di Settings: tempel Client ID aplikasi Anda sendiri, tekan
    **Connect** (menjalankan alur 5a dari dalam aplikasi), dan **Disconnect**
    untuk menghapusnya. Pasangan `{ clientId, refreshToken }` disimpan
    sebagai **satu entri** credential store (`spotify-login`, terdaftar di
    `KNOWN_KEYS`) — satu entri karena Spotify menerbitkan refresh token
    *untuk* client tertentu, dan memisahkan keduanya mengundang kegagalan
    yang tampak seperti korupsi. Konsekuensinya disadari: store bersifat
    write-only bagi halaman, jadi Settings hanya bisa menanyakan "ada
    login atau tidak", tidak menampilkan kembali Client ID-nya.
    `Session` menyerahkan access token, memperpanjangnya dari login
    tersimpan saat token di memori habis — **satu menit lebih awal**,
    `expires_in` dikurangi 60 detik — dan ikut menyimpan refresh token
    baru bila Spotify merotasinya. Token di memori juga diikat ke Client
    ID-nya, jadi menyambung ulang dengan aplikasi lain tidak akan memakai
    ulang token lama.
    Sembilan string baru ikut masuk dalam sepuluh bahasa — **tiga di
    antaranya adalah error yang sudah dikembalikan modul 5a dalam bahasa
    Inggris**; tes kelengkapan terjemahan akan menangkapnya kalau tes itu
    dijalankan pada langkah itu, dan itu terlewat. Sudah diperbaiki.
    Tes baru: pasangan tersimpan terbaca atau dianggap tidak ada,
    aritmetika umur token, dan permintaan refresh yang dibaca dari soket
    (tanpa client secret, token yang dirotasi diterima).
    Verifikasi: `tsc` bersih, **363/363** tes Node, **262** tes Rust,
    `npm run pack` hijau.
    **Belum diverifikasi di aplikasi berjalan:** menekan Connect di
    Settings sungguhan (butuh mata Anda — lihat uji manual di bawah).
-   **5c — Status dan artwork. SELESAI — commit `5e890ad`.** Submodul
    baru `src-tauri/src/spotify/web.rs` (di dalam modul `spotify`,
    mengikuti pola `platform/`): memetakan `/me/player` ke `PlayerState`
    yang sama seperti jalur MPRIS — URI Spotify sebagai id, artis
    digabung dengan cara Mac, `show` milik episode dibaca sebagai album,
    cover terbesar, volume di-clamp. Membedakan 204 (tidak ada yang
    diputar), 404 (tidak ada perangkat), **401 (buang token, minta yang
    baru, coba sekali lagi)**, 403 (Premium) dan 429 (menunggu sesuai
    `Retry-After`, dibatasi 120 detik). Cover diambil di Rust lalu dikirim
    sebagai data URL, karena CSP halaman melarang gambar jarak jauh.
    Poller berjalan **hanya saat pil dinyatakan** dan **tidak menyentuh
    jaringan sama sekali saat aplikasi dijeda**; `sync(on)` menaikkan
    penghitung generasi, dan itulah yang menghentikannya. Interval 4
    detik saat diputar, 15 detik saat tidak. Dua string baru ikut
    diterjemahkan ke sepuluh bahasa.
    Verifikasi: `tsc` bersih, **363/363** tes Node, **266** tes Rust
    (pemetaan lengkap, setiap status jawaban Spotify lewat soket
    sungguhan, dan permintaan bacaannya sendiri), `npm run pack` hijau.
    **Belum bisa dilihat di aplikasi:** pil Spotify masih terkunci
    Linux-only sampai 5e, jadi poller tidak akan pernah menyala.
    Buktinya sementara lewat tes manual `the_player_is_read_over_the_web_api`
    (butuh login tersimpan; jalankan dengan `--ignored`) yang mencetak
    apa yang akan dilihat poller — judul, artis, album, posisi, volume,
    shuffle, repeat — dan membuktikan cover datang sebagai data URL.
    Urutan 5d → 5e tetap: menyalakan pil sebelum kontrolnya bekerja akan
    menampilkan tombol yang diam saja, dan itu jenis kegagalan senyap
    yang justru ingin dihindari.
-   **5d — Kontrol. SELESAI — commit `89e399d`.** Setiap aksi dari kartu
    dan pil menjadi panggilan yang Web API minta: `PUT play`/`pause`,
    `POST next`/`previous`, `PUT seek?position_ms=`, `shuffle?state=`,
    `repeat?state=context|off` (toggle kartu = melooping konteks, aturan
    Mac), `volume?volume_percent=` di-clamp 0–100, dan seek negatif
    berarti awal track.
    `playPause` **membaca pemutar dulu**: API tidak punya toggle,
    sedangkan halaman sudah membalik salinannya sendiri secara optimistis,
    jadi tidak ada cara lain mengetahui klik ini artinya play atau pause.
    Token yang ditolak (401) dibuang lalu panggilan diulang sekali.
    **Degradasi yang terlihat:** penolakan yang bisa ditindaklanjuti
    pengguna — akun Free (403), tidak ada yang diputar di perangkat mana
    pun (404) — dikirim ke island sebagai `spotify-note` dan ditampilkan
    di kartu note yang sama dengan error chat, lalu ditarik kembali
    setelah 2,4 detik. Sisanya cukup jadi baris log.
    Juga di sini: `spotify_installed` (instalasi per-user dan alias
    Microsoft Store — inilah yang dipakai Settings untuk bilang "Not
    installed") dan `spotify_open` (jalankan aplikasinya kalau ada, kalau
    tidak buka halaman unduh).
    **`DOWNLOAD_URL` dinaikkan dari 5e ke sini**, karena kode inilah yang
    memakainya: sekarang tiap platform punya halamannya sendiri, dan
    sebelumnya Windows akan membuka halaman unduh Linux.
    Satu kesalahan nyata tertangkap tes saat menulis ini:
    `query_pairs_mut()` pada daftar kosong menyisakan tanda `?`
    menggantung di URL `next`/`pause`.
    Verifikasi: `tsc` bersih, **363/363** tes Node, **269** tes Rust
    (setiap aksi diperiksa method, path dan query-nya, plus satu kontrol
    nyata yang dibaca dari soket), `npm run pack` hijau. Tiga tes manual
    bertanda `--ignored` sekarang tersedia: login penuh, refresh dari
    login tersimpan, baca pemutar, dan **satu kontrol yang tidak
    mengubah apa pun** (volume disetel ke nilai yang sudah dipakai).
-   **5e — Membuka gate. SELESAI — commit `59ca244`.** `support` pil jadi
    `yes` (kedua build) dan `connect` memakai **bentuk kelima** yang
    diusulkan di §18: `{ kind: "login", key: "spotify-login" }`. Pil ini
    terhubung karena **login**, bukan karena kunci, jadi tipenya mengatakannya
    dengan jujur alih-alih meminjam `key`.
    Tiga tes di `windows/tests/pills.test.mjs` yang mengunci Spotify
    sebagai Linux-only ditulis ulang: sekarang kedua build hanya berbeda
    satu pil (Claude Desktop), dan pil yang memang tidak ditawarkan build
    ini (Apple Music) tetap dibuang dari deklarasi.
    Bagian Settings untuk login dibatasi ke Windows — Linux membaca
    pemutar lewat MPRIS dan tidak perlu disetel apa pun.
    Bentuk `connect` yang baru **menangkap satu celah nyata**, bukan
    kosmetik: `island/integrations.ts` memakai `switch` atas
    `connect.kind` tanpa cabang untuknya, sehingga "connected" versi
    island akan tertinggal sebagai variabel yang tidak pernah diberi
    nilai. `tsc` menolaknya, dan itulah gunanya menambah bentuk
    ketimbang meminjam yang sudah ada.
    Tiga komentar yang menyatakan Windows belum punya sumber musik ikut
    diperbarui.
    Verifikasi: `tsc` bersih, **363/363** tes Node, **269** tes Rust,
    `npm run pack` hijau.

**Fase 5 selesai seluruhnya.** Yang tersisa hanya verifikasi langsung di
aplikasi berjalan — dan itu memang tidak bisa dikerjakan dari sini:

1. Settings → Integrations → nyalakan sakelar **Spotify**.
2. Settings → Spotify → tempel Client ID → **Connect** (kalau belum).
3. Putar sesuatu: pil menampilkan judul track, cover muncul di kartu, dan
   ipin menari.
4. Coba kontrolnya: play/pause, next, previous, seek, volume, shuffle,
   repeat. Akun Free akan memunculkan kartu note "Premium diperlukan" —
   itu degradasi yang diminta, bukan kerusakan.
5. Matikan sakelar pil: poller berhenti (tidak ada permintaan lagi), dan
   `coucou.log` tidak lagi menyebut Spotify.

Apa yang belum diverifikasi dan mengapa: **seluruh poller hanya bisa
dibuktikan sekarang**, karena sebelumnya pilnya tidak bisa dinyalakan.
Empat tes manual bertanda `--ignored` tetap berguna sebagai pemeriksaan
terpisah (login penuh, refresh dari login tersimpan, baca pemutar, satu
kontrol yang tidak mengubah apa pun).

**Perbaikan pasca-5e (commit `b3b7dbf`).** Tujuh kontrol tidak berfungsi
sama sekali di akun Premium. Penyebabnya bukan token, cakupan, atau
pengkabelan — log aplikasi menunjukkan 40 kegagalan berturut-turut dengan
satu bentuk yang sama: **HTTP 411 Length Required**. Permintaan kontrol
tanpa body keluar dari reqwest tanpa `Content-Length` maupun
`Transfer-Encoding`, dan front-end Spotify menolak permintaan seperti
itu sebelum memeriksa apa pun. Buktinya di tingkat wire diambil dari
soket palsu di tes: permintaan hanya membawa `authorization`, `accept`,
dan `host`. Perbaikannya satu header eksplisit (`Content-Length: 0`),
dan tes soket sekarang mengasrtikannya — itulah assertion yang seharusnya
menangkapnya sejak awal.

Dua hal membuat kegagalan ini tidak terlihat, dan keduanya diperbaiki
bareng:

1. Hanya 403 dan 404 yang diucapkan; penolakan lain hanya jadi baris log
   yang tidak dibaca siapa pun. Sekarang **setiap** penolakan kontrol
   diucapkan di kartu note, dengan kode status untuk kasus yang tidak
   bisa kita beri nama.
2. Body error HTML ditulis utuh ke log, sehingga satu kegagalan menjadi
   delapan baris dan merusak format log satu-baris-per-peristiwa. Detail
   sekarang diratakan dan dipotong.

**Bukti perbaikan:** kontrol manual yang sama, yang sebelumnya dijawab
**411**, sekarang dijawab **404 (tidak ada perangkat aktif)** — artinya
Spotify sudah membaca dan mengautentikasi permintaannya lalu sampai ke
logika pemutar. Verifikasi: `tsc` bersih, **363/363** tes Node, **271**
tes Rust, `npm run pack` hijau.

**Perbaikan kedua pasca-5e (commit `2cffc96`).** Setelah 411 hilang,
kontrolnya bekerja semua **kecuali volume**, yang menjawab 403 dengan
pesan kartu "Premium is needed to control playback" — padahal akunnya
Premium. Sebabnya: **403 di Spotify mencakup lebih dari satu hal**, dan
alasannya ada di body. Akun Free ("Premium required") dan perangkat yang
menolak perubahan volume ("Cannot control device volume", kasus khas
ponsel dan Web Player) sama-sama menjawab 403. Pesan sekarang mengikuti
alasan yang Spotify berikan; 403 yang tidak bisa kita namai menyebut kode
statusnya alih-alih menebak; dan satu tes mengunci kasus ponsel itu supaya
akun Premium tidak pernah lagi diberi tahu bahwa ia butuh Premium.
Yang perlu dicatat sebagai perilaku, bukan bug: **volume adalah satu-satunya
kontrol dengan batas perangkat.** Aplikasi Spotify sendiri mematikan slider
volume untuk perangkat seperti itu, dan Web API mengikuti aturan yang sama.

Dokumentasi yang perlu diperbarui di Fase 8: `README.md` dan
`windows/README.md` masih menyatakan Spotify hanya untuk Linux.
-   **Cakupan file:** `src-tauri/src/spotify.rs` (dibuat sadar-platform
    mengikuti pola `platform/mod.rs`), satu modul OAuth baru,
    `src-tauri/src/secrets.rs`, `src/core/pills.ts`, `src/core/state.ts`,
    `windows/tests/pills.test.mjs`, `src/i18n/extra.json`.
-   **Prasyarat:** Fase 1; Client ID Spotify dibuat di dashboard
    pengembang.
-   **Risiko:** lihat §16; yang terbesar adalah kuota/dev-mode Spotify
    dan penanganan refresh token.
-   **Uji wajib:** tes unit pemetaan respons → `SpotifyState`
    (termasuk 204 = tidak ada yang diputar, 403 = bukan Premium, 404 =
    tidak ada perangkat aktif); `npm test` hijau setelah assertion
    diperbarui; uji manual: track tampil, dance jalan, kontrol bekerja.
-   **Kriteria sukses:** pil Spotify berfungsi di Windows tanpa
    mengorbankan satu pun fitur lain.
-   **Berhenti bila:** 5a gagal (loopback redirect ditolak Spotify) —
    jangan lanjut sebelum alur auth terbukti.

### Fase 6 --- Hardening, packaging, dan dokumentasi

-   **Tujuan:** siap dipakai harian dan dipaketkan dengan benar.
-   **Langkah:** ulangi seluruh smoke test Fase 1; `npm run pack`;
    pasang installer di lingkungan bersih; uji uninstaller (termasuk
    `nsis/hooks.nsh` yang menghapus `bin/`, `inbox/`, dan log);
    dokumentasikan konfigurasi, privasi, dan pemulihan; catat konsumsi
    memori dan perilaku startup.
-   **Uji wajib:** instalasi bersih, upgrade dari versi sebelumnya,
    uninstall bersih, `%USERPROFILE%\.claude\settings.json` tidak
    tersentuh oleh uninstaller.
-   **Kriteria sukses:** instalasi/upgrade/uninstall dapat
    dipertanggungjawabkan; dokumentasi selesai.
-   **Berhenti bila:** uninstaller menghapus berkas milik pengguna.

**Status (2026-10-12):** dipecah empat supaya tiap bagian bisa ditinjau
sendiri.

| Sub | Isi | Status |
| --- | --- | --- |
| 6a | Fakta + merek di `windows/README.md`, plus bagian baru: Spotify, lokasi data, privasi, pemulihan, sisa nama, kredit | **Selesai** |
| 6b | Screenshot baru untuk `windows/screenshots/` (7 gambar masih menampilkan karakter Mochi lama) | Belum — menunggu tangkapan pemilik proyek |
| 6c | Halaman depan `README.md`, `CLAUDE.md`, issue template | **Selesai** |
| 6d | Verifikasi installer: NSIS **selesai** (pasang, pasang ulang, uninstall); MSI belum | Sebagian — hasil dan temuannya di bawah |

**Hasil 6d (NSIS, 2026-10-12).** Terbukti: pemasangan silent (`/S`)
berhasil dan menaruh `coucou.exe`, `coucou-hook.exe`, dan `uninstall.exe`
di `%LOCALAPPDATA%\DapinCi`; entri uninstall bertuliskan `DapinCi` 0.3.0;
shortcut Start-menu dibuat; memasang ulang di atas versi yang sama tidak
membuat entri ganda; uninstall menghapus folder terpasang, `bin/`,
`inbox/`, `coucou.log`, entri registry, dan shortcut — sementara
`conversations.json`, `recap.json`, dan `%APPDATA%\Coucou\settings.json`
**bertahan**. `%USERPROFILE%\.claude\settings.json` **tidak berubah**
(hash SHA-256 sama sebelum dan sesudah). Yang paling penting: sesudah
uninstall menghapus `bin/`, pemasangan baru + sekali jalan benar-benar
membuat ulang `bin\coucou-hook.exe` dari resource yang ikut terpasang,
dengan hash identik — membuktikan relay memang terkirim, persis kegagalan
yang diperingatkan komentar di `hooks.rs`.

**Temuan 6d yang perlu diperbaiki:**

| # | Temuan | Dampak | Perbaikan |
| - | ------ | ------ | --------- |
| 1 | Publisher installer terbaca **`github`** | Di "Apps & features" tertulis *Publisher: github*, dan kunci registry aplikasi mendarat di `HKCU\Software\github\DapinCi` | Set `bundle.publisher` (mis. `DafinCi`) di `tauri.conf.json` |
| 2 | Uninstaller meninggalkan kunci `HKCU\Software\<publisher>\<Nama Produk>` | Sisa kecil di registry; di mesin uji tertinggal **dua** kunci: `…\github\DapinCi` dan `…\DafinCi\DapinCi` | **Tidak** hilang setelah #1 diperbaiki — ini bawaan template NSIS Tauri. Bersihkan manual, atau terima |
| 3 | Entri hook di `.claude\settings.json` tetap menunjuk relay yang sudah dihapus | Antara uninstall dan menjalankan DapinCi lagi, hook gagal — **memang disengaja** (`nsis/hooks.nsh`), tetapi belum terdokumentasi | Catat di `windows/README.md` |

**Batasan:** ini bukan lingkungan bersih (tanpa VM atau profil Windows
baru), dan kaki "upgrade" hanya memasang versi yang sama di atas dirinya
sendiri — belum ada versi lama untuk diuji. MSI belum diuji.

**Perbaikan temuan #1 sudah diuji (2026-10-12).** `bundle.publisher` diset
`DafinCi`, installer dibangun ulang, lalu dipasang dan di-uninstall lagi
lewat siklus penuh. Hasilnya: entri uninstall kini menulis
**Publisher: DafinCi**, dan kunci aplikasi mendarat di
`HKCU\Software\DafinCi\DapinCi`. Relay tetap dibuat ulang dari nol dengan
hash yang sama (`53FE2207…`). Temuan #2 ternyata **tidak** ikut hilang:
template NSIS Tauri meninggalkan kunci
`HKCU\Software\<publisher>\<Nama Produk>` untuk kedua nilai publisher.

Temuan 6a yang perlu diingat: dokumentasinya bukan hanya salah merek,
tetapi juga **salah fakta** — "Spotify hanya di Linux" dan "dance hanya di
Linux" sudah tidak benar sejak Fase 5, dan nama installer di README masih
`Coucou-Windows-*`. Inti Fase 6 karena itu adalah memastikan dokumen
**benar**, bukan sekadar berganti nama.

### Fase 7 --- Rename kontrak internal dan aset orisinal (gated)

Fase ini **hanya** dikerjakan bila DapinCi akan dipublikasikan, dan harus
dilakukan satu kontrak per commit dengan uji hook di antaranya.

-   **Tujuan:** menghilangkan sisa identitas Coucou dari aplikasi yang
    dipublikasikan.
-   **Cakupan file:** Lampiran A (nama relay + 3 marker + allow-list
    deteksi, nama pipe/socket, nama direktori data + `nsis/hooks.nsh`,
    `SERVICE` keyring, nama crate + `main.rs`), plus penggantian aset
    (ikon, 29 suara, karakter).
-   **Prasyarat:** Fase 6 lulus; aset orisinal sudah siap.
-   **Langkah:** mulai dari yang paling berisiko rendah: direktori data
    (dengan migrasi atau reset yang disadari) → `SERVICE` keyring →
    nama relay + marker → nama pipe. Setiap langkah diikuti uji hook
    nyata.
-   **Risiko:** tinggi dan sudah teridentifikasi di §16 dan Lampiran A.
-   **Uji wajib:** setelah setiap langkah: hook hidup, kartu approval
    muncul, pill agen "connected", suara berbunyi, preferensi dan riwayat
    tetap terbaca.
-   **Kriteria sukses:** tidak ada lagi identifier `coucou` yang aktif
    dipakai, dan seluruh alur tetap berfungsi.
-   **Berhenti bila:** salah satu langkah tidak bisa diverifikasi pada
    mesin ini.

### Fase 8 --- Publikasi dan lisensi

-   **Tujuan:** repo publik dengan identitas DafinCi yang sah.
-   **Langkah:** tulis `LICENSE` baru atas nama Anda **dengan atribusi
    MIT upstream dipertahankan** (kewajiban lisensi); ganti/tulis
    `LICENSE-ASSETS.md` untuk aset orisinal; tambahkan pemberitahuan
    pihak ketiga bila diinginkan; bersihkan sisa aset upstream
    (`windows/screenshots/`, `design/`, `docs/media/`,
    `NotchBuddy/Resources/`); perbarui README dan workflow.
-   **Uji wajib:** checklist aset bersih; CI hijau di repo baru; tidak
    ada aset dengan status lisensi ambigu yang ikut terkirim.
-   **Kriteria sukses:** repo dapat dipublikasikan tanpa keraguan
    lisensi.
-   **Berhenti bila:** masih ada aset yang statusnya belum diputuskan.

Fase dapat disesuaikan bila verifikasi menemukan komponen Coucou yang
sudah memenuhi kebutuhan. Jangan membuat ulang fungsi yang sudah ada
tanpa alasan.

------------------------------------------------------------------------

## 11. Kriteria Penerimaan MVP

MVP dianggap layak untuk penggunaan pribadi setelah semua kondisi
berikut diverifikasi. Penanda `[ADA]` berarti kondisi itu sudah terpenuhi
hari ini dan hanya perlu diuji ulang; `[BELUM]` menyebut fasenya.

-   [ ] `[ADA]` Aplikasi Windows dapat dijalankan melalui workflow yang
    terdokumentasi (`cd windows`, `npm install`, `npm run tauri dev`).
-   [ ] `[ADA]` Companion dapat membuka dan menutup panel tanpa
    mematikan aplikasi.
-   [ ] `[ADA]` Global shortcut bekerja dan konflik shortcut ditangani
    dengan jelas.
-   [ ] `[ADA]` Pengguna dapat memasukkan/mengganti API key tanpa key
    masuk ke log.
-   [ ] Pengguna dapat mengirim pesan ke DeepSeek dan menerima
    jawabannya. `[BELUM]` → Fase 4.
-   [ ] Pengguna dapat menghentikan request yang sedang berjalan.
    `[BELUM]` → Fase 3.
-   [ ] Percakapan tetap benar setelah aplikasi ditutup dan dibuka
    kembali. `[BELUM]` → Fase 3.
-   [ ] Request dari percakapan yang berbeda tidak saling mencampur.
-   [ ] Error jaringan/API ditampilkan dengan jelas, termasuk 401, 403,
    429, dan kondisi kuota.
-   [ ] Pil Spotify menampilkan track yang diputar, kontrol yang
    didukung bekerja, dan karakter menari saat musik diputar.
    `[BELUM]` → Fase 5.
-   [ ] Bila akun bukan Premium atau tidak ada perangkat aktif,
    aplikasi menjelaskan alasannya alih-alih gagal diam-diam.
    `[BELUM]` → Fase 5.
-   [ ] Fitur utama Coucou yang ada tidak mengalami regresi yang
    diketahui (smoke test Fase 1 lulus ulang).
-   [ ] Test yang relevan lulus, atau setiap kegagalan/blocker
    terdokumentasi beserta sebab dan rencananya.
-   [ ] Perilaku penyimpanan dan pengiriman data dijelaskan kepada
    pengguna: riwayat percakapan disimpan lokal, token Spotify disimpan
    di Credential Manager.

**Penyesuaian kriteria streaming (akibat keputusan Opsi 1).** Respons
streaming **tidak** lagi menjadi syarat MVP, karena DeepSeek dikerjakan
di jalur non-streaming. Yang diwajibkan adalah indikator loading yang
jelas dan jawaban yang muncul utuh. Streaming untuk provider cloud
menjadi kriteria P1 (§5).

Jangan menyatakan kriteria terpenuhi hanya berdasarkan code review;
lakukan pengujian yang sesuai, dan catat tanggal serta hasil setiap uji.

------------------------------------------------------------------------

## 12. Risiko dan Mitigasi

Prioritas: **P0** = memblokir publikasi atau mematikan fungsi inti;
**P1** = kehilangan data pengguna atau pengalaman rusak berat;
**P2** = fitur rusak sebagian atau kegagalan senyap; **P3** = kosmetik.
Kolom "Dasar" menunjukkan bukti yang sudah diverifikasi di kode.

| Pri | Risiko | Dampak | Kemungkinan | Dasar (file) | Mitigasi | Fase |
| --- | ------ | ------ | ----------- | ------------ | -------- | ---- |
| P0 | Publikasi masih membawa nama, karakter, ikon, atau suara Coucou | Pelanggaran lisensi aset | Tinggi bila tidak diganti | `LICENSE-ASSETS.md`; 29 WAV yang benar-benar dikopi ke installer oleh `vite.config.ts` | Ganti aset sebelum publikasi; jangan publikasikan sebelum Fase 7–8 | 7–8 |
| P0 | Nama relay diganti tanpa memperbarui penanda | Hook terdeteksi "tidak terpasang"; entri ganda di `settings.json` | Tinggi — ada 4 lokasi | `hooks.rs:42`, `agents.rs:21`, `agent_hooks.rs:36`, `platform/windows.rs:37` | Ubah 4 lokasi dalam satu commit, lalu uji hook nyata | 7 |
| P0 | Nama pipe tidak cocok di kedua sisi | Seluruh fitur hook mati senyap | Tinggi bila diubah sepihak | `pipe.rs:69` ⟷ `hook/src/win.rs:32` (komentar "must match exactly") | Ubah bersamaan; uji end-to-end | 7 |
| P1 | `SERVICE` keyring diganti | Semua API key lama tidak ditemukan; tidak ada migrasi di kode | Tinggi bila diganti setelah ada data | `secrets.rs:6,29` | Ganti sebelum ada data, atau tulis langkah migrasi | 7 |
| P1 | Direktori data diganti tanpa menyesuaikan `nsis/hooks.nsh` | Kehilangan settings, recap, inbox, suara kustom; uninstaller menyisakan atau salah menghapus | Sedang | `platform/windows.rs:48-61` vs `nsis/hooks.nsh:14-16` | Ubah bersamaan; uji uninstall | 7 |
| P1 | `identifier`/`productName` diganti | Terpasang berdampingan (bukan upgrade); entri autostart lama tertinggal; `localStorage` ter-reset | Pasti terjadi | `tauri.conf.json:3,5` | Disadari dan diuji; lakukan sekali saja | 2 |
| P1 | Spotify: refresh token hilang atau kedaluwarsa | Pengguna harus login ulang; pil berhenti diperbarui | Sedang | Rancangan §18 | Simpan refresh token di keyring; uji kasus token tidak valid → minta login ulang | 5 |
| P1 | Spotify: kuota mode pengembangan | Hanya pemilik app yang bisa memakai; pengguna lain gagal login | Tinggi untuk aplikasi publik | Dokumentasi resmi Spotify (§13) | **Client ID diisi pengguna sendiri**, tidak ditanam di aplikasi, dan didokumentasikan | 5 |
| P2 | Suara hilang senyap | Aplikasi tanpa audio, tanpa pesan error | Tinggi bila aset tidak dibawa | `vite.config.ts:9` + `sound.ts:74` (`try/catch`) | Pastikan 29 nama tetap terpetakan; periksa `dist/sounds` berjumlah 29 | 1, 7 |
| P2 | `strings.json` diedit tangan atau gagal diregenerasi | Gagal kompilasi (`include_str!`) atau UI tak diterjemahkan | Sedang | `i18n.rs:17-18`; peringatan "Do not edit" di dalam berkasnya | Hasilkan ulang lewat skrip; jangan edit tangan | 2 |
| P2 | Argumen WebView2 tidak sengaja berubah | Window Settings/ipin blank tanpa error | Rendah — hanya bila disentuh | Komentar `BROWSER_ARGS` di `lib.rs`; `tauri.conf.json` | Jangan sentuh `additionalBrowserArgs` selama rebranding | 2 |
| P2 | DeepSeek: `/models` tidak tersedia atau nama field token salah | Model picker kosong atau error 400 dari API | Sedang | `models_path` di `openai_compat.rs`; `max_tokens_field` | Verifikasi dokumentasi saat implementasi; sediakan fallback daftar model statis | 4 |
| P2 | Assertion tes Spotify tidak diperbarui saat gate dibuka | `npm test` merah dan menghalangi CI | Pasti bila gate dibuka tanpa memperbarui tes | `windows/tests/pills.test.mjs` (tiga assertion) | Perbarui sebagai bagian dari langkah 5e | 5 |
| P2 | Anggapan bahwa plugin notifikasi bisa membaca pesan masuk | Integrasi salah desain | Sedang | Belum diverifikasi (§20) | PoC lebih dulu; jangan jadikan komitmen MVP | — |
| P3 | Sisa merek di dokumentasi dan komentar provenance | Kosmetik | Tinggi | `windows/README.md`; komentar `NotchBuddy/Sources/…` di `src/mochi/*` | Sapuan terakhir | 8 |
| P3 | Aset berstatus lisensi ambigu (`windows/screenshots/`) | Ketidakpastian hukum kecil | Sedang | Tidak disebut di `LICENSE-ASSETS.md` | Hapus atau minta izin | 8 |
| P3 | Abstraksi provider berlebihan | Kompleksitas tanpa manfaat | Rendah | Struktur provider dan `chat.rs` sudah memadai | Jangan membuat lapisan baru | — |
| P3 | Terlalu banyak fitur ditambahkan sekaligus | MVP tidak pernah stabil | Sedang | — | Gate per fase sesuai kriteria sukses §10 | semua |

**Risiko yang sudah terbukti** (bukan dugaan): semua P0 dan P1 terkait
marker/pipe/keyring/direktori data, kegagalan senyap suara, dan tiga
assertion tes Spotify. **Risiko yang masih dugaan sampai diuji:**
perilaku upgrade installer antar-identifier, nama entri autostart,
kemampuan API notifikasi Windows, dan seluruh perilaku runtime Spotify
Web API.

------------------------------------------------------------------------

## 13. Dokumentasi Resmi dan Referensi Teknis

> Tautan di bawah adalah dokumentasi resmi yang relevan. Periksa versi
> dan persyaratan yang berlaku terhadap versi dependency aktual di
> repository sebelum menambah atau memperbarui paket. Dokumentasi online
> terbaru tidak otomatis berarti dependency project harus langsung
> dinaikkan.

### Tauri

-   [Tauri v2 --- Documentation](https://v2.tauri.app/)
-   [Tauri --- Global Shortcut
    plugin](https://v2.tauri.app/plugin/global-shortcut/)
-   [Tauri --- Notifications
    plugin](https://v2.tauri.app/plugin/notification/)
-   [Tauri --- Stronghold
    plugin](https://v2.tauri.app/plugin/stronghold/)
-   [Tauri --- Store plugin](https://v2.tauri.app/plugin/store/)
-   [Tauri --- SQL plugin](https://v2.tauri.app/plugin/sql/)
-   [Tauri --- Window State
    plugin](https://v2.tauri.app/plugin/window-state/)
-   [Tauri --- Plugin overview](https://v2.tauri.app/plugin/)
-   [Tauri --- Security](https://v2.tauri.app/security/)

Gunakan plugin hanya jika kebutuhan dan versi dependency cocok. Jangan
menambahkan seluruh plugin tersebut sebagai satu paket default.

### DeepSeek

-   [DeepSeek API --- dokumentasi utama](https://api-docs.deepseek.com/)
-   [Chat Completions
    API](https://api-docs.deepseek.com/api/create-chat-completion/)
-   [Responses API](https://api-docs.deepseek.com/guides/responses_api/)
-   [Models &
    Pricing](https://api-docs.deepseek.com/quick_start/pricing)

Periksa model ID, fitur streaming, batas token, serta harga pada
dokumentasi resmi saat implementasi karena dapat berubah.

### Spotify (Web API, OAuth)

Deep link di bawah adalah struktur dokumentasi resmi Spotify. **Belum
diverifikasi ulang dengan akses jaringan** saat dokumen ini ditulis
(sesi audit tidak punya akses internet), jadi wajib dicek kembali di
langkah 5a sebelum menulis kode.

-   [Web API --- dokumentasi utama](https://developer.spotify.com/documentation/web-api)
-   [Authorization
    concepts](https://developer.spotify.com/documentation/web-api/concepts/authorization)
-   [Authorization Code with PKCE
    flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
-   [Scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes)
-   [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
-   [Quota modes (development
    mode)](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
-   [Referensi endpoint](https://developer.spotify.com/documentation/web-api/reference/)
-   [Dashboard aplikasi (membuat Client
    ID)](https://developer.spotify.com/dashboard)

Endpoint yang relevan (dasar `https://api.spotify.com`):

| Kebutuhan | Endpoint |
| --------- | -------- |
| Status pemutaran | `GET /v1/me/player` |
| Track yang sedang diputar | `GET /v1/me/player/currently-playing` |
| Daftar perangkat | `GET /v1/me/player/devices` |
| Play / pause | `PUT /v1/me/player/play`, `PUT /v1/me/player/pause` |
| Next / previous | `POST /v1/me/player/next`, `POST /v1/me/player/previous` |
| Seek | `PUT /v1/me/player/seek?position_ms=` |
| Volume | `PUT /v1/me/player/volume?volume_percent=` |
| Shuffle / repeat | `PUT /v1/me/player/shuffle?state=`, `PUT /v1/me/player/repeat?state=` |
| Transfer playback | `PUT /v1/me/player` |
| Tukar / segarkan token | `POST https://accounts.spotify.com/api/token` |

Catatan kewajiban yang sudah terlihat dari struktur dokumentasi dan harus
dikonfirmasi saat implementasi: **kontrol playback memerlukan akun
Premium** dan **ada perangkat aktif**; aplikasi dalam *development mode*
dibatasi pada sejumlah pengguna terdaftar sehingga **Client ID harus
diisi pengguna sendiri**, bukan ditanam di aplikasi (§18).

### Windows

-   [Microsoft --- Windows App
    SDK](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/)
-   [Microsoft --- App
    notifications](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/)
-   [Microsoft --- Windows notifications
    overview](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/)

Dokumentasi Windows App SDK tidak berarti DapinCi harus mengadopsi
Windows App SDK secara langsung. Gunakan untuk memahami kapabilitas OS,
lalu tentukan pendekatan yang kompatibel dengan Tauri dan arsitektur
yang sudah ada.

### Upstream project

-   [Coucou --- GitHub repository](https://github.com/Louis-CFM/coucou)

Sumber paling relevan untuk perilaku dan implementasi aktual tetap kode
pada commit yang sedang dipakai. Cocokkan dokumentasi online dengan
dependency lockfile dan konfigurasi project sebelum melakukan perubahan.

------------------------------------------------------------------------

## 14. Aturan Kerja untuk AI Coding Agent

Saat mengerjakan DapinCi:

1.  Baca source code terkait sebelum mengusulkan atau melakukan
    perubahan.
2.  Jangan menganggap nama file, struktur, atau API tertentu tersedia
    sebelum memverifikasi repository.
3.  Pertahankan seluruh direktori platform yang ada.
4.  Jangan melakukan rebranding massal atau mengganti identifier
    internal tanpa rencana migrasi.
5.  Jangan menambahkan dependency tanpa menjelaskan kebutuhan,
    kompatibilitas, dan dampaknya.
6.  Kerjakan satu fase dan satu alur pengguna pada satu waktu.
7.  Buat tes untuk behavior baru dan regresi yang relevan.
8.  Bedakan hasil yang benar-benar diuji dari asumsi dan rekomendasi.
9.  Jangan mengklaim build, test, integrasi, atau runtime berhasil jika
    belum dijalankan.
10. Jangan mengubah lisensi atau menghapus atribusi upstream secara
    sembarangan.
11. Jangan mengirim atau menyimpan konten pribadi tanpa jalur yang jelas
    dan izin pengguna.
12. Laporkan file yang berubah, alasan perubahan, hasil validasi, dan
    risiko yang tersisa.
13. **Jangan mengganti nama internal apa pun tanpa membaca Lampiran A.**
    Nama relay, nama pipe/socket, direktori data, dan identifier keyring
    adalah kontrak yang tersebar di beberapa file; satu tempat yang
    terlewat menghasilkan kegagalan senyap.
14. **Jangan menambah plugin Tauri, database, atau dependency baru tanpa
    menyebutkan alasan dan dampaknya.** Untuk MVP ini, kredensial
    (Credential Manager), penyimpanan (JSON di direktori data), dan
    shortcut sudah punya solusinya di repo.

------------------------------------------------------------------------

## 15. Keputusan yang Sudah Ditetapkan

-   [x] Nama produk: DapinCi.
-   [x] Identitas pemilik: DafinCi. Package, crate, dan identifier
    memakai `dapinci` (huruf kecil), bukan `DapinCi`.
-   [x] `identifier` diganti dari `fr.louisraille.coucou` menjadi
    identifier `dapinci`. **Nilai konkretnya ditetapkan di Fase 2**
    (rekomendasi: `io.github.<username-github-anda>.dapinci`, agar tidak
    bergantung pada domain pribadi dan aman untuk repo publik). Identifier
    ini **tidak boleh sama** dengan milik Coucou, supaya instalasi
    terpisah dan tidak saling merusak.
-   [x] Target implementasi utama: Windows.
-   [x] Arah produk: hybrid --- AI, komunikasi, dan kontrol desktop.
-   [x] Prioritas fitur pertama: chat DeepSeek dan fondasi
    multi-provider.
-   [x] **Streaming DeepSeek: Opsi 1** (non-streaming, ditambahkan ke
    `openai_compat.rs`). Streaming provider cloud menjadi P1.
-   [x] **Spotify: Opsi B** (Spotify Web API dengan OAuth Authorization
    Code + PKCE). Client ID diisi pengguna, bukan ditanam di aplikasi.
-   [x] **Persistensi riwayat percakapan dan tombol Stop/cancel masuk
    MVP** (P0, Fase 3).
-   [x] Model interaksi: **Companion-first** dengan floating companion
    yang bisa diperluas.
-   [x] **Model window: ikuti arsitektur Coucou sekarang** (window
    `island` + window `settings` tersembunyi + window `ipin` opsional),
    dengan syarat panel bisa ditutup dan dibuka kembali. Tidak ada window
    baru, tidak ada mekanisme overlay baru, dan
    `additionalBrowserArgs` tidak disentuh.
-   [x] Repository Coucou tetap utuh; direktori macOS/Linux tidak
    dihapus.
-   [x] macOS dipakai sebagai referensi fitur dan perilaku, bukan sumber
    asumsi kompatibilitas Windows.
-   [x] Aset Coucou dipertahankan sementara untuk pengembangan sesuai
    batas lisensinya.
-   [x] Implementasi dilakukan bertahap setelah audit baseline.
-   [x] Rebranding dibagi dua: **identitas terlihat & metadata (Fase 2)**
    dan **kontrak internal (Fase 7)**. Yang kedua hanya dikerjakan
    sebelum publikasi.

## 16. Hal yang Masih Perlu Diverifikasi

Sudah terjawab oleh audit kode (§17): arsitektur window dan lifecycle,
kemampuan UI TypeScript/Canvas 2D, cara menyimpan API key, dan mekanisme
persistensi yang sesuai. Yang benar-benar masih terbuka:

-   Apakah DeepSeek menyediakan `/models` yang kompatibel, dan nama field
    batas token yang benar (Fase 4).
-   Aturan redirect URI Spotify saat ini: apakah
    `http://127.0.0.1:<port>/callback` masih bentuk yang diterima, dan
    apakah `localhost` masih ditolak (langkah 5a).
-   Batas nyata *development mode* Spotify dan konsekuensinya untuk
    pengguna repo publik (langkah 5a/5e).
-   Data apa saja yang benar-benar bisa dibaca dari notifikasi Windows,
    dan apakah balasan langsung ke aplikasi komunikasi mungkin dilakukan
    lewat jalur yang sah (P2; PoC dulu).
-   Perilaku upgrade installer saat `identifier` berubah — sudah
    diperkirakan terpasang berdampingan, tapi belum diuji di mesin nyata
    (Fase 2/6).
-   Nama entri autostart yang ditulis `tauri-plugin-autostart` setelah
    `productName` berubah (plugin di-`init` dengan argumen default, jadi
    namanya diturunkan dari metadata aplikasi) — perlu diperiksa di
    registry saat Fase 2.
-   Batas lisensi aset: status `windows/screenshots/` dan status tabel
    terjemahan turunan (Fase 8).

**Langkah berikutnya:** jalankan Fase 0 dan Fase 1 (§10). Jangan
mengimplementasikan seluruh roadmap dalam satu prompt.

------------------------------------------------------------------------

## 17. Status Aktual Implementasi (hasil verifikasi kode)

Semua baris di bawah **TERVERIFIKASI** dengan pembacaan berkas langsung
pada commit yang sedang dipakai (bukan dari dokumentasi daring). Tabel ini
adalah dasar penilaian di §5.

| Kemampuan | Status | Bukti |
| --------- | ------ | ----- |
| Lapisan provider AI | **ADA** — 7 provider | `src/core/providers.ts` (`PROVIDERS`, `ProviderId`); `src-tauri/src/openai_compat.rs` (openai, google, openrouter), `claude.rs`, `local_chat.rs` |
| Routing provider + daftar model | **ADA** | `chat.rs` `send()` dan `models()` |
| UI chat + Markdown + tombol copy | **ADA** | `src/views/chat.ts`, `src/views/markdown.ts` |
| Streaming respons | **ADA, hanya jalur OpenAI-compatible/lokal** | `local_chat.rs` (SSE, event `chat-delta`, `MAX_ANSWER`, filter `<think>`) |
| Streaming provider cloud | **BELUM** | `openai_compat.rs` dan `claude.rs` tidak memuat `text/event-stream` |
| Penyimpanan kredensial aman | **ADA** | `secrets.rs` (`keyring`, `windows-native`, service + `KNOWN_KEYS` 13 entri) |
| Riwayat percakapan | **BELUM** — hanya memori proses | `chat.rs` `Chat { inner: Mutex<Conversation> }`, `Chat::default()` di `lib.rs`, hanya ada `chat_reset` |
| Stop/cancel request | **BELUM** | tidak ada command pembatalan di antara 70 command di `invoke_handler!` |
| Fondasi pembatalan (epoch) | **ADA** | `chat.rs` `Conversation.epoch`, dinaikkan `Chat::reset` |
| Global shortcut + konflik + AltGr | **ADA** | `src/core/shortcuts.ts`, `src-tauri/src/shortcuts.rs` |
| Companion/island + tutup/buka | **ADA** | `island.rs`, `src/island/fsm.ts`, `set_collapsed`, `apply_geometry` |
| Window Settings & ipin | **ADA** | `lib.rs` `create_settings_window`, `desktop.rs` (label `ipin`) |
| Tray + menu | **ADA** | `tray.rs` |
| Suara (29) | **ADA**, aset orisinal (dirender `scripts/render-sounds.py`) | `src/core/sound.ts` `SOUND_NAMES` (29 nama polos, cocok 1:1 dengan 29 `.wav` di `windows/sounds/`), `vite.config.ts` `SOUNDS_DIR` |
| Hook agent (Claude Code, Codex, Copilot, Muse, Gemini, Antigravity, Cursor, OpenCode, Amp, Hermes) | **ADA** | `hooks.rs`, `agents.rs`, `agent_hooks.rs`, `hook/` |
| Integrasi layanan (GitHub, Stripe, Vercel, Resend, Notion, Cal.com, n8n) | **ADA** | `integrations.rs`, `github.rs`, `src/core/pills.ts` |
| Spotify | **SEBAGIAN** — UI/dance/tes ADA, sumber data BELUM di Windows | `src/core/spotify.ts`, `src/views/spotify.ts`, `src/island/spotify.ts`, `tests/spotify.test.mjs`; `spotify.rs` cabang non-Linux mengembalikan "tidak ada yang diputar" |
| Recap mingguan + share image | **ADA** | `recap.rs`, `src/recap/*` |
| Telemetri / updater | **TIDAK ADA** (memang tidak ada) | tidak ada plugin `updater`; pencarian `telemetry` hanya menemukan teks UI |
| Database | **TIDAK ADA** | preferensi/riwayat berformat JSON (lihat §7) |

------------------------------------------------------------------------

## 18. Spotify di Windows --- desain teknis (Opsi B, Web API)

### Mengapa ini bukan pekerjaan kecil, dan mengapa tetap layak

Yang sudah ada dan **tidak perlu ditulis ulang**: seluruh logika halaman
(`src/core/spotify.ts` — posisi yang diekstrapolasi dari timestamp,
`withPlaying`, `isAd`, `formatTime`, `volumeLevel`, `islandDances`,
`desktopDances`), kartu pemutar (`src/views/spotify.ts`), jembatan event
(`src/island/spotify.ts`), animasi dance ipin, dan `tests/spotify.test.mjs`.

Yang **harus dibuat**: sumber data di Rust. Cabang Windows sekarang
mengembalikan "tidak ada yang diputar" untuk keempat command
(`spotify_refresh`, `spotify_control`, `spotify_open`, `spotify_installed`),
dan `sync()` tidak melakukan apa pun. Parser MPRIS yang ada **tidak bisa
dipakai ulang** karena bentuk datanya khas MPRIS (`xesam:title`,
`mpris:length`, `mpris:artUrl`).

### Alur otorisasi (Authorization Code + PKCE)

1.  **Sekali, oleh pengguna:** membuat aplikasi di Spotify Developer
    Dashboard, menyalin **Client ID**, dan mendaftarkan **Redirect URI**
    yang dipakai aplikasi. Karena Spotify mencocokkan redirect URI secara
    persis, aplikasi memakai **port loopback tetap** (mis.
    `http://127.0.0.1:8899/callback`) dan mendokumentasikannya di
    Settings.
2.  **Connect:** aplikasi membuka browser ke
    `https://accounts.spotify.com/authorize` dengan `client_id`,
    `response_type=code`, `redirect_uri`, `scope`,
    `code_challenge_method=S256`, `code_challenge`, dan `state`.
3.  **Listener loopback:** `tokio::net::TcpListener` pada port itu
    menerima `GET /callback?code=…&state=…`, memverifikasi `state`, dan
    membalas halaman HTML sederhana ("boleh tutup tab ini"). Fitur `net`
    pada `tokio` **sudah aktif** di `src-tauri/Cargo.toml`, jadi tidak ada
    crate jaringan baru.
4.  **Tukar kode:** `POST https://accounts.spotify.com/api/token` dengan
    `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`,
    dan `code_verifier` (tanpa client secret — inilah alasan PKCE dipakai).
5.  **Simpan:** `{ clientId, refreshToken }` sebagai satu string JSON di
    Credential Manager lewat pola `BoundKey` yang sudah dipakai kunci
    server kustom (`local_chat.rs`), dan daftarkan kuncinya di
    `KNOWN_KEYS`. Access token hanya di memori.
6.  **Segarkan:** saat access token kedaluwarsa (umumnya ~1 jam), `POST`
    dengan `grant_type=refresh_token`. Bila refresh gagal, tandai pil
    sebagai "perlu login ulang" dan jangan mencoba lagi tanpa henti.
7.  **Disconnect:** hapus entri keyring dan matikan listener.

PKCE memerlukan SHA-256 dan angka acak. `sha2 0.10.9`, `rand 0.8.8`,
`getrandom 0.2.17`, `base64 0.21.7` sudah ada di `Cargo.lock` sebagai
dependensi transitif, sehingga tidak ada unduhan crate baru — tetapi
**tetap wajib dideklarasikan di `Cargo.toml`** dan itu berarti lockfile
berubah (sesuai aturan kerja §14 no. 5, jelaskan alasan dan dampaknya).

### Pemetaan data ke `SpotifyState` yang sudah ada

| Field `SpotifyState` | Sumber Web API |
| -------------------- | -------------- |
| `running` | ada respons pemutaran (`GET /v1/me/player`) |
| `installed` | tidak relevan — Web API tidak butuh aplikasi Spotify terpasang (§ catatan di bawah) |
| `track.id` | `item.uri` (`spotify:track:…`) agar cocok dengan konvensi `spotify_id()` yang ada |
| `track.title` / `artist` / `album` | `item.name`, `item.artists[].name`, `item.album.name` |
| `track.duration` | `item.duration_ms / 1000` |
| `track.artUrl` | `item.album.images[0].url` |
| `playing` | `is_playing` |
| `position` + `positionAt` | `progress_ms` + waktu penerimaan respons |
| `shuffle` / `repeat` | `shuffle_state` / `repeat_state` |
| `volume` | `device.volume_percent` |

### Polling, artwork, dan degradasi

-   **Polling:** hanya saat pil dinyatakan **dan** aplikasi tidak dijeda —
    pola yang sudah dipakai `integrations.rs` dan `spotify::sync()`.
    Interval lebih rapat saat `is_playing` dan lebih longgar saat tidak.
    Web API tidak punya push, jadi polling adalah satu-satunya cara tanpa
    menambah sumber lokal.
-   **Rate limit:** hormati `429` dan header `Retry-After`; mundur
    sementara, jangan menumpuk request.
-   **Artwork:** diambil di Rust lalu dikirim sebagai data URL, karena CSP
    halaman hanya mengizinkan `img-src 'self' data: blob:`. Jalur MPRIS
    sudah memakai pola ini (event `spotify-artwork`).
-   **Degradasi yang wajib jelas, bukan senyap:** `204` = tidak ada yang
    diputar (bukan error); `401` = coba refresh, lalu minta login ulang;
    `403` = akun bukan Premium, jadi kontrol dinonaktifkan dengan
    penjelasan; `404` = tidak ada perangkat aktif.
-   **`spotify_open()` di Windows:** buka aplikasi Spotify bila ditemukan,
    jika tidak buka `https://open.spotify.com/`. `DOWNLOAD_URL` di
    `spotify.rs` saat ini menunjuk halaman unduh **Linux** dan harus
    dibuat sadar-platform.
-   **Perbedaan perilaku yang perlu dicatat:** MPRIS menandai iklan
    lewat `spotify:ad:` sehingga `isAd()` bisa menyala; Web API tidak
    memberi penanda itu, jadi di jalur Web API `isAd()` kemungkinan tidak
    pernah aktif. Ini bukan bug, tapi perbedaan yang harus disadari.

### Cakupan file dan gate pil

-   Rust: `spotify.rs` dibuat sadar-platform mengikuti pola
    `platform/mod.rs`, plus satu modul OAuth baru, plus `secrets.rs`.
-   Halaman: `src/core/pills.ts` (nilai `support`), `src/core/state.ts`
    (jika perlu), `src/i18n/extra.json`, dan `windows/tests/pills.test.mjs`.
-   **Tiga assertion tes yang mengunci Spotify sebagai Linux-only wajib
    diperbarui** dan itu memang disengaja; lihat §12 dan langkah 5e.

### Batas privasi fitur ini

-   Tidak ada audio yang diputar oleh DapinCi; aplikasi hanya membaca
    status dan mengirim perintah kontrol.
-   Tidak ada riwayat mendengarkan yang disimpan.
-   Data hanya pergi ke Spotify (dan ke `accounts.spotify.com` untuk
    token). Tidak ada pihak ketiga lain.

------------------------------------------------------------------------

## Lampiran A --- Kontrak internal (jangan ganti tanpa daftar ini)

Aturan: satu nama = satu commit, dengan uji hook nyata setelahnya.
Urutan yang disarankan ada di kolom terakhir.

| Kontrak | Nilai sekarang | Semua situs yang harus berubah bersamaan | Risiko bila terlewat |
| ------- | -------------- | ---------------------------------------- | -------------------- |
| Nama biner relay | `coucou-hook.exe` / `coucou-hook` | `platform/windows.rs:37`, `platform/linux.rs:26`, `hook/Cargo.toml` (nama package + `[[bin]]`), `package.json` (`cargo build -p coucou-hook`), `tauri.conf.json:51` + `tauri.linux.conf.json:10-11` (resource), `hooks.rs:42` (`MARKER`), `agents.rs:21` (`MARKER`), `agent_hooks.rs:36` (`contains("coucou")`) | Hook terdeteksi "tidak terpasang"; penulisan ulang menambah entri ganda di `settings.json` |
| Nama named pipe (Windows) | `\\.\pipe\coucou-<sid>` | `pipe.rs:69` (server) ⟷ `hook/src/win.rs:32` (klien) | Seluruh fitur hook mati **senyap** (hook keluar `exit 0` tanpa pesan) |
| Nama socket (Linux) | `$XDG_RUNTIME_DIR/coucou.sock` | `platform/linux.rs:213` ⟷ `hook/src/unix.rs:26` | Sama, khusus Linux |
| Direktori data | `%APPDATA%\Coucou`, `%LOCALAPPDATA%\Coucou`, `~/.config/coucou`, `~/.local/share/coucou`, `~/.cache/coucou` | `platform/windows.rs:48-61`, `platform/linux.rs:44,51,100`, dan `nsis/hooks.nsh:14-16` yang menghapus jalur yang sama saat uninstall | Kehilangan settings, `recap.json`, `inbox/`, suara kustom; uninstaller menyisakan atau salah menghapus |
| Identifier keyring | service `fr.louisraille.coucou` | `secrets.rs:6` (+ 13 entri `KNOWN_KEYS` di bawahnya) | Semua API key lama tidak ditemukan; tidak ada migrasi di kode |
| Nama crate | `coucou`, `coucou_lib`, `coucou-hook` | `src-tauri/Cargo.toml`, `main.rs:5` (`coucou_lib::run()`), `hook/Cargo.toml`, `tauri.conf.json` (resource) | Gagal kompilasi |
| Berkas plugin agen | `.copilot/hooks/coucou.json`, `plugins/coucou.js`, `plugins/coucou.ts`, `.hermes/plugins/coucou/` | `agents.rs:145,148,149,151`, penanda `GENERATED` (`agents.rs:740`), `HERMES_PLUGIN_YAML:920` (`name: coucou`) | Berkas lama tidak dikenali sebagai milik kita; tidak bisa diperbarui/dihapus otomatis |
| Grup hook Antigravity | `"coucou"` | `agents.rs:255, 552-563` | Tidak bisa mengenali/menghapus grup lama; menolak menulis karena dianggap milik orang lain |
| Field payload `coucou_agent` | `coucou_agent` | `hook/src/main.rs:161` (menulis), `recap.rs:476` (membaca), `src/island/hooks.ts` (membaca), **`docs/AGENTS.md` (kontrak publik pihak ketiga)** | Integrasi pihak ketiga yang mengikuti dokumentasi berhenti berfungsi |
| Id tray + tooltip | `"dapinci"`, `DapinCi` — **sudah selesai** | `tray.rs:36-37` | Kosmetik + id internal |
| Ikon & aset karakter | `src-tauri/icons/*`, 29 `.wav`, gambar karakter di `src/ipin/*`, `views/icons.ts`, `upload/canvas.ts`, `recap/share.ts`, `gen-icons.mjs` | harus **diganti**, bukan dihapus | Pelanggaran lisensi aset bila dipublikasikan |
| Identitas Linux | `fr.louisraille.coucou` (portal), `fr.louisraille.Coucou.Focus` (D-Bus), namespace GTK `coucou`/`coucou-mochi`, `coucou-spotify` (MPRIS), fallback exe `coucou` | `portal.rs:45`, `platform/linux_focus.rs:284`, `platform/linux.rs:410,645`, `spotify.rs:636,1000`, `shortcuts.rs:425` | Shortcut Wayland bisa ditolak |
| Nama artefak paket | `DapinCi-Windows-*` (Windows), `Coucou-Linux-*` (Linux) | `scripts/pack.mjs`, `.github/workflows/windows.yml` (path upload), `linux/arch/PKGBUILD` | Langkah upload/rilis gagal |
| Skema settings tersimpan | `mochiOutfit`, `desktopMochi` | `settings.rs` (serde + fixture uji), `src/core/state.ts:135-179`, `desktop.rs:551-576` | **JANGAN diganti tanpa migrasi** — berkas settings yang sudah ada kehilangan pilihan outfit dan posisi desktop, dan tidak ada migrasi di kode |
| Nama karakter di UI | **ipin** (dulu "Mochi") — **selesai** | `core/shortcuts.ts`, `src-tauri/src/shortcuts.rs`, `island/island.ts`, `settings/main.ts`, `views/chat.ts`, prompt di `chat.rs`, 4 key di `src/i18n/extra.json` × 9 bahasa | Sudah berganti; tidak ada teks UI yang masih memakai nama lama |

**Urutan aman untuk Fase 7:** direktori data (dengan migrasi atau reset
yang disadari) → service keyring → nama relay + tiga marker → nama pipe.
Jangan pernah semuanya dalam satu commit.

------------------------------------------------------------------------

## Lampiran B --- Dependency lintas direktori

**L1 (SOUNDS_DIR) sudah selesai.** `windows/vite.config.ts` tidak lagi
menunjuk ke luar `windows/`: `SOUNDS_DIR` kini `resolve(__dirname, "sounds")`
dan 29 WAV orisinal tinggal di `windows/sounds/`, jadi `windows/` sudah
mandiri untuk build dan runtime.

Yang tersisa --- **dua baris**, keduanya soal katalog terjemahan Mac:

| # | Pengguna | Target | Tahap | Jika tidak ada | Perlakuan | Fase |
| - | -------- | ------ | ----- | -------------- | --------- | ---- |
| L2 | `windows/scripts/gen-strings.mjs` | `NotchBuddy/Resources/Localizable.xcstrings` | dev (codegen manual) | Skrip gagal; `npm run dev`/`build`/`cargo build` tidak terpengaruh karena `strings.json` sudah tersimpan di repo | Salin katalog ke dalam repo, atau putuskan kaitan dan miliki tabel string sendiri | 8 |
| L3 | `windows/tests/i18n.test.mjs` | sama seperti L2 | testing | 1 dari 24 berkas tes gagal | Sama seperti L2 | 8 |

Yang **bukan** dependency eksternal meski terlihat seperti itu (semua
TERVERIFIKASI): `i18n.rs` `include_str!("../../src/i18n/*.json")` (masih
di dalam `windows/`), resource Tauri `"../target/release/coucou-hook.exe"`
(masih di `windows/target/`), fallback `parent.join("../release")` di
`hooks.rs` (relatif terhadap berkas exe yang berjalan), dan seluruh
penyebutan `NotchBuddy/Sources/…` di komentar (provenance, bukan path).

**Yang tidak dirujuk sama sekali dari `windows/`:** `relay/`, `design/`,
`docs/`, `scripts/` (root), `tests/` (root), `linux/`, dan
`NotchBuddy/Sources/`. Mengejutkan tapi terverifikasi: worker Cloudflare
di `relay/` hanya dipakai aplikasi macOS untuk Live Activity iPhone, dan
tidak ada satu pun URL worker di dalam `windows/`.
