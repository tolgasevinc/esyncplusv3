/** Sabit pazaryeri sekmeleri - API dokümantasyonlarına göre alan tanımları */
export const MARKETPLACES = [
  {
    id: 'trendyol',
    label: 'Trendyol',
    category: 'marketplace_trendyol',
    baseUrl: 'https://apigw.trendyol.com',
    auth: 'basic' as const,
    fields: [
      { key: 'supplier_id', label: 'Satıcı ID (Supplier ID)', type: 'text', required: true, placeholder: 'Hesap Bilgilerim > Entegrasyon Bilgileri' },
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'API KEY' },
      { key: 'api_secret', label: 'API Secret Key', type: 'password', required: true, placeholder: 'API SECRET KEY' },
      { key: 'user_agent', label: 'User-Agent (Entegratör firma adı)', type: 'text', required: false, placeholder: 'SelfIntegration veya firma adı (max 30 karakter)' },
      { key: 'environment', label: 'Ortam', type: 'text', required: false, placeholder: 'prod', options: [{ value: 'prod', label: 'Canlı (PROD)' }, { value: 'stage', label: 'Test (STAGE)' }] },
    ],
  },
  {
    id: 'hepsiburada',
    label: 'Hepsiburada',
    category: 'marketplace_hepsiburada',
    baseUrl: 'https://api.hepsiglobal.com',
    auth: 'bearer' as const,
    fields: [
      { key: 'merchant_id', label: 'Merchant ID', type: 'text', required: true, placeholder: 'Satıcı panelinden' },
      { key: 'bearer_token', label: 'Bearer Token', type: 'password', required: true, placeholder: 'Seller Portal\'dan alınır' },
    ],
  },
  {
    id: 'ciceksepeti',
    label: 'Çiçeksepeti',
    category: 'marketplace_ciceksepeti',
    baseUrl: 'https://api.ciceksepeti.com',
    auth: 'custom' as const,
    fields: [
      { key: 'api_url', label: 'API URL (opsiyonel)', type: 'text', required: false, placeholder: 'Özel API adresi' },
      { key: 'supplier_id', label: 'Supplier ID', type: 'text', required: true, placeholder: 'Hesap Yönetimi > Entegrasyon Bilgilerim' },
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'API Key' },
    ],
  },
  {
    id: 'n11',
    label: 'N11',
    category: 'marketplace_n11',
    baseUrl: 'https://api-sandbox.n1co.shop',
    auth: 'oauth' as const,
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text', required: true, placeholder: 'N11 ekibinden alınır' },
      { key: 'client_secret', label: 'Client Secret', type: 'password', required: true, placeholder: 'Client Secret' },
    ],
  },
  {
    id: 'pazarama',
    label: 'Pazarama',
    category: 'marketplace_pazarama',
    baseUrl: '',
    auth: 'custom' as const,
    fields: [
      { key: 'supplier_id', label: 'Satıcı ID', type: 'text', required: true, placeholder: 'Satıcı panelinden' },
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'API Key' },
      { key: 'api_secret', label: 'API Secret', type: 'password', required: true, placeholder: 'API Secret' },
      { key: 'default_city', label: 'Varsayılan Şehir', type: 'text', required: false, placeholder: 'Sakarya' },
      { key: 'default_delivery_address', label: 'Varsayılan Teslimat Adresi', type: 'text', required: false, placeholder: 'kargo' },
    ],
  },
  {
    id: 'idefix',
    label: 'Idefix',
    category: 'marketplace_idefix',
    baseUrl: 'https://merchantapi.idefix.com',
    auth: 'x-api-key' as const,
    fields: [
      { key: 'supplier_id', label: 'Satıcı ID', type: 'text', required: true, placeholder: 'Hesap Bilgilerim > Entegrasyon Bilgileri' },
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'Entegrasyon Bilgileri > Yeni API Oluştur' },
      { key: 'api_secret', label: 'API Secret Key', type: 'password', required: true, placeholder: 'Mail ile gönderilir' },
    ],
  },
] as const

export type MarketplaceId = (typeof MARKETPLACES)[number]['id']
