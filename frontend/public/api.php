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

$config = file_exists(__DIR__ . '/db_config.php') ? require __DIR__ . '/db_config.php' : ['mongoUri' => ''];
$mongoUri = $config['mongoUri'];
$dbName = 'obermap';

try {
    $manager = new MongoDB\Driver\Manager($mongoUri);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed. Error: ' . $e->getMessage()]);
    exit;
}

// Migration Endpoint
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && ($_GET['action'] === 'migrate_to_mongodb' || $_GET['action'] === 'migrate_to_sql')) {
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
                
                $bulk = new MongoDB\Driver\BulkWrite;
                $bulk->update(
                    ['id' => $show_id],
                    ['$set' => [
                        'id' => $show_id,
                        'title' => $title,
                        'data' => $content,
                        'updated_at' => new MongoDB\BSON\UTCDateTime($mtime * 1000)
                    ]],
                    ['upsert' => true]
                );
                $manager->executeBulkWrite('obermap.shows', $bulk);
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
                    $bulk = new MongoDB\Driver\BulkWrite;
                    $bulk->update(
                        ['id' => $data['cacheId']],
                        ['$set' => [
                            'id' => $data['cacheId'],
                            'data' => $content,
                            'created_at' => new MongoDB\BSON\UTCDateTime(strtotime($data['createdAt']) * 1000)
                        ]],
                        ['upsert' => true]
                    );
                    $manager->executeBulkWrite('obermap.weather_cache', $bulk);
                    $migratedCache++;
                }
            }
        }
    }

    // Connect to legacy MySQL database to migrate existing entries if available
    $mysqlMigratedShows = 0;
    $mysqlMigratedCache = 0;
    $mysqlError = null;
    try {
        $dbHost = 'db5020452906.hosting-data.io';
        $dbPort = '3306';
        $dbUser = 'dbu347313';
        $dbPass = 'aN19ehfS863SfvgXav1sOcvibu20a9sduOUAYVDyq083y7bh';
        $dbName = 'dbs15671316';
        
        $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Migrate shows table
        $stmt = $pdo->query("SELECT id, title, data, updated_at FROM shows");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $mtime = strtotime($row['updated_at']) ?: time();
            $bulk = new MongoDB\Driver\BulkWrite;
            $bulk->update(
                ['id' => $row['id']],
                ['$set' => [
                    'id' => $row['id'],
                    'title' => $row['title'],
                    'data' => $row['data'],
                    'updated_at' => new MongoDB\BSON\UTCDateTime($mtime * 1000)
                ]],
                ['upsert' => true]
            );
            $manager->executeBulkWrite('obermap.shows', $bulk);
            $mysqlMigratedShows++;
        }
        
        // Migrate weather_cache table
        $stmtCache = $pdo->query("SELECT id, data, created_at FROM weather_cache");
        while ($row = $stmtCache->fetch(PDO::FETCH_ASSOC)) {
            $ctime = strtotime($row['created_at']) ?: time();
            $bulk = new MongoDB\Driver\BulkWrite;
            $bulk->update(
                ['id' => $row['id']],
                ['$set' => [
                    'id' => $row['id'],
                    'data' => $row['data'],
                    'created_at' => new MongoDB\BSON\UTCDateTime($ctime * 1000)
                ]],
                ['upsert' => true]
            );
            $manager->executeBulkWrite('obermap.weather_cache', $bulk);
            $mysqlMigratedCache++;
        }
    } catch (Exception $e) {
        $mysqlError = $e->getMessage();
    }
    
    echo json_encode([
        'success' => true, 
        'files_migrated' => [
            'shows' => $migratedShows, 
            'weather_cache' => $migratedCache
        ],
        'mysql_migrated' => [
        ],
        'mysql_error' => $mysqlError
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'list_basemaps') {
    $query = new MongoDB\Driver\Query([]);
    $cursor = $manager->executeQuery('obermap.basemaps', $query);
    $basemaps = [];
    foreach ($cursor as $doc) {
        $basemaps[] = (array)$doc;
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
    $query = new MongoDB\Driver\Query(['id' => $id]);
    $cursor = $manager->executeQuery('obermap.basemaps', $query);
    $doc = current($cursor->toArray());
    if ($doc && isset($doc->styleData)) {
        header('Content-Type: application/json');
        echo $doc->styleData;
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Not found or no style data']);
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
    $bulk = new MongoDB\Driver\BulkWrite;
    $bulk->delete(['id' => $id]);
    $result = $manager->executeBulkWrite('obermap.basemaps', $bulk);
    if ($result->getDeletedCount() > 0) {
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

    $bulk = new MongoDB\Driver\BulkWrite;
    $bulk->update(
        ['id' => $decoded['id']],
        ['$set' => [
            'id' => $decoded['id'],
            'name' => $decoded['name'] ?? $decoded['id'],
            'url' => $decoded['url'],
            'styleData' => $decoded['styleData'] ?? null,
            'previewData' => $decoded['previewData'] ?? null,
            'updated_at' => new MongoDB\BSON\UTCDateTime()
        ]],
        ['upsert' => true]
    );
    $manager->executeBulkWrite('obermap.basemaps', $bulk);
    echo json_encode(['success' => true]);
    exit;
}

// Handle list_shows action
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'list_shows') {
    $query = new MongoDB\Driver\Query([], [
        'projection' => ['id' => 1, 'title' => 1, 'updated_at' => 1],
        'sort' => ['updated_at' => -1]
    ]);
    $cursor = $manager->executeQuery('obermap.shows', $query);
    $shows = [];
    foreach ($cursor as $doc) {
        $arr = (array)$doc;
        if (isset($arr['updated_at']) && $arr['updated_at'] instanceof MongoDB\BSON\UTCDateTime) {
            $milliseconds = (string)$arr['updated_at'];
            $seconds = (int)($milliseconds / 1000);
            $updatedAt = date('c', $seconds);
        } else {
            $updatedAt = date('c');
        }
        $shows[] = [
            'id' => $arr['id'] ?? '',
            'title' => $arr['title'] ?? '',
            'updatedAt' => $updatedAt
        ];
    }
    
    echo json_encode($shows);
    exit;
}

// Handle delete_show action
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'delete_show') {
    $show_id = $_GET['show'] ?? '';
    if (preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        $bulk = new MongoDB\Driver\BulkWrite;
        $bulk->delete(['id' => $show_id]);
        $result = $manager->executeBulkWrite('obermap.shows', $bulk);
        if ($result->getDeletedCount() > 0) {
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
            $query = new MongoDB\Driver\Query([], ['sort' => ['created_at' => 1]]);
            $cursor = $manager->executeQuery('obermap.weather_cache', $query);
            $snapshots = [];
            foreach ($cursor as $doc) {
                $arr = (array)$doc;
                if (isset($arr['created_at']) && $arr['created_at'] instanceof MongoDB\BSON\UTCDateTime) {
                    $milliseconds = (string)$arr['created_at'];
                    $seconds = (int)($milliseconds / 1000);
                    $createdAt = date('c', $seconds);
                } else {
                    $createdAt = date('c');
                }
                $snapshots[] = [
                    'cacheId' => $arr['id'] ?? '',
                    'createdAt' => $createdAt,
                    'path' => 'weather-cache/' . ($arr['id'] ?? '') . '.json'
                ];
            }
            echo json_encode(['snapshots' => $snapshots]);
            exit;
        }

        if (isset($_GET['cacheId'])) {
            $cache_id = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['cacheId']);
            $query = new MongoDB\Driver\Query(['id' => $cache_id]);
        } else {
            $query = new MongoDB\Driver\Query([], ['sort' => ['created_at' => -1], 'limit' => 1]);
        }
        
        $cursor = $manager->executeQuery('obermap.weather_cache', $query);
        $docs = $cursor->toArray();
        if (empty($docs)) {
            http_response_code(404);
            echo json_encode(['error' => 'No weather wind cache available']);
            exit;
        }

        $arr = (array)$docs[0];
        echo $arr['data'];
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
        
        $bulk = new MongoDB\Driver\BulkWrite;
        $bulk->update(
            ['id' => $cache_id],
            ['$set' => [
                'id' => $cache_id,
                'data' => $encoded,
                'created_at' => new MongoDB\BSON\UTCDateTime(strtotime($createdAt) * 1000)
            ]],
            ['upsert' => true]
        );
        $manager->executeBulkWrite('obermap.weather_cache', $bulk);

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

// Handle Template Upload proxy
if ($_SERVER['REQUEST_METHOD'] === 'POST' && strpos($_SERVER['REQUEST_URI'], '/api/upload-template') !== false) {
    if (!isset($_FILES['file'])) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded']);
        exit;
    }

    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'Upload failed with error code ' . $file['error']]);
        exit;
    }

    $templateName = pathinfo($file['name'], PATHINFO_FILENAME);
    $targetDir = __DIR__ . '/label-templates/' . $templateName;

    if (!is_dir(__DIR__ . '/label-templates')) {
        mkdir(__DIR__ . '/label-templates', 0777, true);
    }

    $zip = new ZipArchive();
    if ($zip->open($file['tmp_name']) === TRUE) {
        $zip->extractTo($targetDir);
        $zip->close();
        
        // Clean up __MACOSX if it exists
        $macosxPath = $targetDir . '/__MACOSX';
        if (is_dir($macosxPath)) {
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($macosxPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
            }
            rmdir($macosxPath);
        }

        // Check if it extracted a single folder
        $contents = array_values(array_diff(scandir($targetDir), ['.', '..']));
        if (count($contents) === 1 && is_dir($targetDir . '/' . $contents[0])) {
            $innerDir = $targetDir . '/' . $contents[0];
            $innerContents = array_diff(scandir($innerDir), ['.', '..']);
            foreach ($innerContents as $item) {
                rename($innerDir . '/' . $item, $targetDir . '/' . $item);
            }
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
        $dirs = array_filter(glob($templatesDir . '/*'), 'is_dir');
        foreach ($dirs as $dir) {
            $id = basename($dir);
            $kind = 'regular';
            $manifestPath = $dir . '/manifest.json';
            $manifest = null;
            if (file_exists($manifestPath)) {
                $manifest = json_decode(file_get_contents($manifestPath), true);
                if (isset($manifest['kind'])) {
                    $kind = $manifest['kind'];
                }
            }
            $templates[] = ['id' => $id, 'kind' => $kind, 'manifest' => $manifest];
        }
    }
    echo json_encode($templates);
    exit;
}

