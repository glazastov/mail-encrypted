<?php

$GLOBALS['CAPTCHA_PROVIDERS'] = array(
  'hcaptcha' => array(
    'field'        => 'h-captcha-response',
    'verify'       => 'https://api.hcaptcha.com/siteverify',
    'script'       => 'https://js.hcaptcha.com/1/api.js',
    'widget_class' => 'h-captcha',
    'site_attr'    => 'data-sitekey',
  ),
  'recaptcha' => array(
    'field'        => 'g-recaptcha-response',
    'verify'       => 'https://www.google.com/recaptcha/api/siteverify',
    'script'       => 'https://www.google.com/recaptcha/api.js',
    'widget_class' => 'g-recaptcha',
    'site_attr'    => 'data-sitekey',
  ),
  'turnstile' => array(
    'field'        => 'cf-turnstile-response',
    'verify'       => 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    'script'       => 'https://challenges.cloudflare.com/turnstile/v0/api.js',
    'widget_class' => 'cf-turnstile',
    'site_attr'    => 'data-sitekey',
  ),
);

function captcha_settings($env = null) {
  $read = function ($name) use ($env) {
    $value = ($env === null) ? getenv($name) : (isset($env[$name]) ? $env[$name] : '');
    return is_string($value) ? trim($value) : '';
  };

  $provider = strtolower($read('CAPTCHA_PROVIDER'));
  $site_key = $read('CAPTCHA_SITE_KEY');
  $secret_key = $read('CAPTCHA_SECRET_KEY');

  $settings = array(
    'provider'     => $provider,
    'site_key'     => $site_key,
    'secret_key'   => $secret_key,
    'enabled'      => ($provider !== '' && $provider !== 'none'),
    'configured'   => true,
    'field'        => '',
    'verify'       => '',
    'script'       => '',
    'widget_class' => '',
    'site_attr'    => '',
  );

  if (!$settings['enabled']) {
    return $settings;
  }

  if (!isset($GLOBALS['CAPTCHA_PROVIDERS'][$provider])) {
    $settings['configured'] = false;
    return $settings;
  }

  $settings = array_merge($settings, $GLOBALS['CAPTCHA_PROVIDERS'][$provider]);
  $settings['configured'] = ($site_key !== '' && $secret_key !== '');
  return $settings;
}

function captcha_template_data($settings) {
  if (empty($settings['enabled']) || empty($settings['configured'])) {
    return null;
  }
  return array(
    'provider'     => $settings['provider'],
    'site_key'     => $settings['site_key'],
    'script'       => $settings['script'],
    'widget_class' => $settings['widget_class'],
    'site_attr'    => $settings['site_attr'],
  );
}

function captcha_post($url, $fields) {
  $ch = curl_init($url);
  curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query($fields),
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_USERAGENT      => 'mailcow-captcha',
  ));
  $body = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($body === false || $code !== 200) {
    return null;
  }
  return $body;
}

function captcha_verify($settings, $token, $remote_ip = null, $transport = null) {
  if (empty($settings['enabled'])) {
    return false;
  }
  if (empty($settings['configured']) || empty($settings['verify'])) {
    return false;
  }
  if (!is_string($token) || trim($token) === '') {
    return false;
  }

  $fields = array(
    'secret'   => $settings['secret_key'],
    'response' => $token,
  );
  if (is_string($remote_ip) && $remote_ip !== '') {
    $fields['remoteip'] = $remote_ip;
  }

  $send = is_callable($transport) ? $transport : 'captcha_post';

  try {
    $body = $send($settings['verify'], $fields);
  } catch (Throwable $error) {
    return false;
  }

  if (!is_string($body)) {
    return false;
  }

  $answer = json_decode($body, true);
  if (!is_array($answer) || !array_key_exists('success', $answer)) {
    return false;
  }

  return $answer['success'] === true;
}

function captcha_token($settings, $post) {
  if (empty($settings['field']) || !isset($post[$settings['field']])) {
    return '';
  }
  return is_string($post[$settings['field']]) ? $post[$settings['field']] : '';
}

function captcha_guard($settings, $post, $remote_ip) {
  if (empty($settings['enabled'])) {
    return true;
  }
  if (empty($settings['configured'])) {
    error_log('mailcow: CAPTCHA_PROVIDER is set but incomplete, refusing the request');
    return false;
  }
  return captcha_verify($settings, captcha_token($settings, $post), $remote_ip);
}
