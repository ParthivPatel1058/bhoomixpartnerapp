import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TabType, DeliveryOrder, PartnerProfile } from './types';
import { useAuth } from './hooks/useAuth';
import { useMfa } from './hooks/useMfa';
import { usePartner } from './hooks/usePartner';
import { usePartnerStats } from './hooks/usePartnerStats';
import { useOrders } from './hooks/useOrders';
import { useGeolocation } from './hooks/useGeolocation';
import { summarizeEarnings, successRateOf } from './lib/earnings';
import { initialsAvatar } from './lib/avatar';
import { useToast } from './components/Toast';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SideNav } from './components/SideNav';
import { DashboardView } from './components/DashboardView';
import { OrdersView } from './components/OrdersView';
import { NavigationMapView } from './components/NavigationMapView';
import { WalletView } from './components/WalletView';
import { ProfileView } from './components/ProfileView';
import { ActiveDeliveryView } from './components/ActiveDeliveryView';
import { IncomingOrderModal } from './components/IncomingOrderModal';
import { QrVerifyModal } from './components/QrVerifyModal';
import { SplashModal } from './components/SplashModal';
import { AuthView } from './components/AuthView';
import { PartnerOnboardingView } from './components/PartnerOnboardingView';
import { AdminView } from './components/AdminView';
import { useAdmin } from './hooks/useAdmin';
import { MfaChallengeView } from './components/MfaChallengeView';

/** Namespaced so it cannot collide with the customer app on the same origin. */
const ONLINE_STORAGE_KEY = 'bhoomix-partner-online';

