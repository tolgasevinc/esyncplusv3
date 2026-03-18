/** Veri aktarım sayfası için veri kaynağı ve alan tanımları */

export type TransferType = 'export' | 'import'
export type OutputFormat = 'xml' | 'xls' | 'xlsx' | 'csv' | 'txt'

export interface DataSourceField {
  value: string
  label: string
}

export interface DataSourceSchema {
  id: string
  label: string
  fields: DataSourceField[]
}

export const DATA_SOURCES: DataSourceSchema[] = [
  {
    id: 'product',
    label: 'Ürün',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ürün Adı' },
      { value: 'sku', label: 'SKU' },
      { value: 'barcode', label: 'Barkod' },
      { value: 'brand_id', label: 'Marka ID' },
      { value: 'category_id', label: 'Kategori ID' },
      { value: 'type_id', label: 'Tip ID' },
      { value: 'unit_id', label: 'Birim ID' },
      { value: 'price', label: 'Genel Fiyat' },
      { value: 'ecommerce_price', label: 'E-Ticaret Fiyatı (hesaplamalı)' },
      { value: 'price_type_2', label: 'Fiyat Tipi 2 (hesaplamalı)' },
      { value: 'price_type_3', label: 'Fiyat Tipi 3 (hesaplamalı)' },
      { value: 'price_type_4', label: 'Fiyat Tipi 4 (hesaplamalı)' },
      { value: 'price_type_5', label: 'Fiyat Tipi 5 (hesaplamalı)' },
      { value: 'quantity', label: 'Miktar' },
      { value: 'tax_rate', label: 'Vergi Oranı' },
      { value: 'supplier_code', label: 'Tedarikçi Kodu' },
      { value: 'gtip_code', label: 'GTIP Kodu' },
      { value: 'image', label: 'Görsel' },
      { value: 'status', label: 'Durum' },
      { value: 'ecommerce_name', label: 'E-Ticaret Adı' },
      { value: 'main_description', label: 'Açıklama' },
      { value: 'seo_slug', label: 'SEO Slug' },
      { value: 'seo_title', label: 'SEO Başlık' },
      { value: 'seo_description', label: 'SEO Açıklama' },
    ],
  },
  {
    id: 'customer',
    label: 'Cari',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ünvan' },
      { value: 'code', label: 'Kod' },
      { value: 'tax_office', label: 'Vergi Dairesi' },
      { value: 'tax_number', label: 'Vergi No' },
      { value: 'email', label: 'E-posta' },
      { value: 'phone', label: 'Telefon' },
      { value: 'address', label: 'Adres' },
      { value: 'type_id', label: 'Tip ID' },
      { value: 'group_id', label: 'Grup ID' },
      { value: 'status', label: 'Durum' },
    ],
  },
  {
    id: 'category',
    label: 'Kategori',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ad' },
      { value: 'code', label: 'Kod' },
      { value: 'group_id', label: 'Grup ID' },
      { value: 'category_id', label: 'Üst Kategori ID' },
      { value: 'sort_order', label: 'Sıra' },
      { value: 'status', label: 'Durum' },
    ],
  },
  {
    id: 'brand',
    label: 'Marka',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ad' },
      { value: 'code', label: 'Kod' },
      { value: 'description', label: 'Açıklama' },
      { value: 'website', label: 'Web Sitesi' },
      { value: 'country', label: 'Ülke' },
      { value: 'sort_order', label: 'Sıra' },
      { value: 'status', label: 'Durum' },
    ],
  },
  {
    id: 'type',
    label: 'Ürün Tipi',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ad' },
      { value: 'code', label: 'Kod' },
      { value: 'description', label: 'Açıklama' },
      { value: 'sort_order', label: 'Sıra' },
      { value: 'status', label: 'Durum' },
    ],
  },
  {
    id: 'unit',
    label: 'Birim',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ad' },
      { value: 'code', label: 'Kod' },
      { value: 'description', label: 'Açıklama' },
      { value: 'sort_order', label: 'Sıra' },
      { value: 'status', label: 'Durum' },
    ],
  },
  {
    id: 'supplier',
    label: 'Tedarikçi',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ad' },
      { value: 'code', label: 'Kod' },
      { value: 'currency_id', label: 'Para Birimi ID' },
      { value: 'status', label: 'Durum' },
    ],
  },
  {
    id: 'currency',
    label: 'Para Birimi',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ad' },
      { value: 'code', label: 'Kod' },
      { value: 'symbol', label: 'Sembol' },
      { value: 'is_default', label: 'Varsayılan' },
      { value: 'sort_order', label: 'Sıra' },
      { value: 'status', label: 'Durum' },
    ],
  },
  {
    id: 'tax_rate',
    label: 'Vergi Oranı',
    fields: [
      { value: 'id', label: 'ID' },
      { value: 'name', label: 'Ad' },
      { value: 'value', label: 'Oran (%)' },
      { value: 'description', label: 'Açıklama' },
      { value: 'sort_order', label: 'Sıra' },
      { value: 'status', label: 'Durum' },
    ],
  },
]

export const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'xml', label: 'XML' },
  { value: 'xls', label: 'XLS' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'csv', label: 'CSV' },
  { value: 'txt', label: 'TXT' },
]

export function getDataSourceById(id: string): DataSourceSchema | undefined {
  return DATA_SOURCES.find((s) => s.id === id)
}
