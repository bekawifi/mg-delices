import { describe, expect, it, vi } from "vitest";
import {
  ownedProductImagePath,
  productImagePath,
  productImageValidationError,
  removeOwnedProductImage,
  uploadProductImage,
} from "./productImages";

const productId = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";

describe("stockage des images produit", () => {
  it("valide formats et taille sans produire de base64", () => {
    expect(productImageValidationError({ type: "image/png", size: 1024 })).toBe("");
    expect(productImageValidationError({ type: "image/jpeg", size: 1024 })).toBe("");
    expect(productImageValidationError({ type: "image/webp", size: 1024 })).toBe("");
    expect(productImageValidationError({ type: "text/plain", size: 10 })).toMatch(/PNG/);
    expect(productImageValidationError({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toMatch(/5 Mo/);
    expect(productImagePath(productId, fileId, "image/jpeg")).toBe(`products/${productId}/${fileId}.jpg`);
  });

  it("reconnait uniquement les URLs appartenant au bucket", () => {
    const owned = `https://project.supabase.co/storage/v1/object/public/product-images/products/${productId}/${fileId}.webp`;
    expect(ownedProductImagePath(owned)).toBe(`products/${productId}/${fileId}.webp`);
    expect(ownedProductImagePath("https://images.example.test/menu.webp")).toBeNull();
    expect(ownedProductImagePath("data:image/png;base64,AAAA")).toBeNull();
  });

  it("upload puis retourne une URL publique, jamais du base64", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "ok" }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/product-images/${path}` } }));
    const client = { storage: { from: vi.fn(() => ({ upload, remove, getPublicUrl })) } } as never;
    const file = new File(["png"], "nom utilisateur.png", { type: "image/png" });
    const result = await uploadProductImage(productId, file, client);
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^products/${productId}/[0-9a-f-]+\\.png$`));
    expect(result.url).toMatch(/^https:\/\//);
    expect(result.url).not.toMatch(/^data:/);
  });

  it("supprime seulement une image geree par RestoPRO", async () => {
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = { storage: { from: vi.fn(() => ({ remove })) } } as never;
    const owned = `https://project.supabase.co/storage/v1/object/public/product-images/products/${productId}/${fileId}.png`;
    expect(await removeOwnedProductImage(owned, client)).toBe(true);
    expect(remove).toHaveBeenCalledWith([`products/${productId}/${fileId}.png`]);
    expect(await removeOwnedProductImage("https://external.test/image.png", client)).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
  });
});
