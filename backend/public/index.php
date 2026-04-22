<?php

declare(strict_types=1);

header('Content-Type: application/json');

$corsOriginsRaw = getenv('CORS_ORIGINS') ?: '*';
$corsOrigins = array_values(array_filter(array_map('trim', explode(',', $corsOriginsRaw))));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
if (in_array('*', $corsOrigins, true) || in_array($origin, $corsOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function jsonInput(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function respond(int $status, $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function errorResponse(int $status, string $code, string $message, $details = null): void {
    respond($status, ['error' => ['code' => $code, 'message' => $message, 'details' => $details]]);
}

function nowUtc(): string {
    return (new DateTime('now', new DateTimeZone('UTC')))->format(DateTimeInterface::ATOM);
}

function parseDatabaseUrl(string $url): array {
    $parts = parse_url($url);
    if ($parts === false) {
        throw new RuntimeException('Invalid DATABASE_URL');
    }
    return [
        'host' => $parts['host'] ?? 'localhost',
        'port' => $parts['port'] ?? 5432,
        'user' => $parts['user'] ?? 'promtdb',
        'pass' => $parts['pass'] ?? 'promtdb',
        'db' => ltrim($parts['path'] ?? '/promtdb', '/'),
    ];
}

function pdo(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $dbUrl = getenv('DATABASE_URL') ?: 'postgresql+psycopg://promtdb:promtdb@localhost:5432/promtdb';
    $dbUrl = preg_replace('#^postgresql\+psycopg://#', 'postgres://', $dbUrl);
    $cfg = parseDatabaseUrl($dbUrl);
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $cfg['host'], $cfg['port'], $cfg['db']);
    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    initSchema($pdo);
    return $pdo;
}

function initSchema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS category (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS phrase (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        default_weight DOUBLE PRECISION NULL,
        is_negative_default BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT NULL,
        required_lora VARCHAR(255) NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS promptpreset (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        positive_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
        negative_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS composerpack (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        positive_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
        negative_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS characterpreset (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version_family VARCHAR(255) NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        description TEXT NULL,
        required_sdxl_base_model VARCHAR(255) NULL,
        recommended_sdxl_base_model VARCHAR(255) NULL,
        positive_prompt TEXT NOT NULL DEFAULT '',
        negative_prompt TEXT NOT NULL DEFAULT '',
        positive_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
        negative_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
        required_loras JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");
}

function normalizeName(string $value): string {
    return strtolower(trim(preg_replace('/\s+/', ' ', $value)));
}

function inferVersionFamily(string $name): string {
    $clean = strtolower(str_replace(' ', '_', trim($name)));
    return preg_replace('/_v\d+$/', '', $clean) ?: $clean;
}

$authUser = getenv('PROMPTDB_USER') ?: 'promptdb';
$authPass = getenv('PROMPTDB_PASS') ?: 'promptdb';
$tokenTtlHours = (int) (getenv('PROMPTDB_TOKEN_TTL_HOURS') ?: '24');
$tokenFile = sys_get_temp_dir() . '/promtdb_php_tokens.json';

function loadTokens(string $file): array {
    if (!is_file($file)) return [];
    $raw = file_get_contents($file);
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : [];
}

function saveTokens(string $file, array $tokens): void {
    file_put_contents($file, json_encode($tokens));
}

function issueToken(string $file, int $ttlHours): string {
    $tokens = loadTokens($file);
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $tokens[$token] = (new DateTime('now', new DateTimeZone('UTC')))->modify("+{$ttlHours} hours")->format(DateTimeInterface::ATOM);
    saveTokens($file, $tokens);
    return $token;
}

function requireAuth(string $file): void {
    $public = ['/health', '/auth/login'];
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    if (in_array($path, $public, true)) return;

    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        errorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    $token = trim($m[1]);
    $tokens = loadTokens($file);
    $exp = $tokens[$token] ?? null;
    if ($exp === null || strtotime((string)$exp) < time()) {
        unset($tokens[$token]);
        saveTokens($file, $tokens);
        errorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
    }
}

requireAuth($tokenFile);
$pdo = pdo();
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$payload = jsonInput();

try {
    if ($method === 'GET' && $path === '/health') {
        respond(200, ['ok' => true, 'service' => 'promtdb-backend-php']);
    }

    if ($method === 'POST' && $path === '/auth/login') {
        $username = trim((string)($payload['username'] ?? ''));
        $password = (string)($payload['password'] ?? '');
        if ($username !== $authUser || $password !== $authPass) {
            errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
        }
        $token = issueToken($tokenFile, $tokenTtlHours);
        respond(200, ['token' => $token, 'token_type' => 'bearer', 'expires_in_seconds' => $tokenTtlHours * 3600, 'user' => $authUser]);
    }

    if ($method === 'GET' && $path === '/auth/me') {
        respond(200, ['user' => $authUser]);
    }

    if ($method === 'GET' && $path === '/categories') {
        $rows = $pdo->query('SELECT * FROM category ORDER BY sort_order, id')->fetchAll();
        respond(200, $rows);
    }

    if ($method === 'POST' && $path === '/categories') {
        $name = trim((string)($payload['name'] ?? ''));
        if ($name === '') errorResponse(400, 'CATEGORY_NAME_REQUIRED', 'Category name is required');
        $normalized = normalizeName($name);
        $stmt = $pdo->prepare('SELECT id,name FROM category');
        $stmt->execute();
        foreach ($stmt->fetchAll() as $r) {
            if (normalizeName((string)$r['name']) === $normalized) errorResponse(409, 'CATEGORY_ALREADY_EXISTS', 'Category already exists');
        }
        $sort = (int)($payload['sort_order'] ?? 0);
        $stmt = $pdo->prepare('INSERT INTO category(name, sort_order, created_at, updated_at) VALUES (:name,:sort,:now,:now) RETURNING *');
        $now = nowUtc();
        $stmt->execute([':name' => $name, ':sort' => $sort, ':now' => $now]);
        respond(200, $stmt->fetch());
    }

    if (preg_match('#^/categories/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        if ($method === 'PATCH') {
            $row = $pdo->prepare('SELECT * FROM category WHERE id=:id');
            $row->execute([':id' => $id]);
            $curr = $row->fetch();
            if (!$curr) errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found');
            $name = array_key_exists('name', $payload) ? trim((string)$payload['name']) : (string)$curr['name'];
            if ($name === '') errorResponse(400, 'CATEGORY_NAME_REQUIRED', 'Category name is required');
            $sort = array_key_exists('sort_order', $payload) ? (int)$payload['sort_order'] : (int)$curr['sort_order'];
            $stmt = $pdo->prepare('UPDATE category SET name=:name, sort_order=:sort, updated_at=:now WHERE id=:id RETURNING *');
            $stmt->execute([':name' => $name, ':sort' => $sort, ':now' => nowUtc(), ':id' => $id]);
            respond(200, $stmt->fetch());
        }
        if ($method === 'DELETE') {
            $pdo->prepare('DELETE FROM phrase WHERE category_id=:id')->execute([':id' => $id]);
            $stmt = $pdo->prepare('DELETE FROM category WHERE id=:id');
            $stmt->execute([':id' => $id]);
            if ($stmt->rowCount() === 0) errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found');
            respond(200, ['ok' => true]);
        }
    }

    if ($method === 'GET' && $path === '/phrases') {
        $categoryId = isset($_GET['category_id']) ? (int)$_GET['category_id'] : null;
        if ($categoryId !== null && $categoryId > 0) {
            $stmt = $pdo->prepare('SELECT * FROM phrase WHERE category_id=:category_id ORDER BY sort_order, id');
            $stmt->execute([':category_id' => $categoryId]);
            respond(200, $stmt->fetchAll());
        }
        $rows = $pdo->query('SELECT * FROM phrase ORDER BY sort_order, id')->fetchAll();
        respond(200, $rows);
    }

    if ($method === 'POST' && $path === '/phrases') {
        $categoryId = (int)($payload['category_id'] ?? 0);
        $categoryCheck = $pdo->prepare('SELECT id FROM category WHERE id=:id');
        $categoryCheck->execute([':id' => $categoryId]);
        if (!$categoryCheck->fetch()) errorResponse(400, 'INVALID_CATEGORY_ID', 'Invalid category_id');

        $stmt = $pdo->prepare('INSERT INTO phrase(category_id,text,default_weight,is_negative_default,notes,required_lora,sort_order,created_at,updated_at)
            VALUES (:category_id,:text,:default_weight,:is_negative_default,:notes,:required_lora,:sort_order,:now,:now) RETURNING *');
        $stmt->execute([
            ':category_id' => $categoryId,
            ':text' => trim((string)($payload['text'] ?? '')),
            ':default_weight' => array_key_exists('default_weight', $payload) ? $payload['default_weight'] : null,
            ':is_negative_default' => (bool)($payload['is_negative_default'] ?? false),
            ':notes' => $payload['notes'] ?? null,
            ':required_lora' => ($payload['required_lora'] ?? null) ?: null,
            ':sort_order' => (int)($payload['sort_order'] ?? 0),
            ':now' => nowUtc(),
        ]);
        respond(200, $stmt->fetch());
    }

    if (preg_match('#^/phrases/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        if ($method === 'PATCH') {
            $get = $pdo->prepare('SELECT * FROM phrase WHERE id=:id');
            $get->execute([':id' => $id]);
            $curr = $get->fetch();
            if (!$curr) errorResponse(404, 'PHRASE_NOT_FOUND', 'Phrase not found');

            $categoryId = array_key_exists('category_id', $payload) ? (int)$payload['category_id'] : (int)$curr['category_id'];
            $text = array_key_exists('text', $payload) ? trim((string)$payload['text']) : (string)$curr['text'];
            $defaultWeight = array_key_exists('default_weight', $payload) ? $payload['default_weight'] : $curr['default_weight'];
            $isNegativeDefault = array_key_exists('is_negative_default', $payload) ? (bool)$payload['is_negative_default'] : (bool)$curr['is_negative_default'];
            $notes = array_key_exists('notes', $payload) ? $payload['notes'] : $curr['notes'];
            $requiredLora = array_key_exists('required_lora', $payload) ? ($payload['required_lora'] ?: null) : $curr['required_lora'];
            $sortOrder = array_key_exists('sort_order', $payload) ? (int)$payload['sort_order'] : (int)$curr['sort_order'];

            $stmt = $pdo->prepare('UPDATE phrase SET category_id=:category_id,text=:text,default_weight=:default_weight,is_negative_default=:is_negative_default,notes=:notes,required_lora=:required_lora,sort_order=:sort_order,updated_at=:now WHERE id=:id RETURNING *');
            $stmt->execute([
                ':category_id' => $categoryId,
                ':text' => $text,
                ':default_weight' => $defaultWeight,
                ':is_negative_default' => $isNegativeDefault,
                ':notes' => $notes,
                ':required_lora' => $requiredLora,
                ':sort_order' => $sortOrder,
                ':now' => nowUtc(),
                ':id' => $id,
            ]);
            respond(200, $stmt->fetch());
        }
        if ($method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM phrase WHERE id=:id');
            $stmt->execute([':id' => $id]);
            if ($stmt->rowCount() === 0) errorResponse(404, 'PHRASE_NOT_FOUND', 'Phrase not found');
            respond(200, ['ok' => true]);
        }
    }

    if ($method === 'POST' && $path === '/compose') {
        $toPrompt = function(array $parts): string {
            $out = [];
            foreach ($parts as $p) {
                $text = trim((string)($p['text'] ?? ''));
                if ($text === '') continue;
                if (array_key_exists('weight', $p) && $p['weight'] !== null) {
                    $out[] = "({$text}:{$p['weight']})";
                } else {
                    $out[] = $text;
                }
            }
            return implode(', ', $out);
        };
        respond(200, [
            'positive_prompt' => $toPrompt((array)($payload['positive_parts'] ?? [])),
            'negative_prompt' => $toPrompt((array)($payload['negative_parts'] ?? [])),
        ]);
    }

    $jsonList = function(string $table) use ($pdo): array {
        $rows = $pdo->query("SELECT * FROM {$table} ORDER BY id DESC")->fetchAll();
        foreach ($rows as &$row) {
            foreach (['positive_parts', 'negative_parts', 'required_loras'] as $k) {
                if (array_key_exists($k, $row)) {
                    $row[$k] = json_decode((string)$row[$k], true) ?: [];
                }
            }
        }
        return $rows;
    };

    if ($method === 'GET' && $path === '/presets') respond(200, $jsonList('promptpreset'));
    if ($method === 'GET' && $path === '/packs') respond(200, $jsonList('composerpack'));
    if ($method === 'GET' && $path === '/characters') respond(200, $jsonList('characterpreset'));

    if ($method === 'POST' && $path === '/presets') {
        $stmt = $pdo->prepare('INSERT INTO promptpreset(name,positive_parts,negative_parts,created_at,updated_at) VALUES (:name,:positive_parts,:negative_parts,:now,:now) RETURNING *');
        $stmt->execute([
            ':name' => trim((string)($payload['name'] ?? '')),
            ':positive_parts' => json_encode($payload['positive_parts'] ?? []),
            ':negative_parts' => json_encode($payload['negative_parts'] ?? []),
            ':now' => nowUtc(),
        ]);
        $row = $stmt->fetch();
        $row['positive_parts'] = json_decode((string)$row['positive_parts'], true) ?: [];
        $row['negative_parts'] = json_decode((string)$row['negative_parts'], true) ?: [];
        respond(200, $row);
    }

    if ($method === 'POST' && $path === '/packs') {
        $stmt = $pdo->prepare('INSERT INTO composerpack(name,positive_parts,negative_parts,created_at,updated_at) VALUES (:name,:positive_parts,:negative_parts,:now,:now) RETURNING *');
        $stmt->execute([
            ':name' => trim((string)($payload['name'] ?? '')),
            ':positive_parts' => json_encode($payload['positive_parts'] ?? []),
            ':negative_parts' => json_encode($payload['negative_parts'] ?? []),
            ':now' => nowUtc(),
        ]);
        $row = $stmt->fetch();
        $row['positive_parts'] = json_decode((string)$row['positive_parts'], true) ?: [];
        $row['negative_parts'] = json_decode((string)$row['negative_parts'], true) ?: [];
        respond(200, $row);
    }

    if ($method === 'POST' && $path === '/characters') {
        $name = trim((string)($payload['name'] ?? ''));
        $family = trim((string)($payload['version_family'] ?? '')) ?: inferVersionFamily($name);
        $version = max(1, (int)($payload['version'] ?? 1));
        $stmt = $pdo->prepare('INSERT INTO characterpreset(name,version_family,version,description,required_sdxl_base_model,recommended_sdxl_base_model,positive_prompt,negative_prompt,positive_parts,negative_parts,required_loras,created_at,updated_at)
            VALUES (:name,:version_family,:version,:description,:required,:recommended,:positive_prompt,:negative_prompt,:positive_parts,:negative_parts,:required_loras,:now,:now) RETURNING *');
        $stmt->execute([
            ':name' => $name,
            ':version_family' => $family,
            ':version' => $version,
            ':description' => $payload['description'] ?? null,
            ':required' => $payload['required_sdxl_base_model'] ?? null,
            ':recommended' => $payload['recommended_sdxl_base_model'] ?? null,
            ':positive_prompt' => (string)($payload['positive_prompt'] ?? ''),
            ':negative_prompt' => (string)($payload['negative_prompt'] ?? ''),
            ':positive_parts' => json_encode($payload['positive_parts'] ?? []),
            ':negative_parts' => json_encode($payload['negative_parts'] ?? []),
            ':required_loras' => json_encode($payload['required_loras'] ?? []),
            ':now' => nowUtc(),
        ]);
        $row = $stmt->fetch();
        foreach (['positive_parts', 'negative_parts', 'required_loras'] as $k) $row[$k] = json_decode((string)$row[$k], true) ?: [];
        respond(200, $row);
    }

    if (preg_match('#^/(presets|packs|characters)/(\d+)$#', $path, $m)) {
        $entity = $m[1];
        $id = (int)$m[2];
        $table = $entity === 'presets' ? 'promptpreset' : ($entity === 'packs' ? 'composerpack' : 'characterpreset');
        if ($method === 'DELETE') {
            $stmt = $pdo->prepare("DELETE FROM {$table} WHERE id=:id");
            $stmt->execute([':id' => $id]);
            if ($stmt->rowCount() === 0) errorResponse(404, strtoupper($entity) . '_NOT_FOUND', ucfirst($entity) . ' not found');
            respond(200, ['ok' => true]);
        }
        if ($method === 'PATCH') {
            $get = $pdo->prepare("SELECT * FROM {$table} WHERE id=:id");
            $get->execute([':id' => $id]);
            $curr = $get->fetch();
            if (!$curr) errorResponse(404, strtoupper($entity) . '_NOT_FOUND', ucfirst($entity) . ' not found');

            if ($table === 'characterpreset') {
                $name = array_key_exists('name', $payload) ? trim((string)$payload['name']) : $curr['name'];
                $family = array_key_exists('version_family', $payload) ? trim((string)$payload['version_family']) : $curr['version_family'];
                $version = array_key_exists('version', $payload) ? max(1, (int)$payload['version']) : (int)$curr['version'];
                $stmt = $pdo->prepare('UPDATE characterpreset SET name=:name,version_family=:version_family,version=:version,description=:description,required_sdxl_base_model=:required,recommended_sdxl_base_model=:recommended,positive_prompt=:positive_prompt,negative_prompt=:negative_prompt,positive_parts=:positive_parts,negative_parts=:negative_parts,required_loras=:required_loras,updated_at=:now WHERE id=:id RETURNING *');
                $stmt->execute([
                    ':name' => $name,
                    ':version_family' => $family,
                    ':version' => $version,
                    ':description' => array_key_exists('description', $payload) ? $payload['description'] : $curr['description'],
                    ':required' => array_key_exists('required_sdxl_base_model', $payload) ? $payload['required_sdxl_base_model'] : $curr['required_sdxl_base_model'],
                    ':recommended' => array_key_exists('recommended_sdxl_base_model', $payload) ? $payload['recommended_sdxl_base_model'] : $curr['recommended_sdxl_base_model'],
                    ':positive_prompt' => array_key_exists('positive_prompt', $payload) ? (string)$payload['positive_prompt'] : (string)$curr['positive_prompt'],
                    ':negative_prompt' => array_key_exists('negative_prompt', $payload) ? (string)$payload['negative_prompt'] : (string)$curr['negative_prompt'],
                    ':positive_parts' => json_encode(array_key_exists('positive_parts', $payload) ? $payload['positive_parts'] : (json_decode((string)$curr['positive_parts'], true) ?: [])),
                    ':negative_parts' => json_encode(array_key_exists('negative_parts', $payload) ? $payload['negative_parts'] : (json_decode((string)$curr['negative_parts'], true) ?: [])),
                    ':required_loras' => json_encode(array_key_exists('required_loras', $payload) ? $payload['required_loras'] : (json_decode((string)$curr['required_loras'], true) ?: [])),
                    ':now' => nowUtc(),
                    ':id' => $id,
                ]);
                $row = $stmt->fetch();
                foreach (['positive_parts', 'negative_parts', 'required_loras'] as $k) $row[$k] = json_decode((string)$row[$k], true) ?: [];
                respond(200, $row);
            }

            $name = array_key_exists('name', $payload) ? trim((string)$payload['name']) : (string)$curr['name'];
            $stmt = $pdo->prepare("UPDATE {$table} SET name=:name,positive_parts=:positive_parts,negative_parts=:negative_parts,updated_at=:now WHERE id=:id RETURNING *");
            $stmt->execute([
                ':name' => $name,
                ':positive_parts' => json_encode(array_key_exists('positive_parts', $payload) ? $payload['positive_parts'] : (json_decode((string)$curr['positive_parts'], true) ?: [])),
                ':negative_parts' => json_encode(array_key_exists('negative_parts', $payload) ? $payload['negative_parts'] : (json_decode((string)$curr['negative_parts'], true) ?: [])),
                ':now' => nowUtc(),
                ':id' => $id,
            ]);
            $row = $stmt->fetch();
            $row['positive_parts'] = json_decode((string)$row['positive_parts'], true) ?: [];
            $row['negative_parts'] = json_decode((string)$row['negative_parts'], true) ?: [];
            respond(200, $row);
        }
    }

    if (preg_match('#^/characters/(\d+)/duplicate-version$#', $path, $m) && $method === 'POST') {
        $id = (int)$m[1];
        $stmt = $pdo->prepare('SELECT * FROM characterpreset WHERE id=:id');
        $stmt->execute([':id' => $id]);
        $curr = $stmt->fetch();
        if (!$curr) errorResponse(404, 'CHARACTER_NOT_FOUND', 'Character not found');
        $newVersion = ((int)$curr['version']) + 1;
        $insert = $pdo->prepare('INSERT INTO characterpreset(name,version_family,version,description,required_sdxl_base_model,recommended_sdxl_base_model,positive_prompt,negative_prompt,positive_parts,negative_parts,required_loras,created_at,updated_at)
            VALUES (:name,:version_family,:version,:description,:required,:recommended,:positive_prompt,:negative_prompt,:positive_parts,:negative_parts,:required_loras,:now,:now) RETURNING *');
        $insert->execute([
            ':name' => $curr['name'],
            ':version_family' => $curr['version_family'],
            ':version' => $newVersion,
            ':description' => $curr['description'],
            ':required' => $curr['required_sdxl_base_model'],
            ':recommended' => $curr['recommended_sdxl_base_model'],
            ':positive_prompt' => $curr['positive_prompt'],
            ':negative_prompt' => $curr['negative_prompt'],
            ':positive_parts' => $curr['positive_parts'],
            ':negative_parts' => $curr['negative_parts'],
            ':required_loras' => $curr['required_loras'],
            ':now' => nowUtc(),
        ]);
        $row = $insert->fetch();
        foreach (['positive_parts', 'negative_parts', 'required_loras'] as $k) $row[$k] = json_decode((string)$row[$k], true) ?: [];
        respond(200, $row);
    }

    errorResponse(404, 'NOT_FOUND', 'Endpoint not found');
} catch (PDOException $e) {
    errorResponse(500, 'DB_ERROR', 'Database error', $e->getMessage());
} catch (Throwable $e) {
    errorResponse(500, 'INTERNAL_ERROR', 'Internal server error', $e->getMessage());
}
