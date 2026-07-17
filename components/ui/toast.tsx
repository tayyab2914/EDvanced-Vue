"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * The in-app notification the Spec names as a known gap (§5.13): "there is no in-app toast
 * or notification system today. Forms report success and errors inline... a small
 * notification component would make the product feel more finished."
 *
 * Deliberately small. Inline errors stay where they are — a message about ONE field
 * belongs beside that field, and moving it to a corner of the screen would be a
 * regression. This is for the things that have no field to sit beside: "Imported 2,400
 * rows as v3", "Restored v1".
 */

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContext {
  toast: (message: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastContext | null>(null);

/**
 * Throws rather than no-oping when the provider is missing.
 *
 * A toast that silently does nothing is worse than a crash: the code looks like it told
 * the user something, and nobody finds out for months that it didn't.
 */
export function useToast(): ToastContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, tone, message }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        // polite, not assertive: a confirmation should wait its turn rather than
        // interrupt whatever a screen reader is mid-sentence on.
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

const TONES: Record<ToastTone, string> = {
  success: "bg-ok-bg text-ok ring-[#c3e2d0]",
  error: "bg-bad-bg text-bad ring-[#f0cdbf]",
  info: "bg-[#f2f7ff] text-[#33507a] ring-[#d5e3fb]",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    // Errors stay until dismissed. A success can vanish — the district saw the thing
    // happen. Something that went wrong should not disappear while they are reading it.
    if (toast.tone === "error") return;
    const t = setTimeout(() => onDismiss(toast.id), 5_000);
    return () => clearTimeout(t);
  }, [toast.id, toast.tone, onDismiss]);

  return (
    <div
      className={cn(
        "animate-fade-up pointer-events-auto flex items-start gap-3 rounded-lg px-3.5 py-2.5 text-[13px] shadow-lg ring-1 ring-inset",
        TONES[toast.tone],
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mr-1 -mt-0.5 rounded px-1 text-[15px] leading-none opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
