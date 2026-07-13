<?php
// api.php - Simple backend for Mapbox annotations (JSON FILE BASED for IONOS)
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

// Ensure directories exist
$shows_dir = __DIR__ . '/shows';
$weather_cache_dir = __DIR__ . '/weather-cache';
$basemaps_dir = __DIR__ . '/basemaps';

if (!is_dir($shows_dir)) mkdir($shows_dir, 0777, true);
if (!is_dir($weather_cache_dir)) mkdir($weather_cache_dir, 0777, true);
if (!is_dir($basemaps_dir)) mkdir($basemaps_dir, 0777, true);

// Migration Endpoint (No-op in JSON mode)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && ($_GET['action'] === 'migrate_to_mongodb' || $_GET['action'] === 'migrate_to_sql')) {
    echo json_encode(['success' => true, 'message' => 'Migration not supported in JSON mode']);
    exit;
}

// Basemaps Endpoints
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'list_basemaps') {
    $basemaps = [];
    foreach (glob($basemaps_dir . '/*.json') as $file) {
        $content = file_get_contents($file);
        if ($content !== false) {
            $data = json_decode($content, true);
            if ($data) $basemaps[] = $data;
        }
    }
    echo json_encode($basemaps);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'basemap_style') {
    $id = $_GET['id'] ?? '';
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit;
    }
    $file = $basemaps_dir . '/' . $id . '.json';
    if (file_exists($file)) {
        $doc = json_decode(file_get_contents($file), true);
        if ($doc && isset($doc['styleData'])) {
            header('Content-Type: application/json');
            echo is_string($doc['styleData']) ? $doc['styleData'] : json_encode($doc['styleData']);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Not found or no style data']);
        }
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'delete_basemap') {
    $id = $_GET['id'] ?? '';
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit;
    }
    $file = $basemaps_dir . '/' . $id . '.json';
    if (file_exists($file)) {
        unlink($file);
        echo json_encode(['success' => true]);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'save_basemap') {
    $input = file_get_contents('php://input');
    $decoded = json_decode($input, true);
    if (!isset($decoded['id']) || !isset($decoded['url'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id or url']);
        exit;
    }

    $doc = [
        'id' => $decoded['id'],
        'name' => $decoded['name'] ?? $decoded['id'],
        'url' => $decoded['url'],
        'styleData' => $decoded['styleData'] ?? null,
        'previewData' => $decoded['previewData'] ?? null,
        'updated_at' => date('c')
    ];
    file_put_contents($basemaps_dir . '/' . $decoded['id'] . '.json', json_encode($doc, JSON_PRETTY_PRINT));
    echo json_encode(['success' => true]);
    exit;
}

// Handle list_shows action
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'list_shows') {
    $shows = [];
    foreach (glob($shows_dir . '/*.json') as $file) {
        $id = basename($file, '.json');
        $content = file_get_contents($file);
        if ($content !== false) {
            $data = json_decode($content, true);
            $mtime = filemtime($file);
            $shows[] = [
                'id' => $id,
                'title' => $data['settings']['title'] ?? $id,
                'isTemplate' => $data['settings']['isTemplate'] ?? false,
                'previewData' => $data['settings']['previewData'] ?? null,
                'updatedAt' => date('c', $mtime)
            ];
        }
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
        $file = $shows_dir . '/' . $show_id . '.json';
        if (file_exists($file)) {
            unlink($file);
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
            $snapshots = [];
            foreach (glob($weather_cache_dir . '/weather-wind_*.json') as $file) {
                $content = file_get_contents($file);
                if ($content !== false) {
                    $data = json_decode($content, true);
                    if (isset($data['cacheId'], $data['createdAt'])) {
                        $snapshots[] = [
                            'cacheId' => $data['cacheId'],
                            'createdAt' => $data['createdAt'],
                            'path' => 'weather-cache/' . basename($file)
                        ];
                    }
                }
            }
            usort($snapshots, function($a, $b) {
                return strtotime($a['createdAt']) - strtotime($b['createdAt']);
            });
            echo json_encode(['snapshots' => $snapshots]);
            exit;
        }

        $docs = [];
        if (isset($_GET['cacheId'])) {
            $cache_id = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['cacheId']);
            $file = $weather_cache_dir . '/' . $cache_id . '.json';
            if (file_exists($file)) {
                $docs[] = json_decode(file_get_contents($file), true);
            }
        } else {
            // Get latest
            $files = glob($weather_cache_dir . '/weather-wind_*.json');
            if (!empty($files)) {
                usort($files, function($a, $b) { return filemtime($b) - filemtime($a); });
                $docs[] = json_decode(file_get_contents($files[0]), true);
            }
        }
        
        if (empty($docs) || empty($docs[0])) {
            http_response_code(404);
            echo json_encode(['error' => 'No weather wind cache available']);
            exit;
        }
        
        echo json_encode($docs[0]);
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

        file_put_contents($weather_cache_dir . '/' . $cache_id . '.json', json_encode($payload, JSON_PRETTY_PRINT));
        echo json_encode(['success' => true, 'cacheId' => $cache_id, 'path' => 'weather-cache/' . $cache_id . '.json']);
        exit;
    }
}

