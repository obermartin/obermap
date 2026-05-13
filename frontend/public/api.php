<?php
// api.php - Simple backend for Mapbox annotations
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dbHost = 'db5020452906.hosting-data.io';
$dbPort = '3306';
$dbUser = 'dbu347313';
$dbPass = 'aN19ehfS863SfvgXav1sOcvibu20a9sduOUAYVDyq083y7bh';
$dbName = 'dbs15671316';

try {
    $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Ensure tables exist
    $pdo->exec("CREATE TABLE IF NOT EXISTS shows (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255),
        data LONGTEXT,
        updated_at DATETIME
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS weather_cache (
        id VARCHAR(255) PRIMARY KEY,
        data LONGTEXT,
        created_at DATETIME
    )");
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed. Verify the $dbName variable in api.php. Error: ' . $e->getMessage()]);
    exit;
}

// Migration Endpoint
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'migrate_to_sql') {
    $shows_dir = __DIR__ . '/shows';
    $weather_cache_dir = __DIR__ . '/weather-cache';
    $migratedShows = 0;
    
    if (is_dir($shows_dir)) {
        foreach (glob($shows_dir . '/*.json') as $file) {
            $show_id = basename($file, '.json');
            
            $content = file_get_contents($file);
            $mtime = filemtime($file);
            $title = $show_id;
            if ($content !== false) {
                $data = json_decode($content, true);
                if (isset($data['settings']['title']) && !empty($data['settings']['title'])) {
                    $title = $data['settings']['title'];
                }
                $stmt = $pdo->prepare("INSERT INTO shows (id, title, data, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data), updated_at=VALUES(updated_at)");
                $stmt->execute([$show_id, $title, $content, date('Y-m-d H:i:s', $mtime)]);
                $migratedShows++;
            }
        }
    }

    $migratedCache = 0;
    if (is_dir($weather_cache_dir)) {
        foreach (glob($weather_cache_dir . '/weather-wind_*.json') as $file) {
            $content = file_get_contents($file);
            if ($content !== false) {
                $data = json_decode($content, true);
                if (isset($data['cacheId'], $data['createdAt'])) {
                    $stmt = $pdo->prepare("INSERT INTO weather_cache (id, data, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)");
                    $stmt->execute([$data['cacheId'], $content, date('Y-m-d H:i:s', strtotime($data['createdAt']))]);
                    $migratedCache++;
                }
            }
        }
    }
    
    echo json_encode(['success' => true, 'migrated_shows' => $migratedShows, 'migrated_cache' => $migratedCache]);
    exit;
}

// Handle list_shows action
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'list_shows') {
    $stmt = $pdo->query("SELECT id, title, updated_at FROM shows ORDER BY updated_at DESC");
    $shows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($shows as &$show) {
        $show['updatedAt'] = date('c', strtotime($show['updated_at']));
        unset($show['updated_at']);
    }
    
    echo json_encode($shows);
    exit;
}

// Handle delete_show action
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'delete_show') {
    $show_id = $_GET['show'] ?? '';
    if (preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        $stmt = $pdo->prepare("DELETE FROM shows WHERE id = ?");
        $stmt->execute([$show_id]);
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true]);
            exit;
        }
    }
    http_response_code(404);
    echo json_encode(['error' => 'Show not found or invalid ID']);
    exit;
}

// Handle project-backed weather wind cache
if (isset($_GET['action']) && $_GET['action'] === 'weather_wind_cache') {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (isset($_GET['list']) && $_GET['list'] === '1') {
            $stmt = $pdo->query("SELECT id as cacheId, created_at as createdAt FROM weather_cache ORDER BY created_at ASC");
            $snapshots = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($snapshots as &$snap) {
                $snap['createdAt'] = date('c', strtotime($snap['createdAt']));
                $snap['path'] = 'weather-cache/' . $snap['cacheId'] . '.json';
            }
            echo json_encode(['snapshots' => $snapshots]);
            exit;
        }

        if (isset($_GET['cacheId'])) {
            $cache_id = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['cacheId']);
            $stmt = $pdo->prepare("SELECT data FROM weather_cache WHERE id = ?");
            $stmt->execute([$cache_id]);
        } else {
            $stmt = $pdo->query("SELECT data FROM weather_cache ORDER BY created_at DESC LIMIT 1");
        }
        
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'No weather wind cache available']);
            exit;
        }

        echo $row['data'];
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $json = file_get_contents('php://input');
        $decoded = json_decode($json, true);
        if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON payload']);
            exit;
        }

        if (!isset($decoded['geojson'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing geojson payload']);
            exit;
        }

        $cache_id = 'weather-wind_' . gmdate('ymd-His');
        $createdAt = gmdate('c');
        $payload = [
            'cacheId' => $cache_id,
            'createdAt' => $createdAt,
            'geojson' => $decoded['geojson']
        ];

        $encoded = json_encode($payload, JSON_PRETTY_PRINT);
        
        $stmt = $pdo->prepare("INSERT INTO weather_cache (id, data, created_at) VALUES (?, ?, ?)");
        if (!$stmt->execute([$cache_id, $encoded, date('Y-m-d H:i:s', strtotime($createdAt))])) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to write weather wind cache to DB']);
            exit;
        }

        echo json_encode(['success' => true, 'cacheId' => $cache_id, 'path' => 'weather-cache/' . $cache_id . '.json']);
        exit;
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
    $show_id = $_GET['show'] ?? 'default';
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        $show_id = 'default';
    }
    
    $stmt = $pdo->prepare("SELECT data FROM shows WHERE id = ?");
    $stmt->execute([$show_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) {
        if ($show_id !== '_DEFAULT') {
            $stmtDef = $pdo->prepare("SELECT data FROM shows WHERE id = '_DEFAULT'");
            $stmtDef->execute();
            $rowDef = $stmtDef->fetch(PDO::FETCH_ASSOC);
            if ($rowDef) {
                $data = $rowDef['data'];
            } else {
                $data = json_encode(['annotations' => [], 'settings' => null]);
            }
        } else {
            $data = json_encode(['annotations' => [], 'settings' => null]);
        }
        
        // Auto-insert it into SQL
        $insertStmt = $pdo->prepare("INSERT INTO shows (id, title, data, updated_at) VALUES (?, ?, ?, ?)");
        $insertStmt->execute([$show_id, $show_id, $data, date('Y-m-d H:i:s')]);
    } else {
        $data = $row['data'];
    }
    
    echo $data;
    exit;
}

// Handle POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $show_id = $_GET['show'] ?? 'default';
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        $show_id = 'default';
    }
    
    $json = file_get_contents('php://input');
    
    // Validate that it's actually JSON
    $decoded = json_decode($json, true);
    if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload']);
        exit;
    }
    
    // Differential Save Logic
    if (isset($decoded['settings']['layers'])) {
        $stmt = $pdo->prepare("SELECT data FROM shows WHERE id = ?");
        $stmt->execute([$show_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($row) {
            $existing_data = json_decode($row['data'], true);
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
    
    // Write to DB
    $title = $show_id;
    if (isset($decoded['settings']['title']) && !empty($decoded['settings']['title'])) {
        $title = $decoded['settings']['title'];
    }
    
    $stmt = $pdo->prepare("INSERT INTO shows (id, title, data, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data), updated_at=VALUES(updated_at)");
    if (!$stmt->execute([$show_id, $title, $json, date('Y-m-d H:i:s')])) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save data to DB']);
        exit;
    }
    
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
