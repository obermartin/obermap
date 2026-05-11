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

$shows_dir = __DIR__ . '/shows';
if (!is_dir($shows_dir)) {
    mkdir($shows_dir, 0755, true);
}

// Handle list_shows action
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'list_shows') {
    $files = glob($shows_dir . '/*.json');
    $shows = [];
    foreach ($files as $file) {
        $show_id = basename($file, '.json');
        $mtime = filemtime($file);
        $title = $show_id;
        $content = file_get_contents($file);
        if ($content !== false) {
            $data = json_decode($content, true);
            if (isset($data['settings']['title']) && !empty($data['settings']['title'])) {
                $title = $data['settings']['title'];
            }
        }
        $shows[] = [
            'id' => $show_id,
            'title' => $title,
            'updatedAt' => date('c', $mtime)
        ];
    }
    usort($shows, function($a, $b) {
        return strtotime($b['updatedAt']) - strtotime($a['updatedAt']);
    });
    echo json_encode($shows);
    exit;
}

// Handle delete_show action
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'delete_show') {
    $show_id = $_GET['show'] ?? '';
    if (preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        $file_path = $shows_dir . '/' . $show_id . '.json';
        if (file_exists($file_path)) {
            unlink($file_path);
            echo json_encode(['success' => true]);
            exit;
        }
    }
    http_response_code(404);
    echo json_encode(['error' => 'Show not found or invalid ID']);
    exit;
}

$show_id = $_GET['show'] ?? 'default';
if (!preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
    $show_id = 'default';
}
$db_file = $shows_dir . '/' . $show_id . '.json';

// Initialize db.json if it doesn't exist
if (!file_exists($db_file)) {
    $default_file = $shows_dir . '/_DEFAULT.json';
    if (file_exists($default_file)) {
        copy($default_file, $db_file);
    } else {
        $initial_data = json_encode(['annotations' => [], 'settings' => null]);
        file_put_contents($db_file, $initial_data);
    }
}

// Handle OpenSky proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'opensky') {
    $url = 'https://opensky-network.org/api/states/all?' . http_build_query([
        'lamin' => $_GET['lamin'] ?? '',
        'lomin' => $_GET['lomin'] ?? '',
        'lamax' => $_GET['lamax'] ?? '',
        'lomax' => $_GET['lomax'] ?? '',
        'extended' => '1'
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    // Auth
    if (!empty($_GET['token'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $_GET['token']
        ]);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode);
    echo $response;
    exit;
}

// Handle OpenSky track proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'opensky_track') {
    $url = 'https://opensky-network.org/api/tracks/all?' . http_build_query([
        'icao24' => $_GET['icao24'] ?? '',
        'time' => $_GET['time'] ?? '0'
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    // Auth
    if (!empty($_GET['token'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $_GET['token']
        ]);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode);
    echo $response;
    exit;
}

// Handle OpenSky token proxy request
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'opensky_token') {
    $url = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'client_credentials',
        'client_id' => $_POST['client_id'] ?? '',
        'client_secret' => $_POST['client_secret'] ?? ''
    ]));
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode);
    echo $response;
    exit;
}

// Handle OpenSky metadata proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'opensky_metadata') {
    $icao24 = $_GET['icao24'] ?? '';
    $url = 'https://opensky-network.org/api/metadata/aircraft/icao/' . urlencode($icao24);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    // Auth
    if (!empty($_GET['token'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $_GET['token']
        ]);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode);
    echo $response;
    exit;
}

// Handle OpenSky route proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'opensky_route') {
    $callsign = $_GET['callsign'] ?? '';
    $url = 'https://opensky-network.org/api/routes?callsign=' . urlencode($callsign);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    // Auth
    if (!empty($_GET['token'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $_GET['token']
        ]);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode);
    echo $response;
    exit;
}

// Handle Google Directions proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'google_directions') {
    $url = 'https://maps.googleapis.com/maps/api/directions/json?' . http_build_query([
        'origin' => $_GET['origin'] ?? '',
        'destination' => $_GET['destination'] ?? '',
        'mode' => 'transit',
        'transit_mode' => 'train',
        'key' => $_GET['key'] ?? ''
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode);
    echo $response;
    exit;
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
    // Differential Save Logic
    if (isset($decoded['settings']['layers']) && file_exists($db_file)) {
        $existing_json = file_get_contents($db_file);
        if ($existing_json !== false) {
            $existing_data = json_decode($existing_json, true);
            if (isset($existing_data['settings']['layers'])) {
                $existing_layers = [];
                foreach ($existing_data['settings']['layers'] as $layer) {
                    if (isset($layer['id'])) {
                        $existing_layers[$layer['id']] = $layer;
                    }
                }
                
                foreach ($decoded['settings']['layers'] as &$layer) {
                    if (isset($layer['_keepExistingData']) && $layer['_keepExistingData'] === true) {
                        if (isset($layer['id']) && isset($existing_layers[$layer['id']]['data'])) {
                            $layer['data'] = $existing_layers[$layer['id']]['data'];
                        }
                        unset($layer['_keepExistingData']);
                    }
                    if (isset($layer['_isDirty'])) {
                        unset($layer['_isDirty']);
                    }
                }
                $json = json_encode($decoded);
            }
        }
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
