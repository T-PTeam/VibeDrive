<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Method not allowed'
    ]);
    exit;
}

if (!isset($_FILES['audio']) || $_FILES['audio']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'No audio file uploaded or upload error'
    ]);
    exit;
}

$userId = $_POST['user_id'] ?? 'unknown';
$audioFile = $_FILES['audio'];
$uploadDir = __DIR__ . '/../../uploads/audio/';

if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$fileExtension = pathinfo($audioFile['name'], PATHINFO_EXTENSION);
$fileName = uniqid('audio_', true) . '_' . $userId . '.' . $fileExtension;
$filePath = $uploadDir . $fileName;

if (!move_uploaded_file($audioFile['tmp_name'], $filePath)) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Failed to save audio file'
    ]);
    exit;
}

$fileSize = filesize($filePath);
$duration = $_POST['duration'] ?? null;

http_response_code(200);
echo json_encode([
    'status' => 'success',
    'message' => 'Audio uploaded successfully',
    'data' => [
        'file_name' => $fileName,
        'file_path' => $filePath,
        'file_size' => $fileSize,
        'duration' => $duration,
        'user_id' => $userId,
        'uploaded_at' => date('Y-m-d H:i:s')
    ]
]);