// Handle EFFIS proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'proxy_effis') {
    $targetUrl = $_GET['url'] ?? '';
    if (!$targetUrl || strpos($targetUrl, 'https://maps.effis.emergency.copernicus.eu/') !== 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid or missing target URL']);
        exit;
    }
    
    // Some WMS endpoints encode things that we might need to be careful with,
    // but mapbox url-encodes the whole URL when putting it in the query string.
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $targetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2); // Connect quickly or fail
    curl_setopt($ch, CURLOPT_TIMEOUT, 4); // Don't hang PHP workers for long if EFFIS is slow
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    
    if ($httpCode === 200 && $response) {
        header("Content-Type: " . ($contentType ? $contentType : "image/png"));
        header("Cache-Control: public, max-age=3600");
        echo $response;
    } else {
        // If 503 or any error, return a transparent 1x1 PNG to prevent Mapbox CORS errors and console spam
        header("Content-Type: image/png");
        header("Cache-Control: public, max-age=60");
        echo base64_decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
    }
    exit;
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
    if (!empty($_GET['token'])) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $_GET['token']]);
    $response = curl_exec($ch);
    http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    echo $response;
    exit;
}

// Handle OpenSky track proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'opensky_track') {
    $url = 'https://opensky-network.org/api/tracks/all?' . http_build_query(['icao24' => $_GET['icao24'] ?? '', 'time' => $_GET['time'] ?? '0']);
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    if (!empty($_GET['token'])) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $_GET['token']]);
    $response = curl_exec($ch);
    http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    echo $response;
    exit;
}

// Handle OpenSky token proxy request
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'opensky_token') {
    $url = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(['grant_type' => 'client_credentials', 'client_id' => $_POST['client_id'] ?? '', 'client_secret' => $_POST['client_secret'] ?? '']));
    $response = curl_exec($ch);
    http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    echo $response;
    exit;
}

// Handle OpenSky metadata proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'opensky_metadata') {
    $url = 'https://opensky-network.org/api/metadata/aircraft/icao/' . urlencode($_GET['icao24'] ?? '');
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    if (!empty($_GET['token'])) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $_GET['token']]);
    $response = curl_exec($ch);
    http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    echo $response;
    exit;
}

// Handle OpenSky route proxy request
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'opensky_route') {
    $url = 'https://opensky-network.org/api/routes?callsign=' . urlencode($_GET['callsign'] ?? '');
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    if (!empty($_GET['token'])) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $_GET['token']]);
    $response = curl_exec($ch);
    http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
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
    http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    echo $response;
    exit;
}

// Handle Deepstate History proxy
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'deepstate_history') {
    $url = 'https://deepstatemap.live/api/history';
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    echo $response;
    exit;
}

// Handle Deepstate GeoJSON proxy
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'deepstate_geojson') {
    $id = $_GET['id'] ?? '';
    if (preg_match('/^[a-zA-Z0-9-]+$/', $id)) {
        $url = 'https://deepstatemap.live/api/history/' . $id . '/geojson';
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $response = curl_exec($ch);
        http_response_code(curl_getinfo($ch, CURLINFO_HTTP_CODE));
        curl_close($ch);
        echo $response;
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid ID']);
    }
    exit;
}

