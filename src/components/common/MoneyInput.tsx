import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { formatIndianNumber, parseIndianNumber } from "@/lib/format";
import { AmountInWords } from "@/components/common/AmountInWords";
import { cn } from "@/lib/utils";

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** The numeric source-of-truth value */
  value?: number | string | null;
  /** Emits numeric value and formatted string */
  onChange?: (numericValue: number, formattedText: string) => void;
  /** Currency code for display and amount-in-words (default: INR) */
  currency?: string;
  /** Allow decimals/paise (default: false) */
  allowDecimals?: boolean;
  /** Render dynamically derived Amount in Words below the input */
  showAmountInWords?: boolean;
  /** Optional container class name */
  containerClassName?: string;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  {
    value,
    onChange,
    currency = "INR",
    allowDecimals = false,
    showAmountInWords = false,
    placeholder = "0",
    className,
    containerClassName,
    disabled,
    ...props
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  // Derive initial formatted string from numeric value
  const formatValue = useCallback(
    (val: number | string | null | undefined): string => {
      if (val == null || val === "" || val === 0) {
        if (val === 0 && props.defaultValue !== undefined) return "0";
        return val === 0 ? "" : "";
      }
      return formatIndianNumber(val, allowDecimals);
    },
    [allowDecimals, props.defaultValue],
  );

  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (value === 0 && props.required) return "0";
    return formatValue(value);
  });

  // Track cursor position across re-renders
  const cursorTracker = useRef<{ digitsBeforeCursor: number } | null>(null);

  // Sync internal displayValue when external value changes
  useEffect(() => {
    const formatted = formatValue(value);
    setDisplayValue((prev) => {
      // Avoid overwriting while user is actively typing decimals (e.g. "1,000.")
      if (allowDecimals && prev.endsWith(".") && !formatted.includes(".")) {
        return prev;
      }
      const prevNum = parseIndianNumber(prev);
      const nextNum = parseIndianNumber(value);
      if (prevNum === nextNum && prev.length > 0 && formatted.length > 0) {
        return prev;
      }
      return formatted;
    });
  }, [value, formatValue, allowDecimals]);

  // Restore cursor after formatting
  useEffect(() => {
    if (cursorTracker.current !== null && inputRef.current) {
      const targetDigits = cursorTracker.current.digitsBeforeCursor;
      const text = inputRef.current.value;
      let digitCount = 0;
      let newCursorPos = text.length;

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch && /\d/.test(ch)) {
          digitCount++;
        }
        if (digitCount === targetDigits) {
          newCursorPos = i + 1;
          break;
        }
      }

      inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      cursorTracker.current = null;
    }
  }, [displayValue]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const rawInput = el.value;
    const selStart = el.selectionStart ?? rawInput.length;

    // Count raw digits before cursor before formatting
    const beforeCursor = rawInput.slice(0, selStart);
    const digitsBefore = (beforeCursor.match(/\d/g) || []).length;
    cursorTracker.current = { digitsBeforeCursor: digitsBefore };

    // Format input with Indian numbering
    const formatted = formatIndianNumber(rawInput, allowDecimals);
    const numericValue = parseIndianNumber(formatted);

    setDisplayValue(formatted);
    onChange?.(numericValue, formatted);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    // Handle backspace when immediately to the right of a comma: e.g. "1,|00,000"
    if (e.key === "Backspace") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start === end && start !== null && start > 0) {
        const charToDelete = el.value[start - 1];
        if (charToDelete === ",") {
          e.preventDefault();
          // Remove the digit before the comma
          const beforeComma = el.value.slice(0, start - 2);
          const afterComma = el.value.slice(start);
          const combined = beforeComma + afterComma;

          const digitsBefore = (beforeComma.match(/\d/g) || []).length;
          cursorTracker.current = { digitsBeforeCursor: digitsBefore };

          const formatted = formatIndianNumber(combined, allowDecimals);
          const numericValue = parseIndianNumber(formatted);

          setDisplayValue(formatted);
          onChange?.(numericValue, formatted);
        }
      }
    }
  };

  const currentNumeric = parseIndianNumber(displayValue);

  return (
    <div className={cn("space-y-1.5 w-full", containerClassName)}>
      <div className="relative flex items-center">
        <Input
          ref={inputRef}
          type="text"
          inputMode={allowDecimals ? "decimal" : "numeric"}
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("font-mono font-medium", className)}
          autoComplete="off"
          {...props}
        />
      </div>

      {showAmountInWords && currentNumeric > 0 && (
        <AmountInWords
          amount={currentNumeric}
          currency={currency}
          className="mt-1"
          label="In words:"
        />
      )}
    </div>
  );
});
