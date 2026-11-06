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

const STORAGE_KEY = "jahitlink.orders.v1";
const statuses: ProgressStatus[] = [
  "Menunggu konfirmasi",
  "Menunggu pengerjaan",
  "Dalam pengerjaan",
  "Siap fitting",
  "Perlu revisi",
  "Siap diambil",
  "Selesai",
];

const today = "2026-11-06";
const sampleOrder: Order = {
  id: "JL-001",
  token: "c2a8f3d9-5248-4ed8-9d2b-6e9d8bd4f9aa",
  createdAt: today,
  customer: "Rina",
  phone: "08xx-xxxx-xxxx",
  service: "Jahit baru",
  garment: "1 kemeja wanita",
  model: "Lengan panjang, kerah biasa, kancing depan",
  material: "Katun biru muda dari pelanggan",
  materialAmount: "2 meter",
  note: "Untuk acara 20 November, jangan terlalu ketat.",
  measurements: {
    "Lingkar badan": "92",
    "Lingkar pinggang": "78",
    "Lebar bahu": "38",
    "Panjang baju": "65",
    "Panjang lengan": "54",
    "Lingkar lengan atas": "30",
  },
  fittingDate: "2026-11-13",
  dueDate: "2026-11-16",
  total: 180000,
  payments: [{ amount: 80000, method: "Tunai", date: today }],
  progress: [
    { status: "Menunggu pengerjaan", note: "Pesanan dan bahan diterima.", date: today },
  ],
  pickedUpAt: null,
};

