#!/usr/bin/python3
"""Parse DMARC aggregate (rua) and SMTP TLS (TLS-RPT, RFC 8460) reports out of
the report mailboxes chosen in the admin UI and store them for the reports page.

Messages are read through doveadm and tagged with a keyword once handled, so
each run only looks at new mail. The mailboxes themselves are left untouched.
A mailbox with PGP storage is skipped: its messages are encrypted to the
user's key and cannot be read here, and the UI refuses to select one.
"""

import datetime
import email
import email.policy
import gzip
import io
import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

import MySQLdb
import redis

KEYWORD = '$MailcowReport'
# Reports are small; anything bigger after decompression is not one (or a bomb)
MAX_REPORT_SIZE = 50 * 1024 * 1024
MAX_ERRORS_KEPT = 20
DOVEADM_TIMEOUT = 120


def log(msg):
  print('%s - %s' % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg), flush=True)


def doveadm(*args):
  res = subprocess.run(['doveadm'] + list(args), capture_output=True, text=True,
    errors='replace', timeout=DOVEADM_TIMEOUT)
  if res.returncode != 0:
    raise RuntimeError('doveadm %s failed: %s' % (args[0], res.stderr.strip() or res.returncode))
  return res.stdout


def utc_from_epoch(value):
  return datetime.datetime.fromtimestamp(int(value), datetime.timezone.utc).replace(tzinfo=None)


def utc_from_iso(value):
  dt = datetime.datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))
  if dt.tzinfo is not None:
    dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
  return dt


def read_limited(fileobj):
  data = fileobj.read(MAX_REPORT_SIZE + 1)
  if len(data) > MAX_REPORT_SIZE:
    raise ValueError('report larger than %d bytes after decompression' % MAX_REPORT_SIZE)
  return data


def unpack(payload):
  """Return the report documents inside an attachment (zip, gzip or plain)."""
  if payload[:2] == b'PK':
    docs = []
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
      for info in zf.infolist():
        if info.is_dir():
          continue
        with zf.open(info) as f:
          docs.append(read_limited(f))
    return docs
  if payload[:2] == b'\x1f\x8b':
    with gzip.GzipFile(fileobj=io.BytesIO(payload)) as f:
      return [read_limited(f)]
  return [payload]


def local(tag):
  # DMARC 2.0 reports carry an XML namespace, 1.0 reports do not
  return tag.rsplit('}', 1)[-1]


def child(elem, name):
  if elem is None:
    return None
  for c in elem:
    if local(c.tag) == name:
      return c
  return None


def children(elem, name):
  if elem is None:
    return []
  return [c for c in elem if local(c.tag) == name]


def text(elem, *path, default=''):
  for name in path:
    elem = child(elem, name)
    if elem is None:
      return default
  return (elem.text or '').strip() or default


