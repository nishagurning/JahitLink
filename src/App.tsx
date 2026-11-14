import React, { useEffect, useMemo, useState } from 'react';

type View =
  | 'landing'
  | 'portal'
  | 'auth-customer'
  | 'auth-admin'
  | 'customer-dashboard'
  | 'order-detail'
  | 'admin-workspace';

type OrderStatus =
  | 'Menunggu konfirmasi'
  | 'Menunggu pengerjaan'
  | 'Dalam pengerjaan'
  | 'Siap fitting'
  | 'Perlu revisi'
  | 'Siap diambil'
  | 'Selesai';

interface CustomerUser {
  id: number;
  name: string;
  phone: string;
}

interface PaymentItem {
  amount: number;
  method: string;
  date: string;
}

interface ProgressItem {
  status: OrderStatus;
  note: string;
  date: string;
}

interface AdminOrder {
  id: string;
  token: string;
  createdAt: string;
  customer: string;
  service: 'Jahit baru' | 'Permak' | 'Perbaikan';
  garment: string;
  model: string;
  dueDate: string;
  fittingDate: string;
  total: number;
  payments: PaymentItem[];
  progress: ProgressItem[];
  customerAccountId: number | null;
  phone: string;
  address: string;
  material: string;
  materialAmount: string;
  note: string;
  measurements: Record<string, string>;
  pickedUpAt: string | null;
}

interface CustomerOrderSummary {
  id: string;
  token: string;
  createdAt: string;
  garment: string;
  service: string;
  dueDate: string;
  total: number;
  paid: number;
  status: OrderStatus;
}

interface TrackedOrder {
  id: string;
  createdAt: string;
  customer: string;
  service: string;
  garment: string;
  model: string;
  dueDate: string;
  fittingDate: string;
  total: number;
  paid: number;
  progress: ProgressItem[];
}

const STATUS_TABS: ('Semua' | OrderStatus)[] = [
  'Semua',
  'Menunggu konfirmasi',
  'Menunggu pengerjaan',
  'Dalam pengerjaan',
  'Siap fitting',
  'Perlu revisi',
  'Siap diambil',
  'Selesai',
];

const STEPPER_LABELS = [
  'Pesanan Diterima',
  'Pengukuran / Menunggu',
  'Dalam Pengerjaan',
  'Siap Fitting / Diambil',
  'Selesai',
];

const formatRupiah = (amount: number) => `Rp${(amount || 0).toLocaleString('id-ID')}`;

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'JL';

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'Dalam pengerjaan':
      return 'badge badge-blue';
    case 'Siap fitting':
    case 'Siap diambil':
    case 'Selesai':
      return 'badge badge-green';
    case 'Menunggu konfirmasi':
    case 'Menunggu pengerjaan':
      return 'badge badge-amber';
    case 'Perlu revisi':
      return 'badge badge-red';
    default:
      return 'badge badge-amber';
  }
};

const getProgressStepIndex = (status: string) => {
  switch (status) {
    case 'Menunggu konfirmasi':
      return 0;
    case 'Menunggu pengerjaan':
      return 1;
    case 'Dalam pengerjaan':
    case 'Perlu revisi':
      return 2;
    case 'Siap fitting':
    case 'Siap diambil':
      return 3;
    case 'Selesai':
      return 4;
    default:
      return 0;
  }
};

const LogoMark = () => (
  <span className="brand-mark" aria-hidden="true">
    J
  </span>
);

