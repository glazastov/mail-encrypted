<?php
// Quota lock: a mailbox whose quota is lowered below what it already stores is
// put in the read-only status (active 3) instead of the change being refused.
// attributes.quota_lock_from keeps the status it had, so it can be given back
// once the mailbox fits again, and tells Dovecot to apply acl-quota-locked,
// which still lets the owner delete mail to get there. A read-only status set
// by hand has no quota_lock_from and is never lifted here.

// Whether a mailbox storing $bytes has to be locked under a quota of $quota
// bytes. A quota of 0 is unlimited.
function quota_lock_exceeds($bytes, $quota) {
  return (int)$quota > 0 && (int)$bytes > (int)$quota;
}

// Locks, when $lock is set, the listed active mailboxes storing more than their
// quota, and gives every locked mailbox that fits again its status back. With
// $usernames null every mailbox is considered. Returns the usernames changed.
function quota_lock_sync($usernames = null, $lock = true) {
  global $pdo;

  $result = array('locked' => array(), 'unlocked' => array());
  if (is_array($usernames) && empty($usernames)) {
    return $result;
  }

  $filter = '';
  $params = array();
  if (is_array($usernames)) {
    $placeholders = array();
    foreach (array_values($usernames) as $i => $username) {
      $placeholders[] = ':username' . $i;
      $params[':username' . $i] = $username;
    }
    $filter = ' AND `mailbox`.`username` IN (' . implode(', ', $placeholders) . ')';
  }

  $stmt = $pdo->prepare("SELECT `mailbox`.`username`, `mailbox`.`active`, `mailbox`.`quota`,
      JSON_UNQUOTE(JSON_VALUE(`mailbox`.`attributes`, '$.quota_lock_from')) AS `quota_lock_from`,
      COALESCE(`quota2`.`bytes`, 0) AS `bytes`
    FROM `mailbox`
      LEFT JOIN `quota2` ON `quota2`.`username` = `mailbox`.`username`
    WHERE (`mailbox`.`kind` = '' OR `mailbox`.`kind` IS NULL)
      AND `mailbox`.`active` IN ('1', '3')" . $filter);
  $stmt->execute($params);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  foreach ($rows as $row) {
    $exceeds = quota_lock_exceeds($row['bytes'], $row['quota']);
    $locked = (string)$row['active'] === '3' && !empty($row['quota_lock_from']);

    if ($lock && $exceeds && (string)$row['active'] === '1') {
      // the status is repeated in the WHERE so a change made meanwhile wins
      $stmt = $pdo->prepare("UPDATE `mailbox` SET
          `active` = '3',
          `attributes` = JSON_SET(`attributes`, '$.quota_lock_from', '1')
        WHERE `username` = :username AND `active` = '1'");
      $stmt->execute(array(':username' => $row['username']));
      quota_lock_mirror_alias($row['username'], '3');
      $result['locked'][] = $row['username'];
    }
    elseif ($locked && !$exceeds) {
      $stmt = $pdo->prepare("UPDATE `mailbox` SET
          `active` = :active,
          `attributes` = JSON_REMOVE(`attributes`, '$.quota_lock_from')
        WHERE `username` = :username AND `active` = '3'");
      $stmt->execute(array(':active' => $row['quota_lock_from'], ':username' => $row['username']));
      quota_lock_mirror_alias($row['username'], $row['quota_lock_from']);
      $result['unlocked'][] = $row['username'];
    }
  }

  return $result;
}

// The mailbox's own alias row follows its status, as mailbox edits do.
function quota_lock_mirror_alias($username, $active) {
  global $pdo;

  $stmt = $pdo->prepare("UPDATE `alias` SET `active` = :active WHERE `address` = :address");
  $stmt->execute(array(':active' => $active, ':address' => $username));
}

// Reports the mailboxes a quota change locked or unlocked to whoever made it.
function quota_lock_report($result, $log) {
  if (!empty($result['locked'])) {
    $_SESSION['return'][] = array(
      'type' => 'warning',
      'log' => $log,
      'msg' => array('mailbox_quota_locked', htmlspecialchars(implode(', ', $result['locked'])))
    );
  }
  if (!empty($result['unlocked'])) {
    $_SESSION['return'][] = array(
      'type' => 'success',
      'log' => $log,
      'msg' => array('mailbox_quota_unlocked', htmlspecialchars(implode(', ', $result['unlocked'])))
    );
  }
}
