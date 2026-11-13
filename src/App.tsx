import { useEffect, useMemo, useState, type FormEvent } from "react";

type ProgressStatus =
  | "Menunggu konfirmasi"
  | "Menunggu pengerjaan"
  | "Dalam pengerjaan"
  | "Siap fitting"
  | "Perlu revisi"
  | "Siap diambil"
  | "Selesai";

type Payment = {
  amount: number;
  method: string;
  date: string;
};

type ProgressUpdate = {
  status: ProgressStatus;
  note: string;
  date: string;
};

type Order = {
  id: string;
  token: string;
  createdAt: string;
  customer: string;
  phone: string;
  address: string;
  service: string;
  garment: string;
  model: string;
  material: string;
  materialAmount: string;
  note: string;
  measurements: Record<string, string>;
  fittingDate: string;
  dueDate: string;
  total: number;
  payments: Payment[];
  progress: ProgressUpdate[];
  pickedUpAt: string | null;
  customerAccountId: number | null;
};

type CustomerAccount = { id: number; name: string; phone: string };
type CustomerIdentity = { id: number; name: string; phone?: string };
type CustomerOrder = {
  id: string;
  token: string;
  createdAt: string;
  garment: string;
  service: string;
  dueDate: string;
  total: number;
  paid: number;
  status: ProgressStatus;
};

type TrackingOrder = Pick<
  Order,
  "id" | "createdAt" | "customer" | "service" | "garment" | "model" | "dueDate" | "fittingDate" | "total" | "progress"
> & { paid: number };

type AuthStatus = {
  setupRequired: boolean;
  authenticated: boolean;
  username: string | null;
};

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