def parse_dmarc(doc):
  root = ET.fromstring(doc)
  if local(root.tag) != 'feedback':
    return None
  meta = child(root, 'report_metadata')
  policy = child(root, 'policy_published')
  pct = text(policy, 'pct')
  report = {
    'org_name': text(meta, 'org_name')[:191],
    'email': text(meta, 'email')[:255],
    'report_id': text(meta, 'report_id')[:191],
    'date_begin': utc_from_epoch(text(meta, 'date_range', 'begin', default='0')),
    'date_end': utc_from_epoch(text(meta, 'date_range', 'end', default='0')),
    'domain': text(policy, 'domain').lower()[:255],
    'adkim': text(policy, 'adkim')[:8],
    'aspf': text(policy, 'aspf')[:8],
    'p': text(policy, 'p')[:16],
    'sp': text(policy, 'sp')[:16],
    'pct': int(pct) if pct.isdigit() else None,
    'records': [],
  }
  if not report['org_name'] or not report['report_id'] or not report['domain']:
    raise ValueError('DMARC report without org_name, report_id or domain')
  for rec in children(root, 'record'):
    row = child(rec, 'row')
    evaluated = child(row, 'policy_evaluated')
    reasons = [text(r, 'type') for r in children(evaluated, 'reason')]
    auth = child(rec, 'auth_results')
    auth_results = {
      'dkim': [{'domain': text(a, 'domain'), 'selector': text(a, 'selector'), 'result': text(a, 'result')}
               for a in children(auth, 'dkim')],
      'spf': [{'domain': text(a, 'domain'), 'scope': text(a, 'scope'), 'result': text(a, 'result')}
              for a in children(auth, 'spf')],
    }
    count = text(row, 'count', default='0')
    report['records'].append({
      'source_ip': text(row, 'source_ip')[:45],
      'count': int(count) if count.isdigit() else 0,
      'disposition': text(evaluated, 'disposition')[:16],
      'dkim': text(evaluated, 'dkim')[:16],
      'spf': text(evaluated, 'spf')[:16],
      'reason': ','.join(r for r in reasons if r)[:255],
      'header_from': text(rec, 'identifiers', 'header_from').lower()[:255],
      'envelope_from': text(rec, 'identifiers', 'envelope_from').lower()[:255],
      'auth_results': json.dumps(auth_results),
    })
  return report


def parse_tlsrpt(doc):
  data = json.loads(doc)
  if not isinstance(data, dict) or 'policies' not in data:
    return None
  dates = data.get('date-range') or {}
  report = {
    'org_name': str(data.get('organization-name') or '')[:191],
    'report_id': str(data.get('report-id') or '')[:191],
    'contact': str(data.get('contact-info') or '')[:255],
    'date_begin': utc_from_iso(dates['start-datetime']),
    'date_end': utc_from_iso(dates['end-datetime']),
    'policies': [],
  }
  if not report['org_name'] or not report['report_id']:
    raise ValueError('TLS report without organization-name or report-id')
  for entry in data.get('policies') or []:
    pol = entry.get('policy') or {}
    summary = entry.get('summary') or {}
    report['policies'].append({
      'type': str(pol.get('policy-type') or '')[:32],
      'domain': str(pol.get('policy-domain') or '').lower()[:255],
      'string': json.dumps(pol.get('policy-string') or []),
      'mx_host': json.dumps(pol.get('mx-host') or []),
      'success': int(summary.get('total-successful-session-count') or 0),
      'failure': int(summary.get('total-failure-session-count') or 0),
      'failures': [{
        'result_type': str(f.get('result-type') or '')[:64],
        'sending_mta_ip': str(f.get('sending-mta-ip') or '')[:45],
        'receiving_mx_hostname': str(f.get('receiving-mx-hostname') or '').rstrip('.').lower()[:255],
        'receiving_ip': str(f.get('receiving-ip') or '')[:45],
        'failed_sessions': int(f.get('failed-session-count') or 0),
        'failure_reason_code': str(f.get('failure-reason-code') or '')[:255],
        'additional_info': str(f.get('additional-information') or ''),
      } for f in entry.get('failure-details') or []],
    })
  return report


def reports_in_message(raw):
  """Yield ('dmarc'|'tls', report) for every report attached to a message."""
  msg = email.message_from_string(raw, policy=email.policy.compat32)
  for part in msg.walk():
    if part.is_multipart():
      continue
    ctype = part.get_content_type()
    filename = (part.get_filename() or '').lower()
    if not (ctype.startswith('application/') or ctype in ('text/xml', 'text/json')
            or filename.endswith(('.xml', '.gz', '.zip', '.json'))):
      continue
    payload = part.get_payload(decode=True)
    if not payload:
      continue
    for doc in unpack(payload):
      head = doc.lstrip()[:1]
      if head == b'<':
        report = parse_dmarc(doc)
        if report:
          yield 'dmarc', report
      elif head == b'{':
        report = parse_tlsrpt(doc)
        if report:
          yield 'tls', report


