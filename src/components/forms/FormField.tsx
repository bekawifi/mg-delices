import type { ReactNode } from "react";

export function FormField({ label, htmlFor, required = false, hint, children, className = "" }: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>
    <label className="label" htmlFor={htmlFor}>{label}{required && <span className="text-red-600"> *</span>}</label>
    {children}
    {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
  </div>;
}
export function ToggleField({ label, description, checked, onChange, disabled = false }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-3.5 ${disabled ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50"}`}>
    <span><span className="block text-sm font-bold text-slate-800">{label}</span>{description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}</span>
    <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand-600" : "bg-slate-300"}`}>
      <input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
    </span>
  </label>;
}
