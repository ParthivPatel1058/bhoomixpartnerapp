import React from 'react';
import { ArrowDownRight, Package, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { PartnerProfile, DeliveryOrder } from '../types';
import { formatRupees, type EarningsSummary } from '../lib/earnings';

interface WalletViewProps {
  profile: PartnerProfile;
  earnings: EarningsSummary;
  orders: DeliveryOrder[];
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

export const WalletView: React.FC<WalletViewProps> = ({ profile, earnings, orders }) => {
  // Real payout history, newest first. Ordered by when each delivery was
  // completed rather than when the customer placed it, so the ledger matches
  // the order the partner actually earned the money in.
  const paidAt = (o: DeliveryOrder) => new Date(o.completedAt ?? o.createdAt).getTime();
  const payouts = orders
    .filter((o) => o.status === 'delivered')
    .sort((a, b) => paidAt(b) - paidAt(a));

  return (
    <div className="flex flex-col w-full px-4 sm:px-5 gap-6 pt-4 pb-32 lg:pb-10 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-on-background">Wallet & Earnings</h2>
        <p className="text-sm text-on-surface-variant">
          Estimated payouts from your completed deliveries
        </p>
      </div>

      {/* Balance */}
      <div className="relative w-full rounded-2xl overflow-hidden shadow-lg p-6 bg-gradient-to-br from-[#006a6a] to-[#004f4f] text-white">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Wallet className="w-32 h-32" />
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-100">
            Lifetime earnings
          </span>
          <span className="text-4xl font-bold">{formatRupees(earnings.total, 2)}</span>
          <p className="text-xs text-teal-100/90 leading-relaxed max-w-xs">
            Calculated from {earnings.tripsTotal} completed{' '}
            {earnings.tripsTotal === 1 ? 'delivery' : 'deliveries'}. Payouts settle to your
            registered account on the BhoomiX weekly cycle.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-surface-container/70 backdrop-blur-xl p-4 shadow-sm border border-white/50">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
            Today
          </span>
          <div className="text-xl font-bold text-on-background mt-1">
            {formatRupees(earnings.today, 2)}
          </div>
          <span className="text-xs text-secondary mt-1 flex items-center gap-1 font-semibold">
            <TrendingUp className="w-3.5 h-3.5" /> {earnings.tripsToday}{' '}
            {earnings.tripsToday === 1 ? 'trip' : 'trips'}
          </span>
        </div>

        <div className="rounded-2xl bg-surface-container/70 backdrop-blur-xl p-4 shadow-sm border border-white/50">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
            This week
          </span>
          <div className="text-xl font-bold text-on-background mt-1">
            {formatRupees(earnings.week, 2)}
          </div>
          <span className="text-xs text-tertiary mt-1 flex items-center gap-1 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />{' '}
            {profile.isActive ? 'Verified partner' : 'Pending approval'}
          </span>
        </div>
      </div>

      {/* Payout history */}
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-on-background">Payout history</h3>

        {!payouts.length ? (
          <div className="text-center py-14 bg-surface-container/40 rounded-2xl border border-outline-variant/30">
            <Package className="w-11 h-11 text-outline mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold text-on-surface">No payouts yet</p>
            <p className="text-xs text-on-surface-variant mt-1 px-6">
              Complete your first delivery and it will show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {payouts.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface-container/60 backdrop-blur-xl border border-white/50 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-secondary/15 text-secondary">
                    <ArrowDownRight className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-on-surface truncate">
                      Delivery #{order.orderNumber}
                    </h4>
                    <p className="text-xs text-on-surface-variant">
                      {formatWhen(order.completedAt ?? order.createdAt)}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-secondary shrink-0">
                  +{formatRupees(order.payout, 2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-on-surface-variant leading-relaxed px-1">
        Payout amounts are estimates calculated in-app (base fare + distance + order share).
        The shared BhoomiX database does not store a settled payout per delivery yet.
      </p>
    </div>
  );
};
