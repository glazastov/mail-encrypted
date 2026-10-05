<?php
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/triggers.admin.inc.php';

protect_route(['admin']);

// Downloading a certificate happens on this route, before the page is built.
// certificates_download() only ever returns certificates: the private keys are
// not among the files it knows about.
if (isset($_GET['download'])) {
  $download = certificates_download($_GET['name'] ?? '', $_GET['download']);
  if ($download === false) {
    http_response_code(404);
    exit;
  }
  header('Content-Type: application/x-pem-file');
  header('Content-Disposition: attachment; filename="' . $download['filename'] . '"');
  header('Content-Length: ' . strlen($download['content']));
  header('X-Content-Type-Options: nosniff');
  echo $download['content'];
  exit;
}

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/header.inc.php';
$js_minifier->add('/web/js/site/certificates.js');
$_SESSION['return_to'] = $_SERVER['REQUEST_URI'];

$role = "admin";

$template = 'certificates.twig';
$template_data = [
  'acl' => $_SESSION['acl'],
  'acl_json' => json_encode($_SESSION['acl']),
  'role' => $role,
  'lang_certificates' => json_encode($lang['certificates']),
  'lang_datatables' => json_encode($lang['datatables'])
];

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/footer.inc.php';
