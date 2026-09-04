import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, ShieldCheck, X } from 'lucide-react';
import { OtpInput } from './OtpInput';
import type { EnrollmentStart } from '../hooks/useMfa';

interface MfaEnrollDialogProps {
  startEnrollment: () => Promise<{ data: EnrollmentStart | null; error: string | null }>;
  verifyCode: (factorId: string, code: string) => Promise<{ error: string | null }>;
  cancelEnrollment: (factorId: string) => Promise<void>;
  onClose: () => void;
  onEnrolled: () => void;
}

export const MfaEnrollDialog: React.FC<MfaEnrollDialogProps> = ({
  startEnrollment,
  verifyCode,
  cancelEnrollment,
  onClose,
  onEnrolled,
}) => {
  const [enrollment, setEnrollment] = useState<EnrollmentStart | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    startEnrollment().then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setError(err);
      else setEnrollment(data);
      setStarting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [startEnrollment]);

  /** Abandoning setup must drop the half-created factor, or the next attempt collides. */
  const close = async () => {
    if (enrollment) await cancelEnrollment(enrollment.factorId);
    onClose();
  };

  const submit = async (value: string) => {
    if (!enrollment || busy) return;
    setBusy(true);
    setError(null);

    const { error: err } = await verifyCode(enrollment.factorId, value);
    setBusy(false);

    if (err) {
      setError(err);
      setCode('');
      return;
    }
    onEnrolled();
  };

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the secret is on screen to type manually */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Set up two-factor authentication"
    >
      <div className="w-full max-w-sm max-h-[92dvh] overflow-y-auto rounded-3xl bg-surface-container/95 backdrop-blur-2xl p-6 shadow-xl border border-white/60 relative flex flex-col gap-5">
        <button
          onClick={close}
          disabled={busy}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-variant/60 flex items-center justify-center text-on-surface hover:bg-surface-variant disabled:opacity-40"
          aria-label="Cancel setup"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center pt-1">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3 shadow-md">
            <ShieldCheck className="w-7 h-7 text-on-secondary" />
          </div>
          <h2 className="text-lg font-bold text-on-surface">Set up two-factor</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Scan this with Google Authenticator, then enter the code it shows.
          </p>
        </div>

        {starting ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 text-secondary animate-spin" />
            <span className="text-sm text-on-surface-variant">Generating your QR code…</span>
          </div>
        ) : error && !enrollment ? (
          <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            {error}
          </p>
        ) : enrollment ? (
          <>
            {/* Supabase returns the QR as an SVG data URI. */}
            <div className="bg-white rounded-2xl p-3 mx-auto shadow-inner">
              <img
                src={enrollment.qrCode}
                alt="QR code for Google Authenticator"
                className="w-44 h-44 block"
              />
            </div>

            <div className="rounded-xl bg-surface/80 border border-outline-variant/40 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Or enter this key manually
              </span>
              <div className="flex items-center gap-2 mt-1.5">
                <code className="flex-1 font-mono text-xs text-on-surface break-all leading-relaxed">
                  {enrollment.secret}
                </code>
                <button
                  onClick={copySecret}
                  className="shrink-0 w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary"
                  aria-label="Copy setup key"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(code);
              }}
              className="flex flex-col gap-3"
            >
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={submit}
                disabled={busy}
                invalid={Boolean(error)}
              />

              {error && (
                <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full min-h-[52px] rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Turn on two-factor
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
};
