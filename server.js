const express = require('express');
const path = require('path');
const { google } = require('googleapis');

const app = express();

// ==================================================
// 1. MIDDLEWARE (Penting: Untuk membaca input POST req.body & file statis)
// ==================================================
app.use(express.json()); // Membaca data berformat JSON dari frontend
app.use(express.urlencoded({ extended: true })); // Membaca data dari form HTML
app.use(express.static(path.join(__dirname, 'public'))); // Menyajikan file statis (HTML, CSS, JS frontend)

// ==================================================
// 2. KONFIGURASI SPREADSHEET ID & KREDENSIAL GOOGLE
// ==================================================
// Pastikan mengganti 'ID_SPREADSHEET_ANDA_DI_SINI' dengan ID dari URL Google Sheets Anda
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '15dq5D-IRr5q82duHDwNKl600110sIC5R2nRxJUkxINE';

let credentials;
if (process.env.GOOGLE_CREDENTIALS) {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
  credentials = require('./credentials.json');
}

// ==================================================
// 3. INISIALISASI GOOGLE AUTH & SHEETS API
// ==================================================
const auth = new google.auth.GoogleAuth({
  credentials: credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Helper untuk parsing angka dari teks/string ke integer
function parseAngka(val) {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[^0-9-]/g, '');
  return parseInt(cleaned, 10) || 0;
}

// ==================================================
// 4. API GET ENDPOINTS (MEMBACA DATA LAPORAN)
// ==================================================

// A. Laporan Penjualan Harian
app.get('/api/laporan/penjualan-harian', async (req, res) => {
  try {
    const resPenjualan = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Penjualan!A2:H',
    });
    const rows = resPenjualan.data.values || [];
    
    const tglFilter = req.query.tanggal;
    let dataFormatted = rows.map(row => ({
      Tanggal: row[0] || '',
      Menu: row[1] || '',
      Qty: row[2] || '0',
      Harga: row[3] || '0',
      Total: row[4] || '0',
      Pelanggan: row[5] || '-',
      Metode_Pembayaran: row[6] || '-',
      Keterangan: row[7] || '-'
    }));

    if (tglFilter) {
      dataFormatted = dataFormatted.filter(item => 
        item.Tanggal.toLowerCase() === tglFilter.toLowerCase()
      );
    }

    res.json({ success: true, data: dataFormatted });
  } catch (error) {
    console.error('Error Penjualan Harian:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// B. Laporan Pengeluaran Harian
app.get('/api/laporan/pengeluaran-harian', async (req, res) => {
  try {
    const resPengeluaran = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Pengeluaran!A2:F',
    });
    const rows = resPengeluaran.data.values || [];
    
    let dataFormatted = rows.map(row => ({
      Tanggal: row[0] || '',
      Kategori: row[1] || '',
      Keterangan: row[2] || '-',
      Nominal: row[3] || '0',
      Metode_Pembayaran: row[4] || '-',
      Ket_Tambahan: row[5] || '-'
    }));

    res.json({ success: true, data: dataFormatted });
  } catch (error) {
    console.error('Error Pengeluaran Harian:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// C. Laporan Laba Rugi
app.get('/api/laporan/laba-rugi', async (req, res) => {
  try {
    // 1. Pendapatan Penjualan
    const resPenjualan = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Penjualan!A2:H',
    });
    const rowsPenjualan = resPenjualan.data.values || [];
    
    let totalPendapatan = 0;
    rowsPenjualan.forEach(row => {
      const qty = parseAngka(row[2]);
      const harga = parseAngka(row[3]);
      const total = parseAngka(row[4]);
      
      const nominalBaris = total > 0 ? total : (qty * harga);
      totalPendapatan += nominalBaris;
    });

    // 2. Pengeluaran (HPP vs Biaya Operasional)
    const resPengeluaran = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Pengeluaran!A2:F',
    });
    const rowsPengeluaran = resPengeluaran.data.values || [];

    let hppBahanBaku = 0;
    let biayaOperasional = 0;

    rowsPengeluaran.forEach(row => {
      const kategori = (row[1] || '').toString().toLowerCase();
      const nominal = parseAngka(row[3]);

      if (kategori.includes('bahan') || kategori.includes('hpp') || kategori.includes('baku')) {
        hppBahanBaku += nominal;
      } else {
        biayaOperasional += nominal;
      }
    });

    const labaKotor = totalPendapatan - hppBahanBaku;
    const labaBersih = labaKotor - biayaOperasional;

    res.json({
      success: true,
      ringkasan: {
        total_pendapatan: totalPendapatan,
        hpp_bahan_baku: hppBahanBaku,
        laba_kotor: labaKotor,
        biaya_operasional: biayaOperasional,
        laba_bersih: labaBersih,
      }
    });
  } catch (error) {
    console.error('Error Laba Rugi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// D. Laporan Arus Kas
app.get('/api/laporan/arus-kas', async (req, res) => {
  try {
    const resPenjualan = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Penjualan!A2:H',
    });
    const rowsPenjualan = resPenjualan.data.values || [];
    
    let kasMasuk = 0;
    rowsPenjualan.forEach(row => {
      const qty = parseAngka(row[2]);
      const harga = parseAngka(row[3]);
      const total = parseAngka(row[4]);
      kasMasuk += total > 0 ? total : (qty * harga);
    });

    const resPengeluaran = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Pengeluaran!A2:F',
    });
    const rowsPengeluaran = resPengeluaran.data.values || [];

    let kasKeluar = 0;
    rowsPengeluaran.forEach(row => {
      kasKeluar += parseAngka(row[3]);
    });

    res.json({
      success: true,
      kas_masuk: { total_kas_masuk: kasMasuk },
      kas_keluar: { total_kas_keluar: kasKeluar },
      saldo_kas_akhir: kasMasuk - kasKeluar
    });
  } catch (error) {
    console.error('Error Arus Kas:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// E. Laporan Status Piutang (Kasbon)
app.get('/api/laporan/piutang', async (req, res) => {
  try {
    const resPenjualan = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Penjualan!A2:H',
    });
    const rowsPenjualan = resPenjualan.data.values || [];
    let piutangKotor = 0;

    rowsPenjualan.forEach(row => {
      const metode = (row[6] || '').toString().toLowerCase();
      const qty = parseAngka(row[2]);
      const harga = parseAngka(row[3]);
      const total = parseAngka(row[4]);
      const nominal = total > 0 ? total : (qty * harga);

      if (metode.includes('kasbon') || metode.includes('piutang')) {
        piutangKotor += nominal;
      }
    });

    const resPelunasan = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Pelunasan_Piutang!A2:F',
    });
    const rowsPelunasan = resPelunasan.data.values || [];

    let totalPelunasan = 0;
    rowsPelunasan.forEach(row => {
      totalPelunasan += parseAngka(row[3]);
    });

    res.json({
      success: true,
      total_piutang_kotor: piutangKotor,
      total_sudah_dilunasi: totalPelunasan,
      sisa_piutang_aktif: piutangKotor - totalPelunasan
    });
  } catch (error) {
    console.error('Error Piutang:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================================================
// 5. API POST ENDPOINTS (MENYIMPAN DATA BARU)
// ==================================================

// Input Penjualan -> Tab Penjualan!A:H
app.post('/api/input/penjualan', async (req, res) => {
  try {
    const { tanggal, menu, qty, harga, pelanggan, metode, keterangan } = req.body;

    // Validasi sederhana
    if (!menu) {
      return res.status(400).json({ success: false, message: 'Nama menu wajib diisi!' });
    }

    const qtyNum = parseInt(qty, 10) || 0;
    const hargaNum = parseInt(harga, 10) || 0;
    const totalNum = qtyNum * hargaNum;

    // Menambahkan baris ke tab Penjualan
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Penjualan!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          tanggal || new Date().toISOString().split('T')[0],
          menu,
          qtyNum,
          hargaNum,
          totalNum,
          pelanggan || '-',
          metode || 'Tunai',
          keterangan || '-'
        ]],
      },
    });

    res.json({ success: true, message: 'Data Penjualan berhasil ditambahkan!' });
  } catch (error) {
    console.error('Error Input Penjualan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Input Pengeluaran -> Tab Pengeluaran!A:F
app.post('/api/input/pengeluaran', async (req, res) => {
  try {
    const { tanggal, kategori, keterangan, nominal, metode, ket_tambahan } = req.body;

    if (!kategori || !nominal) {
      return res.status(400).json({ success: false, message: 'Kategori dan Nominal wajib diisi!' });
    }

    const nominalNum = parseInt(nominal, 10) || 0;

    // Menambahkan baris ke tab Pengeluaran
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Pengeluaran!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          tanggal || new Date().toISOString().split('T')[0],
          kategori,
          keterangan || '-',
          nominalNum,
          metode || 'Tunai',
          ket_tambahan || '-'
        ]],
      },
    });

    res.json({ success: true, message: 'Data Pengeluaran berhasil ditambahkan!' });
  } catch (error) {
    console.error('Error Input Pengeluaran:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Fallback jika API endpoint tidak ditemukan
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint API tidak ditemukan' });
});

// ==================================================
// 6. ROUTE TAMPILAN WEB (HALAMAN FRONTEND)
// ==================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ==================================================
// 7. JALANKAN SERVER
// ==================================================
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server Warkop berjalan di http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} sedang digunakan oleh aplikasi lain!`);
  } else {
    console.error('Error Server:', err.message);
  }
});