// Handle GET request
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $show_id = $_GET['show'] ?? '';
    if (!$show_id || !preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid show ID']);
        exit;
    }
    
    $query = new MongoDB\Driver\Query(['id' => $show_id]);
    $cursor = $manager->executeQuery('obermap.shows', $query);
    $docs = $cursor->toArray();
    
    if (empty($docs)) {
        if ($show_id !== '_DEFAULT') {
            $queryDef = new MongoDB\Driver\Query(['id' => '_DEFAULT']);
            $cursorDef = $manager->executeQuery('obermap.shows', $queryDef);
            $docsDef = $cursorDef->toArray();
            if (!empty($docsDef)) {
                $arrDef = (array)$docsDef[0];
                $data = $arrDef['data'];
            } else {
                $data = json_encode(['annotations' => [], 'settings' => null]);
            }
        } else {
            $data = json_encode(['annotations' => [], 'settings' => null]);
        }
        
        // Auto-insert it into MongoDB
        $bulk = new MongoDB\Driver\BulkWrite;
        $bulk->update(
            ['id' => $show_id],
            ['$set' => [
                'id' => $show_id,
                'title' => $show_id,
                'data' => $data,
                'updated_at' => new MongoDB\BSON\UTCDateTime(time() * 1000)
            ]],
            ['upsert' => true]
        );
        $manager->executeBulkWrite('obermap.shows', $bulk);
    } else {
        $arr = (array)$docs[0];
        $data = $arr['data'];
    }
    
    echo $data;
    exit;
}

// Handle POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $show_id = $_GET['show'] ?? '';
    if (!$show_id || !preg_match('/^[a-zA-Z0-9_-]+$/', $show_id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid show ID']);
        exit;
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
        $query = new MongoDB\Driver\Query(['id' => $show_id]);
        $cursor = $manager->executeQuery('obermap.shows', $query);
        $docs = $cursor->toArray();
        
        if (!empty($docs)) {
            $arr = (array)$docs[0];
            $existing_data = json_decode($arr['data'], true);
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
    
    $bulk = new MongoDB\Driver\BulkWrite;
    $bulk->update(
        ['id' => $show_id],
        ['$set' => [
            'id' => $show_id,
            'title' => $title,
            'data' => $json,
            'updated_at' => new MongoDB\BSON\UTCDateTime(time() * 1000)
        ]],
        ['upsert' => true]
    );
    
    try {
        $manager->executeBulkWrite('obermap.shows', $bulk);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save data to DB: ' . $e->getMessage()]);
        exit;
    }
    
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
