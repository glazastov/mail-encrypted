<?php

require_once __DIR__ . '/../../../data/web/inc/functions.captcha.inc.php';

$failures = 0;
$checks = 0;

function check($name, $actual, $expected) {
  global $failures, $checks;
  $checks++;
  if ($actual === $expected) {
    return;
  }
  $failures++;
  fwrite(STDERR, sprintf(
    "FAIL %s\n  expected: %s\n  actual:   %s\n",
    $name,
    var_export($expected, true),
    var_export($actual, true)
  ));
}

function settings($provider, $site = 'site', $secret = 'secret') {
  return captcha_settings(array(
    'CAPTCHA_PROVIDER'   => $provider,
    'CAPTCHA_SITE_KEY'   => $site,
    'CAPTCHA_SECRET_KEY' => $secret,
  ));
}

function recorder($body) {
  $calls = new ArrayObject();
  $transport = function ($url, $fields) use ($calls, $body) {
    $calls[] = array('url' => $url, 'fields' => $fields);
    return $body;
  };
  return array($transport, $calls);
}

$providers = array(
  'hcaptcha' => array(
    'field'  => 'h-captcha-response',
    'verify' => 'https://api.hcaptcha.com/siteverify',
    'script' => 'https://js.hcaptcha.com/1/api.js',
    'class'  => 'h-captcha',
  ),
  'recaptcha' => array(
    'field'  => 'g-recaptcha-response',
    'verify' => 'https://www.google.com/recaptcha/api/siteverify',
    'script' => 'https://www.google.com/recaptcha/api.js',
    'class'  => 'g-recaptcha',
  ),
  'turnstile' => array(
    'field'  => 'cf-turnstile-response',
    'verify' => 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    'script' => 'https://challenges.cloudflare.com/turnstile/v0/api.js',
    'class'  => 'cf-turnstile',
  ),
);

foreach ($providers as $provider => $expected) {
  $config = settings($provider);

  check("$provider is enabled", $config['enabled'], true);
  check("$provider is configured", $config['configured'], true);
  check("$provider response field", $config['field'], $expected['field']);
  check("$provider script url", $config['script'], $expected['script']);
  check("$provider widget class", $config['widget_class'], $expected['class']);

  list($transport, $calls) = recorder('{"success":true}');
  check(
    "$provider accepts a valid token",
    captcha_verify($config, 'token-value', '198.51.100.7', $transport),
    true
  );
  check("$provider calls its own endpoint", $calls[0]['url'], $expected['verify']);
  check("$provider sends the secret", $calls[0]['fields']['secret'], 'secret');
  check("$provider sends the token", $calls[0]['fields']['response'], 'token-value');
  check("$provider sends the client ip", $calls[0]['fields']['remoteip'], '198.51.100.7');

  list($transport, $calls) = recorder('{"success":false,"error-codes":["invalid-input-response"]}');
  check(
    "$provider rejects a refused token",
    captcha_verify($config, 'token-value', null, $transport),
    false
  );
}

$disabled = settings('');
check('empty provider disables the captcha', $disabled['enabled'], false);
check('empty provider is not a misconfiguration', $disabled['configured'], true);

$none = settings('none');
check('provider none disables the captcha', $none['enabled'], false);

$unknown = settings('funcaptcha');
check('unknown provider stays enabled', $unknown['enabled'], true);
check('unknown provider is a misconfiguration', $unknown['configured'], false);
list($transport, $calls) = recorder('{"success":true}');
check(
  'unknown provider never passes',
  captcha_verify($unknown, 'token-value', null, $transport),
  false
);
check('unknown provider makes no request', count($calls), 0);

$noSecret = settings('turnstile', 'site', '');
check('a missing secret is a misconfiguration', $noSecret['configured'], false);
list($transport, $calls) = recorder('{"success":true}');
check(
  'a missing secret never passes',
  captcha_verify($noSecret, 'token-value', null, $transport),
  false
);
check('a missing secret makes no request', count($calls), 0);

$noSite = settings('turnstile', '', 'secret');
check('a missing site key is a misconfiguration', $noSite['configured'], false);

$config = settings('turnstile');

list($transport, $calls) = recorder('{"success":true}');
check('an empty token is refused', captcha_verify($config, '', null, $transport), false);
check('an empty token makes no request', count($calls), 0);

list($transport, $calls) = recorder(null);
check(
  'an unreachable provider fails closed',
  captcha_verify($config, 'token-value', null, $transport),
  false
);

list($transport, $calls) = recorder('not json at all');
check(
  'a malformed answer fails closed',
  captcha_verify($config, 'token-value', null, $transport),
  false
);

list($transport, $calls) = recorder('{"error-codes":["timeout-or-duplicate"]}');
check(
  'an answer without success fails closed',
  captcha_verify($config, 'token-value', null, $transport),
  false
);

list($transport, $calls) = recorder('{"success":"true"}');
check(
  'a non boolean success fails closed',
  captcha_verify($config, 'token-value', null, $transport),
  false
);

$throwing = function ($url, $fields) {
  throw new RuntimeException('network down');
};
check(
  'a transport that throws fails closed',
  captcha_verify($config, 'token-value', null, $throwing),
  false
);

list($transport, $calls) = recorder('{"success":true}');
captcha_verify($config, 'token-value', '', $transport);
check('an empty ip is not sent', isset($calls[0]['fields']['remoteip']), false);

$fromEnv = captcha_settings(array('CAPTCHA_PROVIDER' => 'HCaptcha ', 'CAPTCHA_SITE_KEY' => ' s ', 'CAPTCHA_SECRET_KEY' => ' k '));
check('the provider name is normalised', $fromEnv['provider'], 'hcaptcha');
check('the site key is trimmed', $fromEnv['site_key'], 's');
check('the secret key is trimmed', $fromEnv['secret_key'], 'k');

check('the secret never reaches the template data', isset(captcha_template_data($config)['secret_key']), false);
check('the template data carries the site key', captcha_template_data($config)['site_key'], 'site');
check('a disabled captcha has no template data', captcha_template_data($disabled), null);

printf("%d checks, %d failures\n", $checks, $failures);
exit($failures === 0 ? 0 : 1);
