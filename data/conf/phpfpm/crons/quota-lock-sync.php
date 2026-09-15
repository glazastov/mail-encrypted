<?php
// Gives every mailbox locked for storing more than its quota its status back
// once it fits again, whether its owner deleted mail or its quota was raised.
// It never locks: only lowering a quota does.

require_once(__DIR__ . '/../web/inc/vars.inc.php');
if (file_exists(__DIR__ . '/../web/inc/vars.local.inc.php')) {
  include_once(__DIR__ . '/../web/inc/vars.local.inc.php');
}

$dsn = $database_type . ":unix_socket=" . $database_sock . ";dbname=" . $database_name;
$opt = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];
try {
  $pdo = new PDO($dsn, $database_user, $database_pass, $opt);
}
catch (PDOException $e) {
  fwrite(STDERR, "Quota lock sync: " . $e->getMessage() . PHP_EOL);
  exit(1);
}

require_once __DIR__ . '/../web/inc/functions.quota_lock.inc.php';

$result = quota_lock_sync(null, false);
foreach ($result['unlocked'] as $username) {
  echo "Quota lock sync: " . $username . " fits its quota again, status restored" . PHP_EOL;
}
