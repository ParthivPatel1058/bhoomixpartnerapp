import React, { useEffect, useRef } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when all six digits are present. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
}

const LENGTH = 6;

/**
 * Six-box one-time-code field.
 *
 * Phone details that matter here: `inputMode="numeric"` brings up the number
 * pad rather than the full keyboard, `autoComplete="one-time-code"` lets iOS and
 * Android offer the code from the notification, and the boxes are 16px+ so iOS
 * does not zoom the viewport on focus.
 */
export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  invalid = false,
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(LENGTH).slice(0, LENGTH).split('');

  useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) onComplete?.(clean);
    return clean;
  };

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;

    // A paste (or an autofilled code) arrives as one long string — spread it
    // across the boxes instead of dropping everything but the first digit.
    if (typed.length > 1) {
      const clean = commit(typed);
      const focus = Math.min(clean.length, LENGTH - 1);
      inputsRef.current[focus]?.focus();
      return;
    }

    const chars = value.padEnd(LENGTH).split('');
    chars[index] = typed;
    commit(chars.join('').trimEnd());

    if (index < LENGTH - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const chars = value.padEnd(LENGTH).split('');
      // Backspace on an empty box steps back and clears the previous one.
      const target = chars[index]?.trim() ? index : Math.max(0, index - 1);
      chars[target] = ' ';
      commit(chars.join('').trimEnd());
      inputsRef.current[target]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center" role="group" aria-label="6-digit code">
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={LENGTH}
          value={digits[i]?.trim() ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          className={`w-11 h-14 sm:w-12 sm:h-16 rounded-xl border-2 bg-surface text-center text-xl font-bold text-on-surface
            transition-colors focus:outline-none focus:ring-2 focus:ring-secondary disabled:opacity-50
            ${invalid ? 'border-error' : 'border-outline-variant/50 focus:border-secondary'}`}
        />
      ))}
    </div>
  );
};
