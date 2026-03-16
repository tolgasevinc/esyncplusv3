<?php
/**
 * OpenCart görsel alıcı - e-Sync+ Yayınla > OpenCart akışı için
 *
 * Kurulum:
 * 1. Bu dosyayı OpenCart kurulumunuzun image/catalog/ klasörüne kopyalayın
 *    Örn: /var/www/otomatikkapimarketim.com/image/catalog/opencart-image-upload.php
 * 2. Ayarlar > Veri Aktarımı veya app_settings üzerinden opencart_mysql kategorisine
 *    image_upload_url = https://otomatikkapimarketim.com/image/catalog/opencart-image-upload.php
 *    ekleyin
 *
 * API'den gelen POST: file (multipart), product_id
 * Yanıt: {"path": "catalog/product/xxx.jpg"} (WebP gelenler JPG'ye dönüştürülür)
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['error' => 'Sadece POST desteklenir']);
    exit(1);
}

$file = $_FILES['file'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['error' => 'Dosya alınamadı veya yükleme hatası: ' . ($file['error'] ?? 'bilinmiyor')]);
    exit(1);
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) ?: 'webp';
$allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
if (!in_array($ext, $allowed)) {
    $ext = 'webp';
}

// OpenCart 3 / eski sunucularda WebP sorun çıkarabiliyor → JPG'ye dönüştür
$saveExt = $ext;
if ($ext === 'webp' && function_exists('imagecreatefromwebp') && function_exists('imagejpeg')) {
    $img = @imagecreatefromwebp($file['tmp_name']);
    if ($img) {
        $saveExt = 'jpg';
    }
}

$productId = $_POST['product_id'] ?? '';
$safeId = preg_replace('/[^0-9]/', '', $productId) ?: '0';
$filename = 'product_' . $safeId . '_' . time() . '_' . substr(md5(uniqid()), 0, 8) . '.' . $saveExt;

// OpenCart ürün görselleri image/catalog/product altında aranır
$subdir = 'catalog/product';
$baseDir = __DIR__ . '/product/';  // script image/catalog/ içinde → image/catalog/product/
if (!is_dir($baseDir)) {
    mkdir($baseDir, 0755, true);
}

$destPath = $baseDir . $filename;
$saved = false;

if ($saveExt === 'jpg' && $ext === 'webp' && isset($img)) {
    $saved = imagejpeg($img, $destPath, 90);
    imagedestroy($img);
} else {
    $saved = move_uploaded_file($file['tmp_name'], $destPath);
}

if (!$saved) {
    echo json_encode(['error' => 'Dosya kaydedilemedi: ' . $destPath]);
    exit(1);
}

$relativePath = $subdir . '/' . $filename;  // catalog/product/xxx.webp
echo json_encode(['path' => $relativePath]);
