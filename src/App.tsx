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
          const result = await apiRequest<{ orders: Order[] }>("/api/orders");
          if (active) setOrders(result.orders);
        } else {
          setOrders([]);
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
      void apiRequest<{ orders: Order[] }>("/api/orders")
        .then((result) => setOrders(result.orders))
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
      const [status, result] = await Promise.all([
        apiRequest<AuthStatus>("/api/auth/status"),
        apiRequest<{ orders: Order[] }>("/api/orders"),
      ]);
      setAuthStatus({ ...status, authenticated: true });
      setOrders(result.orders);
      setStartupError("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal memuat data admin.");
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
          <label>Nama pengguna<input name="username" required minLength={3} autoComplete="username" /></label>
          <label>Kata sandi<input name="password" type="password" required minLength={isSetup ? 10 : 1} autoComplete={isSetup ? "new-password" : "current-password"} /></label>
          {isSetup && <label>Ulangi kata sandi<input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></label>}
          {error && <p className="admin-access-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" type="submit">{isSetup ? "Buat akun dan masuk" : "Masuk"}</button>
        </form>
        <p className="admin-access-note">Kredensial diperiksa oleh server. Sesi berakhir otomatis setelah 8 jam.</p>
        <a className="admin-access-home" href="/">← Kembali ke halaman pelanggan</a>
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

function OrderDetail(props: {
  order: Order;
  currentStatus: ProgressStatus;
  onBack: () => void;
  onCopyLink: () => void;
  onProgress: (order: Order) => void;
  onPayment: (order: Order) => void;
  onQuote: (order: Order) => void;
  onPickup: (order: Order) => void;
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

function CustomerLanding(props: {
  trackError: string;
  onTrack: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="storefront">
      <header className="storefront-header">
        <a className="brand" href="/" aria-label="JahitLink beranda"><span className="brand-mark">J</span><span>jahit<span className="brand-accent">link</span></span></a>
        <nav className="storefront-nav"><a href="#layanan">Layanan</a><a href="#cara-pesan">Cara pesan</a><a href="#lacak">Lacak pesanan</a></nav>
        <a className="button button-secondary owner-link" href="/admin">Masuk pemilik ↗</a>
      </header>

      <section className="storefront-hero">
        <div className="hero-copy">
          <span className="hero-kicker"><span /> JAHITAN PERSONAL, HASIL ISTIMEWA</span>
          <h1>Jahitan yang pas,<br /><em>untuk ceritamu.</em></h1>
          <p>Wujudkan pakaian sesuai ukuran dan gayamu. Pesanan dicatat langsung oleh admin atau penjahit studio.</p>
          <div className="hero-actions"><a href="#lacak" className="button button-primary">Lacak pesanan <span>→</span></a><a href="#cara-pesan" className="text-link">Pelajari proses <span>↓</span></a></div>
          <div className="hero-note"><span className="hero-note-check">✓</span> Ukuran personal <span className="hero-note-divider">·</span> Progres transparan <span className="hero-note-divider">·</span> Konsultasi langsung</div>
        </div>
        <div className="hero-art" aria-label="Ilustrasi busana dan pola jahit">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="fabric-card"><div className="fabric-lines" /><span>MADE<br />FOR YOU</span></div>
          <div className="sewing-tag"><span>✦</span> dibuat dengan teliti</div>
          <div className="art-stitch stitch-one" /><div className="art-stitch stitch-two" />
        </div>
      </section>

      <section id="layanan" className="storefront-services">
        <div className="section-heading"><div><p className="eyebrow">LAYANAN JAHIT</p><h2>Dari ide, jadi pakaian favorit.</h2></div><p>Jahitan dibuat sesuai kebutuhanmu, dengan detail yang dibicarakan bersama penjahit.</p></div>
        <div className="service-cards">
          <article className="service-card"><span className="service-icon lavender">✦</span><h3>Jahit pakaian baru</h3><p>Buat pakaian dengan model, bahan, dan ukuran pilihanmu.</p><span className="service-number">01</span></article>
          <article className="service-card"><span className="service-icon peach">⌁</span><h3>Permak pakaian</h3><p>Sesuaikan panjang, ukuran, atau potongan agar lebih nyaman dipakai.</p><span className="service-number">02</span></article>
          <article className="service-card"><span className="service-icon mint">✂</span><h3>Perbaikan jahitan</h3><p>Perbaiki pakaian kesayangan agar bisa dipakai kembali.</p><span className="service-number">03</span></article>
        </div>
      </section>

      <section id="cara-pesan" className="how-section">
        <div><p className="eyebrow">MUDAH DAN JELAS</p><h2>Pesan, pantau,<br />lalu kenakan.</h2><p className="how-copy">Admin atau penjahit mencatat pesanan di studio. Pelanggan dapat memantau progres melalui kode pelacakan.</p></div>
        <div className="how-steps">
          <div className="how-step"><span>01</span><div><strong>Konsultasi di studio</strong><p>Diskusikan jenis pakaian, model, dan kebutuhan dengan penjahit.</p></div></div>
          <div className="how-step"><span>02</span><div><strong>Pesanan dicatat admin</strong><p>Admin atau penjahit memasukkan detail, ukuran, biaya, dan jadwal.</p></div></div>
          <div className="how-step"><span>03</span><div><strong>Pantau sampai selesai</strong><p>Lihat progres dan sisa pembayaran melalui tautan khusus.</p></div></div>
        </div>
      </section>

      <section id="lacak" className="track-section">
        <div className="track-section-copy"><span className="track-icon">◷</span><div><h2>Sudah punya pesanan?</h2><p>Masukkan kode atau tautan pelacakan untuk melihat kabar terbaru.</p></div></div>
        <div className="track-box">
          <form className="tracking-lookup" onSubmit={props.onTrack}>
            <label className="sr-only" htmlFor="tracking-link">Kode atau tautan pelacakan</label>
            <input id="tracking-link" name="tracking-link" required placeholder="Masukkan kode atau tautan dari admin" />
            <button className="button button-dark" type="submit">Lacak pesanan →</button>
          </form>
          {props.trackError && <p className="track-error" role="alert">{props.trackError}</p>}
        </div>
      </section>

      <footer className="storefront-footer"><a className="brand" href="/"><span className="brand-mark">J</span><span>jahit<span className="brand-accent">link</span></span></a><span>Merawat detail, menjahit cerita.</span><a href="/admin">Portal pemilik usaha ↗</a></footer>
      <p className="prototype-note storefront-note"><span>ⓘ</span> Prototipe lokal: pesanan dicatat admin dan tersimpan di browser ini.</p>
    </main>
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
    <main className={`tracking-page ${embedded ? "embedded" : ""}`}>
      {!embedded && <header className="tracking-header"><a className="brand" href="/"><span className="brand-mark">J</span><span>jahit<span className="brand-accent">link</span></span></a><span className="tracking-label">PELACAKAN PESANAN</span></header>}
      <div className="tracking-content">
        <div className="tracking-welcome"><div className="tracking-check">✦</div><p className="eyebrow">PESANAN {order.id}</p><h1>Halo, {order.customer}!</h1><p>Pantau proses jahitanmu di sini. Informasi diperbarui oleh penjahit.</p></div>
        <section className="tracking-status-card">
          <div><span className="label-small">STATUS TERKINI</span><h2>{latest?.status ?? "Menunggu pengerjaan"}</h2><p>{latest?.note}</p></div>
          <StatusBadge status={latest?.status ?? "Menunggu pengerjaan"} />
        </section>
        <section className="panel tracking-order">
          <div className="panel-title"><div className="section-icon blue">✦</div><div><h2>Detail pesanan</h2><p>{order.id} · Dipesan {formatDate(order.createdAt)}</p></div></div>
          <div className="detail-fields"><InfoField label="Pakaian" value={order.garment} /><InfoField label="Jenis layanan" value={order.service} /><InfoField label="Model" value={order.model || "—"} /><InfoField label="Target selesai" value={formatDate(order.dueDate)} /><InfoField label="Jadwal fitting" value={formatDate(order.fittingDate)} /></div>
        </section>
        <section className="customer-balance-card">
          <div className="customer-balance-icon">Rp</div>
          <div><span>{order.total <= 0 ? "ESTIMASI BIAYA" : "SISA PEMBAYARAN"}</span><strong>{order.total <= 0 ? "Menunggu konfirmasi" : formatCurrency(balance)}</strong><p>{order.total <= 0 ? "Penjahit akan mengonfirmasi biaya setelah meninjau permintaan." : balance === 0 ? "Pesanan sudah lunas." : "Silakan lunasi kepada penjahit saat pembayaran."}</p></div>
          {order.total > 0 && <span className={`payment-status ${balance === 0 ? "paid" : ""}`}>{balance === 0 ? "Lunas" : "Belum lunas"}</span>}
        </section>
        <section className="panel tracking-timeline">
          <div className="panel-title"><div className="section-icon green">◷</div><div><h2>Perjalanan pesanan</h2><p>Riwayat pembaruan dari penjahit</p></div></div>
          <div className="timeline">
            {[...order.progress].reverse().map((entry, index) => (
              <div className="timeline-entry" key={`${entry.date}-${index}`}><span className={`timeline-dot ${index === 0 ? "current" : ""}`} /><div><div className="timeline-head"><strong>{entry.status}</strong><time>{formatDate(entry.date)}</time></div><p>{entry.note}</p></div></div>
            ))}
          </div>
        </section>
        <div className="privacy-message">🔒 Tautan ini hanya menampilkan informasi pesanan dan progres. Data kontak dan ukuran badan tidak ditampilkan.</div>
      </div>
      {!embedded && <footer className="tracking-footer">Dikelola dengan <strong>jahitlink</strong></footer>}
    </main>
  );
}

function NotFoundPage() {
  return <main className="not-found"><a className="brand" href="/"><span className="brand-mark">J</span><span>jahit<span className="brand-accent">link</span></span></a><h1>Pesanan tidak ditemukan</h1><p>Periksa kembali tautan pelacakan atau hubungi penjahit.</p><a className="button button-primary" href="/">Kembali</a></main>;
}

export default App;