const statuses: ProgressStatus[] = [
  "Menunggu konfirmasi",
  "Menunggu pengerjaan",
  "Dalam pengerjaan",
  "Siap fitting",
  "Perlu revisi",
  "Siap diambil",
  "Selesai",
];

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Permintaan gagal (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function getPaid(order: Order): number {
  return order.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function initialForm() {
  return {
    customer: "",
    phone: "",
    address: "",
    service: "Jahit baru",
    garment: "",
    model: "",
    material: "",
    materialAmount: "",
    note: "",
    fittingDate: "",
    dueDate: "",
    total: "",
    deposit: "",
    paymentMethod: "Tunai",
    measurements: {
      "Lingkar badan": "",
      "Lingkar pinggang": "",
      "Lebar bahu": "",
      "Panjang baju": "",
      "Panjang lengan": "",
      "Lingkar lengan atas": "",
    } as Record<string, string>,
  };
}

function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccount[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [startupError, setStartupError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [trackingOrder, setTrackingOrder] = useState<TrackingOrder | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(Boolean(window.location.pathname.match(/^\/track\/([^/]+)\/?$/)?.[1]));
  const [trackingLoadError, setTrackingLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState<ProgressStatus | "Semua">("Semua");
  const [notice, setNotice] = useState("");
  const [newStatus, setNewStatus] = useState<ProgressStatus>("Dalam pengerjaan");
  const [progressNote, setProgressNote] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Tunai");
  const [quoteAmount, setQuoteAmount] = useState("");

  const trackingToken = window.location.pathname.match(/^\/track\/([^/]+)\/?$/)?.[1];
  const selectedOrder = orders.find((order) => order.id === selectedId);
  const isAdminRoute = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");

  useEffect(() => {
    let active = true;
    if (trackingToken) {
      const loadTrackingOrder = async () => {
        try {
          const result = await apiRequest<{ order: TrackingOrder }>(`/api/track/${encodeURIComponent(trackingToken)}`);
          if (active) {
            setTrackingOrder(result.order);
            setTrackingLoadError("");
            setTrackingLoading(false);
          }
        } catch (error) {
          console.error("Gagal memuat pelacakan pesanan.", error);
          if (active) {
            setTrackingOrder(null);
            setTrackingLoadError(error instanceof Error ? error.message : "Pelacakan pesanan gagal dimuat.");
            setTrackingLoading(false);
          }
        }
      };
      void loadTrackingOrder();
      const interval = window.setInterval(() => void loadTrackingOrder(), 15_000);
      return () => {
        active = false;
        window.clearInterval(interval);
      };
    }

    if (!isAdminRoute) return () => { active = false; };
    const loadAuthStatus = async () => {
      try {
        const status = await apiRequest<AuthStatus>("/api/auth/status");
        if (!active) return;
        setAuthStatus(status);
        if (status.authenticated) {
          const [result, accounts] = await Promise.all([
            apiRequest<{ orders: Order[] }>("/api/orders"),
            apiRequest<{ customers: CustomerAccount[] }>("/api/customer-accounts"),
          ]);
          if (active) {
            setOrders(result.orders);
            setCustomerAccounts(accounts.customers);
          }
        } else {
          setOrders([]);
          setCustomerAccounts([]);
        }
        setStartupError("");
      } catch (error) {
        console.error("Gagal menghubungi backend JahitLink.", error);
        if (active) setStartupError("Backend belum dapat dihubungi. Jalankan `npm run dev` untuk memulai aplikasi dan API.");
      }
    };
    void loadAuthStatus();
    return () => { active = false; };
  }, [isAdminRoute, trackingToken]);

  useEffect(() => {
    if (!isAdminRoute || !authStatus?.authenticated) return;
    const interval = window.setInterval(() => {
      void Promise.all([
        apiRequest<{ orders: Order[] }>("/api/orders"),
        apiRequest<{ customers: CustomerAccount[] }>("/api/customer-accounts"),
      ])
        .then(([result, accounts]) => {
          setOrders(result.orders);
          setCustomerAccounts(accounts.customers);
        })
        .catch((error: unknown) => {
          console.error("Gagal memperbarui pesanan.", error);
          if (error instanceof Error && error.message.includes("Sesi admin")) {
            setAuthStatus((current) => current ? { ...current, authenticated: false } : current);
            setOrders([]);
          }
        });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [authStatus?.authenticated, isAdminRoute]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("id");
    return orders.filter((order) => {
      const matchesQuery = !normalized
        || `${order.id} ${order.customer} ${order.garment}`.toLocaleLowerCase("id").includes(normalized);
      const status = order.progress.at(-1)?.status ?? "Menunggu pengerjaan";
      return matchesQuery && (orderFilter === "Semua" || status === orderFilter);
    });
  }, [orders, orderFilter, query]);

  const openNewOrder = () => setShowCreate(true);

  async function openCustomerTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitted = String(formData.get("tracking-link") ?? "").trim();
    const token = submitted.match(/\/track\/([^/?#]+)/)?.[1] ?? submitted;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setTrackError("Masukkan kode atau tautan pelacakan yang diberikan admin.");
      return;
    }
    try {
      await apiRequest<{ order: TrackingOrder }>(`/api/track/${encodeURIComponent(token)}`);
      window.location.href = `/track/${token}`;
    } catch {
      setTrackError("Pesanan tidak ditemukan. Periksa kembali kode atau tautan pelacakan.");
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = Object.fromEntries(formData.entries());
    const total = Number(form.total);
    const deposit = Number(form.deposit || 0);
    if (!Number.isFinite(total) || total <= 0 || deposit < 0 || deposit > total) {
      setNotice("Periksa kembali total biaya dan jumlah DP.");
      return;
    }

    const measurements: Record<string, string> = {};
    for (const [label] of Object.entries(initialForm().measurements)) {
      measurements[label] = String(form[`measurement:${label}`] ?? "");
    }

    try {
      const result = await apiRequest<{ order: Order }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          total,
          deposit,
          measurements,
        }),
      });
      setOrders((current) => [result.order, ...current]);
      setSelectedId(result.order.id);
      setShowCreate(false);
      setNotice(`${result.order.id} berhasil dibuat.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Pesanan gagal dibuat.");
    }
  }

  function updateProgress(order: Order) {
    void apiRequest<{ order: Order }>(`/api/orders/${order.id}/progress`, {
      method: "POST",
      body: JSON.stringify({ status: newStatus, note: progressNote.trim() }),
    }).then(({ order: updated }) => {
      setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
      setProgressNote("");
      setNotice("Progres pesanan diperbarui.");
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Progres gagal diperbarui."));
  }

  function addPayment(order: Order) {
    const amount = Number(paymentAmount);
    const balance = order.total - getPaid(order);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setNotice(`Masukkan pembayaran antara Rp1 dan ${formatCurrency(balance)}.`);
      return;
    }
    void apiRequest<{ order: Order }>(`/api/orders/${order.id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount, method: paymentMethod }),
    }).then(({ order: updated }) => {
      setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
      setPaymentAmount("");
      setNotice("Pembayaran berhasil dicatat.");
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Pembayaran gagal dicatat."));
  }

  function setOrderQuote(order: Order) {
    const total = Number(quoteAmount);
    if (!Number.isFinite(total) || total <= 0) {
      setNotice("Masukkan biaya pesanan yang valid.");
      return;
    }
    void apiRequest<{ order: Order }>(`/api/orders/${order.id}/quote`, {
      method: "POST",
      body: JSON.stringify({ total }),
    }).then(({ order: updated }) => {
      setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
      setQuoteAmount("");
      setNotice("Estimasi biaya berhasil disimpan.");
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Estimasi biaya gagal disimpan."));
  }

  function markPickedUp(order: Order) {
    if (order.pickedUpAt) return;
    void apiRequest<{ order: Order }>(`/api/orders/${order.id}/pickup`, { method: "POST" })
      .then(({ order: updated }) => {
        setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
        setNotice("Pengambilan pesanan telah dicatat.");
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Pengambilan gagal dicatat."));
  }

  async function copyTrackingLink(order: Order) {
    const link = `${window.location.origin}/track/${order.token}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Tautan pelacakan disalin.");
    } catch (error) {
      console.error("Tidak dapat menyalin tautan pelacakan.", error);
      setNotice(`Salin tautan ini: ${link}`);
    }
  }

  async function handleAdminAuthenticated() {
    try {
      const [status, result, accounts] = await Promise.all([
        apiRequest<AuthStatus>("/api/auth/status"),
        apiRequest<{ orders: Order[] }>("/api/orders"),
        apiRequest<{ customers: CustomerAccount[] }>("/api/customer-accounts"),
      ]);
      setAuthStatus({ ...status, authenticated: true });
      setOrders(result.orders);
      setCustomerAccounts(accounts.customers);
      setStartupError("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal memuat data admin.");
    }
  }

  async function assignCustomerAccount(order: Order, customerAccountId: number | null) {
    try {
      const result = await apiRequest<{ order: Order }>(`/api/orders/${order.id}/customer-account`, {
        method: "POST",
        body: JSON.stringify({ customerAccountId }),
      });
      setOrders((current) => current.map((item) => item.id === order.id ? result.order : item));
      setNotice(customerAccountId === null ? "Akun pelanggan diputus dari pesanan." : "Pesanan berhasil ditautkan ke akun pelanggan.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Akun pelanggan gagal diperbarui.");
    }
  }

  async function logoutAdmin() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setAuthStatus((current) => current ? { ...current, authenticated: false } : current);
      setOrders([]);
      setSelectedId(null);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal keluar dari akun.");
    }
  }

  if (trackingToken) {
    if (trackingLoading) return <main className="tracking-page"><div className="tracking-content">Memuat informasi pesanan...</div></main>;
    if (trackingOrder) return <TrackingPage order={trackingOrder} />;
    if (trackingLoadError && !trackingLoadError.includes("tidak ditemukan")) {
      return <main className="not-found"><h1>Pelacakan belum tersedia</h1><p>{trackingLoadError}</p><a className="button button-primary" href="/">Kembali</a></main>;
    }
    return <NotFoundPage />;
  }
  if (window.location.pathname === "/pelanggan" || window.location.pathname.startsWith("/pelanggan/")) {
    return <CustomerPortal />;
  }
  if (window.location.pathname === "/masuk") {
    return <LoginChoice />;
  }
  if (!isAdminRoute) {
    return <CustomerLanding trackError={trackError} onTrack={openCustomerTracking} />;
  }

  if (startupError) {
    return <main className="admin-access-page"><section className="admin-access-card"><p className="admin-access-error" role="alert">{startupError}</p></section></main>;
  }
  if (!authStatus) {
    return <main className="admin-access-page"><section className="admin-access-card">Menghubungkan ke backend...</section></main>;
  }
  if (!authStatus.authenticated) {
    return <AdminAccess setupRequired={authStatus.setupRequired} onAuthenticated={() => void handleAdminAuthenticated()} />;
  }

  const currentStatus = (order: Order) => order.progress.at(-1)?.status ?? "Menunggu pengerjaan";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/admin" aria-label="JahitLink dashboard pemilik">
          <span className="brand-mark">J</span>
          <span>jahit<span className="brand-accent">link</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Navigasi utama">
          <button className="nav-item active" type="button" onClick={() => setSelectedId(null)}>
            <span className="nav-icon">▦</span> Pesanan
          </button>
          <button className="nav-item" type="button" onClick={openNewOrder}>
            <span className="nav-icon">＋</span> Buat pesanan
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">JL</div>
          <div><strong>Studio Jahit</strong><small>Pemilik usaha</small></div>
          <span className="more-icon">···</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><a href="/">JahitLink</a> <span>/</span> Ruang kerja</div>
          <div className="topbar-right"><a href="/" className="customer-site-link">Lihat halaman pelanggan ↗</a><span className="online-dot" /> Database<button className="logout-button" type="button" onClick={() => void logoutAdmin()}>Keluar</button></div>
        </header>

        <div className="page-wrap">
          {selectedOrder ? (
            <OrderDetail
              order={selectedOrder}
              currentStatus={currentStatus(selectedOrder)}
              onBack={() => setSelectedId(null)}
              onCopyLink={() => void copyTrackingLink(selectedOrder)}
              onProgress={updateProgress}
              onPayment={addPayment}
              onQuote={setOrderQuote}
              onPickup={markPickedUp}
              customerAccounts={customerAccounts}
              onAssignCustomerAccount={(customerAccountId) => void assignCustomerAccount(selectedOrder, customerAccountId)}
              newStatus={newStatus}
              setNewStatus={setNewStatus}
              progressNote={progressNote}
              setProgressNote={setProgressNote}
              paymentAmount={paymentAmount}
              setPaymentAmount={setPaymentAmount}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              quoteAmount={quoteAmount}
              setQuoteAmount={setQuoteAmount}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">DASHBOARD ADMIN &amp; PENJAHIT</p>
                  <h1>Ruang kerja</h1>
                  <p className="muted">Pantau pesanan, progres jahitan, jadwal, dan pembayaran dalam satu tempat.</p>
                </div>
                <button className="button button-primary" type="button" onClick={openNewOrder}>
                  <span className="button-plus">＋</span> Pesanan baru
                </button>
              </div>

              <section className="stats-grid" aria-label="Ringkasan pesanan">
                <StatCard label="Total pesanan" value={orders.length} icon="▤" tone="blue" />
                <StatCard
                  label="Sedang dikerjakan"
                  value={orders.filter((order) => !["Menunggu konfirmasi", "Siap diambil", "Selesai"].includes(currentStatus(order))).length}
                  icon="◷"
                  tone="amber"
                />
                <StatCard
                  label="Siap diambil"
                  value={orders.filter((order) => currentStatus(order) === "Siap diambil").length}
                  icon="✓"
                  tone="green"
                />
                <StatCard
                  label="Belum lunas"
                  value={orders.filter((order) => order.total > 0 && getPaid(order) < order.total).length}
                  icon="Rp"
                  tone="purple"
                />
              </section>

              <section className="panel orders-panel">
                <div className="panel-heading">
                  <div><h2>Daftar pekerjaan</h2><p>{filteredOrders.length} dari {orders.length} pesanan</p></div>
                  <label className="search-box">
                    <span>⌕</span>
                    <input
                      type="search"
                      placeholder="Cari nama atau nomor..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                <div className="order-filters" role="group" aria-label="Filter status pesanan">
                  {(["Semua", ...statuses] as const).map((status) => {
                    const count = status === "Semua"
                      ? orders.length
                      : orders.filter((order) => (order.progress.at(-1)?.status ?? "Menunggu pengerjaan") === status).length;
                    return (
                      <button
                        key={status}
                        className={`order-filter${orderFilter === status ? " active" : ""}`}
                        type="button"
                        aria-pressed={orderFilter === status}
                        onClick={() => setOrderFilter(status)}
                      >
                        {status}<span>{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>PELANGGAN</th><th>PESANAN</th><th>TARGET SELESAI</th><th>PROGRES</th><th>PEMBAYARAN</th><th /></tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => {
                        const paid = getPaid(order);
                        return (
                          <tr key={order.id} onClick={() => setSelectedId(order.id)} tabIndex={0} onKeyDown={(event) => {
                            if (event.key === "Enter") setSelectedId(order.id);
                          }}>
                            <td><div className="customer-cell"><div className="table-avatar">{order.customer.slice(0, 1).toUpperCase()}</div><div><strong>{order.customer}</strong><small>{order.id}</small></div></div></td>
                            <td><strong className="table-main">{order.garment}</strong><small>{order.service}</small></td>
                            <td>{formatDate(order.dueDate)}</td>
                            <td><StatusBadge status={currentStatus(order)} /></td>
                            <td><strong className="table-main">{order.total <= 0 ? "Menunggu biaya" : paid >= order.total ? "Lunas" : "Belum lunas"}</strong><small>{order.total <= 0 ? "Estimasi belum ditentukan" : `${formatCurrency(paid)} / ${formatCurrency(order.total)}`}</small></td>
                            <td><button className="row-arrow" type="button" aria-label={`Buka pesanan ${order.id}`}>↗</button></td>
                          </tr>
                        );
                      })}
                      {filteredOrders.length === 0 && (
                        <tr><td className="empty-table" colSpan={6}>Belum ada pesanan yang cocok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="prototype-note"><span>ⓘ</span> Data pesanan disimpan di database server.</p>
            </>
          )}
        </div>
      </main>

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onSubmit={createOrder}
        />
      )}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function AdminAccess({ setupRequired, onAuthenticated }: { setupRequired: boolean; onAuthenticated: () => void }) {
  const isSetup = setupRequired;
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (isSetup) {
        const confirmation = String(form.get("confirmPassword") ?? "");
        if (username.length < 3) {
          setError("Nama pengguna harus terdiri dari minimal 3 karakter.");
          return;
        }
        if (password.length < 10) {
          setError("Kata sandi harus terdiri dari minimal 10 karakter.");
          return;
        }
        if (password !== confirmation) {
          setError("Konfirmasi kata sandi tidak cocok.");
          return;
        }
      }
      await apiRequest(isSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login tidak dapat diproses.");
    }
  }

  return (
    <main className="admin-access-page">
      <section className="admin-access-card">
        <a className="brand" href="/" aria-label="Kembali ke JahitLink">
          <span className="brand-mark">J</span>
          <span>jahit<span className="brand-accent">link</span></span>
        </a>
        <p className="eyebrow">{isSetup ? "PENGATURAN ADMIN" : "AREA TERBATAS"}</p>
        <h1>{isSetup ? "Buat akun admin" : "Masuk ke ruang kerja"}</h1>
        <p className="admin-access-description">
          {isSetup
            ? "Buat akun admin pertama untuk mengelola data studio."
            : "Masuk untuk membuat dan mengelola pesanan jahit."}
        </p>
        <form className="admin-access-form" onSubmit={(event) => void submit(event)}>
          <label>Nama pengguna atau email<input name="username" type="text" required minLength={3} autoComplete="username" placeholder="Contoh: adminjahit atau email@contoh.com" /></label>
          <label>Kata sandi<input name="password" type="password" required minLength={isSetup ? 10 : 1} autoComplete={isSetup ? "new-password" : "current-password"} /></label>
          {isSetup && <label>Ulangi kata sandi<input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></label>}
          {error && <p className="admin-access-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" type="submit">{isSetup ? "Buat akun dan masuk" : "Masuk"}</button>
        </form>
        <p className="admin-access-note">Kredensial diperiksa oleh server. Sesi berakhir otomatis setelah 8 jam.</p>
        <a className="admin-access-home" href="/masuk">← Pilih jenis akun</a>
      </section>
    </main>
  );
}

function CustomerPortal() {
  const [customer, setCustomer] = useState<CustomerIdentity | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [error, setError] = useState("");

  async function loadOrders() {
    const result = await apiRequest<{ orders: CustomerOrder[] }>("/api/customer/orders");
    setOrders(result.orders);
  }

  useEffect(() => {
    let active = true;
    async function loadCustomer() {
      try {
        const status = await apiRequest<{ authenticated: boolean; customer: CustomerIdentity | null }>("/api/customer/auth/status");
        if (!active) return;
        if (status.authenticated && status.customer) {
          setCustomer(status.customer);
          const result = await apiRequest<{ orders: CustomerOrder[] }>("/api/customer/orders");
          if (active) setOrders(result.orders);
        }
      } catch (caught) {
        console.error("Gagal memuat akun pelanggan.", caught);
        if (active) setError(caught instanceof Error ? caught.message : "Akun pelanggan gagal dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadCustomer();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!customer) return;
    let active = true;
    const refreshOrders = async () => {
      try {
        const result = await apiRequest<{ orders: CustomerOrder[] }>("/api/customer/orders");
        if (active) setOrders(result.orders);
      } catch (caught) {
        console.error("Gagal memperbarui pesanan pelanggan.", caught);
        if (active) setError(caught instanceof Error ? caught.message : "Pesanan pelanggan gagal diperbarui.");
      }
    };
    const interval = window.setInterval(() => void refreshOrders(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [customer?.id]);

  async function refreshCustomerOrders() {
    setRefreshingOrders(true);
    setError("");
    try {
      await loadOrders();
    } catch (caught) {
      console.error("Gagal memuat ulang pesanan pelanggan.", caught);
      setError(caught instanceof Error ? caught.message : "Pesanan pelanggan gagal diperbarui.");
    } finally {
      setRefreshingOrders(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (isRegister) {
        const name = String(form.get("name") ?? "").trim();
        if (name.length < 2) throw new Error("Nama harus terdiri dari minimal 2 karakter.");
        if (password.length < 10) throw new Error("Kata sandi harus terdiri dari minimal 10 karakter.");
        if (password !== String(form.get("confirmPassword") ?? "")) throw new Error("Konfirmasi kata sandi tidak cocok.");
        const result = await apiRequest<{ customer: CustomerIdentity }>("/api/customer/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, phone, password }),
        });
        setCustomer(result.customer);
        await loadOrders();
      } else {
        const result = await apiRequest<{ customer: CustomerIdentity }>("/api/customer/auth/login", {
          method: "POST",
          body: JSON.stringify({ phone, password }),
        });
        setCustomer(result.customer);
        await loadOrders();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Permintaan akun pelanggan gagal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    try {
      await apiRequest("/api/customer/auth/logout", { method: "POST" });
      setCustomer(null);
      setOrders([]);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal keluar dari akun.");
    }
  }

  if (loading) {
    return <main className="admin-access-page"><section className="admin-access-card">Memuat akun pelanggan...</section></main>;
  }

  if (customer) {
    const activeOrders = orders.filter((order) => order.status !== "Selesai").length;
    const featuredOrder = orders[0];
    const progressLabels = ["Pesanan Diterima", "Pengukuran Selesai", "Proses Pemotongan", "Proses Penjahitan", "Selesai"];
    const progressStep = featuredOrder ? getCustomerProgressStep(featuredOrder.status) : 0;
    const progressPercent = Math.max(0, ((progressStep - 1) / (progressLabels.length - 1)) * 100);
    return (
      <main className="customer-account-page" id="customer-home">
        <header className="customer-account-header">
          <a className="brand" href="/pelanggan" aria-label="JahitLink beranda"><span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 8h4v11h13v-3h-5V9h5l4 4v7h2v3H3v-3h2V8Zm5-2h10v2H10V6Zm13 8h3l-3-3v3ZM8 24a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm16 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg></span><span>Jahit<span className="brand-accent">Link</span></span></a>
          <nav className="customer-header-nav" aria-label="Navigasi utama">
            <a className="active" href="#customer-home">⌂ <span>Beranda</span></a>
            <a href="#order-history">▣ <span>Pesanan Saya</span></a>
            <a href="#profile-card">♙ <span>Profil Saya</span></a>
            <a href="#help-card">ⓘ <span>Bantuan</span></a>
          </nav>
          <div className="customer-account-user">
            <span className="customer-account-avatar">{customer.name.slice(0, 1).toUpperCase()}</span>
            <span className="customer-account-greeting"><strong>{customer.name}</strong><small>Pelanggan</small></span>
            <button className="logout-button" type="button" onClick={() => void logout()}>Keluar</button>
          </div>
        </header>
        <section className="customer-account-hero">
          <div className="customer-account-hero-copy">
            <p className="eyebrow">BERANDA PELANGGAN</p>
            <h1>Halo, {customer.name}! <span aria-hidden="true">👋</span></h1>
            <h2>Pantau progres jahitan Anda dengan mudah di JahitLink</h2>
            <p>Kami selalu berusaha memberikan hasil terbaik untuk setiap pesanan Anda.</p>
            <a className="customer-hero-action" href={featuredOrder ? "#order-history" : "/#cara-pesan"}>
              {featuredOrder ? "Lihat Pesanan Saya" : "Panduan Pemesanan"} <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>

        <div className="customer-home-layout">
          <div className="customer-home-main">
            <section className="customer-dashboard-panel customer-feature-panel" id="customer-orders">
              <div className="customer-dashboard-panel-heading">
                <h2><span className="customer-panel-icon">▣</span>Pesanan Terbaru Anda</h2>
                <div className="customer-dashboard-panel-actions">
                  <a href="#order-history">Lihat Semua Pesanan <span aria-hidden="true">→</span></a>
                  <button className="customer-orders-refresh" type="button" onClick={() => void refreshCustomerOrders()} disabled={refreshingOrders} aria-label="Muat ulang pesanan">
                    {refreshingOrders ? "…" : "↻"}
                  </button>
                </div>
              </div>
              {error && <p className="admin-access-error" role="alert">{error}</p>}
              {featuredOrder ? (
                <div className="customer-featured-order">
                  <img className="customer-featured-image" src="/garment-dress.svg" alt="" />
                  <div className="customer-featured-info">
                    <div className="customer-featured-title">
                      <strong>{featuredOrder.id}</strong>
                      <StatusBadge status={featuredOrder.status} />
                    </div>
                    <p className="customer-featured-label">Jenis Pakaian <span>:</span> <strong>{featuredOrder.garment}</strong></p>
                    <p className="customer-featured-label">Tanggal Pesanan <span>:</span> <strong>{formatDate(featuredOrder.createdAt)}</strong></p>
                    <div className="customer-due-highlight"><span>◷</span><div><small>Estimasi Selesai</small><strong>{formatDate(featuredOrder.dueDate)}</strong></div></div>
                  </div>
                  <div className="customer-featured-progress">
                    <h3>Progres Jahitan</h3>
                    <div className="customer-progress-line">
                      <span className="customer-progress-track" style={{ background: `linear-gradient(to right, #249461 ${progressPercent}%, #e5ebe7 ${progressPercent}%)` }} />
                      {progressLabels.map((label, index) => {
                        const complete = featuredOrder.status === "Selesai" || index < progressStep - 1;
                        const current = featuredOrder.status !== "Selesai" && index === progressStep - 1;
                        return (
                          <span className={`customer-progress-step${complete ? " complete" : ""}${current ? " current" : ""}`} key={label}>
                            <i>{complete ? "✓" : ""}</i><small>{label}</small>
                          </span>
                        );
                      })}
                    </div>
                    <div className="customer-stage-note"><span aria-hidden="true">ⓘ</span><p>Pesanan Anda saat ini dalam tahap <strong>{featuredOrder.status}</strong>.</p><a href={`/track/${encodeURIComponent(featuredOrder.token)}`}>Detail <span aria-hidden="true">→</span></a></div>
                  </div>
                </div>
              ) : (
                <div className="customer-dashboard-empty">
                  <span className="customer-empty-art" aria-hidden="true"><span>J</span><i>✦</i></span>
                  <div><h3>Belum ada pesanan di akun Anda</h3><p>Pesanan akan tampil di sini setelah studio menghubungkannya ke akun Anda.</p></div>
                </div>
              )}
            </section>

            <section className="customer-dashboard-panel customer-history-panel" id="order-history">
              <div className="customer-dashboard-panel-heading">
                <h2><span className="customer-panel-icon">◷</span>Riwayat Pesanan</h2>
                <span className="customer-history-count">{orders.length} pesanan</span>
              </div>
              {orders.length > 0 ? (
                <div className="customer-history-scroll">
                  <table className="customer-history-table">
                    <thead><tr><th>No. Pesanan</th><th>Tanggal Pesanan</th><th>Jenis Pakaian</th><th>Status</th><th>Estimasi Selesai</th><th>Aksi</th></tr></thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id}>
                          <td><strong>{order.id}</strong></td>
                          <td>{formatDate(order.createdAt)}</td>
                          <td>{order.garment}</td>
                          <td><StatusBadge status={order.status} /></td>
                          <td>{formatDate(order.dueDate)}</td>
                          <td><a className="customer-history-action" href={`/track/${encodeURIComponent(order.token)}`}>◉ Detail</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="customer-history-empty">Riwayat pesanan Anda akan muncul di sini.</p>
              )}
              {orders.length > 0 && <p className="customer-orders-status">{activeOrders} pesanan masih dalam proses</p>}
            </section>
          </div>

          <aside className="customer-home-side">
            <section className="customer-dashboard-panel customer-help-panel" id="help-card">
              <div className="customer-side-card-title"><span className="customer-side-icon">♡</span><div><h2>Butuh Bantuan?</h2><p>Jika ada pertanyaan, silakan hubungi studio tempat Anda memesan.</p></div></div>
              <a className="customer-outline-action" href="/#cara-pesan">Lihat Cara Pemesanan <span aria-hidden="true">→</span></a>
              <img src="/process-sewing.svg" alt="" />
            </section>
            <section className="customer-dashboard-panel customer-profile-panel" id="profile-card">
              <div className="customer-side-card-title"><span className="customer-side-icon">♙</span><h2>Informasi Akun</h2></div>
              <dl><div><dt>Nama</dt><dd>{customer.name}</dd></div><div><dt>Nomor HP</dt><dd>{customer.phone || "Tidak tersedia"}</dd></div></dl>
              <a className="customer-outline-action" href="#profile-card">Profil Saya <span aria-hidden="true">→</span></a>
            </section>
          </aside>
        </div>
        <footer className="customer-dashboard-footer"><a className="brand" href="/pelanggan"><span className="brand-mark">J</span><span>Jahit<span className="brand-accent">Link</span></span></a><span>Menjahit dengan hati, melayani dengan sepenuh hati.</span><nav><a href="#customer-home">Beranda</a><a href="#order-history">Pesanan Saya</a><a href="#help-card">Bantuan</a></nav></footer>
      </main>
    );
  }

  return (
    <main className="admin-access-page">
      <section className="admin-access-card">
        <a className="brand" href="/" aria-label="Kembali ke JahitLink">
          <span className="brand-mark">J</span>
          <span>jahit<span className="brand-accent">link</span></span>
        </a>
        <p className="eyebrow">{isRegister ? "AKUN PELANGGAN" : "PORTAL PELANGGAN"}</p>
        <h1>{isRegister ? "Buat akun pelanggan" : "Masuk ke akun pelanggan"}</h1>
        <p className="admin-access-description">
          {isRegister ? "Daftar dengan nomor HP dan kata sandi untuk melihat pesanan yang ditautkan admin." : "Masuk untuk melihat pesanan yang telah ditautkan ke akun Anda."}
        </p>
        <form className="admin-access-form" onSubmit={(event) => void submit(event)}>
          {isRegister && <label>Nama lengkap<input name="name" required minLength={2} autoComplete="name" /></label>}
          <label>Nomor HP<input name="phone" type="tel" required autoComplete="tel" placeholder="Contoh: 081234567890" /></label>
          <label>Kata sandi<input name="password" type="password" required minLength={isRegister ? 10 : 1} autoComplete={isRegister ? "new-password" : "current-password"} /></label>
          {isRegister && <label>Ulangi kata sandi<input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></label>}
          {error && <p className="admin-access-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? "Memproses..." : isRegister ? "Daftar dan masuk" : "Masuk"}
          </button>
        </form>
        <button className="customer-auth-switch" type="button" onClick={() => { setIsRegister((current) => !current); setError(""); }}>
          {isRegister ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
        </button>
        <a className="customer-auth-staff-link" href="/admin">Masuk sebagai admin atau penjahit</a>
        <p className="admin-access-note">Akun baru hanya dapat melihat pesanan setelah admin menautkannya.</p>
        <a className="admin-access-home" href="/">← Kembali ke halaman utama</a>
      </section>
    </main>
  );
}

function LoginChoice() {
  return (
    <main className="login-choice-page">
      <section className="login-choice-card">
        <a className="brand" href="/" aria-label="Kembali ke JahitLink">
          <span className="brand-mark">J</span>
          <span>jahit<span className="brand-accent">link</span></span>
        </a>
        <p className="eyebrow">SELAMAT DATANG</p>
        <h1>Masuk ke JahitLink</h1>
        <p className="login-choice-description">Pilih portal sesuai akun yang Anda gunakan.</p>
        <div className="login-choice-options">
          <a className="login-choice-option" href="/pelanggan">
            <span className="login-choice-icon customer">♙</span>
            <span><strong>Pelanggan</strong><small>Masuk atau buat akun untuk melihat pesanan Anda.</small></span>
            <span className="login-choice-arrow" aria-hidden="true">→</span>
          </a>
          <a className="login-choice-option" href="/admin">
            <span className="login-choice-icon staff">✂</span>
            <span><strong>Admin atau penjahit</strong><small>Kelola pesanan dan progres jahitan studio.</small></span>
            <span className="login-choice-arrow" aria-hidden="true">→</span>
          </a>
        </div>
        <a className="admin-access-home" href="/">← Kembali ke halaman utama</a>
      </section>
    </main>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div><p>{label}</p><strong>{value}</strong></div>
      <span className="stat-spark">↗</span>
    </div>
  );
}

function StatusBadge({ status }: { status: ProgressStatus }) {
  const tone = status === "Siap diambil" || status === "Selesai"
    ? "green"
    : status === "Perlu revisi"
      ? "rose"
      : status === "Dalam pengerjaan" || status === "Siap fitting"
        ? "blue"
        : "amber";
  return <span className={`status-badge ${tone}`}><span />{status}</span>;
}

function getCustomerProgressStep(status: ProgressStatus): number {
  return {
    "Menunggu konfirmasi": 1,
    "Menunggu pengerjaan": 2,
    "Dalam pengerjaan": 2,
    "Siap fitting": 3,
    "Perlu revisi": 3,
    "Siap diambil": 4,
    "Selesai": 5,
  }[status];
}

function OrderDetail(props: {
  order: Order;
  currentStatus: ProgressStatus;
  onBack: () => void;
  onCopyLink: () => void;
  onProgress: (order: Order) => void;
  onPayment: (order: Order) => void;
  onQuote: (order: Order) => void;
  onPickup: (order: Order) => void;
  customerAccounts: CustomerAccount[];
  onAssignCustomerAccount: (customerAccountId: number | null) => void;
  newStatus: ProgressStatus;
  setNewStatus: (status: ProgressStatus) => void;
  progressNote: string;
  setProgressNote: (value: string) => void;
  paymentAmount: string;
  setPaymentAmount: (value: string) => void;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  quoteAmount: string;
  setQuoteAmount: (value: string) => void;
}) {
  const { order } = props;
  const [customerAccountId, setCustomerAccountId] = useState(order.customerAccountId?.toString() ?? "");
  useEffect(() => {
    setCustomerAccountId(order.customerAccountId?.toString() ?? "");
  }, [order.id, order.customerAccountId]);
  const paid = getPaid(order);
  const balance = Math.max(0, order.total - paid);
  return (
    <div className="detail-page">
      <button className="back-link" type="button" onClick={props.onBack}>← Kembali ke pesanan</button>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{order.id} <span>·</span> Masuk {formatDate(order.createdAt)}</p>
          <h1>{order.customer}</h1>
          <p className="muted">{order.garment} <span className="dot-separator">·</span> {order.service}</p>
        </div>
        <div className="heading-actions">
          <StatusBadge status={props.currentStatus} />
          <button className="button button-secondary" type="button" onClick={props.onCopyLink}>↗ Salin tautan</button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main-column">
          <section className="panel">
            <div className="panel-title"><div className="section-icon blue">✦</div><div><h2>Detail pesanan</h2><p>Informasi jahitan dan bahan</p></div></div>
            <div className="detail-fields">
              <InfoField label="Jenis layanan" value={order.service} />
              <InfoField label="Pakaian" value={order.garment} />
              <InfoField label="Model" value={order.model || "—"} />
              <InfoField label="Bahan" value={order.material || "—"} />
              <InfoField label="Jumlah bahan" value={order.materialAmount || "—"} />
              <InfoField label="Catatan" value={order.note || "—"} wide />
            </div>
          </section>

          <section className="panel">
            <div className="panel-title"><div className="section-icon purple">⌁</div><div><h2>Ukuran badan</h2><p>Dalam sentimeter</p></div></div>
            <div className="measurement-grid">
              {Object.entries(order.measurements).map(([label, value]) => (
                <InfoField key={label} label={label} value={value ? `${value} cm` : "—"} />
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title"><div className="section-icon green">◷</div><div><h2>Riwayat progres</h2><p>Pembaruan yang dapat dilihat pelanggan</p></div></div>
            <div className="timeline">
              {[...order.progress].reverse().map((entry, index) => (
                <div className="timeline-entry" key={`${entry.date}-${index}`}>
                  <span className={`timeline-dot ${index === 0 ? "current" : ""}`} />
                  <div><div className="timeline-head"><strong>{entry.status}</strong><time>{formatDate(entry.date)}</time></div><p>{entry.note}</p></div>
                </div>
              ))}
            </div>
            <div className="update-form">
              <h3>Perbarui progres</h3>
              <div className="inline-form">
                <select value={props.newStatus} onChange={(event) => props.setNewStatus(event.target.value as ProgressStatus)} aria-label="Status progres baru">
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
                <button className="button button-primary" type="button" onClick={() => props.onProgress(order)}>Simpan progres</button>
              </div>
              <input value={props.progressNote} onChange={(event) => props.setProgressNote(event.target.value)} placeholder="Catatan untuk pelanggan (opsional)" />
            </div>
          </section>
        </div>

        <aside className="detail-side-column">
          <section className="panel">
            <div className="panel-title"><div className="section-icon amber">▣</div><div><h2>Jadwal</h2><p>Tanggal penting pesanan</p></div></div>
            <InfoField label="Fitting" value={formatDate(order.fittingDate)} />
            <InfoField label="Target siap diambil" value={formatDate(order.dueDate)} />
          </section>

          <section className="panel">
            <div className="panel-title"><div className="section-icon green">Rp</div><div><h2>Biaya & pembayaran</h2><p>{order.total <= 0 ? "Estimasi biaya belum ditentukan" : balance === 0 ? "Pembayaran lunas" : "Masih ada sisa pembayaran"}</p></div></div>
            {order.total <= 0 ? (
              <div className="payment-entry quote-entry">
                <label htmlFor="quote-amount">Tentukan estimasi biaya (Rp)</label>
                <div className="money-input"><span>Rp</span><input id="quote-amount" type="number" min="1" value={props.quoteAmount} onChange={(event) => props.setQuoteAmount(event.target.value)} placeholder="Contoh: 180000" /></div>
                <button className="button button-primary button-full" type="button" onClick={() => props.onQuote(order)}>Simpan estimasi biaya</button>
              </div>
            ) : (
              <>
                <div className="payment-summary">
                  <div><span>Total biaya</span><strong>{formatCurrency(order.total)}</strong></div>
                  <div><span>Sudah dibayar</span><strong className="paid-value">{formatCurrency(paid)}</strong></div>
                  <div className="balance-row"><span>Sisa</span><strong>{formatCurrency(balance)}</strong></div>
                </div>
                {order.payments.length > 0 && (
                  <div className="payment-history">
                    {order.payments.map((payment, index) => (
                      <div key={`${payment.date}-${index}`}><span>{payment.method} · {formatDate(payment.date)}</span><strong>{formatCurrency(payment.amount)}</strong></div>
                    ))}
                  </div>
                )}
                {balance > 0 && (
                  <div className="payment-entry">
                    <label htmlFor="payment-amount">Catat pembayaran</label>
                    <div className="money-input"><span>Rp</span><input id="payment-amount" type="number" min="1" max={balance} value={props.paymentAmount} onChange={(event) => props.setPaymentAmount(event.target.value)} placeholder="Jumlah pembayaran" /></div>
                    <div className="inline-form">
                      <select value={props.paymentMethod} onChange={(event) => props.setPaymentMethod(event.target.value)} aria-label="Metode pembayaran">
                        <option>Tunai</option><option>Transfer bank</option><option>QRIS</option>
                      </select>
                      <button className="button button-dark" type="button" onClick={() => props.onPayment(order)}>Catat</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="panel customer-panel">
            <div className="panel-title"><div className="section-icon blue">♙</div><div><h2>Pelanggan</h2><p>Informasi kontak internal</p></div></div>
            <InfoField label="Nama" value={order.customer} />
            <InfoField label="WhatsApp" value={order.phone || "—"} />
            <InfoField label="Alamat" value={order.address || "—"} />
            <div className="customer-account-link">
              <label htmlFor="customer-account">Akun pelanggan</label>
              <select id="customer-account" value={customerAccountId} onChange={(event) => setCustomerAccountId(event.target.value)} aria-label="Akun pelanggan untuk pesanan ini">
                <option value="">Belum ditautkan</option>
                {props.customerAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name} · {account.phone}</option>
                ))}
              </select>
              <button
                className="button button-secondary button-full"
                type="button"
                disabled={customerAccountId === (order.customerAccountId?.toString() ?? "")}
                onClick={() => props.onAssignCustomerAccount(customerAccountId ? Number(customerAccountId) : null)}
              >
                Simpan tautan akun
              </button>
            </div>
          </section>

          <section className="pickup-card">
            <div className="pickup-top"><span className="pickup-icon">✓</span><div><strong>Pengambilan</strong><p>{order.pickedUpAt ? `Diambil ${formatDate(order.pickedUpAt)}` : "Belum diambil pelanggan"}</p></div></div>
            {!order.pickedUpAt && (
              <button className="button button-primary button-full" type="button" onClick={() => props.onPickup(order)}>Catat pengambilan</button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function InfoField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`info-field ${wide ? "wide" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}


const services = [
  {
    icon: "shirt",
    title: "Jahit pakaian baru",
    description: "Dari desain hingga model.",
    color: "purple",
  },
  {
    icon: "scissors",
    title: "Permak pakaian",
    description: "Sesuaikan ukuran pakaian.",
    color: "orange",
  },
  {
    icon: "wrench",
    title: "Perbaikan jahitan",
    description: "Perbaiki pakaian kesayangan.",
    color: "green",
  },
];

const processes = [
  {
    number: "01",
    icon: "☏",
    title: "Konsultasi di studio",
    description: "Diskusikan jenis pakaian, model, dan kebutuhan dengan penjahit.",
  },
  {
    number: "02",
    icon: "✓",
    title: "Pesanan dicatat admin",
    description: "Admin mencatat detail ukuran, bahan, dan jadwal pesanan.",
  },
  {
    number: "03",
    icon: "♧",
    title: "Pakaian sampai selesai",
    description: "Lihat progres jahitan dan dapatkan kabar melalui tautan khusus.",
  },
];

function CustomerLanding(props: {
  trackError: string;
  onTrack: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="website">

      {/* NAVBAR */}
      <header className="navbar">
        <a href="/" className="logo">
          <span className="logo-icon">J</span>
          <span>JahitLink</span>
        </a>

        <nav className="nav-links">
          <a href="#">Beranda</a>
          <a href="#layanan">Layanan</a>
          <a href="#proses">Cara Pesan</a>
          <a href="#lacak">Lokasi Pesanan</a>
        </nav>

        <div className="nav-actions">
          <a href="/masuk" className="login-btn">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="2.5" /><path d="M3.5 14c.25-2.7 1.85-4.1 4.5-4.1s4.25 1.4 4.5 4.1" /></svg>
            Masuk
          </a>
          <a href="#layanan" className="primary-btn">
            Mulai Pesanan <span>→</span>
          </a>
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero">
          <div className="hero-content">
            <div className="eyebrow">
              <span>+</span> JAHITAN PERSONAL, HASIL ISTIMEWA
            </div>

            <h1>
              Jahitan yang pas,
              <span>untuk ceritamu.</span>
            </h1>

            <p className="hero-description">
              Wujudkan pakaian sesuai ukuran dan gayamu.
              Pesanan dicatat langsung oleh admin atau penjahit studio.
            </p>

            <div className="hero-buttons">
              <a href="#lacak" className="primary-btn hero-btn">
                Lacak Pesanan <span>→</span>
              </a>

              <a href="#proses" className="secondary-btn">
                <span aria-hidden="true">▶</span> Pelajari Proses
              </a>
            </div>
          </div>

          <div className="hero-image">
            <img
              src="/hero-sewing-detail.jpg"
              alt="Jarum mesin jahit menjahit kain hijau"
            />
          </div>
        </section>

        {/* SERVICES */}
        <section className="services section-container" id="layanan">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span>+</span> LAYANAN KAMI
              </div>
              <h2>Dari ide, jadi pakaian favorit.</h2>
            </div>
          </div>

          <div className="service-grid">
            {services.map((service) => (
              <a
                href="#lacak"
                className={`service-card ${service.color}`}
                key={service.title}
              >
                <div className="service-icon" aria-hidden="true">
                  <svg className={service.icon === "scissors" ? "outline" : ""} viewBox="0 0 24 24" aria-hidden="true">
                    {service.icon === "shirt" && (
                      <path d="m8 3 4 2 4-2 5 3-2.2 5-2.8-1v11H8V10l-2.8 1L3 6l5-3Z" />
                    )}
                    {service.icon === "scissors" && (
                      <>
                        <circle cx="6" cy="6" r="2.4" />
                        <circle cx="6" cy="18" r="2.4" />
                        <path d="m8 8 12 12M8 16 20 4M12 12l-2 2" />
                      </>
                    )}
                    {service.icon === "wrench" && (
                      <path d="M21 5.2a6.1 6.1 0 0 1-7.8 7.8l-7.6 7.6a2.1 2.1 0 0 1-3-3l7.6-7.6A6.1 6.1 0 0 1 18 2.2l-4 4 3.8 3.8 3.2-4.8Z" />
                    )}
                  </svg>
                </div>

                <div className="service-info">
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                </div>

                <div className="service-arrow">→</div>
              </a>
            ))}
          </div>
        </section>

        {/* PROCESS */}
        <section className="process section-container" id="proses">
          <div className="process-left">
            <div className="eyebrow">
              <span>✦</span> MUDAH DAN JELAS
            </div>

            <h2>
              Pesan, pantau,
              <br />
              lalu <span>kenakan.</span>
            </h2>

            <p>
              Jahitlink membantu proses pemesanan pakaian menjadi
              lebih mudah, mulai dari konsultasi hingga pakaian selesai.
            </p>

            <img
              src="/process-dress.svg"
              alt="Gaun hijau di manekin jahit"
              className="process-image"
            />
          </div>

          <div className="process-list">
            {processes.map((process) => (
              <div className="process-item" key={process.number}>
                <span className="process-number">{process.number}</span>

                <div className="process-icon">{process.icon}</div>

                <div>
                  <h3>{process.title}</h3>
                  <p>{process.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TRACK ORDER */}
        <section className="tracking section-container" id="lacak">
          <div className="tracking-icon" aria-hidden="true">
            <span className="tracking-search-glass" />
          </div>

          <div className="tracking-text">
            <h3>Sudah punya pesanan?</h3>
            <p>
              Masukkan kode atau tautan pelacakan untuk melihat status terbaru.
            </p>
          </div>

          <form className="tracking-form" onSubmit={props.onTrack}>
            <label className="sr-only" htmlFor="tracking-link">Kode atau tautan pelacakan</label>
            <input
              id="tracking-link"
              name="tracking-link"
              type="text"
              placeholder="Masukkan kode atau tautan dari admin..."
              required
            />

            <button type="submit">
              Lacak Pesanan <span>→</span>
            </button>
          </form>

          {props.trackError && <p className="tracking-message" role="alert">{props.trackError}</p>}
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer section-container">
        <div className="footer-brand">
          <a href="/" className="logo">
            <span className="logo-icon">J</span>
            <span>Jahitlink</span>
          </a>
          <p>Jahit dengan mudah, tampil lebih percaya diri.</p>
        </div>

        <div className="footer-links">
          <a href="/">Beranda</a>
          <a href="#layanan">Layanan</a>
          <a href="#proses">Tentang Kami</a>
          <a href="#lacak">Bantuan</a>
        </div>

        <div className="footer-social">
          <a href="/pelanggan">Akun pelanggan</a>
          <a href="/admin">Portal admin/penjahit</a>
        </div>

        <div className="footer-bottom">
          <span>© 2026 Jahitlink. Semua hak dilindungi.</span>
          <span>Menjahit dengan hati, melayani dengan sepenuh hati.</span>
        </div>
      </footer>

    </div>
  );
}

function CreateOrderModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const measurements = Object.keys(initialForm().measurements);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-header"><div><p className="eyebrow">PESANAN BARU</p><h2 id="create-title">Buat pesanan</h2><p>Isi detail pesanan pelanggan.</p></div><button className="close-button" type="button" onClick={onClose} aria-label="Tutup">×</button></div>
        <form onSubmit={onSubmit}>
          <div className="form-section"><h3>Informasi pelanggan</h3><div className="form-grid">
            <label>Nama pelanggan<input name="customer" required placeholder="Contoh: Rina" /></label>
            <label>Nomor WhatsApp<input name="phone" placeholder="08xx-xxxx-xxxx" /></label>
            <label className="full">Alamat pelanggan<textarea name="address" rows={2} maxLength={500} placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan, kecamatan, kota" /></label>
          </div></div>
          <div className="form-section"><h3>Detail pesanan</h3><div className="form-grid">
            <label>Jenis layanan<select name="service"><option>Jahit baru</option><option>Permak</option><option>Perbaikan</option></select></label>
            <label>Pakaian<input name="garment" required placeholder="Contoh: 1 kemeja wanita" /></label>
            <label className="full">Model<input name="model" placeholder="Lengan, kerah, kancing, dan lainnya" /></label>
            <label>Bahan<input name="material" placeholder="Jenis dan warna bahan" /></label>
            <label>Jumlah bahan<input name="materialAmount" placeholder="Contoh: 2 meter" /></label>
            <label className="full">Catatan<textarea name="note" rows={2} placeholder="Catatan khusus untuk pesanan" /></label>
          </div></div>
          <div className="form-section"><h3>Ukuran badan <small>cm</small></h3><div className="form-grid three">
            {measurements.map((label) => <label key={label}>{label}<input name={`measurement:${label}`} type="number" min="0" step="0.1" placeholder="—" /></label>)}
          </div></div>
          <div className="form-section"><h3>Jadwal dan pembayaran</h3><div className="form-grid">
            <label>Tanggal fitting<input name="fittingDate" type="date" /></label>
            <label>Target siap diambil<input name="dueDate" type="date" /></label>
            <label>Total biaya (Rp)<input name="total" type="number" min="1" required placeholder="180000" /></label>
            <label>DP diterima (Rp)<input name="deposit" type="number" min="0" placeholder="0" /></label>
            <label>Metode DP<select name="paymentMethod"><option>Tunai</option><option>Transfer bank</option><option>QRIS</option></select></label>
          </div></div>
          <div className="modal-footer"><button className="button button-secondary" type="button" onClick={onClose}>Batal</button><button className="button button-primary" type="submit">Buat pesanan</button></div>
        </form>
      </section>
    </div>
  );
}

function TrackingPage({ order, embedded = false }: { order: TrackingOrder; embedded?: boolean }) {
  const latest = order.progress.at(-1);
  const balance = Math.max(0, order.total - order.paid);
  return (
    <main className={`tracking-page tracking-detail-page ${embedded ? "embedded" : ""}`}>
      {!embedded && <header className="tracking-header"><a className="brand" href="/"><span className="brand-mark">J</span><span>jahit<span className="brand-accent">link</span></span></a><span className="tracking-label">PELACAKAN PESANAN</span></header>}
      <div className="tracking-content tracking-detail-content">
        <a className="tracking-back-link" href="/pelanggan">← Kembali</a>
        <div className="tracking-detail-heading">
          <div>
            <p className="eyebrow">PESANAN {order.id}</p>
            <h1>Detail Pesanan</h1>
          </div>
          <StatusBadge status={latest?.status ?? "Menunggu pengerjaan"} />
        </div>
        <div className="tracking-detail-grid">
          <div className="tracking-detail-main">
            <section className="panel tracking-order">
              <div className="tracking-order-overview">
                <img className="tracking-order-image" src="/garment-dress.svg" alt="" />
                <div className="tracking-order-info">
                  <p className="eyebrow">INFORMASI PESANAN</p>
                  <h2>{order.garment}</h2>
                  <div><span>Jenis layanan</span><strong>{order.service}</strong></div>
                  <div><span>Tanggal pesanan</span><strong>{formatDate(order.createdAt)}</strong></div>
                  <div><span>Estimasi selesai</span><strong>{formatDate(order.dueDate)}</strong></div>
                  {order.fittingDate && <div><span>Jadwal fitting</span><strong>{formatDate(order.fittingDate)}</strong></div>}
                </div>
              </div>
              {order.model && <div className="tracking-order-model"><span>Model</span><strong>{order.model}</strong></div>}
            </section>
            <section className="panel tracking-timeline">
              <div className="tracking-section-heading">
                <div className="section-icon green">◷</div>
                <div><h2>Progres Jahitan</h2><p>Pembaruan dari penjahit</p></div>
              </div>
              <div className="timeline">
                {[...order.progress].reverse().map((entry, index) => (
                  <div className="timeline-entry" key={`${entry.date}-${index}`}>
                    <span className={`timeline-dot ${index === 0 ? "current" : ""}`} />
                    <div><div className="timeline-head"><strong>{entry.status}</strong><time>{formatDate(entry.date)}</time></div><p>{entry.note || "Progres pesanan diperbarui."}</p></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <aside className="tracking-detail-side">
            <section className="customer-balance-card">
              <div className="customer-balance-icon">Rp</div>
              <div><span>{order.total <= 0 ? "ESTIMASI BIAYA" : "SISA PEMBAYARAN"}</span><strong>{order.total <= 0 ? "Menunggu konfirmasi" : formatCurrency(balance)}</strong><p>{order.total <= 0 ? "Penjahit akan mengonfirmasi biaya setelah meninjau permintaan." : balance === 0 ? "Pesanan sudah lunas." : "Silakan lunasi kepada penjahit saat pembayaran."}</p></div>
              {order.total > 0 && <span className={`payment-status ${balance === 0 ? "paid" : ""}`}>{balance === 0 ? "Lunas" : "Belum lunas"}</span>}
            </section>
            <div className="privacy-message">Informasi kontak dan ukuran badan tidak ditampilkan pada tautan pelacakan ini.</div>
          </aside>
        </div>
      </div>
      {!embedded && <footer className="tracking-footer">Dikelola dengan <strong>jahitlink</strong></footer>}
    </main>
  );
}

function NotFoundPage() {
  return <main className="not-found"><a className="brand" href="/"><span className="brand-mark">J</span><span>jahit<span className="brand-accent">link</span></span></a><h1>Pesanan tidak ditemukan</h1><p>Periksa kembali tautan pelacakan atau hubungi penjahit.</p><a className="button button-primary" href="/">Kembali</a></main>;
}

export default App;
