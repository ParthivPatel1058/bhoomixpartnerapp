import React, { useState } from 'react';
import {
  Bike,
  CheckCircle,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { PartnerProfile } from '../types';
import type { GeolocationState } from '../hooks/useGeolocation';
import type { useMfa } from '../hooks/useMfa';
import { MfaEnrollDialog } from './MfaEnrollDialog';
import { formatRupees } from '../lib/earnings';

interface ProfileViewProps {
  profile: PartnerProfile;
  geo: GeolocationState & { refresh: () => void };
  mfa: ReturnType<typeof useMfa>;
  onReplaySplash: () => void;
  onSignOut: () => void;
}

const GEO_LABEL: Record<GeolocationState['status'], string> = {
  idle: 'Off — go online to enable',
  locating: 'Acquiring a fix…',
  tracking: 'Live',
  denied: 'Permission blocked',
  unavailable: 'Not supported on this device',
  error: 'Unavailable',
};

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  geo,
  mfa,
  onReplaySplash,
  onSignOut,
}) => {
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [removingMfa, setRemovingMfa] = useState(false);
  const [mfaNotice, setMfaNotice] = useState<string | null>(null);

  const handleRemoveMfa = async () => {
    const factorId = mfa.factors[0]?.id;
    if (!factorId) return;
    setRemovingMfa(true);
    const { error } = await mfa.removeFactor(factorId);
    setRemovingMfa(false);
    setMfaNotice(error ?? 'Two-factor authentication turned off.');
  };

  const fetchAiAdvice = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch('/api/ai-advice', { method: 'POST' });
      const data = await res.json();
      setAiTip(data.advice ?? null);
    } catch {
      setAiTip(
        'Peak delivery hours are between 5 PM and 8 PM. Keep your battery charged and stay near high-demand hubs.',
      );
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="flex flex-col w-full px-4 sm:px-5 gap-6 pt-4 pb-32 lg:pb-10 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-on-background">Partner Profile</h2>
        <p className="text-sm text-on-surface-variant">Account details & vehicle credentials</p>
      </div>

      {/* Profile card */}
      <div className="relative rounded-2xl bg-surface-container/70 backdrop-blur-xl p-6 shadow-sm border border-white/60 flex flex-col items-center text-center gap-4">
        <div className="relative">
          <img
            src={profile.avatar}
            alt=""
            className="w-24 h-24 rounded-full object-cover shadow-md border-2 border-white"
          />
          {profile.isActive && (
            <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-secondary text-on-secondary flex items-center justify-center shadow">
              <CheckCircle className="w-4 h-4" />
            </span>
          )}
        </div>

        <div>
          <h3 className="text-xl font-bold text-on-surface">{profile.name}</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {profile.isActive ? 'BhoomiX Delivery Partner' : 'Awaiting activation'}
          </p>
        </div>

        <div className="flex gap-4 w-full justify-center pt-3 border-t border-outline-variant/30">
          <div className="flex flex-col items-center flex-1">
            <span className="text-xs text-on-surface-variant">Rating</span>
            <span className="text-sm font-bold text-on-surface flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-[#d4af37] fill-[#d4af37]" />{' '}
              {profile.rating != null ? profile.rating.toFixed(1) : 'New'}
            </span>
          </div>
          <div className="w-px bg-outline-variant/30" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-xs text-on-surface-variant">Success</span>
            <span className="text-sm font-bold text-secondary">
              {profile.successRate != null ? `${profile.successRate}%` : '—'}
            </span>
          </div>
          <div className="w-px bg-outline-variant/30" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-xs text-on-surface-variant">Trips</span>
            <span className="text-sm font-bold text-on-surface">{profile.totalTrips}</span>
          </div>
        </div>

        <div className="w-full bg-surface/70 rounded-xl p-3 text-left">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Lifetime earnings
          </span>
          <p className="text-lg font-bold text-on-surface">
            {formatRupees(profile.earningsTotal, 2)}
          </p>
        </div>
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-3">
        <h4 className="text-base font-semibold text-on-background">Account</h4>
        <div className="rounded-2xl bg-surface-container/60 backdrop-blur-xl border border-white/50 divide-y divide-outline-variant/25">
          <div className="p-4 flex items-center gap-3">
            <Mail className="w-4 h-4 text-secondary shrink-0" />
            <span className="text-sm text-on-surface truncate">{profile.email || '—'}</span>
          </div>
          <div className="p-4 flex items-center gap-3">
            <Phone className="w-4 h-4 text-secondary shrink-0" />
            <span className="text-sm text-on-surface truncate">{profile.phone || '—'}</span>
          </div>
          <div className="p-4 flex items-center gap-3">
            <MapPin className="w-4 h-4 text-secondary shrink-0" />
            <span className="text-sm text-on-surface flex-1">GPS · {GEO_LABEL[geo.status]}</span>
            <button
              onClick={geo.refresh}
              className="text-xs font-bold text-secondary hover:underline shrink-0"
            >
              Retry
            </button>
          </div>
        </div>
      </div>

      {/* Vehicle */}
      <div className="flex flex-col gap-3">
        <h4 className="text-base font-semibold text-on-background">Vehicle</h4>
        <div className="rounded-2xl bg-surface-container/60 backdrop-blur-xl p-4 flex items-center gap-4 border border-white/50">
          <div className="w-12 h-12 shrink-0 rounded-full bg-secondary/15 flex items-center justify-center text-secondary">
            <Bike className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-sm font-bold text-on-surface truncate">{profile.vehicle}</h5>
            <p className="text-xs text-on-surface-variant">Registered with BhoomiX</p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
              profile.isActive
                ? 'bg-secondary/15 text-secondary'
                : 'bg-error-container text-on-error-container'
            }`}
          >
            {profile.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Two-factor */}
      <div className="flex flex-col gap-3">
        <h4 className="text-base font-semibold text-on-background">Security</h4>
        <div className="rounded-2xl bg-surface-container/60 backdrop-blur-xl p-4 border border-white/50 flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${
                mfa.enabled
                  ? 'bg-secondary/15 text-secondary'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="text-sm font-bold text-on-surface">Two-factor authentication</h5>
              <p className="text-xs text-on-surface-variant">
                {mfa.enabled
                  ? 'On — a code from Google Authenticator is required at sign-in.'
                  : 'Off — protect customer addresses with a 6-digit code.'}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                mfa.enabled
                  ? 'bg-secondary/15 text-secondary'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {mfa.enabled ? 'On' : 'Off'}
            </span>
          </div>

          {mfaNotice && (
            <p className="text-xs text-on-surface-variant bg-surface/70 rounded-xl px-3 py-2">
              {mfaNotice}
            </p>
          )}

          {mfa.loading ? (
            <div className="min-h-[48px] flex items-center justify-center gap-2 text-on-surface-variant">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Checking…</span>
            </div>
          ) : mfa.enabled ? (
            <button
              onClick={handleRemoveMfa}
              disabled={removingMfa}
              className="w-full min-h-[48px] rounded-xl bg-error-container text-on-error-container font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {removingMfa && <Loader2 className="w-4 h-4 animate-spin" />}
              Turn off two-factor
            </button>
          ) : (
            <button
              onClick={() => {
                setMfaNotice(null);
                setShowEnroll(true);
              }}
              className="w-full min-h-[48px] rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              Set up with Google Authenticator
            </button>
          )}
        </div>
      </div>

      {showEnroll && (
        <MfaEnrollDialog
          startEnrollment={mfa.startEnrollment}
          verifyCode={mfa.verifyCode}
          cancelEnrollment={mfa.cancelEnrollment}
          onClose={() => setShowEnroll(false)}
          onEnrolled={() => {
            setShowEnroll(false);
            setMfaNotice('Two-factor is on. You will need a code at every sign-in.');
          }}
        />
      )}

      {/* AI coach */}
      <div className="relative rounded-2xl bg-gradient-to-r from-tertiary-container/40 to-secondary-container/40 backdrop-blur-xl p-5 shadow-sm border border-white/60 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-secondary" /> AI Partner Coach
          </h4>
          <button
            onClick={fetchAiAdvice}
            disabled={loadingAi}
            className="text-xs font-semibold text-secondary hover:underline flex items-center gap-1 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAi ? 'animate-spin' : ''}`} /> Get tips
          </button>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {aiTip ??
            'Tap "Get tips" for guidance on peak hours and route planning.'}
        </p>
      </div>

      {/* Settings */}
      <div className="flex flex-col gap-3">
        <h4 className="text-base font-semibold text-on-background">App</h4>
        <button
          onClick={onReplaySplash}
          className="w-full py-3.5 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors text-xs font-bold text-on-surface flex items-center justify-between border border-outline-variant/30 shadow-sm"
        >
          <span>Replay intro animation</span>
          <RefreshCw className="w-4 h-4 text-secondary" />
        </button>
        <button
          onClick={onSignOut}
          className="w-full py-3.5 px-4 rounded-xl bg-error-container text-on-error-container transition-colors text-xs font-bold flex items-center justify-between shadow-sm"
        >
          <span>Sign out</span>
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
