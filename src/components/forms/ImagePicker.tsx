import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { FormField } from "./FormField";
import { productImageValidationError } from "../../lib/productImages";

export function ImagePicker({ value, file, onUrlChange, onFileChange, onRemove, disabled = false }: {
  value: string;
  file: File | null;
  onUrlChange: (value: string) => void;
  onFileChange: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = productImageValidationError(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    onFileChange(file);
  };
  const preview = previewUrl || value;
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-600">Image du produit</p>
    <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
      <div className="space-y-3">
        <FormField label="URL de l’image" htmlFor="product-image-url" hint="PNG, JPG, JPEG ou WEBP — 5 Mo maximum pour un fichier local.">
          <input id="product-image-url" className="field" type="text" inputMode="url" placeholder="https://…" value={file ? "" : value} disabled={disabled} onChange={(event) => { setError(""); onUrlChange(event.target.value); }} />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} className="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={choose} disabled={disabled} />
          <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={disabled}><ImagePlus size={18} />Choisir une image</button>
          {(value || file) && <button type="button" className="btn-secondary text-red-600" onClick={onRemove} disabled={disabled}><Trash2 size={17} />Retirer</button>}
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      </div>
      <div className="grid h-32 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white">
        {preview ? <img src={preview} alt="Aperçu du produit" className="h-full w-full object-cover" /> : <div className="px-3 text-center text-xs text-slate-400"><ImagePlus className="mx-auto mb-2" />Aucun aperçu</div>}
      </div>
    </div>
  </div>;
}