const TAB_TITLES: Record<TabType, string> = {
  dashboard: 'Dashboard',
  orders: 'Orders',
  navigation: 'Live Navigation',
  wallet: 'Wallet & Earnings',
  profile: 'Partner Profile',
  admin: 'Admin',
};

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const mfa = useMfa();
  const { partner, loading: partnerLoading, awaitingApproval, register, refresh } = usePartner();
  const { stats: serverStats, refresh: refreshStats } = usePartnerStats();
  // Only decides whether the nav entry is worth showing; the database re-checks
  // the role on every admin query regardless.
  const { isAdmin } = useAdmin();
  const { toast } = useToast();

  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [showSplash, setShowSplash] = useState(true);

  /*
   * Availability survives a reload. A partner who goes offline at the end of a
   * shift used to come back ONLINE after any refresh or PWA restart, which
   * quietly reopened the GPS watch and started popping order requests at them.
   */
  const [isOnline, setIsOnline] = useState(() => {
    try {
      return window.localStorage.getItem(ONLINE_STORAGE_KEY) !== 'false';
    } catch {
      return true; // private mode / storage blocked
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(ONLINE_STORAGE_KEY, String(isOnline));
    } catch {
      /* non-fatal — availability just won't persist */
    }
  }, [isOnline]);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<DeliveryOrder | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [dismissedOrderIds, setDismissedOrderIds] = useState<string[]>([]);

  // GPS only runs while the partner is online — no point holding the radio open
  // when they aren't taking deliveries.
  const geo = useGeolocation(Boolean(user) && isOnline);

  const {
    available,
    mine,
    activeOrder,
    loading: ordersLoading,
    error: ordersError,
    notAPartner,
    refresh: refreshOrders,
    acceptOrder,
    startDelivery,
    completeDelivery,
  } = useOrders(geo.position);

  // --- Derived data --------------------------------------------------------

  // Client-side estimate, used until the `partner` schema migration is applied.
  const localEarnings = useMemo(() => summarizeEarnings(mine), [mine]);

  // Prefer authoritative payouts from partner.payouts; keep the local charts,
  // which the RPC does not (and need not) provide.
  const earnings = useMemo(
    () =>
      serverStats
        ? {
            ...localEarnings,
            today: serverStats.earnedToday,
            week: serverStats.earnedWeek,
            total: serverStats.earnedTotal,
            tripsToday: serverStats.tripsToday,
            tripsTotal: serverStats.tripsTotal,
          }
        : localEarnings,
    [serverStats, localEarnings],
  );

  const profile = useMemo<PartnerProfile>(() => {
    const meta = user?.user_metadata ?? {};
    const name =
      partner?.full_name ??
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      'Partner';
    const finishedRate = successRateOf(mine);

    // Google supplies a real profile photo; fall back to a generated initials
    // avatar for email signups.
    const googleAvatar =
      (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined);

    return {
      userId: user?.id ?? '',
      name,
      email: user?.email ?? '',
      phone: partner?.phone_number ?? '',
      avatar: googleAvatar || initialsAvatar(name, user?.id ?? name),
      vehicle: partner?.vehicle_type ?? 'Not set',
      isRegistered: Boolean(partner),
      isActive: partner?.is_active !== false,
      isOnline,

      totalTrips: earnings.tripsTotal,
      earningsToday: earnings.today,
      earningsWeek: earnings.week,
      earningsTotal: earnings.total,

      // Null rather than invented: the UI hides these tiles instead of showing
      // a number that means nothing. `rating` fills in from partner.ratings once
      // the migration is applied and a customer has actually rated a delivery.
      rating: serverStats?.avgRating ?? null,
      ratingCount: serverStats?.ratingCount ?? 0,
      successRate: finishedRate,
    };
  }, [partner, user, mine, earnings, isOnline]);

  const selectedOrder = useMemo(
    () => mine.find((o) => o.id === selectedOrderId) ?? null,
    [mine, selectedOrderId],
  );

  // --- Incoming order popup ------------------------------------------------

  // Surface the newest unclaimed order as a request card, but only while the
  // partner is online, has nothing in flight, and hasn't already dismissed it.
  useEffect(() => {
    if (!isOnline || activeOrder || incomingOrder || showSplash) return;

    const candidate = available.find((o) => !dismissedOrderIds.includes(o.id));
    if (candidate) setIncomingOrder(candidate);
  }, [available, isOnline, activeOrder, incomingOrder, dismissedOrderIds, showSplash]);

  // Drop the card if someone else claims the order while it is on screen.
  useEffect(() => {
    if (incomingOrder && !available.some((o) => o.id === incomingOrder.id)) {
      setIncomingOrder(null);
    }
  }, [available, incomingOrder]);

  const handleAcceptIncoming = useCallback(async () => {
    if (!incomingOrder) return;
    const order = incomingOrder;
    setIncomingOrder(null);
    // Retire the id before awaiting. `available` is still stale for the length
    // of the request, and without this the effect below re-opens the modal for
    // the very order being claimed — the second tap then collided with our own
    // in-flight claim and was reported as another partner taking it.
    setDismissedOrderIds((ids) => (ids.includes(order.id) ? ids : [...ids, order.id]));

    const { error } = await acceptOrder(order.id);
    if (error) {
      toast(error, 'error');
      return;
    }
    toast(`Order #${order.orderNumber} accepted`, 'success');
    setSelectedOrderId(order.id);
  }, [incomingOrder, acceptOrder, toast]);

  const handleRejectIncoming = useCallback(() => {
    if (incomingOrder) setDismissedOrderIds((ids) => [...ids, incomingOrder.id]);
    setIncomingOrder(null);
  }, [incomingOrder]);

  // --- Delivery actions ----------------------------------------------------

  const handleAcceptFromList = useCallback(
    async (order: DeliveryOrder) => {
      // Same guard as the modal path: stop the request card re-appearing for an
      // order we are already claiming.
      setDismissedOrderIds((ids) => (ids.includes(order.id) ? ids : [...ids, order.id]));
      const { error } = await acceptOrder(order.id);
      if (error) {
        toast(error, 'error');
        return;
      }
      toast(`Order #${order.orderNumber} accepted`, 'success');
      setSelectedOrderId(order.id);
    },
    [acceptOrder, toast],
  );

  const handleStartDelivery = useCallback(
    async (order: DeliveryOrder) => {
      const { error } = await startDelivery(order.id);
      if (error) toast(error, 'error');
      else toast('Marked as on the way — the customer can see it now', 'success');
    },
    [startDelivery, toast],
  );

  const handleQrSuccess = useCallback(async () => {
    setShowQrModal(false);
    if (!selectedOrder) return;

    const { error } = await completeDelivery(selectedOrder.id);
    if (error) {
      toast(error, 'error');
      return;
    }
    // The delivery trigger settles a payout server-side, so the earnings RPC
    // has to be re-read — without this the wallet and dashboard kept showing
    // the pre-delivery totals until a full reload.
    void refreshStats();
    toast(`Delivered! ₹${selectedOrder.payout} added to your earnings`, 'success');
    setSelectedOrderId(null);
    setCurrentTab('dashboard');
  }, [selectedOrder, completeDelivery, refreshStats, toast]);

  // Surface fetch failures once rather than swallowing them.
  useEffect(() => {
    if (ordersError) toast(ordersError, 'error');
  }, [ordersError, toast]);

  // --- Gating --------------------------------------------------------------

  if (showSplash) {
    return <SplashModal onDismiss={() => setShowSplash(false)} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-3 border-secondary/25 border-t-secondary animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthView />;

  // Signed in with one factor but the account has TOTP enrolled — no partner or
  // customer data is fetched until the second factor clears.
  if (mfa.challengeRequired) {
    return <MfaChallengeView factors={mfa.factors} verifyCode={mfa.verifyCode} />;
  }

  if (partnerLoading || mfa.loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-3 border-secondary/25 border-t-secondary animate-spin" />
      </div>
    );
  }

  // No `partners` row, an inactive one, or an RPC that rejected us — all three
  // mean the same thing to the partner: they can't take orders yet.
  if (!partner || awaitingApproval || notAPartner) {
    return (
      <PartnerOnboardingView
        register={register}
        awaitingApproval={awaitingApproval || (notAPartner && Boolean(partner))}
        onRetry={() => {
          refresh();
          void refreshOrders();
        }}
      />
    );
  }

  // --- Main app ------------------------------------------------------------

  const viewingDelivery = Boolean(selectedOrder);
  const headerTitle = viewingDelivery ? 'Active Delivery' : TAB_TITLES[currentTab];

  return (
    <div className="bg-background text-on-surface min-h-dvh font-['Inter'] selection:bg-secondary selection:text-on-secondary">
      {incomingOrder && (
        <IncomingOrderModal
          order={incomingOrder}
          onAccept={handleAcceptIncoming}
          onReject={handleRejectIncoming}
        />
      )}

      {showQrModal && selectedOrder && (
        <QrVerifyModal
          order={selectedOrder}
          onClose={() => setShowQrModal(false)}
          onSuccess={handleQrSuccess}
        />
      )}

      {/* Desktop rail; hidden below lg, where BottomNav takes over. */}
      <SideNav
        currentTab={currentTab}
        onTabChange={(tab) => {
          setSelectedOrderId(null);
          setCurrentTab(tab);
        }}
        profile={profile}
        availableCount={available.length}
        showAdmin={isAdmin}
        onToggleOnline={() => setIsOnline((v) => !v)}
        onSignOut={signOut}
      />

      <div className="lg:pl-[264px] flex flex-col min-h-dvh">
        <Header
          title={headerTitle}
          profile={profile}
          onProfileClick={() => {
            setSelectedOrderId(null);
            setCurrentTab('profile');
          }}
          showBack={viewingDelivery}
          onBack={() => setSelectedOrderId(null)}
        />

        <main className="flex-1 pt-16">
        {selectedOrder ? (
          <ActiveDeliveryView
            order={selectedOrder}
            geo={geo}
            onVerifyQR={() => setShowQrModal(true)}
            onStartDelivery={() => handleStartDelivery(selectedOrder)}
          />
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <DashboardView
                profile={profile}
                activeOrder={activeOrder}
                availableCount={available.length}
                earnings={earnings}
                loading={ordersLoading}
                onToggleOnline={() => setIsOnline((v) => !v)}
                onSelectOrder={(o) => setSelectedOrderId(o.id)}
                onNavigateTab={setCurrentTab}
              />
            )}
            {currentTab === 'orders' && (
              <OrdersView
                available={available}
                mine={mine}
                loading={ordersLoading}
                onSelectOrder={(o) => setSelectedOrderId(o.id)}
                onAcceptOrder={handleAcceptFromList}
                onRefresh={refreshOrders}
              />
            )}
            {currentTab === 'navigation' && (
              <NavigationMapView
                order={activeOrder}
                geo={geo}
                onOpenOrder={(o) => setSelectedOrderId(o.id)}
              />
            )}
            {currentTab === 'wallet' && <WalletView profile={profile} earnings={earnings} orders={mine} />}
            {currentTab === 'admin' && <AdminView />}
            {currentTab === 'profile' && (
              <ProfileView
                profile={profile}
                geo={geo}
                mfa={mfa}
                onReplaySplash={() => setShowSplash(true)}
                onSignOut={signOut}
              />
            )}
            </>
          )}
        </main>

        {/* Mobile only — the sidebar covers lg and up. */}
        {!viewingDelivery && (
          <div className="lg:hidden">
            <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} />
          </div>
        )}
      </div>
    </div>
  );
}
