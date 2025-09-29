import * as React from "react";

import { cn } from "@/lib/utils";

type PhoneInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  // If provided, called with the raw digits string (no formatting)
  onValueChange?: (digits: string) => void;
};

function formatUSPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  const len = d.length;
  if (len === 0) return "";
  if (len < 4) return `(${d}`;
  if (len < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, onValueChange, ...props }, ref) => {
    const rawDigits = React.useMemo(() => (typeof value === "string" ? value.replace(/\D/g, "") : ""), [value]);
    const displayValue = React.useMemo(() => formatUSPhone(rawDigits), [rawDigits]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);

      // Fire optional raw digits callback
      onValueChange?.(digits);

      if (onChange) {
        // Synthesize a change event that carries the digits as value
        const target = { ...e.target, value: digits } as unknown as EventTarget & HTMLInputElement;
        const synthetic = { ...e, target, currentTarget: target } as React.ChangeEvent<HTMLInputElement>;
        onChange(synthetic);
      }
    };

    return (
      <input
        type="tel"
        inputMode="tel"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export default PhoneInput;

