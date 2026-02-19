/** API base URL - trailing slash kaldırılır (çift slash sorununu önler) */
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/+$/, '')