async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Permintaan gagal (${res.status})`);
  }
  return data;
}

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [previousView, setPreviousView] = useState<View>('landing');

  // Auth states
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [customerUser, setCustomerUser] = useState<CustomerUser | null>(null);

  // Forms Auth
  const [adminIdentInput, setAdminIdentInput] = useState('admin');
  const [adminPassInput, setAdminPassInput] = useState('');
  const [customerTab, setCustomerTab] = useState<'login' | 'register'>('login');
  const [custNameInput, setCustNameInput] = useState('');
  const [custPhoneInput, setCustPhoneInput] = useState('');
  const [custPassInput, setCustPassInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Orders Data
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<CustomerUser[]>([]);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<TrackedOrder | null>(null);

  // Track modal
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackTokenInput, setTrackTokenInput] = useState('');
  const [trackError, setTrackError] = useState('');

  // Customer UI
  const [customerNav, setCustomerNav] = useState<'pesanan' | 'profil' | 'bantuan'>('pesanan');

  // Admin UI
  const [adminNav, setAdminNav] = useState<'pesanan' | 'buat'>('pesanan');
  const [statusFilter, setStatusFilter] = useState<'Semua' | OrderStatus>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [managingOrder, setManagingOrder] = useState<AdminOrder | null>(null);
  const [adminFeedback, setAdminFeedback] = useState('');

  // Manage order modal inputs
  const [nextStatus, setNextStatus] = useState<OrderStatus>('Dalam pengerjaan');
  const [progressNote, setProgressNote] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [linkCustomerId, setLinkCustomerId] = useState<string>('');

  // Create order form
  const [newOrder, setNewOrder] = useState({
    customer: '',
    phone: '',
    address: '',
    service: 'Jahit baru' as 'Jahit baru' | 'Permak' | 'Perbaikan',
    garment: '',
    model: '',
    material: '',
    materialAmount: '',
    fittingDate: '',
    dueDate: '',
    total: '',
    deposit: '0',
    paymentMethod: 'Tunai',
    note: '',
    measurementsText: '',
    customerAccountId: '',
  });

  const refreshAdminData = async () => {
    const [ordersData, customersData] = await Promise.all([
      apiFetch('/api/orders'),
      apiFetch('/api/customer-accounts'),
    ]);
    setAdminOrders(ordersData.orders || []);
    setCustomerAccounts(customersData.customers || []);
  };

  const refreshCustomerOrders = async () => {
    const data = await apiFetch('/api/customer/orders');
    setCustomerOrders(data.orders || []);
  };

  const checkSessions = async () => {
    try {
      const [adminStatus, custStatus] = await Promise.all([
        apiFetch('/api/auth/status'),
        apiFetch('/api/customer/auth/status'),
      ]);
      setAdminSetupRequired(Boolean(adminStatus.setupRequired));
      if (adminStatus.authenticated) {
        setAdminUsername(adminStatus.username);
        await refreshAdminData();
        setView('admin-workspace');
        return;
      }
      if (custStatus.authenticated && custStatus.customer) {
        setCustomerUser(custStatus.customer);
        await refreshCustomerOrders();
        setView('customer-dashboard');
      }
    } catch {
      // Server belum menyala atau sesi kosong
    }
  };

  useEffect(() => {
    checkSessions();
  }, []);

  const handleOpenAdminPortal = async () => {
    setAuthError('');
    try {
      const status = await apiFetch('/api/auth/status');
      setAdminSetupRequired(Boolean(status.setupRequired));
      if (status.authenticated) {
        setAdminUsername(status.username);
        await refreshAdminData();
        setView('admin-workspace');
        return;
      }
    } catch {
      // tetap buka form login
    }
    setView('auth-admin');
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const endpoint = adminSetupRequired ? '/api/auth/setup' : '/api/auth/login';
      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          username: adminIdentInput.trim(),
          password: adminPassInput,
        }),
      });
      setAdminSetupRequired(false);
      setAdminUsername(data.username);
      await refreshAdminData();
      setAdminNav('pesanan');
      setView('admin-workspace');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login admin gagal.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const endpoint =
        customerTab === 'login'
          ? '/api/customer/auth/login'
          : '/api/customer/auth/register';
      const body =
        customerTab === 'login'
          ? { phone: custPhoneInput, password: custPassInput }
          : { name: custNameInput, phone: custPhoneInput, password: custPassInput };

      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCustomerUser(data.customer);
      await refreshCustomerOrders();
      setCustomerNav('pesanan');
      setView('customer-dashboard');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Autentikasi pelanggan gagal.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogoutAdmin = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAdminUsername(null);
    setAdminOrders([]);
    setView('landing');
  };

  const handleLogoutCustomer = async () => {
    await apiFetch('/api/customer/auth/logout', { method: 'POST' }).catch(() => {});
    setCustomerUser(null);
    setCustomerOrders([]);
    setView('landing');
  };

  const handleTrackByToken = async (token: string, fromView: View) => {
    const cleanToken = token.trim();
    const data = await apiFetch(`/api/track/${encodeURIComponent(cleanToken)}`);
    setSelectedOrder(data.order);
    setPreviousView(fromView);
    setView('order-detail');
  };

  const handleSubmitTrackModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError('');
    try {
      await handleTrackByToken(trackTokenInput, view);
      setShowTrackModal(false);
    } catch (err) {
      setTrackError(
        err instanceof Error
          ? err.message
          : 'Token pelacakan tidak valid atau tidak ditemukan.'
      );
    }
  };

  const handleOpenAdminOrderDetail = (order: AdminOrder) => {
    const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    setSelectedOrder({
      id: order.id,
      createdAt: order.createdAt,
      customer: order.customer,
      service: order.service,
      garment: order.garment,
      model: order.model,
      dueDate: order.dueDate,
      fittingDate: order.fittingDate,
      total: order.total,
      paid,
      progress: order.progress,
    });
    setPreviousView('admin-workspace');
    setView('order-detail');
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminFeedback('');
    try {
      const measurements: Record<string, string> = {};
      newOrder.measurementsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((pair) => {
          const [k, ...rest] = pair.split(':');
          if (k && rest.length) measurements[k.trim()] = rest.join(':').trim();
        });

      const created = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer: newOrder.customer,
          phone: newOrder.phone,
          address: newOrder.address,
          service: newOrder.service,
          garment: newOrder.garment,
          model: newOrder.model,
          material: newOrder.material,
          materialAmount: newOrder.materialAmount,
          fittingDate: newOrder.fittingDate,
          dueDate: newOrder.dueDate,
          total: Number(newOrder.total),
          deposit: Number(newOrder.deposit || 0),
          paymentMethod: newOrder.paymentMethod,
          note: newOrder.note,
          measurements,
        }),
      });

      if (newOrder.customerAccountId && created.order?.id) {
        await apiFetch(`/api/orders/${created.order.id}/customer-account`, {
          method: 'POST',
          body: JSON.stringify({
            customerAccountId: Number(newOrder.customerAccountId),
          }),
        });
      }

      setNewOrder({
        customer: '',
        phone: '',
        address: '',
        service: 'Jahit baru',
        garment: '',
        model: '',
        material: '',
        materialAmount: '',
        fittingDate: '',
        dueDate: '',
        total: '',
        deposit: '0',
        paymentMethod: 'Tunai',
        note: '',
        measurementsText: '',
        customerAccountId: '',
      });
      await refreshAdminData();
      setAdminNav('pesanan');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Gagal membuat pesanan.');
    }
  };

  const openManageModal = (order: AdminOrder) => {
    setManagingOrder(order);
    setAdminFeedback('');
    const currentStatus = order.progress.at(-1)?.status || 'Menunggu pengerjaan';
    setNextStatus(currentStatus);
    setProgressNote('');
    setPaymentAmount('');
    setPaymentMethod('Tunai');
    setLinkCustomerId(order.customerAccountId ? String(order.customerAccountId) : '');
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingOrder) return;
    setAdminFeedback('');
    try {
      const res = await apiFetch(`/api/orders/${managingOrder.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus, note: progressNote }),
      });
      setManagingOrder(res.order);
      await refreshAdminData();
      setProgressNote('');
      setAdminFeedback('Progres jahitan berhasil diperbarui.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Gagal update progres.');
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingOrder) return;
    setAdminFeedback('');
    try {
      const res = await apiFetch(`/api/orders/${managingOrder.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(paymentAmount),
          method: paymentMethod,
        }),
      });
      setManagingOrder(res.order);
      await refreshAdminData();
      setPaymentAmount('');
      setAdminFeedback('Pembayaran berhasil dicatat.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Gagal mencatat pembayaran.');
    }
  };

  const handleLinkCustomer = async () => {
    if (!managingOrder) return;
    setAdminFeedback('');
    try {
      const res = await apiFetch(`/api/orders/${managingOrder.id}/customer-account`, {
        method: 'POST',
        body: JSON.stringify({
          customerAccountId: linkCustomerId ? Number(linkCustomerId) : null,
        }),
      });
      setManagingOrder(res.order);
      await refreshAdminData();
      setAdminFeedback('Tautan akun pelanggan diperbarui.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Gagal menautkan akun.');
    }
  };

  const handleMarkPickedUp = async () => {
    if (!managingOrder) return;
    setAdminFeedback('');
    try {
      const res = await apiFetch(`/api/orders/${managingOrder.id}/pickup`, {
        method: 'POST',
      });
      setManagingOrder(res.order);
      await refreshAdminData();
      setAdminFeedback('Pesanan ditandai sudah diambil & selesai.');
    } catch (err) {
      setAdminFeedback(err instanceof Error ? err.message : 'Gagal menandai selesai.');
    }
  };

  const filteredAdminOrders = useMemo(() => {
    return adminOrders.filter((order) => {
      const currentStatus = order.progress.at(-1)?.status || 'Menunggu pengerjaan';
      const matchStatus = statusFilter === 'Semua' || currentStatus === statusFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        order.customer.toLowerCase().includes(q) ||
        order.id.toLowerCase().includes(q) ||
        order.garment.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [adminOrders, statusFilter, searchQuery]);

  const adminStats = useMemo(() => {
    const total = adminOrders.length;
    const inProgress = adminOrders.filter((o) => {
      const s = o.progress.at(-1)?.status || '';
      return ['Menunggu pengerjaan', 'Dalam pengerjaan', 'Perlu revisi'].includes(s);
    }).length;
    const ready = adminOrders.filter((o) => {
      const s = o.progress.at(-1)?.status || '';
      return ['Siap diambil', 'Siap fitting'].includes(s);
    }).length;
    const unpaid = adminOrders.filter((o) => {
      const paid = o.payments.reduce((sum, p) => sum + p.amount, 0);
      return paid < o.total;
    }).length;
    return { total, inProgress, ready, unpaid };
  }, [adminOrders]);

  // =========================================================
  // 1. LANDING PAGE
  // =========================================================
  if (view === 'landing') {
    return (
      <div className="page-wrapper">
        <header className="top-nav">
          <div className="container nav-inner">
            <div className="brand" onClick={() => setView('landing')}>
              <LogoMark />
              <span>JahitLink</span>
            </div>
            <nav className="nav-links">
              <a href="#beranda">Beranda</a>
              <a href="#layanan">Layanan</a>
              <a href="#cara-pesan">Cara Pesan</a>
              <a href="#lokasi">Lokasi Pesanan</a>
            </nav>
            <div className="nav-actions">
              <button
                className="btn-ghost"
                onClick={() => {
                  setAuthError('');
                  setView('portal');
                }}
              >
                Masuk
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setAuthError('');
                  setView('portal');
                }}
              >
                Mulai Pesanan →
              </button>
            </div>
          </div>
        </header>

        <main className="container">
          <section id="beranda" className="hero-section">
            <div className="hero-copy">
              <span className="eyebrow-pill">+ JAHITAN PERSONAL, HASIL ISTIMEWA</span>
              <h1>
                Jahitan yang pas,
                <br />
                untuk ceritamu.
              </h1>
              <p className="hero-desc">
                Wujudkan pakaian sesuai ukuran dan gayamu. Pesanan dicatat langsung
                oleh admin atau penjahit studio.
              </p>
              <div className="hero-buttons">
                <button
                  className="btn-primary btn-lg"
                  onClick={() => {
                    setTrackError('');
                    setShowTrackModal(true);
                  }}
                >
                  Lacak Pesanan →
                </button>
                <a href="#cara-pesan" className="btn-outline btn-lg">
                  ▶ Pelajari Proses
                </a>
              </div>
            </div>
            <div className="hero-media">
              <div className="hero-photo-frame">
                <img
                src="/mesin jahit.png"
                alt="Mesin jahit studio JahitLink"
                />
                </div>
            </div>
          </section>
          
          <section id="layanan" className="services-section">
            <span className="eyebrow-pill">+ LAYANAN KAMI</span>
            <h2>Dari ide, jadi pakaian favorit.</h2>
            <div className="services-grid">
              <div className="service-card">
                <div className="service-icon">
                  <img src="jahit pakaian.png" alt="Jahit pakaian baru" />
                  </div>
                  <div>
                    <h3>Jahit pakaian baru</h3>
                    <p>Dari desain hingga model sesuai ukuran tubuh Anda.</p>
                    </div>
                    </div>
                    
            <div className="service-card">
              <div className="service-icon">
                <img src="permak pakaian.png" alt="Permak pakaian" />
                </div>
                <div>
                  <h3>Permak pakaian</h3>
                  <p>Sesuaikan ukuran pakaian agar jatuh sempurna.</p>
                  </div>
                </div>
                  
            <div className="service-card">
              <div className="service-icon">
                <img src="perbaiki baju.png" alt="Perbaikan jahitan" />
                </div>
                <div>
                  <h3>Perbaikan jahitan</h3>
                  <p>Perbaiki pakaian kesayangan dengan rapi dan kuat.</p>
                  </div>
                </div>
            </div>              
          </section>

          <section id="cara-pesan" className="process-section">
            <span className="eyebrow-pill">+ CARA PESAN</span>
            <h2>Proses jahit transparan & terpantau.</h2>
            <div className="process-grid">
              <div className="process-step-card">
                <span className="step-num">01</span>
                <h4>Konsultasi & Ukur</h4>
                <p>Datang ke studio atau kirim detail model & ukuran ke admin.</p>
              </div>
              <div className="process-step-card">
                <span className="step-num">02</span>
                <h4>Dapat Token Pelacakan</h4>
                <p>Admin mencatat pesanan dan menautkan ke akun pelanggan Anda.</p>
              </div>
              <div className="process-step-card">
                <span className="step-num">03</span>
                <h4>Pantau Real-Time</h4>
                <p>Cek progres dari pemotongan hingga siap fitting & diambil.</p>
              </div>
            </div>
          </section>

          <section id="lokasi" className="location-banner">
            <div>
              <h3>Studio JahitLink</h3>
              <p>Jl. Kemang Raya No. 24, Jakarta Selatan • Buka Senin–Sabtu (09.00 – 18.00 WIB)</p>
            </div>
            <button className="btn-primary" onClick={() => setShowTrackModal(true)}>
              Lacak via Token
            </button>
          </section>
        </main>

        {showTrackModal && (
          <div className="modal-backdrop" onClick={() => setShowTrackModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3>Lacak Progres Pesanan</h3>
              <p className="muted-text">
                Masukkan <b>token pelacakan</b> (64 karakter) yang diberikan oleh admin, atau
                masuk melalui portal Pelanggan untuk melihat seluruh pesanan Anda.
              </p>
              <form onSubmit={handleSubmitTrackModal}>
                <input
                  className="input-field"
                  placeholder="Tempel token pelacakan di sini..."
                  value={trackTokenInput}
                  onChange={(e) => setTrackTokenInput(e.target.value)}
                />
                {trackError && <p className="error-text">{trackError}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setShowTrackModal(false)}
                  >
                    Batal
                  </button>
                  <button type="submit" className="btn-primary">
                    Lacak Sekarang
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================
  // 2. PORTAL SELECTION
  // =========================================================
  if (view === 'portal') {
    return (
      <div className="auth-bg">
        <div className="portal-card">
          <div className="brand center-brand">
            <LogoMark />
            <span>JahitLink</span>
          </div>
          <h1>Masuk ke JahitLink</h1>
          <p className="muted-text">Pilih portal sesuai akun yang Anda gunakan.</p>

          <div className="portal-options">
            <button
              className="portal-option-btn"
              onClick={() => {
                setAuthError('');
                setView('auth-customer');
              }}
            >
              <div className="portal-icon">
                <img src="/user.png" alt="Portal Pelanggan" />
              </div>
              <div className="portal-text">
                <strong>Pelanggan</strong>
                <span>Masuk atau buat akun untuk melihat pesanan.</span>
              </div>
              <span className="arrow">→</span>
            </button>

            <button className="portal-option-btn" onClick={handleOpenAdminPortal}>
              <div className="portal-icon">
                <img src="/admin.png" alt="Portal Admin atau Penjahit" />
              </div>
              <div className="portal-text">
                <strong>Admin atau penjahit</strong>
                <span>Kelola pesanan dan progres jahitan.</span>
              </div>
              <span className="arrow">→</span>
            </button>
          </div>

          <button className="back-link-center" onClick={() => setView('landing')}>
            ← Kembali ke halaman utama
          </button>
        </div>
      </div>
    );
  }

  // =========================================================
  // 3. AUTH ADMIN (SETUP PERTAMA / LOGIN)
  // =========================================================
  if (view === 'auth-admin') {
    return (
      <div className="auth-bg">
        <div className="auth-card-narrow">
          <div className="brand center-brand">
            <LogoMark />
            <span>JahitLink</span>
          </div>
          <span className="eyebrow-pill center-pill">AREA TERBATAS</span>
          <h2>{adminSetupRequired ? 'Buat akun admin pertama' : 'Masuk ke ruang kerja'}</h2>
          <p className="muted-text">
            {adminSetupRequired
              ? 'Belum ada akun admin di database. Buat akun admin studio sekarang (kata sandi minimal 10 karakter).'
              : 'Masuk untuk membuat dan mengelola pesanan jahit.'}
          </p>

          <form onSubmit={handleAdminSubmit} className="auth-form">
            <div className="input-group">
              <span className="input-icon">👤</span>
              <input
                type="text"
                placeholder="Nama pengguna atau email"
                value={adminIdentInput}
                onChange={(e) => setAdminIdentInput(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <span className="input-icon">🔒</span>
              <input
                type="password"
                placeholder={
                  adminSetupRequired ? 'Kata sandi (min. 10 karakter)' : 'Kata sandi'
                }
                value={adminPassInput}
                onChange={(e) => setAdminPassInput(e.target.value)}
                required
              />
            </div>
            {authError && <p className="error-text">{authError}</p>}
            <button type="submit" className="btn-primary full-width" disabled={authLoading}>
              {authLoading
                ? 'Memproses...'
                : adminSetupRequired
                ? 'Buat Akun Admin & Masuk'
                : 'Masuk'}
            </button>
          </form>

          <button className="back-link-center" onClick={() => setView('portal')}>
            ← Pilih jenis akun
          </button>
        </div>
      </div>
    );
  }

  // =========================================================
  // 4. AUTH PELANGGAN
  // =========================================================
  if (view === 'auth-customer') {
    return (
      <div className="auth-bg">
        <div className="customer-auth-split">
          <div className="customer-auth-left">
            <div className="brand center-brand">
              <LogoMark />
              <span>JahitLink</span>
            </div>
            <span className="eyebrow-pill center-pill">AKUN PELANGGAN</span>
            <h2>Masuk atau Daftar</h2>
            <p className="muted-text">Akses pesanan Anda dengan akun pelanggan.</p>

            <div className="auth-tabs">
              <button
                type="button"
                className={customerTab === 'login' ? 'active' : ''}
                onClick={() => {
                  setCustomerTab('login');
                  setAuthError('');
                }}
              >
                Masuk
              </button>
              <button
                type="button"
                className={customerTab === 'register' ? 'active' : ''}
                onClick={() => {
                  setCustomerTab('register');
                  setAuthError('');
                }}
              >
                Daftar
              </button>
            </div>

            <form onSubmit={handleCustomerSubmit} className="auth-form">
              {customerTab === 'register' && (
                <div className="input-group">
                  <span className="input-icon">👤</span>
                  <input
                    type="text"
                    placeholder="Nama lengkap"
                    value={custNameInput}
                    onChange={(e) => setCustNameInput(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="input-group">
                <span className="input-icon">📞</span>
                <input
                  type="text"
                  placeholder="Nomor HP (8–15 digit)"
                  value={custPhoneInput}
                  onChange={(e) => setCustPhoneInput(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <span className="input-icon">🔒</span>
                <input
                  type="password"
                  placeholder={
                    customerTab === 'register'
                      ? 'Kata sandi (min. 10 karakter)'
                      : 'Kata sandi'
                  }
                  value={custPassInput}
                  onChange={(e) => setCustPassInput(e.target.value)}
                  required
                />
              </div>
              {authError && <p className="error-text">{authError}</p>}
              <button type="submit" className="btn-primary full-width" disabled={authLoading}>
                {authLoading
                  ? 'Memproses...'
                  : customerTab === 'login'
                  ? 'Masuk'
                  : 'Daftar Sekarang'}
              </button>
            </form>

            <button className="back-link-center" onClick={() => setView('portal')}>
              ← Pilih jenis akun
            </button>
          </div>

         <div className="customer-auth-right">
          <div className="auth-photo-box">
            <img src="/gaun.png" alt="Koleksi pakaian JahitLink" />
            <div className="auth-photo-caption">
              <span>STUDIO JAHITLINK</span>
              <p>Jahitan personal dengan ukuran presisi & progres terpantau.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
      );
    }

  // =========================================================
  // 5. DETAIL / PELACAKAN PESANAN
  // =========================================================
  if (view === 'order-detail' && selectedOrder) {
    const latestStatus =
      selectedOrder.progress.at(-1)?.status || 'Menunggu pengerjaan';
    const currentStepIdx = getProgressStepIndex(latestStatus);
    const remaining = Math.max(0, selectedOrder.total - selectedOrder.paid);
    const isPaid = remaining === 0;

    return (
      <div className="page-wrapper soft-bg">
        <header className="top-nav">
          <div className="container nav-inner">
            <div className="brand" onClick={() => setView(previousView)}>
              <LogoMark />
              <span>JahitLink</span>
            </div>
            <span className="header-tag">PELACAKAN PESANAN</span>
          </div>
        </header>

        <main className="container detail-container">
          <button className="back-link" onClick={() => setView(previousView)}>
            ← Kembali
          </button>

          <div className="detail-header-row">
            <h1>Detail Pesanan</h1>
            <span className="order-code">#{selectedOrder.id}</span>
            <span className={getStatusBadgeClass(latestStatus)}>{latestStatus}</span>
          </div>

          <div className="detail-top-grid">
            <div className="card garment-detail-card">
              <img
                src="/garment-dress.svg"
                alt={selectedOrder.garment}
                className="garment-thumb-lg"
              />
              <div className="garment-meta">
                <h2>{selectedOrder.garment}</h2>
                <ul>
                  <li>
                    <span>Pelanggan</span>
                    <strong>: {selectedOrder.customer}</strong>
                  </li>
                  <li>
                    <span>Jenis layanan</span>
                    <strong>: {selectedOrder.service}</strong>
                  </li>
                  <li>
                    <span>Tanggal pesanan</span>
                    <strong>: {selectedOrder.createdAt}</strong>
                  </li>
                  <li>
                    <span>Estimasi selesai</span>
                    <strong>: {selectedOrder.dueDate || '-'}</strong>
                  </li>
                  {selectedOrder.fittingDate && (
                    <li>
                      <span>Jadwal fitting</span>
                      <strong>: {selectedOrder.fittingDate}</strong>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="card payment-summary-card">
              <span className="payment-label">Sisa Pembayaran</span>
              <div className="payment-amount">{formatRupiah(remaining)}</div>
              <p className="muted-text">
                {isPaid
                  ? 'Pembayaran telah lunas. Terima kasih!'
                  : `Total biaya ${formatRupiah(selectedOrder.total)} • Sudah dibayar ${formatRupiah(
                      selectedOrder.paid
                    )}`}
              </p>
              <div className={`payment-pill ${isPaid ? 'paid' : 'unpaid'}`}>
                Rp {isPaid ? 'Lunas' : 'Belum lunas'}
              </div>
            </div>
          </div>

          <div className="card stepper-card">
            <h3>Progres Jahitan</h3>
            <div className="stepper-track">
              {STEPPER_LABELS.map((label, idx) => {
                const isDone = idx < currentStepIdx || latestStatus === 'Selesai';
                const isActive = idx === currentStepIdx && latestStatus !== 'Selesai';
                return (
                  <div
                    key={label}
                    className={`step-item ${isDone ? 'done' : ''} ${
                      isActive ? 'active' : ''
                    }`}
                  >
                    <div className="step-dot">{isDone ? '✓' : isActive ? '●' : ''}</div>
                    <span className="step-label">{label}</span>
                  </div>
                );
              })}
            </div>

            {selectedOrder.progress.length > 0 && (
              <div style={{ marginTop: 24, borderTop: '1px solid #e5ece8', paddingTop: 16 }}>
                <h4 style={{ margin: '0 0 10px' }}>Riwayat Catatan Progres</h4>
                {selectedOrder.progress.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      fontSize: '0.88rem',
                    }}
                  >
                    <span>
                      <strong>{item.status}</strong> — {item.note}
                    </span>
                    <span className="muted-text">{item.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // =========================================================
  // 6. DASHBOARD PELANGGAN
  // =========================================================
  if (view === 'customer-dashboard' && customerUser) {
    const latestOrder = customerOrders[0];

    return (
      <div className="page-wrapper soft-bg">
        <header className="top-nav">
          <div className="container nav-inner">
            <div className="brand" onClick={() => setCustomerNav('pesanan')}>
              <LogoMark />
              <span>JahitLink</span>
            </div>
            <nav className="nav-links">
              <button className="nav-link-btn" onClick={() => setView('landing')}>
                Beranda
              </button>
              <button
                className={`nav-link-btn ${customerNav === 'pesanan' ? 'active' : ''}`}
                onClick={() => setCustomerNav('pesanan')}
              >
                Pesanan Saya
              </button>
              <button
                className={`nav-link-btn ${customerNav === 'profil' ? 'active' : ''}`}
                onClick={() => setCustomerNav('profil')}
              >
                Profil Saya
              </button>
              <button
                className={`nav-link-btn ${customerNav === 'bantuan' ? 'active' : ''}`}
                onClick={() => setCustomerNav('bantuan')}
              >
                Bantuan
              </button>
            </nav>
            <div className="nav-actions">
              <div className="user-pill">
                <span className="avatar-sm">{getInitials(customerUser.name)}</span>
                <span>{customerUser.name}</span>
              </div>
              <button className="btn-outline btn-sm" onClick={handleLogoutCustomer}>
                Keluar
              </button>
            </div>
          </div>
        </header>

        <main className="container customer-main">
          {customerNav === 'pesanan' && (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy">
                  <h1>Halo, {customerUser.name}! 👋</h1>
                  <p>Pantau progres jahitan Anda dengan mudah di JahitLink.</p>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (latestOrder) {
                        handleTrackByToken(latestOrder.token, 'customer-dashboard');
                      }
                    }}
                  >
                    Lihat Pesanan Saya →
                  </button>
                </div>
                <img
                  src="/Banner.png"
                  alt="Studio JahitLink"
                  className="welcome-art"
                />
              </section>

              <section className="customer-grid">
                <div className="card">
                  <div className="card-header-row">
                    <h3>Pesanan Terbaru Anda</h3>
                    <span className="muted-text">{customerOrders.length} Pesanan</span>
                  </div>

                  {customerOrders.length === 0 ? (
                    <p className="muted-text">
                      Belum ada pesanan yang ditautkan ke akun Anda. Minta admin studio
                      menautkan pesanan ke akun Anda ({customerUser.phone}).
                    </p>
                  ) : (
                    <div className="customer-orders-list">
                      {customerOrders.map((order) => (
                        <div key={order.id} className="customer-order-row">
                          <img
                            src="/garment-dress.svg"
                            alt={order.garment}
                            className="order-thumb-sm"
                          />
                          <div className="order-row-info">
                            <div className="order-row-title">
                              <strong>#{order.id}</strong>
                              <span className={getStatusBadgeClass(order.status)}>
                                {order.status}
                              </span>
                            </div>
                            <div className="order-item-name">{order.garment}</div>
                            <div className="order-eta">
                              Estimasi selesai: {order.dueDate || '-'}
                            </div>
                          </div>
                          <button
                            className="btn-outline btn-sm"
                            onClick={() =>
                              handleTrackByToken(order.token, 'customer-dashboard')
                            }
                          >
                            Detail →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card help-card">
                  <div className="help-text">
                    <h3>Butuh Bantuan?</h3>
                    <p className="muted-text">
                      Jika ada pertanyaan terkait ukuran atau jadwal fitting, silakan hubungi
                      studio kami.
                    </p>
                    <button
                      className="btn-outline"
                      onClick={() => setCustomerNav('bantuan')}
                    >
                      Hubungi Kami →
                    </button>
                  </div>
                  <div className="help-icon-circle">🎧</div>
                </div>
              </section>
            </>
          )}

          {customerNav === 'profil' && (
            <div className="card">
              <h2>Profil Saya</h2>
              <p>
                <strong>Nama:</strong> {customerUser.name}
              </p>
              <p>
                <strong>Nomor HP:</strong> {customerUser.phone}
              </p>
            </div>
          )}

          {customerNav === 'bantuan' && (
            <div className="card">
              <h2>Pusat Bantuan Studio JahitLink</h2>
              <p className="muted-text">
                Hubungi admin studio kami melalui WhatsApp atau datang langsung ke studio
                pada jam kerja Senin–Sabtu (09.00 – 18.00 WIB).
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // =========================================================
  // 7. RUANG KERJA ADMIN / PENJAHIT
  // =========================================================
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <LogoMark />
          <span>JahitLink</span>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${adminNav === 'pesanan' ? 'active' : ''}`}
            onClick={() => setAdminNav('pesanan')}
          >
            ⊞ Pesanan
          </button>
          <button
            className={`sidebar-item ${adminNav === 'buat' ? 'active' : ''}`}
            onClick={() => setAdminNav('buat')}
          >
            + Buat pesanan
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-avatar">JL</div>
          <div>
            <strong>{adminUsername || 'Studio Jahit'}</strong>
            <span>Pemilik usaha</span>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumb">
            <span className="muted-text">JahitLink /</span> <strong>Ruang kerja</strong>
          </div>
          <div className="admin-topbar-actions">
            <button className="btn-link" onClick={() => setView('landing')}>
              Lihat halaman pelanggan ↗
            </button>
            <span className="online-pill">● Online</span>
            <button className="btn-outline btn-sm" onClick={handleLogoutAdmin}>
              Keluar
            </button>
          </div>
        </header>

        <div className="admin-content">
          {adminNav === 'pesanan' ? (
            <>
              <div className="workspace-header">
                <div>
                  <h1>Ruang kerja</h1>
                  <p className="muted-text">
                    Pantau pesanan, progres jahitan, jadwal, dan pembayaran.
                  </p>
                </div>
                <button className="btn-primary" onClick={() => setAdminNav('buat')}>
                  + Pesanan baru
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon blue">📄</div>
                  <div>
                    <span className="stat-label">Total pesanan</span>
                    <strong className="stat-value">{adminStats.total}</strong>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon amber">🕒</div>
                  <div>
                    <span className="stat-label">Sedang dikerjakan</span>
                    <strong className="stat-value">{adminStats.inProgress}</strong>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon green">✓</div>
                  <div>
                    <span className="stat-label">Siap diambil / fitting</span>
                    <strong className="stat-value">{adminStats.ready}</strong>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon purple">Rp</div>
                  <div>
                    <span className="stat-label">Belum lunas</span>
                    <strong className="stat-value">{adminStats.unpaid}</strong>
                  </div>
                </div>
              </div>

              <div className="card table-card">
                <div className="table-toolbar">
                  <div>
                    <h3>Daftar pekerjaan</h3>
                    <span className="muted-text">{filteredAdminOrders.length} pesanan</span>
                  </div>
                  <div className="search-box">
                    <span>🔍</span>
                    <input
                      type="text"
                      placeholder="Cari nama atau nomor..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="filter-tabs">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab}
                      className={`filter-tab ${statusFilter === tab ? 'active' : ''}`}
                      onClick={() => setStatusFilter(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="table-responsive">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>PELANGGAN</th>
                        <th>PESANAN</th>
                        <th>TARGET SELESAI</th>
                        <th>PROGRES</th>
                        <th>PEMBAYARAN</th>
                        <th>AKSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdminOrders.map((order) => {
                        const paid = order.payments.reduce((s, p) => s + p.amount, 0);
                        const isPaid = paid >= order.total;
                        const currentStatus =
                          order.progress.at(-1)?.status || 'Menunggu pengerjaan';

                        return (
                          <tr key={order.id}>
                            <td>
                              <div className="cust-cell">
                                <span className="avatar-sm">
                                  {getInitials(order.customer)}
                                </span>
                                <div>
                                  <strong>{order.customer}</strong>
                                  <div className="muted-xs">{order.garment}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <strong>#{order.id}</strong>
                            </td>
                            <td>{order.dueDate || '-'}</td>
                            <td>
                              <span className={getStatusBadgeClass(currentStatus)}>
                                {currentStatus}
                              </span>
                            </td>
                            <td>
                              <div className="pay-cell">
                                <strong className={isPaid ? 'text-green' : ''}>
                                  {isPaid ? 'Lunas' : 'Belum lunas'}
                                </strong>
                                <span className="muted-xs">
                                  {isPaid
                                    ? formatRupiah(order.total)
                                    : `${formatRupiah(paid)} / ${formatRupiah(order.total)}`}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="action-cell">
                                <button
                                  className="btn-outline btn-xs"
                                  onClick={() => openManageModal(order)}
                                >
                                  Kelola
                                </button>
                                <button
                                  className="icon-arrow-btn"
                                  title="Lihat detail"
                                  onClick={() => handleOpenAdminOrderDetail(order)}
                                >
                                  →
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredAdminOrders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="empty-row">
                            Belum ada pesanan atau tidak ada yang cocok dengan filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card create-order-card">
              <div className="workspace-header">
                <div>
                  <h2>Buat Pesanan Baru</h2>
                  <p className="muted-text">
                    Catat detail pelanggan, jenis layanan, ukuran, dan biaya jahitan.
                  </p>
                </div>
                <button className="btn-outline" onClick={() => setAdminNav('pesanan')}>
                  ← Kembali ke Daftar
                </button>
              </div>

              {adminFeedback && <p className="error-text">{adminFeedback}</p>}

              <form onSubmit={handleCreateOrder} className="create-form-grid">
                <label>
                  Nama Pelanggan *
                  <input
                    className="input-field"
                    required
                    placeholder="Contoh: Rina"
                    value={newOrder.customer}
                    onChange={(e) => setNewOrder({ ...newOrder, customer: e.target.value })}
                  />
                </label>
                <label>
                  Nomor HP Pelanggan
                  <input
                    className="input-field"
                    placeholder="081234567890"
                    value={newOrder.phone}
                    onChange={(e) => setNewOrder({ ...newOrder, phone: e.target.value })}
                  />
                </label>
                <label>
                  Nama Pakaian *
                  <input
                    className="input-field"
                    required
                    placeholder="Contoh: Kemeja Wanita"
                    value={newOrder.garment}
                    onChange={(e) => setNewOrder({ ...newOrder, garment: e.target.value })}
                  />
                </label>
                <label>
                  Jenis Layanan *
                  <select
                    className="input-field"
                    value={newOrder.service}
                    onChange={(e) =>
                      setNewOrder({
                        ...newOrder,
                        service: e.target.value as 'Jahit baru' | 'Permak' | 'Perbaikan',
                      })
                    }
                  >
                    <option value="Jahit baru">Jahit baru</option>
                    <option value="Permak">Permak</option>
                    <option value="Perbaikan">Perbaikan</option>
                  </select>
                </label>
                <label>
                  Jadwal Fitting
                  <input
                    type="date"
                    className="input-field"
                    value={newOrder.fittingDate}
                    onChange={(e) =>
                      setNewOrder({ ...newOrder, fittingDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Target Selesai
                  <input
                    type="date"
                    className="input-field"
                    value={newOrder.dueDate}
                    onChange={(e) => setNewOrder({ ...newOrder, dueDate: e.target.value })}
                  />
                </label>
                <label>
                  Total Biaya (Rp) *
                  <input
                    type="number"
                    min={1}
                    required
                    className="input-field"
                    placeholder="180000"
                    value={newOrder.total}
                    onChange={(e) => setNewOrder({ ...newOrder, total: e.target.value })}
                  />
                </label>
                <label>
                  Uang Muka / DP (Rp)
                  <input
                    type="number"
                    min={0}
                    className="input-field"
                    value={newOrder.deposit}
                    onChange={(e) => setNewOrder({ ...newOrder, deposit: e.target.value })}
                  />
                </label>
                <label>
                  Tautkan ke Akun Pelanggan (Opsional)
                  <select
                    className="input-field"
                    value={newOrder.customerAccountId}
                    onChange={(e) =>
                      setNewOrder({ ...newOrder, customerAccountId: e.target.value })
                    }
                  >
                    <option value="">-- Belum ditautkan --</option>
                    {customerAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ukuran (format: LD:92, Pinggang:74)
                  <input
                    className="input-field"
                    placeholder="LD: 92cm, Pinggang: 74cm"
                    value={newOrder.measurementsText}
                    onChange={(e) =>
                      setNewOrder({ ...newOrder, measurementsText: e.target.value })
                    }
                  />
                </label>
                <label className="full-span">
                  Catatan Model / Bahan
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="Detail model, warna kain, catatan khusus..."
                    value={newOrder.note}
                    onChange={(e) => setNewOrder({ ...newOrder, note: e.target.value })}
                  />
                </label>

                <div className="full-span form-submit-row">
                  <button type="submit" className="btn-primary">
                    Simpan Pesanan
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Modal Kelola Pesanan */}
      {managingOrder && (
        <div className="modal-backdrop" onClick={() => setManagingOrder(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              Kelola #{managingOrder.id} — {managingOrder.customer}
            </h3>
            <p className="muted-xs" style={{ wordBreak: 'break-all' }}>
              Token Pelacakan: <code>{managingOrder.token}</code>
            </p>
            {adminFeedback && (
              <p style={{ color: '#144d3b', fontWeight: 600, fontSize: '0.86rem' }}>
                {adminFeedback}
              </p>
            )}

            <form onSubmit={handleSaveProgress} className="modal-form">
              <label>
                Update Status Pekerjaan
                <select
                  className="input-field"
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
                >
                  {STATUS_TABS.filter((t) => t !== 'Semua').map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Catatan Progres
                <input
                  className="input-field"
                  placeholder="Contoh: Kain sedang dipotong sesuai pola"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                />
              </label>
              <button type="submit" className="btn-primary btn-sm">
                Simpan Progres
              </button>
            </form>

            <hr style={{ margin: '16px 0', borderColor: '#e5ece8' }} />

            <form onSubmit={handleAddPayment} className="modal-form">
              <label>
                Catat Pembayaran Baru (Sisa:{' '}
                {formatRupiah(
                  Math.max(
                    0,
                    managingOrder.total -
                      managingOrder.payments.reduce((s, p) => s + p.amount, 0)
                  )
                )}
                )
                <input
                  type="number"
                  min={1}
                  className="input-field"
                  placeholder="Nominal Rp..."
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </label>
              <label>
                Metode Pembayaran
                <select
                  className="input-field"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="Tunai">Tunai</option>
                  <option value="Transfer">Transfer</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </label>
              <button type="submit" className="btn-outline btn-sm">
                + Tambah Pembayaran
              </button>
            </form>

            <hr style={{ margin: '16px 0', borderColor: '#e5ece8' }} />

            <div className="modal-form">
              <label>
                Tautkan ke Akun Pelanggan
                <select
                  className="input-field"
                  value={linkCustomerId}
                  onChange={(e) => setLinkCustomerId(e.target.value)}
                >
                  <option value="">-- Tidak ditautkan --</option>
                  {customerAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={handleLinkCustomer}
                >
                  Simpan Tautan Akun
                </button>
                {!managingOrder.pickedUpAt && (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={handleMarkPickedUp}
                  >
                    Tandai Sudah Diambil
                  </button>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setManagingOrder(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}