function loadOrders(): Order[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [sampleOrder];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      throw new Error("Format data pesanan tidak valid.");
    }
    return parsed as Order[];
  } catch (error) {
    console.error("Gagal membaca pesanan dari penyimpanan lokal.", error);
    return [sampleOrder];
  }
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
  const [orders, setOrders] = useState<Order[]>(loadOrders);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCustomerRequest, setShowCustomerRequest] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<Order | null>(null);
  const [trackError, setTrackError] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [newStatus, setNewStatus] = useState<ProgressStatus>("Dalam pengerjaan");
  const [progressNote, setProgressNote] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Tunai");
  const [quoteAmount, setQuoteAmount] = useState("");

  const trackingToken = window.location.pathname.match(/^\/track\/([^/]+)\/?$/)?.[1];
  const trackingOrder = trackingToken
    ? orders.find((order) => order.token === trackingToken)
    : undefined;
  const selectedOrder = orders.find((order) => order.id === selectedId);
  const isAdminRoute = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch (error) {
      console.error("Gagal menyimpan pesanan di browser.", error);
      setNotice("Pesanan tidak dapat disimpan di browser ini.");
    }
  }, [orders]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("id");
    if (!normalized) return orders;
    return orders.filter((order) =>
      `${order.id} ${order.customer} ${order.garment}`.toLocaleLowerCase("id").includes(normalized),
    );
  }, [orders, query]);

  const openNewOrder = () => setShowCreate(true);

  function openCustomerTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitted = String(formData.get("tracking-link") ?? "").trim();
    const token = submitted.match(/\/track\/([^/?#]+)/)?.[1] ?? submitted;
    const order = orders.find((item) => item.token === token || item.id.toLowerCase() === token.toLowerCase());
    if (!order) {
      setTrackError("Pesanan tidak ditemukan. Pastikan kode benar dan gunakan browser tempat pesanan dibuat.");
      return;
    }
    window.location.href = `/track/${order.token}`;
  }

  function createCustomerRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = Object.fromEntries(formData.entries());
    const nextNumber = Math.max(
      0,
      ...orders.map((order) => Number(order.id.replace("JL-", "")) || 0),
    ) + 1;
    const date = new Date().toISOString().slice(0, 10);
    const order: Order = {
      id: `JL-${String(nextNumber).padStart(3, "0")}`,
      token: crypto.randomUUID(),
      createdAt: date,
      customer: String(form.customer).trim(),
      phone: String(form.phone).trim(),
      service: String(form.service),
      garment: String(form.garment).trim(),
      model: String(form.model).trim(),
      material: String(form.material).trim(),
      materialAmount: "",
      note: String(form.note).trim(),
      measurements: {},
      fittingDate: "",
      dueDate: String(form.dueDate),
      total: 0,
      payments: [],
      progress: [{
        status: "Menunggu konfirmasi",
        note: "Permintaan jahit diterima. Penjahit akan menghubungi untuk konfirmasi detail dan biaya.",
        date,
      }],
      pickedUpAt: null,
    };
    setOrders((current) => [order, ...current]);
    setRequestSuccess(order);
    setShowCustomerRequest(false);
  }

  function openTracking(order: Order) {
    window.location.href = `/track/${order.token}`;
  }

  function createOrder(event: FormEvent<HTMLFormElement>) {
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

    const nextNumber = Math.max(
      0,
      ...orders.map((order) => Number(order.id.replace("JL-", "")) || 0),
    ) + 1;
    const date = new Date().toISOString().slice(0, 10);
    const order: Order = {
      id: `JL-${String(nextNumber).padStart(3, "0")}`,
      token: crypto.randomUUID(),
      createdAt: date,
      customer: String(form.customer).trim(),
      phone: String(form.phone).trim(),
      service: String(form.service),
      garment: String(form.garment).trim(),
      model: String(form.model).trim(),
      material: String(form.material).trim(),
      materialAmount: String(form.materialAmount).trim(),
      note: String(form.note).trim(),
      measurements,
      fittingDate: String(form.fittingDate),
      dueDate: String(form.dueDate),
      total,
      payments: deposit > 0
        ? [{ amount: deposit, method: String(form.paymentMethod), date }]
        : [],
      progress: [{ status: "Menunggu pengerjaan", note: "Pesanan diterima.", date }],
      pickedUpAt: null,
    };

    setOrders((current) => [order, ...current]);
    setSelectedId(order.id);
    setShowCreate(false);
    setNotice(`${order.id} berhasil dibuat.`);
  }

  function updateProgress(order: Order) {
    const date = new Date().toISOString().slice(0, 10);
    const next: ProgressUpdate = {
      status: newStatus,
      note: progressNote.trim() || `Status diperbarui menjadi ${newStatus}.`,
      date,
    };
    setOrders((current) =>
      current.map((item) =>
        item.id === order.id ? { ...item, progress: [...item.progress, next] } : item,
      ),
    );
    setProgressNote("");
    setNotice("Progres pesanan diperbarui.");
  }

  function addPayment(order: Order) {
    const amount = Number(paymentAmount);
    const balance = order.total - getPaid(order);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setNotice(`Masukkan pembayaran antara Rp1 dan ${formatCurrency(balance)}.`);
      return;
    }
    const payment = {
      amount,
      method: paymentMethod,
      date: new Date().toISOString().slice(0, 10),
    };
    setOrders((current) =>
      current.map((item) =>
        item.id === order.id ? { ...item, payments: [...item.payments, payment] } : item,
      ),
    );
    setPaymentAmount("");
    setNotice("Pembayaran berhasil dicatat.");
  }

  function setOrderQuote(order: Order) {
    const total = Number(quoteAmount);
    if (!Number.isFinite(total) || total <= 0) {
      setNotice("Masukkan biaya pesanan yang valid.");
      return;
    }
    setOrders((current) =>
      current.map((item) => item.id === order.id ? { ...item, total } : item),
    );
    setQuoteAmount("");
    setNotice("Estimasi biaya berhasil disimpan.");
  }

  function markPickedUp(order: Order) {
    if (order.pickedUpAt) return;
    const date = new Date().toISOString().slice(0, 10);
    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? {
              ...item,
              pickedUpAt: date,
              progress: [
                ...item.progress,
                { status: "Selesai", note: "Pesanan telah diambil pelanggan.", date },
              ],
            }
          : item,
      ),
    );
    setNotice("Pengambilan pesanan telah dicatat.");
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

  if (trackingToken) {
    return trackingOrder
      ? <TrackingPage order={trackingOrder} />
      : <NotFoundPage />;
  }
  if (!isAdminRoute) {
    return (
      <>
        <CustomerLanding
          successOrder={requestSuccess}
          trackError={trackError}
          onRequest={() => { setTrackError(""); setShowCustomerRequest(true); }}
          onTrack={openCustomerTracking}
          onOpenTracking={openTracking}
        />
        {showCustomerRequest && (
          <CustomerRequestModal
            onClose={() => setShowCustomerRequest(false)}
            onSubmit={createCustomerRequest}
          />
        )}
      </>
    );
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
          <div className="breadcrumb"><a href="/">JahitLink</a> <span>/</span> Dashboard pemilik</div>
          <div className="topbar-right"><a href="/" className="customer-site-link">Lihat halaman pelanggan ↗</a><span className="online-dot" /> Data lokal</div>
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
                  <p className="eyebrow">MANAJEMEN STUDIO</p>
                  <h1>Pesanan</h1>
                  <p className="muted">Kelola jahitan, pembaruan progres, dan pembayaran.</p>
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
                  <div><h2>Semua pesanan</h2><p>{orders.length} pesanan tercatat</p></div>
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
              <p className="prototype-note"><span>ⓘ</span> Ini prototipe lokal. Data hanya tersimpan di browser yang sedang digunakan.</p>
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
  successOrder: Order | null;
  trackError: string;
  onRequest: () => void;
  onTrack: (event: FormEvent<HTMLFormElement>) => void;
  onOpenTracking: (order: Order) => void;
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
          <p>Wujudkan pakaian sesuai ukuran dan gayamu. Ceritakan kebutuhan jahitanmu, lalu pantau prosesnya dengan mudah.</p>
          <div className="hero-actions"><button className="button button-primary" type="button" onClick={props.onRequest}>Mulai pesan jahitan <span>→</span></button><a href="#cara-pesan" className="text-link">Pelajari cara pesan <span>↓</span></a></div>
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
        <div><p className="eyebrow">MUDAH DAN JELAS</p><h2>Pesan, pantau,<br />lalu kenakan.</h2><p className="how-copy">Kamu selalu tahu pesananmu sedang dikerjakan sampai siap diambil.</p><button className="button button-primary" type="button" onClick={props.onRequest}>Ajukan pesanan <span>→</span></button></div>
        <div className="how-steps">
          <div className="how-step"><span>01</span><div><strong>Ceritakan jahitanmu</strong><p>Isi jenis pakaian, model, dan kebutuhanmu.</p></div></div>
          <div className="how-step"><span>02</span><div><strong>Konfirmasi dengan penjahit</strong><p>Penjahit menghubungi untuk ukuran, biaya, dan jadwal.</p></div></div>
          <div className="how-step"><span>03</span><div><strong>Pantau sampai selesai</strong><p>Lihat progres dan sisa pembayaran melalui tautan khusus.</p></div></div>
        </div>
      </section>

      <section id="lacak" className="track-section">
        <div className="track-section-copy"><span className="track-icon">◷</span><div><h2>Sudah punya pesanan?</h2><p>Masukkan kode atau tautan pelacakan untuk melihat kabar terbaru.</p></div></div>
        <div className="track-box">
          {props.successOrder ? (
            <div className="request-success">
              <span className="success-check">✓</span><div><strong>Permintaan terkirim · {props.successOrder.id}</strong><p>Penjahit akan menghubungimu untuk mengonfirmasi detail dan biaya.</p></div>
              <button className="button button-primary" type="button" onClick={() => props.onOpenTracking(props.successOrder!)}>Lihat status</button>
            </div>
          ) : (
            <form className="tracking-lookup" onSubmit={props.onTrack}>
              <label className="sr-only" htmlFor="tracking-link">Kode atau tautan pelacakan</label>
              <input id="tracking-link" name="tracking-link" required placeholder="Masukkan kode atau tautan pesanan" />
              <button className="button button-dark" type="submit">Lacak pesanan →</button>
            </form>
          )}
          {props.trackError && <p className="track-error" role="alert">{props.trackError}</p>}
        </div>
      </section>

      <footer className="storefront-footer"><a className="brand" href="/"><span className="brand-mark">J</span><span>jahit<span className="brand-accent">link</span></span></a><span>Merawat detail, menjahit cerita.</span><a href="/admin">Portal pemilik usaha ↗</a></footer>
      <p className="prototype-note storefront-note"><span>ⓘ</span> Prototipe lokal: permintaan hanya tersimpan di browser ini dan belum dikirim ke penjahit.</p>
    </main>
  );
}

function CustomerRequestModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card customer-request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title">
        <div className="modal-header"><div><p className="eyebrow">MULAI PESANAN</p><h2 id="request-title">Ceritakan jahitanmu</h2><p>Penjahit akan menghubungi untuk konfirmasi ukuran, biaya, dan jadwal.</p></div><button className="close-button" type="button" onClick={onClose} aria-label="Tutup">×</button></div>
        <form onSubmit={onSubmit}>
          <div className="form-section"><h3>Kontak kamu</h3><div className="form-grid">
            <label>Nama<input name="customer" required autoComplete="name" placeholder="Nama lengkap" /></label>
            <label>Nomor WhatsApp<input name="phone" required autoComplete="tel" placeholder="08xx-xxxx-xxxx" /></label>
          </div></div>
          <div className="form-section"><h3>Keinginan jahitan</h3><div className="form-grid">
            <label>Jenis layanan<select name="service"><option>Jahit baru</option><option>Permak</option><option>Perbaikan</option></select></label>
            <label>Jenis pakaian<input name="garment" required placeholder="Contoh: kemeja wanita" /></label>
            <label className="full">Model atau gaya yang diinginkan<input name="model" placeholder="Ceritakan model atau detailnya" /></label>
            <label>Bahan<input name="material" placeholder="Sudah punya bahan? Sebutkan di sini" /></label>
            <label>Target selesai<input name="dueDate" type="date" /></label>
            <label className="full">Catatan tambahan<textarea name="note" rows={3} placeholder="Contoh: untuk acara, warna pilihan, atau kebutuhan khusus" /></label>
          </div></div>
          <div className="request-privacy">🔒 Ukuran badan tidak diminta di formulir ini. Penjahit akan mengatur pengukuran setelah menghubungi kamu.</div>
          <div className="modal-footer"><button className="button button-secondary" type="button" onClick={onClose}>Batal</button><button className="button button-primary" type="submit">Kirim permintaan →</button></div>
        </form>
      </section>
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

function TrackingPage({ order, embedded = false }: { order: Order; embedded?: boolean }) {
  const latest = order.progress.at(-1);
  const balance = Math.max(0, order.total - getPaid(order));
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