def store_dmarc(cnx, report, mailbox):
  cur = cnx.cursor()
  cur.execute("""INSERT IGNORE INTO `dmarc_reports` (`org_name`, `email`, `report_id`, `domain`,
      `date_begin`, `date_end`, `policy_adkim`, `policy_aspf`, `policy_p`, `policy_sp`, `policy_pct`, `mailbox`)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
    (report['org_name'], report['email'], report['report_id'], report['domain'],
     report['date_begin'], report['date_end'], report['adkim'], report['aspf'],
     report['p'], report['sp'], report['pct'], mailbox))
  if cur.rowcount == 0:
    return False  # already stored, e.g. the same report sent to two mailboxes
  report_row = cur.lastrowid
  cur.executemany("""INSERT INTO `dmarc_records` (`report`, `source_ip`, `count`, `disposition`,
      `dkim_eval`, `spf_eval`, `reason`, `header_from`, `envelope_from`, `auth_results`)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
    [(report_row, r['source_ip'], r['count'], r['disposition'], r['dkim'], r['spf'],
      r['reason'], r['header_from'], r['envelope_from'], r['auth_results']) for r in report['records']])
  return True


def store_tls(cnx, report, mailbox):
  cur = cnx.cursor()
  cur.execute("""INSERT IGNORE INTO `tlsrpt_reports` (`org_name`, `report_id`, `contact`,
      `date_begin`, `date_end`, `mailbox`) VALUES (%s, %s, %s, %s, %s, %s)""",
    (report['org_name'], report['report_id'], report['contact'],
     report['date_begin'], report['date_end'], mailbox))
  if cur.rowcount == 0:
    return False
  report_row = cur.lastrowid
  for pol in report['policies']:
    cur.execute("""INSERT INTO `tlsrpt_policies` (`report`, `policy_type`, `policy_domain`,
        `policy_string`, `mx_host`, `success`, `failure`) VALUES (%s, %s, %s, %s, %s, %s, %s)""",
      (report_row, pol['type'], pol['domain'], pol['string'], pol['mx_host'], pol['success'], pol['failure']))
    policy_row = cur.lastrowid
    cur.executemany("""INSERT INTO `tlsrpt_failures` (`policy`, `result_type`, `sending_mta_ip`,
        `receiving_mx_hostname`, `receiving_ip`, `failed_sessions`, `failure_reason_code`, `additional_info`)
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
      [(policy_row, f['result_type'], f['sending_mta_ip'], f['receiving_mx_hostname'], f['receiving_ip'],
        f['failed_sessions'], f['failure_reason_code'], f['additional_info']) for f in pol['failures']])
  return True


def mailbox_state(cnx, username):
  """'ok', 'missing' or 'pgp' - the same rule the UI applies when saving."""
  cur = cnx.cursor()
  cur.execute("""SELECT JSON_VALUE(`m`.`attributes`, '$.pgp_storage_encrypt'), `d`.`pgp_storage`, `d`.`pgp_enforce`
    FROM `mailbox` `m` JOIN `domain` `d` ON `d`.`domain` = `m`.`domain`
    WHERE `m`.`username` = %s AND `m`.`kind` = ''""", (username,))
  row = cur.fetchone()
  if not row:
    return 'missing'
  pgp_mailbox, pgp_domain, enforce = row
  # Mirrors pgp_flag() and pgp_domain_enforces() in functions.mailbox.inc.php
  def flag(value):
    return value not in (None, '', '0', 0)
  enforced = flag(1 if pgp_domain is None else pgp_domain) and str(enforce or '').strip().lower() in ('domainadmin', 'admin')
  if flag(pgp_mailbox) or enforced:
    return 'pgp'
  return 'ok'


def process_mailbox(cnx, username, stats, errors):
  # Shared/ folders belong to other users and must not be read on their behalf
  listing = doveadm('-f', 'json', 'fetch', '-u', username, 'mailbox mailbox-guid uid',
    'mailbox', '*', 'NOT', 'KEYWORD', KEYWORD)
  for item in json.loads(listing or '[]'):
    if item.get('mailbox', '').startswith('Shared/'):
      continue
    guid, uid = item['mailbox-guid'], item['uid']
    try:
      fetched = json.loads(doveadm('-f', 'json', 'fetch', '-u', username, 'text',
        'mailbox-guid', guid, 'uid', str(uid)) or '[]')
      raw = fetched[0]['text'] if fetched else ''
      for kind, report in reports_in_message(raw):
        stored = store_dmarc(cnx, report, username) if kind == 'dmarc' else store_tls(cnx, report, username)
        cnx.commit()
        if stored:
          stats[kind] += 1
    except Exception as ex:
      cnx.rollback()
      stats['errors'] += 1
      errors.append({'time': int(time.time()), 'mailbox': username,
        'folder': item.get('mailbox', ''), 'uid': uid, 'error': str(ex)[:500]})
      log('%s %s/%s: %s' % (username, item.get('mailbox', ''), uid, ex))
    # Tagged even when it failed: a broken report would fail the same way
    # on every run, and the error stays visible on the reports page
    try:
      doveadm('flags', 'add', '-u', username, KEYWORD, 'mailbox-guid', guid, 'uid', str(uid))
    except Exception as ex:
      log('%s: cannot tag uid %s: %s' % (username, uid, ex))


def main():
  r = redis.StrictRedis(host='redis', decode_responses=True, port=6379, db=0,
    password=os.environ['REDISPASS'])
  cnx = MySQLdb.connect(user=os.environ.get('DBUSER'), password=os.environ.get('DBPASS'),
    database=os.environ.get('DBNAME'), charset='utf8mb4', collation='utf8mb4_general_ci')

  try:
    mailboxes = json.loads(r.get('REPORTS_MAILBOXES') or '[]')
  except ValueError:
    mailboxes = []
  try:
    retention = int(r.get('REPORTS_RETENTION_DAYS') or 180)
  except ValueError:
    retention = 180

  try:
    previous = json.loads(r.get('REPORTS_STATUS') or '{}')
  except ValueError:
    previous = {}
  errors = previous.get('errors', [])
  status = {'last_run': int(time.time()), 'mailboxes': {}}

  for username in mailboxes:
    stats = {'state': mailbox_state(cnx, username), 'dmarc': 0, 'tls': 0, 'errors': 0}
    status['mailboxes'][username] = stats
    if stats['state'] != 'ok':
      log('%s: skipped (%s)' % (username, stats['state']))
      continue
    try:
      process_mailbox(cnx, username, stats, errors)
    except Exception as ex:
      stats['state'] = 'error'
      stats['errors'] += 1
      errors.append({'time': int(time.time()), 'mailbox': username, 'folder': '', 'uid': '', 'error': str(ex)[:500]})
      log('%s: %s' % (username, ex))
    if stats['dmarc'] or stats['tls']:
      log('%s: %d DMARC and %d TLS reports stored' % (username, stats['dmarc'], stats['tls']))

  if retention > 0:
    cur = cnx.cursor()
    cur.execute("DELETE FROM `dmarc_reports` WHERE `date_end` < UTC_TIMESTAMP() - INTERVAL %s DAY", (retention,))
    cur.execute("DELETE FROM `tlsrpt_reports` WHERE `date_end` < UTC_TIMESTAMP() - INTERVAL %s DAY", (retention,))
    cnx.commit()

  status['errors'] = errors[-MAX_ERRORS_KEPT:]
  r.set('REPORTS_STATUS', json.dumps(status))
  cnx.close()


if __name__ == '__main__':
  try:
    main()
  except Exception as ex:
    log('report ingest failed: %s' % ex)
    sys.exit(1)
