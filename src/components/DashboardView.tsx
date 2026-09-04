import React from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle,
  Gift,
  Lightbulb,
  Loader2,
  Package,
  Star,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { PartnerProfile, DeliveryOrder, TabType } from '../types';
import type { EarningsSummary } from '../lib/earnings';
import { formatRupees } from '../lib/earnings';
import { formatKm, formatMinutes } from '../lib/geo';
import { STATUS_LABEL } from '../lib/orders';

interface DashboardViewProps {
  profile: PartnerProfile;
  activeOrder: DeliveryOrder | null;
  availableCount: number;
  earnings: EarningsSummary;
  loading: boolean;
  onToggleOnline: () => void;
  onSelectOrder: (order: DeliveryOrder) => void;
  onNavigateTab: (tab: TabType) => void;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Progress along the pending → accepted → on the way → delivered pipeline. */
function progressOf(order: DeliveryOrder): number {
  switch (order.status) {
    case 'accepted':
      return 35;
    case 'out_for_delivery':
      return 75;
    case 'delivered':
      return 100;
    default:
      return 10;
  }
}

/** Builds an SVG area+line path for the weekly payout series. */
function sparkline(values: number[], width = 300, height = 100) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * step;
    // Leave 10% headroom so the peak never touches the top edge.
    const y = height - (v / max) * height * 0.9;
    return `${x},${y}`;
  });
  return {
    line: `M ${points.join(' L ')}`,
    area: `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`,
    max,
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  activeOrder,
  availableCount,
  earnings,
  loading,
  onToggleOnline,
  onSelectOrder,
  onNavigateTab,
}) => {
  // `profile.isOnline` is the single source of truth. This component used to
  // keep its own copy, which drifted out of sync with the header dot.
  const isOnline = profile.isOnline;
  const chart = sparkline(earnings.weekSeries);
  const heatMax = Math.max(1, ...earnings.heatmap.flat());

  return (
    <div className="flex flex-col w-full px-4 sm:px-5 gap-6 pt-4 pb-32 lg:pb-10 max-w-5xl mx-auto">
      {/* Status & earnings */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,106,106,0.06)] mt-2 border border-white/60 transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,106,106,0.1)]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-tertiary/10 to-transparent pointer-events-none" />

        <div className="relative p-6 flex flex-col gap-6 bg-surface-container/65 backdrop-blur-2xl">
          <div className="flex justify-between items-center w-full">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Status
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-3 h-3 rounded-full ${
                    isOnline
                      ? 'bg-secondary shadow-[0_0_8px_rgba(0,106,106,0.6)] animate-pulse'
                      : 'bg-outline'
                  }`}
                />
                <span
                  className={`text-sm font-semibold ${isOnline ? 'text-secondary' : 'text-on-surface-variant'}`}
                >
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <span className="sr-only">Toggle availability</span>
              <input
                type="checkbox"
                checked={isOnline}
                onChange={onToggleOnline}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-surface-variant peer-focus-visible:ring-2 peer-focus-visible:ring-secondary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-secondary" />
            </label>
          </div>

          <div className="flex justify-between items-end w-full">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                Today's Earnings
              </span>
              <span className="text-3xl font-bold text-on-surface">
                {formatRupees(earnings.today, 2)}
              </span>
              <span className="text-xs text-on-surface-variant mt-0.5">
                {earnings.tripsToday} {earnings.tripsToday === 1 ? 'trip' : 'trips'} today
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                Rating
              </span>
              <div className="flex items-center gap-1 bg-surface-container-high px-3 py-1.5 rounded-full shadow-sm">
                <Star className="w-3.5 h-3.5 text-[#d4af37] fill-[#d4af37]" />
                <span className="text-sm font-semibold text-on-surface">
                  {profile.rating != null ? profile.rating.toFixed(1) : 'New'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Demand banner */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,106,106,0.05)] border border-white/60">
        <div className="absolute inset-0 bg-gradient-to-r from-tertiary-container/20 to-secondary-container/20 pointer-events-none" />

        <div className="relative p-5 bg-surface-container/45 backdrop-blur-2xl flex items-start gap-4">
          <div className="p-3 bg-secondary/15 rounded-full text-secondary shrink-0">
            <Lightbulb className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <h3 className="text-sm font-bold text-on-surface mb-1 flex items-center gap-2">
              Live demand <Zap className="w-4 h-4 text-secondary fill-secondary" />
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {!isOnline
                ? 'You are offline. Go online to start receiving delivery requests.'
                : availableCount > 0
                  ? `${availableCount} unclaimed ${availableCount === 1 ? 'order is' : 'orders are'} waiting to be picked up right now.`
                  : 'No unclaimed orders at the moment. New requests appear here the second a customer checks out.'}
            </p>
          </div>
        </div>
      </div>

      {/* Active order */}
      <div className="w-full flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-on-background">Active Order</h2>
          {activeOrder && (
            <button
              className="text-xs text-secondary font-semibold hover:underline"
              onClick={() => onSelectOrder(activeOrder)}
            >
              View Details
            </button>
          )}
        </div>

        {loading && !activeOrder ? (
          <div className="rounded-3xl bg-surface-container/50 border border-white/60 p-8 flex items-center justify-center gap-2 text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading your deliveries…</span>
          </div>
        ) : activeOrder ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectOrder(activeOrder)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectOrder(activeOrder);
            }}
            className="relative w-full rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,106,106,0.05)] bg-surface-container/65 backdrop-blur-2xl border border-white/60 cursor-pointer hover:shadow-[0_12px_40px_rgba(0,106,106,0.1)] transition-all duration-300"
          >
            <div className="p-5 flex flex-col gap-4">
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-primary-container flex items-center justify-center text-primary shadow-sm">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-on-surface truncate">
                      {activeOrder.title}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      Order #{activeOrder.orderNumber}
                    </span>
                  </div>
                </div>
                <div className="bg-error-container text-on-error-container px-3 py-1 rounded-full shrink-0">
                  <span className="text-xs font-bold">
                    {formatMinutes(activeOrder.etaMinutes)}
                  </span>
                </div>
              </div>

              <div className="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-secondary to-tertiary h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressOf(activeOrder)}%` }}
                />
              </div>

              <div className="flex justify-between items-center gap-3">
                <span className="text-xs text-on-surface-variant truncate">
                  {STATUS_LABEL[activeOrder.status]}
                  {activeOrder.distanceKm != null && ` · ${formatKm(activeOrder.distanceKm)} away`}
                </span>
                <span className="bg-secondary text-on-secondary px-5 py-2 rounded-full text-xs font-semibold shadow-md shrink-0 flex items-center gap-1">
                  Navigate <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-surface-container/50 border border-white/60 p-8 text-center">
            <Package className="w-10 h-10 text-outline mx-auto mb-3 opacity-60" />
            <p className="text-sm font-semibold text-on-surface">No delivery in progress</p>
            <p className="text-xs text-on-surface-variant mt-1">
              {availableCount > 0
                ? `${availableCount} order${availableCount === 1 ? '' : 's'} available to accept.`
                : 'New customer orders will show up here automatically.'}
            </p>
            <button
              onClick={() => onNavigateTab('orders')}
              className="mt-4 px-5 py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm"
            >
              Browse orders
            </button>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="w-full flex flex-col gap-3 mt-2">
        <h2 className="text-xl font-semibold text-on-background">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Wallet', Icon: Wallet, tab: 'wallet' as TabType },
            { label: 'Navigate', Icon: Award, tab: 'navigation' as TabType },
            { label: 'Orders', Icon: Gift, tab: 'orders' as TabType },
          ].map(({ label, Icon, tab }) => (
            <button
              key={label}
              onClick={() => onNavigateTab(tab)}
              className="relative rounded-2xl overflow-hidden bg-surface-container/65 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,106,106,0.03)] flex flex-col items-center justify-center p-4 gap-2 transition-all duration-300 hover:scale-105 active:scale-95 border border-white/60"
            >
              <Icon className="w-7 h-7 text-secondary" />
              <span className="text-xs font-bold text-on-surface text-center">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Performance */}
      <div className="w-full flex flex-col gap-6 mt-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-on-background">Your Performance</h2>
          <p className="text-sm text-on-surface-variant">
            {earnings.tripsTotal > 0
              ? `${earnings.tripsTotal} completed ${earnings.tripsTotal === 1 ? 'delivery' : 'deliveries'} so far.`
              : 'Complete your first delivery to start building stats.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-surface-container/60 backdrop-blur-2xl p-4 shadow-[0_4px_24px_rgba(0,106,106,0.03)] border border-white/60">
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-secondary/10 rounded-full blur-xl" />
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-secondary" />
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Success
              </span>
            </div>
            <div className="text-2xl font-bold text-secondary">
              {profile.successRate != null ? profile.successRate : '—'}
              {profile.successRate != null && <span className="text-base font-normal">%</span>}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-surface-container/60 backdrop-blur-2xl p-4 shadow-[0_4px_24px_rgba(0,106,106,0.03)] border border-white/60">
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-tertiary/10 rounded-full blur-xl" />
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-tertiary" />
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Trips
              </span>
            </div>
            <div className="text-2xl font-bold text-tertiary">{profile.totalTrips}</div>
          </div>
        </div>

        {/* Weekly earnings */}
        <div className="relative overflow-hidden rounded-3xl bg-surface-container/65 backdrop-blur-2xl p-6 shadow-[0_8px_32px_rgba(0,106,106,0.04)] border border-white/60">
          <div className="flex justify-between items-end mb-6">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Weekly Earnings
              </span>
              {/* Was rendered with a "$" sign while every other figure used ₹. */}
              <span className="text-3xl font-bold text-on-background">
                {formatRupees(earnings.week, 2)}
              </span>
            </div>
            <div className="flex items-center gap-1 bg-secondary-container/40 px-3 py-1.5 rounded-full">
              <TrendingUp className="w-4 h-4 text-secondary" />
              <span className="text-xs font-bold text-secondary">
                {formatRupees(chart.max)} peak
              </span>
            </div>
          </div>

          <div className="w-full h-40 relative">
            <svg
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 300 100"
              role="img"
              aria-label="Earnings for each day this week"
            >
              <defs>
                <linearGradient id="chart-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#006a6a" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#006a6a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={chart.area} fill="url(#chart-grad)" />
              <path
                d={chart.line}
                fill="none"
                stroke="#006a6a"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
            </svg>
          </div>
          <div className="flex justify-between text-xs font-semibold text-on-surface-variant mt-2 px-2">
            {DAY_LABELS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </div>

        {/* Peak hours */}
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-on-background">Peak Hours Heatmap</h3>
          <div className="relative overflow-hidden rounded-3xl bg-surface-container/65 backdrop-blur-2xl p-5 shadow-[0_8px_32px_rgba(0,106,106,0.04)] border border-white/60">
            <div className="grid grid-cols-7 gap-1 h-32 w-full">
              {earnings.heatmap.map((day, dayIdx) => (
                <div key={dayIdx} className="flex flex-col gap-1">
                  {day.map((count, partIdx) => (
                    <div
                      key={partIdx}
                      className="flex-1 rounded-sm bg-secondary"
                      style={{ opacity: 0.08 + (count / heatMax) * 0.92 }}
                      title={`${DAY_LABELS[dayIdx]} · ${count} ${count === 1 ? 'trip' : 'trips'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs font-semibold text-on-surface-variant mt-3 px-1">
              <span>Morning</span>
              <span>Night</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
