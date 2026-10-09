import { useEffect, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, X } from "lucide-react";

export function FormActions({
  onCancel,
  busy = false,
  submitLabel = "Enregistrer",
  submitDisabled = false,
}: {
  onCancel: () => void;
  busy?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
        Annuler
      </button>
      <button type="submit" className="btn-primary sm:min-w-36" disabled={busy || submitDisabled}>
        {busy && <LoaderCircle className="animate-spin" size={18} />}
        {submitLabel}
      </button>
    </div>
  );
}
export function FormModal({
  title,
  eyebrow,
  onClose,
  onSubmit,
  children,
  error,
  busy = false,
  submitLabel,
  submitDisabled = false,
  maxWidth = "max-w-2xl",
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  children: ReactNode;
  error?: string;
  busy?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
  maxWidth?: string;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="form-modal-title">
      <button type="button" className="absolute inset-0" onClick={onClose} disabled={busy} aria-label="Fermer" />
      <form onSubmit={onSubmit} className={`card relative my-6 w-full overflow-hidden ${maxWidth}`}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            {eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
            <h2 id="form-modal-title" className="text-xl font-black text-slate-900">{title}</h2>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={onClose} disabled={busy} aria-label="Fermer">
            <X size={21} />
          </button>
        </header>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-5 sm:px-6">{children}
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>
        <FormActions onCancel={onClose} busy={busy} submitLabel={submitLabel} submitDisabled={submitDisabled} />
      </form>
    </div>
  );
}
