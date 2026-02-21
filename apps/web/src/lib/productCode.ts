/**
 * Ürün kodu oluşturucu: grup_kodu.kategori_kodu.altkategori_kodu.marka_kodu.tedarikçi_kodu
 */

export interface CategoryPathItem {
  name: string
  code: string
}

/**
 * Kategori path'inden + marka + tedarikçi kodundan tam ürün kodu oluşturur.
 * Sadece son kısım (tedarikçi kodu) edit edilebilir.
 */
export function buildProductCode(
  categoryPath: CategoryPathItem[],
  brandCode: string,
  supplierCode: string
): string {
  const prefixParts = categoryPath.map((p) => p.code).filter(Boolean)
  if (brandCode) prefixParts.push(brandCode)
  const prefix = prefixParts.join('.')
  if (!supplierCode.trim()) return prefix
  return prefix ? `${prefix}.${supplierCode.trim()}` : supplierCode.trim()
}

