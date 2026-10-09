import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormModal } from "./FormModal";
import { FormField, ToggleField } from "./FormField";
import { ImagePicker } from "./ImagePicker";
import { isSupportedProductImage } from "../../lib/productImages";

describe("standard des formulaires", () => {
  it("affiche un titre, la fermeture et les actions communes", () => {
    const html = renderToStaticMarkup(
      <FormModal title="Nouveau client" onClose={() => {}} onSubmit={() => {}} busy>
        <FormField label="Nom" required><input className="field" /></FormField>
      </FormModal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Nouveau client");
    expect(html).toContain("Annuler");
    expect(html).toContain("Enregistrer");
    expect(html).toContain("disabled");
  });

  it("rend le toggle commun sans champ image implicite", () => {
    const html = renderToStaticMarkup(<ToggleField label="Client actif" checked onChange={() => {}} />);
    expect(html).toContain("Client actif");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('type="file"');
  });
});

describe("image du produit uniquement", () => {
  it("accepte PNG, JPEG et WEBP dans la limite de taille", () => {
    expect(isSupportedProductImage({ type: "image/png", size: 1000 })).toBe(true);
    expect(isSupportedProductImage({ type: "image/jpeg", size: 1000 })).toBe(true);
    expect(isSupportedProductImage({ type: "image/webp", size: 1000 })).toBe(true);
    expect(isSupportedProductImage({ type: "image/gif", size: 1000 })).toBe(false);
    expect(isSupportedProductImage({ type: "image/png", size: 6 * 1024 * 1024 })).toBe(false);
  });

  it("gère le produit avec ou sans aperçu", () => {
    const props = { file: null, onUrlChange: () => {}, onFileChange: () => {}, onRemove: () => {} };
    const empty = renderToStaticMarkup(<ImagePicker value="" {...props} />);
    const image = renderToStaticMarkup(<ImagePicker value="https://example.test/plat.webp" {...props} />);
    expect(empty).toContain("Aucun aperçu");
    expect(empty).toContain("Choisir une image");
    expect(image).toContain('src="https://example.test/plat.webp"');
    expect(image).toContain("Retirer");
  });
});
