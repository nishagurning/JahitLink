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

Pada kunjungan pertama ke `/admin`, buat akun admin. Satu akun admin dibuat
untuk setiap database. Login memakai sesi cookie `HttpOnly` yang berakhir
setelah delapan jam. Jangan hapus folder `data` kecuali memang ingin mereset
akun dan seluruh pesanan.

## Fitur

- Admin/penjahit membuat pesanan, mencatat ukuran, pembayaran, dan pengambilan.
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
untuk aplikasi publik. Dalam mode produksi cookie sesi memakai atribut `Secure`.
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
