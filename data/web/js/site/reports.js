jQuery(function($){
  // Everything shown here comes from reports sent by other mail servers, so
  // every value is escaped before it reaches the DOM.
  var charts = {};
  var text = $.fn.dataTable.render.text();

  function num(n) {
    return Number(n || 0).toLocaleString();
  }
  function pct(part, total) {
    total = Number(total || 0);
    return total > 0 ? (100 * Number(part || 0) / total).toFixed(1) + '%' : '-';
  }
  function badge(value) {
    var cls = value === 'pass' ? 'bg-success' : (value ? 'bg-danger' : 'bg-secondary');
    return '<span class="badge ' + cls + '">' + escapeHtml(value || '-') + '</span>';
  }
  function filter() {
    var days = $('#reports_days').val();
    var domain = $('#reports_domain').val();
    return encodeURIComponent(days) + (domain ? '/' + encodeURIComponent(domain) : '');
  }
  function tiles(target, items) {
    $(target).html(items.map(function(item) {
      return '<div class="col-6 col-md-4 col-xl-2"><div class="border rounded p-2 h-100">' +
        '<div class="text-muted small">' + escapeHtml(item[0]) + '</div>' +
        '<div class="fs-4' + (item[2] ? ' ' + item[2] : '') + '">' + escapeHtml(item[1]) + '</div></div></div>';
    }).join(''));
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
  function chart(id, series, sets) {
    if (charts[id]) {
      charts[id].destroy();
    }
    charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
      type: 'bar',
      data: {
        labels: series.map(function(row) { return row.day; }),
        datasets: sets.map(function(set) {
          return {label: set[0], backgroundColor: set[2], data: series.map(function(row) { return Number(row[set[1]]); })};
        })
      },
      options: {
        maintainAspectRatio: false,
        scales: {x: {stacked: true}, y: {stacked: true, beginAtZero: true}},
        plugins: {datalabels: {display: false}}
      }
    });
  }
  function number_col(title, key) {
    return {title: title, data: key, className: 'text-end', render: function(d, type) { return type === 'display' ? num(d) : Number(d); }};
  }

  function load_domains() {
    $.get('/api/v1/get/reports/domains', function(domains) {
      var current = $('#reports_domain').val();
      $('#reports_domain option:not(:first)').remove();
      (domains || []).forEach(function(domain) {
        $('#reports_domain').append($('<option/>').val(domain).text(domain));
      });
      $('#reports_domain').val(current).selectpicker('refresh');
    }, 'json');
  }

  function load_dmarc() {
    $.get('/api/v1/get/reports/dmarc/' + filter(), function(data) {
      var t = data.totals || {};
      var fail = Number(t.messages || 0) - Number(t.pass || 0);
      tiles('#dmarc_tiles', [
        [lang.messages, num(t.messages)],
        [lang.dmarc_pass, pct(t.pass, t.messages), 'text-success'],
        [lang.dmarc_fail, num(fail), fail > 0 ? 'text-danger' : ''],
        ['DKIM ' + lang.aligned, pct(t.dkim_pass, t.messages)],
        ['SPF ' + lang.aligned, pct(t.spf_pass, t.messages)],
        [lang.reports_from, num(t.reports) + ' / ' + num(t.reporters)]
      ]);
      chart('dmarc_chart', data.series || [], [[lang.pass, 'pass', '#198754'], [lang.fail, 'fail', '#dc3545']]);
      table('dmarc_domains', [
        {title: lang.domain, data: 'domain', render: text},
        {title: lang.policy, data: 'policy', render: text},
        number_col(lang.messages, 'messages'),
        {title: lang.dmarc_pass, data: null, className: 'text-end', render: function(r) { return pct(r.pass, r.messages); }}
      ], data.domains || [], [[2, 'desc']]);
      table('dmarc_sources', [
        {title: lang.source_ip, data: 'source_ip', render: text},
        {title: lang.header_from, data: 'header_from', render: text},
        number_col(lang.messages, 'messages'),
        {title: 'DMARC', data: null, className: 'text-end', render: function(r) { return pct(r.pass, r.messages); }},
        {title: 'DKIM', data: null, className: 'text-end', render: function(r) { return pct(r.dkim_pass, r.messages); }},
        {title: 'SPF', data: null, className: 'text-end', render: function(r) { return pct(r.spf_pass, r.messages); }},
        number_col(lang.enforced, 'enforced'),
        {title: lang.reporters, data: 'reporters', render: text}
      ], data.sources || [], [[2, 'desc']]);
      table('dmarc_reports', [
        {title: lang.reporter, data: 'org_name', render: text},
        {title: lang.domain, data: 'domain', render: text},
        {title: lang.period, data: null, render: function(r) { return escapeHtml(r.date_begin + ' - ' + r.date_end); }},
        number_col(lang.messages, 'messages'),
        number_col(lang.fail, 'fail'),
        {title: '', data: 'id', orderable: false, render: function(id) {
          return '<a href="#" class="btn btn-xs btn-secondary report-detail" data-kind="dmarc" data-id="' + escapeHtml(id) + '">' + escapeHtml(lang.details) + '</a>';
        }}
      ], data.reports || [], [[2, 'desc']]);
    }, 'json');
  }

  function load_tlsrpt() {
    $.get('/api/v1/get/reports/tlsrpt/' + filter(), function(data) {
      var t = data.totals || {};
      var total = Number(t.success || 0) + Number(t.failure || 0);
      tiles('#tlsrpt_tiles', [
        [lang.sessions, num(total)],
        [lang.tls_success, pct(t.success, total), 'text-success'],
        [lang.tls_failed, num(t.failure), Number(t.failure) > 0 ? 'text-danger' : ''],
        [lang.reports_from, num(t.reports) + ' / ' + num(t.reporters)]
      ]);
      chart('tlsrpt_chart', data.series || [], [[lang.tls_success, 'success', '#198754'], [lang.tls_failed, 'failure', '#dc3545']]);
      table('tlsrpt_domains', [
        {title: lang.domain, data: 'policy_domain', render: text},
        {title: lang.policy, data: 'policy_types', render: text},
        number_col(lang.tls_success, 'success'),
        number_col(lang.tls_failed, 'failure')
      ], data.domains || [], [[3, 'desc']]);
      table('tlsrpt_failures', [
        {title: lang.domain, data: 'policy_domain', render: text},
        {title: lang.result_type, data: 'result_type', render: text},
        {title: lang.receiving_mx, data: null, render: function(r) {
          return escapeHtml(r.receiving_mx_hostname || '-') + (r.receiving_ip ? '<br><small class="text-muted">' + escapeHtml(r.receiving_ip) + '</small>' : '');
        }},
        {title: lang.sending_mta, data: 'sending_mta_ip', render: text},
        number_col(lang.sessions, 'sessions'),
        {title: lang.reporters, data: 'reporters', render: text},
        {title: lang.additional_info, data: 'additional_info', render: text}
      ], data.failures || [], [[4, 'desc']]);
      table('tlsrpt_reports', [
        {title: lang.reporter, data: 'org_name', render: text},
        {title: lang.domain, data: 'domains', render: text},
        {title: lang.period, data: null, render: function(r) { return escapeHtml(r.date_begin + ' - ' + r.date_end); }},
        number_col(lang.tls_success, 'success'),
        number_col(lang.tls_failed, 'failure'),
        {title: '', data: 'id', orderable: false, render: function(id) {
          return '<a href="#" class="btn btn-xs btn-secondary report-detail" data-kind="tlsrpt" data-id="' + escapeHtml(id) + '">' + escapeHtml(lang.details) + '</a>';
        }}
      ], data.reports || [], [[2, 'desc']]);
    }, 'json');
  }

  function load_settings() {
    $.get('/api/v1/get/reports/settings', function(data) {
      var select = $('#reports_mailboxes').empty();
      (data.candidates || []).forEach(function(c) {
        var label = c.username + (c.pgp ? ' (' + lang.pgp_blocked + ')' : '');
        select.append($('<option/>').val(c.username).text(label).prop('disabled', c.pgp && !c.selected).prop('selected', c.selected));
      });
      select.selectpicker('refresh');
      $('#reports_retention').val(data.retention_days);
      $('#reports_no_mailbox').toggleClass('d-none', (data.mailboxes || []).length > 0);

      var status = data.status || {};
      $('#reports_last_run').text(status.last_run ? lang.last_run + ': ' + new Date(status.last_run * 1000).toLocaleString() : lang.never_run);
      var rows = (data.mailboxes || []).map(function(mailbox) {
        var s = (status.mailboxes || {})[mailbox];
        var state = s ? (lang['state_' + s.state] || s.state) : lang.state_pending;
        var cls = !s ? 'bg-secondary' : (s.state === 'ok' ? 'bg-success' : 'bg-danger');
        return '<tr><td>' + escapeHtml(mailbox) + '</td>' +
          '<td><span class="badge ' + cls + '">' + escapeHtml(state) + '</span></td>' +
          '<td>' + escapeHtml(((data.aliases || {})[mailbox] || []).join(', ') || '-') + '</td></tr>';
      });
      $('#reports_mailbox_status').html(rows.join('') || '<tr><td colspan="3" class="text-muted">-</td></tr>');
      var errors = (status.errors || []).slice().reverse().map(function(e) {
        return '<tr><td class="text-nowrap">' + escapeHtml(new Date(e.time * 1000).toLocaleString()) + '</td>' +
          '<td>' + escapeHtml(e.mailbox) + '</td>' +
          '<td>' + escapeHtml((e.folder || '') + (e.uid ? ' #' + e.uid : '')) + '</td>' +
          '<td><code>' + escapeHtml(e.error) + '</code></td></tr>';
      });
      $('#reports_errors').html(errors.join('') || '<tr><td colspan="4" class="text-muted">-</td></tr>');
    }, 'json');
  }

  function dmarc_detail(r) {
    var head = '<p>' + escapeHtml(lang.domain) + ': <b>' + escapeHtml(r.domain) + '</b> &middot; p=' + escapeHtml(r.policy_p || '-') +
      ' sp=' + escapeHtml(r.policy_sp || '-') + ' pct=' + escapeHtml(r.policy_pct === null ? '-' : r.policy_pct) +
      ' adkim=' + escapeHtml(r.policy_adkim || '-') + ' aspf=' + escapeHtml(r.policy_aspf || '-') + '<br>' +
      escapeHtml(lang.period) + ': ' + escapeHtml(r.date_begin + ' - ' + r.date_end + ' UTC') + ' &middot; ' +
      escapeHtml(r.email || '') + ' &middot; ID ' + escapeHtml(r.report_id) + '</p>';
    var rows = (r.records || []).map(function(c) {
      var auth = c.auth_results || {};
      var dkim = (auth.dkim || []).map(function(a) { return escapeHtml(a.domain + (a.selector ? ' (' + a.selector + ')' : '')) + ' ' + badge(a.result); }).join('<br>');
      var spf = (auth.spf || []).map(function(a) { return escapeHtml(a.domain) + ' ' + badge(a.result); }).join('<br>');
      return '<tr><td>' + escapeHtml(c.source_ip) + '</td><td class="text-end">' + num(c.count) + '</td>' +
        '<td>' + escapeHtml(c.header_from) + (c.envelope_from ? '<br><small class="text-muted">' + escapeHtml(c.envelope_from) + '</small>' : '') + '</td>' +
        '<td>' + badge(c.dkim_eval) + '</td><td>' + badge(c.spf_eval) + '</td>' +
        '<td>' + escapeHtml(c.disposition || '-') + (c.reason ? '<br><small class="text-muted">' + escapeHtml(c.reason) + '</small>' : '') + '</td>' +
        '<td>' + (dkim || '-') + '</td><td>' + (spf || '-') + '</td></tr>';
    }).join('');
    return head + '<div class="table-responsive"><table class="table table-sm"><thead><tr>' +
      ['source_ip', 'messages', 'header_from', 'DKIM', 'SPF', 'disposition', 'dkim_results', 'spf_results'].map(function(k) {
        return '<th>' + escapeHtml(lang[k] || k) + '</th>';
      }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function tlsrpt_detail(r) {
    var html = '<p>' + escapeHtml(lang.period) + ': ' + escapeHtml(r.date_begin + ' - ' + r.date_end + ' UTC') + ' &middot; ' +
      escapeHtml(r.contact || '') + ' &middot; ID ' + escapeHtml(r.report_id) + '</p>';
    (r.policies || []).forEach(function(p) {
      html += '<h6 class="mt-3">' + escapeHtml(p.policy_domain) + ' <span class="badge bg-secondary">' + escapeHtml(p.policy_type) + '</span></h6>' +
        '<p class="small mb-1">' + escapeHtml(lang.tls_success) + ': ' + num(p.success) + ' &middot; ' + escapeHtml(lang.tls_failed) + ': ' + num(p.failure) + '</p>';
      if ((p.policy_string || []).length) {
        html += '<pre class="small bg-light p-2">' + escapeHtml(p.policy_string.join('\n')) + '</pre>';
      }
      if ((p.failures || []).length) {
        html += '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>' + escapeHtml(lang.result_type) + '</th><th>' +
          escapeHtml(lang.receiving_mx) + '</th><th>' + escapeHtml(lang.sending_mta) + '</th><th>' + escapeHtml(lang.sessions) + '</th><th>' +
          escapeHtml(lang.additional_info) + '</th></tr></thead><tbody>' +
          p.failures.map(function(f) {
            return '<tr><td>' + escapeHtml(f.result_type) + (f.failure_reason_code ? '<br><small class="text-muted">' + escapeHtml(f.failure_reason_code) + '</small>' : '') + '</td>' +
              '<td>' + escapeHtml(f.receiving_mx_hostname || '-') + '<br><small class="text-muted">' + escapeHtml(f.receiving_ip || '') + '</small></td>' +
              '<td>' + escapeHtml(f.sending_mta_ip || '-') + '</td><td class="text-end">' + num(f.failed_sessions) + '</td>' +
              '<td>' + escapeHtml(f.additional_info || '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }
    });
    return html;
  }

  $(document).on('click', '.report-detail', function(e) {
    e.preventDefault();
    var kind = $(this).data('kind');
    $('#report_detail_title').text(lang.loading);
    $('#report_detail_body').empty();
    new bootstrap.Modal(document.getElementById('reportDetail')).show();
    $.get('/api/v1/get/reports/' + kind + '-report/' + encodeURIComponent($(this).data('id')), function(r) {
      $('#report_detail_title').text((kind === 'dmarc' ? 'DMARC' : 'TLS-RPT') + ' - ' + (r.org_name || ''));
      $('#report_detail_body').html(kind === 'dmarc' ? dmarc_detail(r) : tlsrpt_detail(r));
    }, 'json');
  });

  $('#reports_save').on('click', function(e) {
    e.preventDefault();
    $.ajax({
      type: 'POST',
      dataType: 'json',
      url: '/api/v1/edit/reports-settings',
      data: {
        items: JSON.stringify([]),
        attr: JSON.stringify({
          mailboxes: $('#reports_mailboxes').val() || [],
          retention_days: $('#reports_retention').val()
        }),
        csrf_token: csrf_token
      },
      // the result is shown by the page reload, like every other mailcow form
      complete: function() { window.location.reload(); }
    });
  });

  function refresh() {
    load_domains();
    load_dmarc();
    load_tlsrpt();
    load_settings();
  }
  $('#reports_refresh').on('click', function(e) { e.preventDefault(); refresh(); });
  $('#reports_days, #reports_domain').on('change', function() { load_dmarc(); load_tlsrpt(); });
  // DataTables cannot size columns inside a hidden tab
  $('button[data-bs-toggle="tab"]').on('shown.bs.tab', function() {
    $.fn.dataTable.tables({visible: true, api: true}).columns.adjust().responsive.recalc();
  });
  refresh();
});
