import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Search } from "lucide-react";
import { formatMoney } from "../lib/format";
import { moveCustomerOption } from "../lib/customers";
import type { Customer } from "../types/customers";

export function CustomerPicker({
  customers,
  value,
  onChange,
  onCreate,
}: {
  customers: Customer[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate: () => void;
}) {
  const selected = customers.find((customer) => customer.id === value);
  const [query, setQuery] = useState(selected?.nom || "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers
      .filter((customer) =>
        !needle
          ? true
          : [customer.nom, customer.numero, customer.telephone || ""].some((field) =>
              field.toLowerCase().includes(needle),
            ),
      )
      .slice(0, 8);
  }, [customers, query]);

  useEffect(() => {
    if (selected) setQuery(selected.nom);
  }, [selected?.id, selected?.nom]);

  const choose = (customer: Customer | null) => {
    onChange(customer?.id || null);
    setQuery(customer?.nom || "");
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key;
      setActiveIndex((current) => moveCustomerOption(current, direction, options.length));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(selected?.nom || "");
    }
  };

  return (
    <div className="flex items-stretch gap-2" ref={rootRef}>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-3.5 z-10 text-emerald-700"
          size={19}
          aria-hidden="true"
        />
        <input
          className="field min-h-12 border-emerald-300 bg-emerald-50/70 pl-10 pr-9 font-semibold text-slate-900 placeholder:text-slate-500 focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-100"
          role="combobox"
          aria-label="Rechercher ou sélectionner un client"
          aria-expanded={open}
          aria-controls="pos-customer-options"
          aria-activedescendant={activeIndex >= 0 ? `pos-customer-${options[activeIndex]?.id}` : undefined}
          aria-autocomplete="list"
          placeholder="Rechercher par nom, numéro ou téléphone…"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
          }}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            if (value) onChange(null);
          }}
        />
        {query && (
          <button
            type="button"
            className="absolute right-2 top-2.5 rounded-md px-2 py-1 text-slate-500 hover:bg-white"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(null)}
            aria-label="Effacer le client"
          >
            ×
          </button>
        )}
        {open && (
          <div
            id="pos-customer-options"
            role="listbox"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(null)}
            >
              Vente anonyme
            </button>
            {options.map((customer, index) => (
              <button
                id={`pos-customer-${customer.id}`}
                key={customer.id}
                type="button"
                role="option"
                aria-selected={customer.id === value}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm focus:outline-none ${index === activeIndex ? "bg-emerald-50 text-emerald-950" : "hover:bg-slate-50"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(customer)}
              >
                <span className="block font-bold">{customer.nom}</span>
                <span className="text-xs text-slate-500">
                  {customer.numero} · disponible{" "}
                  {formatMoney(Number(customer.plafond_credit) - Number(customer.encours_credit))}
                </span>
              </button>
            ))}
            {!options.length && (
              <p className="px-3 py-4 text-center text-sm text-slate-500">Aucun client trouvé</p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
        onClick={onCreate}
        title="Créer un nouveau client"
        aria-label="Créer un nouveau client"
      >
        <Plus size={23} strokeWidth={3} />
      </button>
    </div>
  );
}