// Handle Template Upload proxy
if ($_SERVER['REQUEST_METHOD'] === 'POST' && strpos($_SERVER['REQUEST_URI'], '/api/upload-template') !== false) {
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'Upload failed']);
        exit;
    }
    $file = $_FILES['file'];
    $templateName = pathinfo($file['name'], PATHINFO_FILENAME);
    $targetDir = __DIR__ . '/label-templates/' . $templateName;
    if (!is_dir(__DIR__ . '/label-templates')) mkdir(__DIR__ . '/label-templates', 0777, true);

    $zip = new ZipArchive();
    if ($zip->open($file['tmp_name']) === TRUE) {
        $zip->extractTo($targetDir);
        $zip->close();
        
        $macosxPath = $targetDir . '/__MACOSX';
        if (is_dir($macosxPath)) {
            $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($macosxPath, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
            }
            rmdir($macosxPath);
        }

        $contents = array_values(array_diff(scandir($targetDir), ['.', '..']));
        if (count($contents) === 1 && is_dir($targetDir . '/' . $contents[0])) {
            $innerDir = $targetDir . '/' . $contents[0];
            $innerContents = array_diff(scandir($innerDir), ['.', '..']);
            foreach ($innerContents as $item) rename($innerDir . '/' . $item, $targetDir . '/' . $item);
            rmdir($innerDir);
        }
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to extract zip file']);
    }
    exit;
}

// Handle Template Listing
if ($_SERVER['REQUEST_METHOD'] === 'GET' && strpos($_SERVER['REQUEST_URI'], '/api/templates') !== false) {
    $templatesDir = __DIR__ . '/label-templates';
    $templates = [];
    if (is_dir($templatesDir)) {
        foreach (array_filter(glob($templatesDir . '/*'), 'is_dir') as $dir) {
            $id = basename($dir);
            $kind = 'regular';
            $manifestPath = $dir . '/manifest.json';
            $manifest = null;
            if (file_exists($manifestPath)) {
                $manifest = json_decode(file_get_contents($manifestPath), true);
                if (isset($manifest['kind'])) $kind = $manifest['kind'];
            }
            $templates[] = ['id' => $id, 'kind' => $kind, 'manifest' => $manifest];
        }
    }
    echo json_encode($templates);
    exit;
}

// Handle Media Upload
if ($_SERVER['REQUEST_METHOD'] === 'POST' && strpos($_SERVER['REQUEST_URI'], '/api/upload-media') !== false) {
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded']);
        exit;
    }
    
    $file = $_FILES['file'];
    $uploadDir = __DIR__ . '/uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid('media_') . '.' . $ext;
    $targetFile = $uploadDir . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $targetFile)) {
        echo json_encode(['success' => true, 'url' => '/uploads/' . $filename]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save media file']);
    }
    exit;
}

// Handle GET request (Show Data)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $show_id = $_GET['show'] ?? '';
    if (!$show_id || !preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid show ID']);
        exit;
    }
    
    $file = $shows_dir . '/' . $show_id . '.json';
    if (!file_exists($file)) {
        $defFile = $shows_dir . '/_DEFAULT.json';
        if ($show_id !== '_DEFAULT' && file_exists($defFile)) {
            $data = file_get_contents($defFile);
        } else {
            $data = json_encode(['annotations' => [], 'settings' => null]);
        }
        file_put_contents($file, $data);
        echo $data;
    } else {
        echo file_get_contents($file);
    }
    exit;
}

// Handle POST request (Show Data)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $show_id = $_GET['show'] ?? '';
    if (!$show_id || !preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid show ID']);
        exit;
    }
    
    $json = file_get_contents('php://input');
    $decoded = json_decode($json, true);
    if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload']);
        exit;
    }
    
    $file = $shows_dir . '/' . $show_id . '.json';
    if (isset($decoded['settings']['layers']) && file_exists($file)) {
        $existing_data = json_decode(file_get_contents($file), true);
        if (isset($existing_data['settings']['layers'])) {
            $existing_layers = [];
            foreach ($existing_data['settings']['layers'] as $layer) {
                if (isset($layer['id'])) $existing_layers[$layer['id']] = $layer;
            }
            
            foreach ($decoded['settings']['layers'] as &$layer) {
                if (isset($layer['_keepExistingData']) && $layer['_keepExistingData'] === true) {
                    if (isset($layer['id']) && isset($existing_layers[$layer['id']]['data'])) {
                        $layer['data'] = $existing_layers[$layer['id']]['data'];
                    }
                    unset($layer['_keepExistingData']);
                }
                if (isset($layer['_isDirty'])) unset($layer['_isDirty']);
            }
            $json = json_encode($decoded, JSON_PRETTY_PRINT);
        } else {
            $json = json_encode($decoded, JSON_PRETTY_PRINT);
        }
    } else {
        $json = json_encode($decoded, JSON_PRETTY_PRINT);
    }
    
    if (file_put_contents($file, $json) !== false) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save data']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
