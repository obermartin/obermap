<?php
// api.php - Simple backend for Mapbox annotations
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$db_file = __DIR__ . '/db.json';

// Initialize db.json if it doesn't exist
if (!file_exists($db_file)) {
    $initial_data = json_encode(['annotations' => [], 'settings' => null]);
    file_put_contents($db_file, $initial_data);
}

// Handle GET request
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = file_get_contents($db_file);
    if ($data === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to read data']);
        exit;
    }
    echo $data;
    exit;
}

// Handle POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $json = file_get_contents('php://input');
    
    // Validate that it's actually JSON
    $decoded = json_decode($json, true);
    if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload']);
        exit;
    }
    
    // Write to file
    $result = file_put_contents($db_file, $json);
    
    if ($result === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save data']);
        exit;
    }
    
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
