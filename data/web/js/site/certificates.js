jQuery(function($){
  // The certificates acme-mailcow manages. Domain names and the output of the
  // ACME client come from outside, so every value is escaped on its way in.
  var text = $.fn.dataTable.render.text();
  var certificates = [];

  function when(ts) {
    return ts ? new Date(ts * 1000).toLocaleString() : '-';
  }
  // The shortlived profile issues 6 day certificates, so a window counted in
  // days alone would read "0 days" for most of their life
  function duration(seconds) {
    seconds = Math.abs(Number(seconds || 0));
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    if (days >= 2) {
      return days + ' ' + lang.days;
    }
    // under two days, hours alone read better than "1 days 3 hours"
    if (seconds >= 3600) {
      return Math.floor(seconds / 3600) + ' ' + lang.hours;
    }
    return Math.floor(seconds / 60) + ' ' + lang.minutes;
  }
  function left(seconds) {
    if (seconds === null || seconds === undefined) {
      return '-';
    }
    return Number(seconds) <= 0 ? lang.expired_ago.replace('%s', duration(seconds))
                                : lang.expires_in.replace('%s', duration(seconds));
  }
  function state_badge(state) {
    var map = {ok: 'bg-success', expiring: 'bg-warning text-dark', expired: 'bg-danger', failed: 'bg-danger'};
    return '<span class="badge ' + (map[state] || 'bg-secondary') + '">' +
      escapeHtml(lang['state_' + state] || state) + '</span>';
  }
  function challenge_badge(challenge) {
    if (!challenge) {
      return '<span class="text-muted">-</span>';
    }
    return '<span class="badge bg-light text-dark border">' +
      escapeHtml(challenge === 'dns' ? lang.challenge_dns : lang.challenge_http) + '</span>';
  }
  function domain_list(domains) {
    if (!domains || !domains.length) {
      return '<span class="text-muted">-</span>';
    }
    return domains.map(function(domain) {
      return '<span class="badge bg-light text-dark border me-1">' + escapeHtml(domain) + '</span>';
    }).join('');
  }
  function table(id, columns, data, order) {
    if ($.fn.DataTable.isDataTable('#' + id)) {
      $('#' + id).DataTable().clear().rows.add(data).draw();
      return;
    }
    $('#' + id).DataTable({
      responsive: true,
      data: data,
      columns: columns,
      order: order || [],
      pageLength: pagination_size,
      language: lang_datatables,
      dom: "<'row'<'col-sm-12 col-md-6'f><'col-sm-12 col-md-6'l>>" +
           "tr" +
           "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>"
    });
  }
  function tiles(items) {
    $('#certificates_tiles').html(items.map(function(item) {
      return '<div class="col-6 col-md-4 col-xl-2"><div class="border rounded p-2 h-100">' +
        '<div class="text-muted small">' + escapeHtml(item[0]) + '</div>' +
        '<div class="fs-4' + (item[2] ? ' ' + item[2] : '') + '">' + escapeHtml(item[1]) + '</div></div></div>';
    }).join(''));
  }
  // The files a download may ask for. The private key is deliberately not one
  // of them, and the server refuses it too.
  function downloads(name) {
    var items = [['cert', lang.download_cert], ['leaf', lang.download_leaf],
                 ['chain', lang.download_chain], ['csr', lang.download_csr]];
    return '<div class="dropdown"><button class="btn btn-xs btn-secondary dropdown-toggle" data-bs-toggle="dropdown">' +
      '<i class="bi bi-download"></i> ' + escapeHtml(lang.download) + '</button><ul class="dropdown-menu">' +
      items.map(function(item) {
        return '<li><a class="dropdown-item" href="/admin/certificates?download=' + encodeURIComponent(item[0]) +
          '&name=' + encodeURIComponent(name) + '">' + escapeHtml(item[1]) + '</a></li>';
      }).join('') +
      '<li><hr class="dropdown-divider"></li>' +
      '<li><span class="dropdown-item-text text-muted small">' + escapeHtml(lang.no_key_download) + '</span></li>' +
      '</ul></div>';
  }

  function load_status() {
    $.get('/api/v1/get/certificates/status', function(status) {
      var config = status.config || {};
      $('#certificates_no_record').toggleClass('d-none', !!status.has_record);
      $('#certificates_renew_pending').toggleClass('d-none', !status.renew_pending);
      if (status.errors) {
        $('#certificates_errors').removeClass('d-none').text(lang.errors_present);
      }
      else {
        $('#certificates_errors').addClass('d-none');
      }
      var challenge = config.challenge === 'y' ? lang.challenge_dns
        : (config.challenge === 'auto' ? lang.challenge_auto : lang.challenge_http);
      var profile = config.profile || lang.profile_ca_default;
      var parts = [
        lang.hostname + ': ' + (config.hostname || '-'),
        lang.challenge + ': ' + challenge + (config.dns_provider ? ' (' + config.dns_provider + ')' : ''),
        lang.profile + ': ' + profile,
        lang.renew_window + ': ' + duration(config.renew_before) + ', ' + lang.check_interval + ' ' + (config.check_interval || '-'),
        lang.last_run + ': ' + (status.finished ? when(status.finished) : lang.never_run)
      ];
      if (config.additional_san) {
        parts.push(lang.additional_san + ': ' + config.additional_san);
      }
      if (config.staging === 'y') {
        parts.push(lang.staging);
      }
      if (config.mail_certs === 'n') {
        parts.push(lang.mail_certs_off);
      }
      $('#certificates_config').text(parts.join(' · '));
    }, 'json');
  }

  function load_certificates() {
    $.get('/api/v1/get/certificates/all', function(data) {
      certificates = data || [];
      var failed = certificates.filter(function(c) { return c.state === 'failed'; }).length;
      var soon = certificates.filter(function(c) { return c.state === 'expiring' || c.state === 'expired'; }).length;
      var next = certificates.reduce(function(min, c) {
        return (c.seconds_left !== null && (min === null || c.seconds_left < min)) ? c.seconds_left : min;
      }, null);
      tiles([
        [lang.certificates, String(certificates.length)],
        [lang.state_failed, String(failed), failed ? 'text-danger' : ''],
        [lang.renewal_due, String(soon), soon ? 'text-warning' : ''],
        [lang.next_expiry, next === null ? '-' : duration(next), (next !== null && next <= 0) ? 'text-danger' : '']
      ]);
      table('certificates_table', [
        {title: lang.certificate, data: 'name', render: function(name, type, row) {
          if (type !== 'display') {
            return name;
          }
          return escapeHtml(name) + (row.deployed ?
            ' <span class="badge bg-primary" title="' + escapeHtml(lang.deployed_info) + '">' + escapeHtml(lang.deployed) + '</span>' : '');
        }},
        {title: lang.domains, data: 'san', orderable: false, render: function(san, type) {
          return type === 'display' ? domain_list(san) : (san || []).join(' ');
        }},
        {title: lang.state, data: 'state', render: function(state, type, row) {
          if (type !== 'display') {
            return state;
          }
          var html = state_badge(state);
          if (row.missing_san && row.missing_san.length) {
            html += ' <span class="badge bg-warning text-dark" title="' + escapeHtml(lang.missing_san_info) + '">' +
              escapeHtml(lang.missing_san) + '</span>';
          }
          return html;
        }},
        {title: lang.valid_until, data: 'not_after', render: function(ts, type, row) {
          if (type !== 'display') {
            return Number(ts || 0);
          }
          return escapeHtml(when(ts)) + '<br><small class="text-muted">' + escapeHtml(left(row.seconds_left)) + '</small>';
        }},
        {title: lang.issuer, data: 'issuer', render: text},
        {title: '', data: null, orderable: false, className: 'text-end text-nowrap', render: function(row) {
          return '<div class="d-flex gap-1 justify-content-end">' +
            '<a href="#" class="btn btn-xs btn-secondary certificate-detail" data-name="' + escapeHtml(row.name) + '">' +
            escapeHtml(lang.details) + '</a>' + downloads(row.name) + '</div>';
        }}
      ], certificates, [[3, 'asc']]);
    }, 'json');
  }

  function load_missing() {
    $.get('/api/v1/get/certificates/missing', function(data) {
      data = data || [];
      $('#not_issued_count').toggleClass('d-none', !data.length).text(data.length);
      table('not_issued_table', [
        {title: lang.domain, data: 'domain', render: text},
        {title: lang.state, data: 'kind', render: function(kind, type) {
          if (type !== 'display') {
            return kind;
          }
          return '<span class="badge ' + (kind === 'failed' ? 'bg-danger' : 'bg-secondary') + '">' +
            escapeHtml(kind === 'failed' ? lang.kind_failed : lang.kind_skipped) + '</span>';
        }},
        {title: lang.challenge, data: 'challenge', orderable: false, render: function(challenge, type) {
          return type === 'display' ? challenge_badge(challenge) : (challenge || '');
        }},
        {title: lang.reason, data: 'reason', render: function(reason, type) {
          return type === 'display' ? '<span class="text-danger">' + escapeHtml(reason || '-') + '</span>' : (reason || '');
        }},
        {title: lang.covered_by, data: 'covered_by', render: function(name, type) {
          if (type !== 'display') {
            return name || '';
          }
          return name ? '<span class="badge bg-success">' + escapeHtml(name) + '</span>'
                      : '<span class="badge bg-danger">' + escapeHtml(lang.not_covered) + '</span>';
        }},
        {title: lang.time, data: 'time', render: function(ts, type) {
          return type === 'display' ? escapeHtml(when(ts)) : Number(ts || 0);
        }}
      ], data, [[4, 'asc']]);
    }, 'json');
  }

  function load_backups() {
    $.get('/api/v1/get/certificates/backups', function(data) {
      table('archived_table', [
        {title: lang.certificate, data: 'name', render: text},
        {title: lang.domains, data: 'san', orderable: false, render: function(san, type) {
          return type === 'display' ? domain_list(san) : (san || []).join(' ');
        }},
        {title: lang.archived_at, data: 'archived_time', render: function(ts, type, row) {
          return type === 'display' ? escapeHtml(when(ts) || row.archived) : Number(ts || 0);
        }},
        {title: lang.valid_until, data: 'not_after', render: function(ts, type, row) {
          if (type !== 'display') {
            return Number(ts || 0);
          }
          return escapeHtml(when(ts)) + (row.expired ? ' <span class="badge bg-secondary">' + escapeHtml(lang.state_expired) + '</span>' : '');
        }},
        {title: lang.serial, data: 'serial', render: text}
      ], data || [], [[2, 'desc']]);
    }, 'json');
  }

  function load_log() {
    $.get('/api/v1/get/certificates/log/200', function(data) {
      table('certificates_log_table', [
        {title: lang.time, data: 'time', className: 'text-nowrap', render: function(ts, type) {
          return type === 'display' ? escapeHtml(when(ts)) : Number(ts || 0);
        }},
        {title: lang.message, data: 'message', render: text}
      ], data || [], []);
    }, 'json');
  }

  // Everything the table cannot show: the per-domain outcome, which is the only
  // place that says which domain of a multi-domain certificate failed and why
  function detail(certificate) {
    var acme = certificate.acme || {};
    var rows = [
      [lang.subject, certificate.subject],
      [lang.issuer, (certificate.issuer || '') + (certificate.issuer_org ? ' (' + certificate.issuer_org + ')' : '')],
      [lang.serial, certificate.serial],
      [lang.fingerprint, certificate.fingerprint],
      [lang.key, (certificate.key_type || '') + ' ' + (certificate.key_bits || '') + ' bit, ' + (certificate.sig_alg || '')],
      [lang.chain, certificate.chain_length + ' ' + lang.chain_certificates],
      [lang.valid_from, when(certificate.not_before)],
      [lang.valid_until, when(certificate.not_after) + ' (' + left(certificate.seconds_left) + ')'],
      [lang.modified, when(certificate.modified)],
      [lang.requested_domains, (certificate.requested || []).join(', ') || '-']
    ];
    if (acme.failing_since) {
      rows.push([lang.failing_since, when(acme.failing_since) + ' (' + duration((Date.now() / 1000) - acme.failing_since) + ')']);
    }
    if (acme.error) {
      rows.push([lang.last_error, acme.error]);
    }
    var html = '<dl class="row mb-3">' + rows.map(function(row) {
      return '<dt class="col-sm-3 text-muted fw-normal">' + escapeHtml(row[0]) + '</dt>' +
        '<dd class="col-sm-9">' + escapeHtml(row[1] === null || row[1] === undefined ? '-' : String(row[1])) + '</dd>';
    }).join('') + '</dl>';

    if (certificate.missing_san && certificate.missing_san.length) {
      html += '<div class="alert alert-warning"><b>' + escapeHtml(lang.missing_san) + '</b>: ' +
        escapeHtml(certificate.missing_san.join(', ')) + '<br><small>' + escapeHtml(lang.missing_san_info) + '</small></div>';
    }

    html += '<h6>' + escapeHtml(lang.per_domain) + '</h6>';
    if ((acme.domains || []).length) {
      html += '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>' + escapeHtml(lang.domain) +
        '</th><th>' + escapeHtml(lang.challenge) + '</th><th>' + escapeHtml(lang.result) + '</th></tr></thead><tbody>' +
        acme.domains.map(function(domain) {
          var outcome;
          if (domain.error) {
            outcome = '<span class="text-danger">' + escapeHtml(domain.error) + '</span>';
          }
          else if (domain.diagnosis) {
            // the client did not name this domain, so this is what the checks found
            outcome = '<span class="text-warning-emphasis">' + escapeHtml(domain.diagnosis) +
              '</span> <span class="badge bg-light text-dark border">' + escapeHtml(lang.diagnosed) + '</span>';
          }
          else {
            outcome = '<span class="text-success">' + escapeHtml(lang.domain_ok) + '</span>';
          }
          return '<tr><td>' + escapeHtml(domain.domain) + '</td><td>' + challenge_badge(domain.challenge) +
            '</td><td>' + outcome + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    else {
      html += '<p class="text-muted">' + escapeHtml(lang.no_acme_record) + '</p>';
    }

    if (acme.output) {
      html += '<h6 class="mt-3">' + escapeHtml(lang.client_output) + '</h6>' +
        '<pre class="small bg-light p-2" style="max-height: 20rem; overflow: auto;">' + escapeHtml(acme.output) + '</pre>';
    }
    return html;
  }

  $(document).on('click', '.certificate-detail', function(e) {
    e.preventDefault();
    var name = $(this).data('name');
    var certificate = certificates.filter(function(c) { return c.name === name; })[0];
    if (!certificate) {
      return;
    }
    $('#certificate_detail_title').text(name);
    $('#certificate_detail_body').html(detail(certificate));
    new bootstrap.Modal(document.getElementById('certificateDetail')).show();
  });

  $('#certificates_renew').on('click', function(e) {
    e.preventDefault();
    if (!confirm(lang.renew_confirm)) {
      return;
    }
    $.ajax({
      type: 'POST',
      dataType: 'json',
      url: '/api/v1/edit/certificates-renew',
      data: {items: JSON.stringify([]), attr: JSON.stringify({}), csrf_token: csrf_token},
      // the result is shown by the page reload, like every other mailcow form
      complete: function() { window.location.reload(); }
    });
  });

  function refresh() {
    load_status();
    load_certificates();
    load_missing();
    load_backups();
    load_log();
  }
  $('#certificates_refresh').on('click', function(e) { e.preventDefault(); refresh(); });
  // DataTables cannot size columns inside a hidden tab
  $('button[data-bs-toggle="tab"]').on('shown.bs.tab', function() {
    $.fn.dataTable.tables({visible: true, api: true}).columns.adjust().responsive.recalc();
  });
  refresh();
});
