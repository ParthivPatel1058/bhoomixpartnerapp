import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  MapPin,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react';
import { DeliveryOrder } from '../types';
import { SlaChip } from './SlaChip';
import { useNow } from '../hooks/useNow';
import { STATUS_LABEL } from '../lib/orders';
import { formatKm } from '../lib/geo';
import { formatRupees } from '../lib/earnings';

interface OrdersViewProps {
  available: DeliveryOrder[];
  mine: DeliveryOrder[];
  loading: boolean;
  onSelectOrder: (order: DeliveryOrder) => void;
  onAcceptOrder: (order: DeliveryOrder) => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
}

type FilterTab = 'available' | 'active' | 'completed';

const TAB_LABELS: Record<FilterTab, string> = {
  available: 'Available',
  active: 'Active',
  completed: 'History',
};

export const OrdersView: React.FC<OrdersViewProps> = ({
  available,
  mine,
  loading,
  onSelectOrder,
  onAcceptOrder,
  onRefresh,
}) => {
  const now = useNow(30_000);
  const [filter, setFilter] = useState<FilterTab>('available');
  const [searchQuery, setSearchQuery] = useState('');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const source = useMemo(() => {
    switch (filter) {
      case 'available':
        return available;
      case 'active':
        return mine.filter((o) => o.stage === 'active');
      case 'completed':
        return mine.filter((o) => o.stage === 'completed' || o.stage === 'cancelled');
    }
  }, [filter, available, mine]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (o) =>
        o.title.toLowerCase().includes(q) ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.address ?? '').toLowerCase().includes(q),
    );
  }, [source, searchQuery]);

  const counts: Record<FilterTab, number> = {
    available: available.length,
    active: mine.filter((o) => o.stage === 'active').length,
    completed: mine.filter((o) => o.stage === 'completed' || o.stage === 'cancelled').length,
  };

  const handleAccept = async (order: DeliveryOrder) => {
    setAcceptingId(order.id);
    try {
      await onAcceptOrder(order);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col w-full px-4 sm:px-5 gap-6 pt-4 pb-32 lg:pb-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl font-bold text-on-background">Delivery Orders</h2>
          <p className="text-sm text-on-surface-variant">
            Live from the BhoomiX customer app
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 rounded-xl bg-surface-container text-on-surface text-xs font-bold shadow-sm border border-outline-variant/40 flex items-center gap-1.5 shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 text-secondary ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-outline" />
          <input
            type="search"
            placeholder="Search by item, order # or address…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-container pl-10 pr-4 py-3 rounded-xl text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
          />
        </div>

        <div className="flex rounded-xl bg-surface-container p-1 border border-outline-variant/40">
          {(Object.keys(TAB_LABELS) as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                filter === tab
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {TAB_LABELS[tab]}
              {counts[tab] > 0 && (
                <span
                  className={`px-1.5 rounded-full text-[10px] ${
                    filter === tab ? 'bg-white/25' : 'bg-surface-variant'
                  }`}
                >
                  {counts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-4">
        {loading && !visible.length ? (
          <div className="text-center py-16 bg-surface-container/40 rounded-2xl border border-outline-variant/30 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-secondary animate-spin" />
            <p className="text-sm text-on-surface-variant">Loading orders…</p>
          </div>
        ) : !visible.length ? (
          <div className="text-center py-16 bg-surface-container/40 rounded-2xl border border-outline-variant/30">
            <Package className="w-12 h-12 text-outline mx-auto mb-3 opacity-50" />
            <p className="text-base font-semibold text-on-surface">
              {searchQuery ? 'No matching orders' : `No ${TAB_LABELS[filter].toLowerCase()} orders`}
            </p>
            <p className="text-xs text-on-surface-variant mt-1 px-6">
              {searchQuery
                ? 'Try a different search term.'
                : filter === 'available'
                  ? 'When a customer checks out in the BhoomiX app, their order appears here within seconds.'
                  : filter === 'active'
                    ? 'Accept an available order to start a delivery.'
                    : 'Delivered and cancelled orders are archived here.'}
            </p>
          </div>
        ) : (
          visible.map((order) => {
            const isAvailable = order.stage === 'incoming' && !order.isMine;
            const isActive = order.stage === 'active';

            return (
              <div
                key={order.id}
                className="relative rounded-2xl bg-surface-container/70 backdrop-blur-xl p-5 shadow-sm border border-white/60 flex flex-col gap-4"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${
                        isActive
                          ? 'bg-secondary text-on-secondary'
                          : order.status === 'delivered'
                            ? 'bg-tertiary-container text-on-tertiary-container'
                            : 'bg-surface-variant text-on-surface-variant'
                      }`}
                    >
                      {order.status === 'delivered' ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Clock className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-secondary">
                          #{order.orderNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isActive
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'bg-surface-variant text-on-surface-variant'
                          }`}
                        >
                          {STATUS_LABEL[order.status]}
                        </span>
                        <SlaChip order={order} now={now} />
                      </div>
                      <h3 className="text-base font-bold text-on-surface mt-0.5 truncate">
                        {order.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
                        {formatRupees(order.totalAmount)} order value
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-bold text-primary">
                      {formatRupees(order.payout)}
                    </span>
                    <p className="text-xs text-on-surface-variant">
                      {order.distanceKm != null ? formatKm(order.distanceKm) : 'payout est.'}
                    </p>
                  </div>
                </div>

                <div className="w-full h-px bg-outline-variant/30" />

                {/* The RPC masks address/phone/GPS until the order is accepted. */}
                {isAvailable ? (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <Lock className="w-4 h-4 text-outline shrink-0" />
                    <span>Customer address unlocks when you accept</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                    <MapPin className="w-4 h-4 text-tertiary shrink-0 mt-px" />
                    <span className="line-clamp-2">
                      {order.address ?? 'No delivery address on this order'}
                    </span>
                  </div>
                )}

                {isAvailable ? (
                  <button
                    onClick={() => handleAccept(order)}
                    disabled={acceptingId === order.id}
                    className="w-full py-3 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {acceptingId === order.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Accept order
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectOrder(order)}
                    className="w-full py-3 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs border border-outline-variant/30 flex items-center justify-center gap-1"
                  >
                    View details <ChevronRight className="w-4 h-4 text-secondary" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
