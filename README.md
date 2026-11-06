# JahitLink

Prototipe lokal pengelolaan pesanan jahit dengan React, TypeScript, dan Vite.

## Menjalankan

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Proyek ini menyertakan pesanan contoh
JL-001. Pesanan baru, progres, pembayaran, dan pengambilan disimpan di
`localStorage` browser.

## Cakupan prototipe

- Beranda pelanggan di `/` untuk melihat layanan dan mengajukan permintaan jahit.
- Dashboard pemilik di `/admin` untuk mengelola pesanan masuk.
- Membuat pesanan dan mencatat detail jahitan, ukuran, jadwal, biaya, serta DP.
- Menerima permintaan pelanggan dengan status awal "Menunggu konfirmasi".
- Memperbarui progres dan menyimpan catatan riwayat.
- Mencatat pembayaran berikutnya dengan metode dan tanggal.
- Mencatat pengambilan secara terpisah dari status pembayaran.
- Membuka halaman pelacakan pada `/track/:token`.
- Menampilkan progres, jadwal, dan sisa pembayaran kepada pelanggan tanpa
  menampilkan nomor kontak atau ukuran badan.

Penyimpanan browser ini hanya untuk demo: permintaan jahit dan tautan pelacakan
tidak dikirim ke pemilik usaha dan tidak tersedia di perangkat lain. Dashboard
`/admin` belum memiliki login atau otorisasi; data tidak aman untuk menyimpan
data pelanggan sungguhan. Sebelum dipakai sungguhan, pindahkan
penyimpanan ke backend/database, tambahkan autentikasi dan otorisasi server,
serta lindungi halaman pelacakan dengan token acak yang divalidasi server.
Jangan publikasikan data pelanggan dari prototipe ini.

Build untuk memeriksa tipe dan menghasilkan aset produksi:

```bash
npm run build
```
