import { supabase } from "./supabase";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const PRODUCT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

type StorageClient = Pick<typeof supabase, "storage">;

export function productImageValidationError(file: Pick<File, "type" | "size">) {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number])) {
    return "Choisissez une image PNG, JPG, JPEG ou WEBP.";
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return "L’image ne doit pas dépasser 5 Mo.";
  return "";
}
export function isSupportedProductImage(file: Pick<File, "type" | "size">) {
  return productImageValidationError(file) === "";
}

export function productImagePath(productId: string, fileId: string, mimeType: string) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `products/${productId}/${fileId}.${extension}`;
}

export async function uploadProductImage(
  productId: string,
  file: File,
  client: StorageClient = supabase,
) {
  const validationError = productImageValidationError(file);
  if (validationError) throw new Error(validationError);
  const path = productImagePath(productId, crypto.randomUUID(), file.type);
  const bucket = client.storage.from(PRODUCT_IMAGES_BUCKET);
  const uploaded = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const { data } = bucket.getPublicUrl(path);
  if (!data.publicUrl || data.publicUrl.startsWith("data:")) {
    await bucket.remove([path]);
    throw new Error("L’URL publique de l’image n’a pas pu être générée.");
  }
  return { url: data.publicUrl, path };
}

export function ownedProductImagePath(url: string) {
  if (!url || url.startsWith("data:")) return null;
  try {
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
    const parsed = new URL(url);
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    return /^products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(path) ? path : null;
  } catch {
    return null;
  }
}

export async function removeOwnedProductImage(url: string, client: StorageClient = supabase) {
  const path = ownedProductImagePath(url);
  if (!path) return false;
  const { error } = await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  if (error) throw error;
  return true;
}
