import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, UserPlus, X } from "lucide-react";
import { createQuickCustomer } from "../lib/customers";
import { userMessageFromError } from "../lib/errors";
import type { Customer } from "../types/customers";

export function QuickCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customer: Customer, customers: Customer[]) => void;
}) {
  const [form, setForm] = useState({ nom: "", telephone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { customer, customers } = await createQuickCustomer(form);
      onCreated(customer, customers);
    } catch (caught) {
      setError(userMessageFromError(caught, "Le client n’a pas pu être créé."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-customer-title"
    >
      <button className="absolute inset-0" onClick={onClose} aria-label="Fermer" />
      <form className="card relative w-full max-w-md p-5 sm:p-6" onSubmit={submit}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <UserPlus size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Caisse</p>
              <h2 id="quick-customer-title" className="text-xl font-black">
                Nouveau client
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
          >
            <X />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="quick-customer-name">
              Nom
            </label>
            <input
              ref={nameRef}
              id="quick-customer-name"
              required
              className="field"
              value={form.nom}
              onChange={(event) => setForm({ ...form, nom: event.target.value })}
              autoComplete="name"
            />
          </div>
          <div>
            <label className="label" htmlFor="quick-customer-phone">
              Téléphone
            </label>
            <input
              id="quick-customer-phone"
              className="field"
              value={form.telephone}
              onChange={(event) => setForm({ ...form, telephone: event.target.value })}
              autoComplete="tel"
              inputMode="tel"
            />
          </div>
          <div>
            <label className="label" htmlFor="quick-customer-email">
              Email
            </label>
            <input
              id="quick-customer-email"
              type="email"
              className="field"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              autoComplete="email"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button className="btn-primary" disabled={busy || !form.nom.trim()}>
            {busy && <LoaderCircle className="animate-spin" size={18} />}
            Créer et sélectionner
          </button>
        </div>
      </form>
    </div>
  );
}
