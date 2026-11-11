# JahitLink

Website pengelolaan pesanan jahit dengan React, TypeScript, Express, dan SQLite.

## Menjalankan untuk pengembangan

```bash
npm install
npm run dev
```

Perintah ini menjalankan Vite dan API secara bersamaan. Buka alamat Vite yang
ditampilkan di terminal. API tersedia melalui proxy `/api`; database otomatis
dibuat di `data/jahitlink.sqlite`.

Pilih jenis akun melalui `/masuk`. Pelanggan dapat masuk atau mendaftar di
`/pelanggan`; admin dan penjahit menggunakan portal staf di `/admin`. Pada
kunjungan pertama ke `/admin`, buat akun staf. Satu akun staf dibuat untuk
setiap database dan digunakan bersama oleh admin/penjahit. Login memakai sesi
cookie `HttpOnly` yang berakhir setelah delapan jam. Jangan hapus folder `data`
kecuali memang ingin mereset akun dan seluruh pesanan.

Pelanggan dapat membuka `/pelanggan` untuk mendaftar atau masuk menggunakan
nomor HP dan kata sandi. Setelah pelanggan membuat akun, admin perlu membuka
detail pesanan di `/admin` dan menautkan akun pelanggan yang sesuai. Pesanan
hanya terlihat di akun yang sudah ditautkan; nomor HP yang sama saja tidak
memberi akses ke pesanan.

## Fitur

- Admin/penjahit membuat pesanan, mencatat ukuran, pembayaran, dan pengambilan.
- Admin dapat menyimpan alamat pelanggan pada pesanan; alamat hanya ditampilkan
  di ruang kerja admin dan tidak dibagikan pada tautan pelacakan publik.
- Pelanggan dapat membuat akun, masuk, dan melihat pesanan yang ditautkan admin.
- Perubahan progres, biaya, dan pembayaran disimpan di SQLite dan tersedia
  kepada pelanggan lintas perangkat.
- Admin dapat mencari dan memfilter pesanan berdasarkan status.
- Pelanggan melacak pesanan lewat tautan/token acak yang diberikan admin.
  Informasi kontak, catatan internal, dan ukuran tidak dikirim ke halaman publik.
- Dashboard menyegarkan data berkala; halaman pelacakan mengambil update baru
  setiap 15 detik.

## Menjalankan di produksi

```bash
npm run build
```

Jalankan server API dan file website hasil build pada host yang sama:

```powershell
$env:NODE_ENV = "production"
$env:HOST = "0.0.0.0"
npm start
```

Server menggunakan HTTPS melalui reverse proxy yang dikonfigurasi dengan benar
untuk aplikasi publik. Proxy harus meneruskan header `X-Forwarded-Host` dari
browser agar validasi asal permintaan tetap cocok. Dalam mode produksi cookie
sesi memakai atribut `Secure`.
Simpan database di volume persisten; untuk backup, hentikan server terlebih
dahulu dan salin `data/jahitlink.sqlite`. `DATA_DIR` dapat diatur untuk memilih
lokasi penyimpanan lain.

## Batasan dan keamanan

SQLite sesuai untuk prototipe atau satu server dengan beban ringan. Data belum
disinkronkan ke layanan cloud dan tidak disertakan dalam repository. Aplikasi
ini hanya memiliki satu akun admin; pembuatan akun tambahan, reset kata sandi,
dan manajemen peran belum tersedia. Rahasiakan tautan pelacakan karena token
acak pada tautan tersebut memberi akses ke ringkasan status pesanan.

## Pemeriksaan

```bash
npm test
npm run build
```
