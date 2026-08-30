(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  var STORAGE_PREFIX = "mailcow.pgp.key.";
  var ROUTE = /#\/Mail\/([^/]+)\/([^/]+)\/(\d+)/;

  var LABELS = {
    en: {
      unlock: "Unlock PGP",
      locked: "PGP locked",
      unlocked: "PGP unlocked",
      title: "Your OpenPGP private key",
      keyLabel: "Private key",
      passphrase: "Passphrase",
      remember: "Keep this key in this browser",
      rememberHint:
        "Stored only in this browser and never sent to the server. Anyone with access to this browser profile can read it.",
      unlockButton: "Unlock",
      cancel: "Cancel",
      forget: "Forget key",
      close: "Close",
      working: "Decrypting…",
      attachments: "Attachments",
      noSubject: "(no subject)",
      "bad-key": "That is not a usable OpenPGP private key.",
      "bad-passphrase": "Wrong passphrase.",
      "no-key": "Unlock your private key first.",
      "not-encrypted": "This message is not encrypted.",
      "no-matching-key": "This message is not encrypted to any key you hold.",
      "decrypt-failed": "This message could not be decrypted.",
      "parse-failed": "The decrypted content could not be read.",
      "fetch-failed": "The message could not be loaded from the server."
    },
    "pt-br": {
      unlock: "Desbloquear PGP",
      locked: "PGP bloqueado",
      unlocked: "PGP desbloqueado",
      title: "Sua chave privada OpenPGP",
      keyLabel: "Chave privada",
      passphrase: "Senha da chave",
      remember: "Manter esta chave neste navegador",
      rememberHint:
        "Guardada apenas neste navegador e nunca enviada ao servidor. Quem tiver acesso a este perfil do navegador pode lê-la.",
      unlockButton: "Desbloquear",
      cancel: "Cancelar",
      forget: "Esquecer chave",
      close: "Fechar",
      working: "Descriptografando…",
      attachments: "Anexos",
      noSubject: "(sem assunto)",
      "bad-key": "Isto não é uma chave privada OpenPGP utilizável.",
      "bad-passphrase": "Senha incorreta.",
      "no-key": "Desbloqueie sua chave privada primeiro.",
      "not-encrypted": "Esta mensagem não está criptografada.",
      "no-matching-key": "Esta mensagem não foi criptografada para nenhuma chave sua.",
      "decrypt-failed": "Não foi possível descriptografar esta mensagem.",
      "parse-failed": "Não foi possível ler o conteúdo descriptografado.",
      "fetch-failed": "Não foi possível carregar a mensagem do servidor."
    },
    "pt-pt": {
      unlock: "Desbloquear PGP",
      locked: "PGP bloqueado",
      unlocked: "PGP desbloqueado",
      title: "A sua chave privada OpenPGP",
      keyLabel: "Chave privada",
      passphrase: "Frase-passe",
      remember: "Manter esta chave neste browser",
      rememberHint:
        "Guardada apenas neste browser e nunca enviada para o servidor. Quem tiver acesso a este perfil do browser pode lê-la.",
      unlockButton: "Desbloquear",
      cancel: "Cancelar",
      forget: "Esquecer chave",
      close: "Fechar",
      working: "A decifrar…",
      attachments: "Anexos",
      noSubject: "(sem assunto)",
      "bad-key": "Isto não é uma chave privada OpenPGP utilizável.",
      "bad-passphrase": "Frase-passe incorreta.",
      "no-key": "Desbloqueie primeiro a sua chave privada.",
      "not-encrypted": "Esta mensagem não está cifrada.",
      "no-matching-key": "Esta mensagem não foi cifrada para nenhuma chave sua.",
      "decrypt-failed": "Não foi possível decifrar esta mensagem.",
      "parse-failed": "Não foi possível ler o conteúdo decifrado.",
      "fetch-failed": "Não foi possível carregar a mensagem do servidor."
    },
    de: {
      unlock: "PGP entsperren",
      locked: "PGP gesperrt",
      unlocked: "PGP entsperrt",
      title: "Ihr privater OpenPGP-Schlüssel",
      keyLabel: "Privater Schlüssel",
      passphrase: "Passphrase",
      remember: "Diesen Schlüssel in diesem Browser behalten",
      rememberHint:
        "Nur in diesem Browser gespeichert und niemals an den Server gesendet. Wer Zugriff auf dieses Browserprofil hat, kann ihn lesen.",
      unlockButton: "Entsperren",
      cancel: "Abbrechen",
      forget: "Schlüssel verwerfen",
      close: "Schließen",
      working: "Wird entschlüsselt…",
      attachments: "Anhänge",
      noSubject: "(kein Betreff)",
      "bad-key": "Das ist kein verwendbarer privater OpenPGP-Schlüssel.",
      "bad-passphrase": "Falsche Passphrase.",
      "no-key": "Entsperren Sie zuerst Ihren privaten Schlüssel.",
      "not-encrypted": "Diese Nachricht ist nicht verschlüsselt.",
      "no-matching-key": "Diese Nachricht ist für keinen Ihrer Schlüssel verschlüsselt.",
      "decrypt-failed": "Diese Nachricht konnte nicht entschlüsselt werden.",
      "parse-failed": "Der entschlüsselte Inhalt konnte nicht gelesen werden.",
      "fetch-failed": "Die Nachricht konnte nicht vom Server geladen werden."
    },
    ru: {
      unlock: "Разблокировать PGP",
      locked: "PGP заблокирован",
      unlocked: "PGP разблокирован",
      title: "Ваш закрытый ключ OpenPGP",
      keyLabel: "Закрытый ключ",
      passphrase: "Пароль ключа",
      remember: "Сохранить ключ в этом браузере",
      rememberHint:
        "Хранится только в этом браузере и никогда не отправляется на сервер. Любой, у кого есть доступ к этому профилю браузера, сможет его прочитать.",
      unlockButton: "Разблокировать",
      cancel: "Отмена",
      forget: "Забыть ключ",
      close: "Закрыть",
      working: "Расшифровка…",
      attachments: "Вложения",
      noSubject: "(без темы)",
      "bad-key": "Это не пригодный закрытый ключ OpenPGP.",
      "bad-passphrase": "Неверный пароль.",
      "no-key": "Сначала разблокируйте закрытый ключ.",
      "not-encrypted": "Это сообщение не зашифровано.",
      "no-matching-key": "Это сообщение зашифровано не для ваших ключей.",
      "decrypt-failed": "Не удалось расшифровать сообщение.",
      "parse-failed": "Не удалось прочитать расшифрованное содержимое.",
      "fetch-failed": "Не удалось загрузить сообщение с сервера."
    }
  };

  var STYLE = [
    "#mailcow-pgp-button{position:fixed;right:18px;bottom:18px;z-index:120;border:0;border-radius:24px;",
    "padding:10px 18px;font:600 13px/1.2 sans-serif;color:#fff;background:#616161;cursor:pointer;",
    "box-shadow:0 2px 6px rgba(0,0,0,.35)}",
    "#mailcow-pgp-button[data-state=unlocked]{background:#2e7d32}",
    "#mailcow-pgp-overlay{position:fixed;inset:0;z-index:130;background:rgba(0,0,0,.45);display:flex;",
    "align-items:center;justify-content:center}",
    "#mailcow-pgp-overlay .mailcow-pgp-panel{background:#fff;color:#212121;width:min(880px,94vw);",
    "max-height:92vh;display:flex;flex-direction:column;border-radius:6px;overflow:hidden;",
    "font:14px/1.5 sans-serif}",
    ".mailcow-pgp-panel header{padding:14px 18px;border-bottom:1px solid #e0e0e0;font-weight:600}",
    ".mailcow-pgp-panel .mailcow-pgp-body{padding:16px 18px;overflow:auto}",
    ".mailcow-pgp-panel footer{padding:12px 18px;border-top:1px solid #e0e0e0;display:flex;gap:8px;",
    "justify-content:flex-end}",
    ".mailcow-pgp-panel button{border:0;border-radius:4px;padding:8px 14px;font:600 13px sans-serif;",
    "cursor:pointer;background:#eee}",
    ".mailcow-pgp-panel button.mailcow-pgp-primary{background:#2e7d32;color:#fff}",
    ".mailcow-pgp-panel textarea,.mailcow-pgp-panel input{width:100%;box-sizing:border-box;",
    "border:1px solid #bdbdbd;border-radius:4px;padding:8px;font:13px monospace;margin-bottom:12px}",
    ".mailcow-pgp-panel textarea{height:170px;resize:vertical}",
    ".mailcow-pgp-panel label{display:block;font-weight:600;margin-bottom:4px}",
    ".mailcow-pgp-hint{color:#616161;font-size:12px;margin:-6px 0 12px}",
    ".mailcow-pgp-error{color:#c62828;font-weight:600;margin-bottom:12px}",
    ".mailcow-pgp-frame{width:100%;height:52vh;border:1px solid #e0e0e0;border-radius:4px;background:#fff}",
    ".mailcow-pgp-attachments{margin-top:14px}",
    ".mailcow-pgp-attachments a{display:inline-block;margin:0 8px 8px 0;padding:6px 10px;",
    "background:#eee;border-radius:4px;color:#1565c0;text-decoration:none}"
  ].join("");

  var core = null;
  var labels = LABELS.en;
  var unlockedKeys = [];
  var blobUrls = [];
  var button = null;
  var lastRoute = "";

  function label(name) {
    return labels[name] || LABELS.en[name] || name;
  }

  function pickLabels() {
    var language = String(window.UserLanguage || "en").toLowerCase().replace("_", "-");
    if (LABELS[language]) return LABELS[language];
    if (language.indexOf("pt") === 0) return LABELS["pt-pt"];
    if (language.indexOf("de") === 0) return LABELS.de;
    if (language.indexOf("ru") === 0) return LABELS.ru;
    return LABELS.en;
  }

  function storageKey() {
    return STORAGE_PREFIX + (window.UserLogin || "");
  }

  function readStoredKey() {
    try {
      return window.localStorage.getItem(storageKey()) || "";
    } catch (error) {
      return "";
    }
  }

  function writeStoredKey(armoredKey) {
    try {
      if (armoredKey) window.localStorage.setItem(storageKey(), armoredKey);
      else window.localStorage.removeItem(storageKey());
    } catch (error) {
      return;
    }
  }

  function releaseBlobUrls() {
    blobUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    blobUrls = [];
  }

  function element(tag, properties, children) {
    var node = document.createElement(tag);
    Object.keys(properties || {}).forEach(function (name) {
      if (name === "text") node.textContent = properties[name];
      else if (name === "html") node.innerHTML = properties[name];
      else node.setAttribute(name, properties[name]);
    });
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function closeOverlay() {
    var overlay = document.getElementById("mailcow-pgp-overlay");
    if (overlay) overlay.remove();
    releaseBlobUrls();
  }

  function openOverlay(title, bodyNodes, footerNodes) {
    closeOverlay();

    var body = element("div", { class: "mailcow-pgp-body" }, bodyNodes);
    var panel = element("div", { class: "mailcow-pgp-panel" }, [
      element("header", { text: title }),
      body,
      element("footer", {}, footerNodes)
    ]);
    var overlay = element("div", { id: "mailcow-pgp-overlay" }, [panel]);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeOverlay();
    });
    document.body.appendChild(overlay);
    return body;
  }

  function setButtonState() {
    if (!button) return;
    var unlocked = unlockedKeys.length > 0;
    button.setAttribute("data-state", unlocked ? "unlocked" : "locked");
    button.textContent = unlocked ? label("unlocked") : label("unlock");
  }

  function showKeyDialog() {
    var stored = readStoredKey();

    var keyField = element("textarea", {
      spellcheck: "false",
      autocomplete: "off",
      placeholder: "-----BEGIN PGP PRIVATE KEY BLOCK-----"
    });
    keyField.value = stored;

    var passphraseField = element("input", {
      type: "password",
      autocomplete: "off"
    });

    var rememberField = element("input", { type: "checkbox" });
    rememberField.checked = Boolean(stored);

    var errorLine = element("div", { class: "mailcow-pgp-error" });
    errorLine.style.display = "none";

    var rememberRow = element("label", {});
    rememberRow.style.fontWeight = "400";
    rememberRow.appendChild(rememberField);
    rememberRow.appendChild(document.createTextNode(" " + label("remember")));

    var unlockButton = element("button", {
      class: "mailcow-pgp-primary",
      text: label("unlockButton")
    });
    var cancelButton = element("button", { text: label("cancel") });
    var forgetButton = element("button", { text: label("forget") });

    openOverlay(
      label("title"),
      [
        errorLine,
        element("label", { text: label("keyLabel") }),
        keyField,
        element("label", { text: label("passphrase") }),
        passphraseField,
        rememberRow,
        element("p", { class: "mailcow-pgp-hint", text: label("rememberHint") })
      ],
      [forgetButton, cancelButton, unlockButton]
    );

    cancelButton.addEventListener("click", closeOverlay);

    forgetButton.addEventListener("click", function () {
      writeStoredKey("");
      unlockedKeys = [];
      setButtonState();
      closeOverlay();
    });

    unlockButton.addEventListener("click", async function () {
      errorLine.style.display = "none";
      try {
        var key = await core.unlockPrivateKey(keyField.value, passphraseField.value);
        unlockedKeys = [key];
        writeStoredKey(rememberField.checked ? keyField.value.trim() : "");
        passphraseField.value = "";
        setButtonState();
        closeOverlay();
        lastRoute = "";
        refresh();
      } catch (error) {
        errorLine.textContent = label(error.code) || String(error.message);
        errorLine.style.display = "block";
      }
    });
  }

  function currentMessageUrl() {
    var match = ROUTE.exec(window.location.hash || "");
    if (!match) return null;

    var base = window.UserFolderURL || "";
    if (base.charAt(base.length - 1) !== "/") base += "/";
    return {
      route: match[0],
      url:
        base +
        "Mail/" +
        encodeURIComponent(match[1]) +
        "/" +
        encodeURIComponent(match[2]) +
        "/" +
        encodeURIComponent(match[3]) +
        "/viewsource"
    };
  }

  async function fetchSource(url) {
    var response;
    try {
      response = await window.fetch(url, { credentials: "same-origin", cache: "no-cache" });
    } catch (error) {
      throw Object.assign(new Error("fetch failed"), { code: "fetch-failed" });
    }
    if (!response.ok) {
      throw Object.assign(new Error("fetch failed"), { code: "fetch-failed" });
    }
    return response.text();
  }

  function buildFrame(result) {
    var frame = element("iframe", {
      class: "mailcow-pgp-frame",
      sandbox: "",
      referrerpolicy: "no-referrer"
    });

    var content = result.html
      ? result.html
      : "<pre style=\"white-space:pre-wrap;font:14px/1.5 sans-serif\"></pre>";

    var document_ = [
      "<!doctype html><html><head><meta charset=\"utf-8\">",
      "<meta http-equiv=\"Content-Security-Policy\" ",
      "content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\">",
      "</head><body>",
      content,
      "</body></html>"
    ].join("");

    frame.setAttribute("srcdoc", document_);

    if (!result.html) {
      frame.addEventListener("load", function () {
        var target = frame.contentDocument && frame.contentDocument.querySelector("pre");
        if (target) target.textContent = result.text;
      });
    }
    return frame;
  }

  function buildAttachments(result) {
    if (!result.attachments.length) return null;

    var list = element("div", { class: "mailcow-pgp-attachments" }, [
      element("label", { text: label("attachments") })
    ]);

    result.attachments.forEach(function (attachment) {
      var url = URL.createObjectURL(
        new Blob([attachment.content], { type: attachment.mimeType })
      );
      blobUrls.push(url);

      var link = element("a", { href: url, download: attachment.filename });
      link.textContent = attachment.filename;
      list.appendChild(link);
    });

    return list;
  }

  function showResult(result) {
    var nodes = [buildFrame(result)];
    var attachments = buildAttachments(result);
    if (attachments) nodes.push(attachments);

    var closeButton = element("button", {
      class: "mailcow-pgp-primary",
      text: label("close")
    });
    openOverlay(result.subject || label("noSubject"), nodes, [closeButton]);
    closeButton.addEventListener("click", closeOverlay);
  }

  function showError(code) {
    var closeButton = element("button", {
      class: "mailcow-pgp-primary",
      text: label("close")
    });
    openOverlay(label("locked"), [element("div", { class: "mailcow-pgp-error", text: label(code) })], [
      closeButton
    ]);
    closeButton.addEventListener("click", closeOverlay);
  }

  async function refresh() {
    if (!unlockedKeys.length) return;

    var target = currentMessageUrl();
    if (!target || target.route === lastRoute) return;
    lastRoute = target.route;

    var source;
    try {
      source = await fetchSource(target.url);
    } catch (error) {
      return;
    }

    if (!core.isEncryptedSource(source)) return;

    try {
      showResult(await core.decryptRawSource(source, unlockedKeys));
    } catch (error) {
      if (error.code !== "not-encrypted") showError(error.code || "decrypt-failed");
    }
  }

  function install() {
    if (typeof window.MailcowPGPCore === "undefined") return;
    if (typeof window.openpgp === "undefined") return;
    if (typeof window.MailcowPostalMime === "undefined") return;
    if (!window.UserFolderURL) return;

    labels = pickLabels();
    core = window.MailcowPGPCore.create({
      openpgp: window.openpgp,
      PostalMime: window.MailcowPostalMime
    });

    document.head.appendChild(element("style", { text: STYLE }));

    button = element("button", { id: "mailcow-pgp-button", type: "button" });
    button.addEventListener("click", function () {
      if (unlockedKeys.length) {
        lastRoute = "";
        refresh();
      } else {
        showKeyDialog();
      }
    });
    document.body.appendChild(button);
    setButtonState();

    window.addEventListener("hashchange", function () {
      refresh();
    });
    window.addEventListener("beforeunload", function () {
      unlockedKeys = [];
      releaseBlobUrls();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
