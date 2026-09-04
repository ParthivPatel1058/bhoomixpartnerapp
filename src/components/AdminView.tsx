import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  Database,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAdmin, type AdminTable } from '../hooks/useAdmin';
import { formatRupees } from '../lib/earnings';

const TABS: { id: AdminTable; label: string; Icon: typeof Users }[] = [
  { id: 'orders', label: 'Orders', Icon: Package },
  { id: 'partners', label: 'Partners', Icon: Bike },
  { id: 'users', label: 'Users', Icon: Users },
];

const ORDER_STATUSES = ['', 'pending', 'accepted', 'out_for_delivery', 'delivered', 'cancelled'];

function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** Long identifiers are unreadable in a cell; keep the ends, drop the middle. */
function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-surface-variant text-on-surface-variant',
  accepted: 'bg-secondary-container text-on-secondary-container',
  in_transit: 'bg-secondary-container text-on-secondary-container',
  out_for_delivery: 'bg-secondary-container text-on-secondary-container',
  delivered: 'bg-tertiary-container text-on-tertiary-container',
  cancelled: 'bg-error-container text-on-error-container',
};

export const AdminView: React.FC = () => {
  const admin = useAdmin();
  const [tab, setTab] = useState<AdminTable>('orders');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (admin.isAdmin) void admin.loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.isAdmin]);

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if (!admin.isAdmin) return;
    const timer = window.setTimeout(() => void admin.load(tab, search, status), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.isAdmin, tab, search, status]);

  const statCards = useMemo(() => {
    const s = admin.stats;
    if (!s) return [];
    return [
      { label: 'Users', value: String(s.totalUsers), hint: `${s.totalPartners} partners` },
      { label: 'Orders', value: String(s.totalOrders), hint: `${s.ordersToday} today` },
      {
        label: 'In flight',
        value: String(s.activeOrders),
        hint: `${s.pendingOrders} unclaimed`,
      },
      {
        label: 'Revenue',
        value: formatRupees(s.revenueTotal),
        hint: `${formatRupees(s.revenueToday)} today`,
      },
    ];
  }, [admin.stats]);

  if (admin.checking) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-6 h-6 text-secondary animate-spin" />
        <p className="text-sm text-on-surface-variant">Checking access…</p>
      </div>
    );
  }

  if (admin.unavailable) {
    return (
      <div className="px-4 sm:px-5 pt-6 pb-32 lg:pb-10 max-w-5xl mx-auto">
        <div className="rounded-2xl bg-surface-container/70 border border-outline-variant/40 p-6 text-center">
          <Database className="w-10 h-10 text-outline mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-bold text-on-surface">Admin console not installed</h3>
          <p className="text-xs text-on-surface-variant mt-2 leading-relaxed max-w-sm mx-auto">
            Run <code className="font-mono">supabase/migrations/20260803_admin_console.sql</code>{' '}
            in the Supabase SQL Editor, then grant your account the admin role.
          </p>
        </div>
      </div>
    );
  }

  if (!admin.isAdmin) {
    return (
      <div className="px-4 sm:px-5 pt-6 pb-32 lg:pb-10 max-w-5xl mx-auto">
        <div className="rounded-2xl bg-surface-container/70 border border-outline-variant/40 p-6 text-center">
          <ShieldCheck className="w-10 h-10 text-outline mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-bold text-on-surface">Admin access required</h3>
          <p className="text-xs text-on-surface-variant mt-2 leading-relaxed max-w-sm mx-auto">
            This account does not hold the admin role. Grant it in{' '}
            <code className="font-mono">public.user_roles</code> to see the console.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full px-4 sm:px-5 gap-5 pt-4 pb-32 lg:pb-10 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-on-background flex items-center gap-2">
            <Database className="w-5 h-5 text-secondary" /> Admin
          </h2>
          <p className="text-sm text-on-surface-variant">Everything in the shared BhoomiX database</p>
        </div>
        <button
          onClick={() => {
            void admin.loadStats();
            void admin.load(tab, search, status);
          }}
          disabled={admin.loading}
          className="px-4 min-h-[40px] rounded-xl bg-surface-container text-on-surface text-xs font-bold shadow-sm border border-outline-variant/40 flex items-center gap-1.5 shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 text-secondary ${admin.loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overview */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl bg-surface-container/70 backdrop-blur-xl p-4 border border-white/50 shadow-sm"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                {c.label}
              </span>
              <p className="text-xl font-bold text-on-surface mt-1 truncate">{c.value}</p>
              <p className="text-[11px] text-on-surface-variant truncate">{c.hint}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table picker */}
      <div className="flex rounded-xl bg-surface-container p-1 border border-outline-variant/40">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 min-h-[40px] px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === id
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === 'orders'
                ? 'Search order #, address, customer or partner…'
                : tab === 'partners'
                  ? 'Search name, phone or email…'
                  : 'Search email or name…'
            }
            className="w-full bg-surface-container pl-10 pr-4 min-h-[46px] rounded-xl border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
          />
        </div>
        {tab === 'orders' && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-surface-container px-3 min-h-[46px] rounded-xl border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface sm:w-48"
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All statuses' : s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        )}
      </div>

      {admin.error && (
        <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          {admin.error}
        </p>
      )}

      {/* Table. Scrolls inside its own container so the page never scrolls
          sideways on a phone. */}
      <div className="rounded-2xl bg-surface-container/60 border border-outline-variant/30 overflow-hidden">
        <div className="overflow-x-auto">
          {admin.loading ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-secondary animate-spin" />
              <p className="text-sm text-on-surface-variant">Loading…</p>
            </div>
          ) : tab === 'orders' ? (
            <Table
              head={['Order', 'Status', 'Value', 'Customer', 'Partner', 'Age', 'Placed']}
              rows={admin.orders.map((o) => [
                <span key="n" className="font-mono text-xs font-bold text-secondary">
                  #{o.orderNumber}
                </span>,
                <span
                  key="s"
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                    STATUS_TONE[o.status] ?? 'bg-surface-variant text-on-surface-variant'
                  }`}
                >
                  {o.status.replace(/_/g, ' ')}
                </span>,
                formatRupees(o.totalAmount),
                o.customerEmail ?? '—',
                o.partnerName ?? <span className="text-outline">unassigned</span>,
                `${Math.round(o.minutesElapsed)}m`,
                when(o.createdAt),
              ])}
              empty="No orders match."
            />
          ) : tab === 'partners' ? (
            <Table
              head={['Partner', 'Phone', 'Vehicle', 'Status', 'Delivered', 'Active', 'Joined']}
              rows={admin.partners.map((p) => [
                <span key="n">
                  <span className="font-semibold text-on-surface">{p.fullName ?? '—'}</span>
                  <span className="block text-[11px] text-on-surface-variant">
                    {p.email ?? shortId(p.id)}
                  </span>
                </span>,
                p.phoneNumber ?? '—',
                p.vehicleType ?? '—',
                p.isActive ? (
                  <span
                    key="a"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-tertiary-container text-on-tertiary-container"
                  >
                    <CheckCircle2 className="w-3 h-3" /> active
                  </span>
                ) : (
                  <span
                    key="a"
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-variant text-on-surface-variant"
                  >
                    pending
                  </span>
                ),
                String(p.deliveredCount),
                String(p.activeCount),
                when(p.createdAt),
              ])}
              empty="No partners match."
            />
          ) : (
            <Table
              head={['User', 'Roles', 'Partner', 'Orders', 'Joined', 'Last seen']}
              rows={admin.users.map((u) => [
                <span key="u">
                  <span className="font-semibold text-on-surface">
                    {u.displayName ?? u.email ?? shortId(u.id)}
                  </span>
                  <span className="block text-[11px] text-on-surface-variant">
                    {u.email ?? shortId(u.id)}
                  </span>
                </span>,
                u.roles.length ? (
                  <span key="r" className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r === 'admin'
                            ? 'bg-secondary text-on-secondary'
                            : 'bg-surface-variant text-on-surface-variant'
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span key="r" className="text-outline">
                    —
                  </span>
                ),
                u.isPartner ? 'yes' : '—',
                String(u.orderCount),
                when(u.createdAt),
                when(u.lastSignIn),
              ])}
              empty="No users match."
            />
          )}
        </div>
      </div>

      <p className="text-[11px] text-on-surface-variant leading-relaxed px-1">
        Read-only. Every query re-checks the admin role in the database, so this view cannot be
        reached by hiding or unhiding it in the client.
      </p>
    </div>
  );
};

/** Minimal table shell shared by all three views. */
const Table: React.FC<{
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}> = ({ head, rows, empty }) => {
  if (!rows.length) {
    return (
      <div className="py-16 text-center">
        <Package className="w-10 h-10 text-outline mx-auto mb-3 opacity-50" />
        <p className="text-sm text-on-surface-variant">{empty}</p>
      </div>
    );
  }

  return (
    <table className="w-full text-left border-collapse min-w-[720px]">
      <thead>
        <tr className="border-b border-outline-variant/40">
          {head.map((h) => (
            <th
              key={h}
              className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr
            key={i}
            className="border-b border-outline-variant/20 last:border-0 hover:bg-surface-container/60"
          >
            {cells.map((c, j) => (
              <td key={j} className="px-4 py-3 text-xs text-on-surface align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
