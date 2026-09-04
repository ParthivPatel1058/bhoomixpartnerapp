import React, { useState } from 'react';
import { AlertCircle, Clock, Loader2, LogOut, Phone, Truck, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { PartnerRegistration } from '../hooks/usePartner';

const VEHICLES = ['Bike', 'EV Scooter', 'Scooter', 'Cycle', 'Auto', 'Van'] as const;

interface PartnerOnboardingViewProps {
  register: (input: PartnerRegistration) => Promise<{ error: string | null }>;
  /** Registered but `is_active = false`: waiting on admin approval. */
  awaitingApproval: boolean;
  onRetry: () => void;
}

export const PartnerOnboardingView: React.FC<PartnerOnboardingViewProps> = ({
  register,
  awaitingApproval,
  onRetry,
}) => {
  const { user, signOut } = useAuth();

  // Google returns the display name under `name` / `full_name` depending on the
  // provider mapping; email signup stores `full_name`.
  const [fullName, setFullName] = useState(
    (user?.user_metadata?.full_name as string | undefined) ??
      (user?.user_metadata?.name as string | undefined) ??
      '',
  );
  const [phoneNumber, setPhoneNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<string>(VEHICLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (awaitingApproval) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full rounded-3xl bg-surface-container p-6 border border-white/60 shadow-lg text-center">
          <Clock className="w-12 h-12 text-secondary mx-auto mb-3" />
          <h1 className="text-lg font-bold text-on-surface">Approval pending</h1>
          <p className="text-sm text-on-surface-variant mt-2">
            Your partner account exists but is not active yet. A BhoomiX admin has to switch
            it on before order data becomes visible.
          </p>
          <div className="flex gap-2 mt-5">
            <button
              onClick={onRetry}
              className="flex-1 py-3 rounded-xl bg-secondary text-on-secondary font-bold text-sm"
            >
              Check again
            </button>
            <button
              onClick={signOut}
              className="px-4 py-3 rounded-xl bg-surface-variant text-on-surface font-bold text-sm"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !phoneNumber.trim()) {
      setError('Enter your name and phone number.');
      return;
    }

    setBusy(true);
    const { error: err } = await register({ fullName, phoneNumber, vehicleType });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-br from-tertiary-container/40 via-background to-surface-container">
      <form
        onSubmit={handleSubmit}
        className="max-w-sm w-full rounded-3xl bg-surface-container/85 backdrop-blur-xl p-6 border border-white/60 shadow-lg flex flex-col gap-4"
      >
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3 shadow-md">
            <Truck className="w-7 h-7 text-on-secondary" />
          </div>
          <h1 className="text-lg font-bold text-on-surface">Become a delivery partner</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            One-time registration. This creates your entry in the shared BhoomiX partner
            directory.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-on-surface-variant">Full name</span>
          <div className="relative">
            <User className="absolute left-3 top-3.5 w-4 h-4 text-outline" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Rahul Sharma"
              className="w-full bg-surface pl-10 pr-4 py-3 rounded-xl text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-on-surface-variant">Phone number</span>
          <div className="relative">
            <Phone className="absolute left-3 top-3.5 w-4 h-4 text-outline" />
            <input
              type="tel"
              inputMode="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="98765 43210"
              className="w-full bg-surface pl-10 pr-4 py-3 rounded-xl text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
            />
          </div>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-bold text-on-surface-variant mb-1.5">Vehicle</legend>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVehicleType(v)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                  vehicleType === v
                    ? 'bg-secondary text-on-secondary border-transparent shadow-sm'
                    : 'bg-surface text-on-surface-variant border-outline-variant/40'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3.5 rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Register as partner
        </button>

        <button
          type="button"
          onClick={signOut}
          className="text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </form>
    </div>
  );
};
