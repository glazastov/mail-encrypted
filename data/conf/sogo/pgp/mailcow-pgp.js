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
      "fetch-failed": "The message could not be loaded from the server.",
      prefsTitle: "OpenPGP decryption",
      prefsHint: "Paste your private key once. It is sealed with the password below and kept in this browser only; the server never receives it.",
      vaultPassword: "Vault password",
      save: "Save key",
      saved: "Key saved in this browser",
      unlockTitle: "Unlock your PGP key",
      unlockHint: "This message is encrypted. Enter your vault password to read it.",
      noVault: "No key stored yet. Add one in the SOGo preferences.",
      "bad-vault": "The stored key is unreadable. Save it again.",
      "no-password": "A password is required.",
      "no-secret": "Paste your private key first.",
      keyFile: "Or upload a key file",
      "file-too-large": "That file is too large to be a key.",
      "file-failed": "The file could not be read."
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
      "fetch-failed": "Não foi possível carregar a mensagem do servidor.",
      prefsTitle: "Descriptografia OpenPGP",
      prefsHint: "Cole sua chave privada uma vez. Ela é selada com a senha abaixo e fica apenas neste navegador; o servidor nunca a recebe.",
      vaultPassword: "Senha do cofre",
      save: "Salvar chave",
      saved: "Chave salva neste navegador",
      unlockTitle: "Desbloquear sua chave PGP",
      unlockHint: "Esta mensagem está criptografada. Digite a senha do cofre para lê-la.",
      noVault: "Nenhuma chave guardada. Adicione uma nas preferências do SOGo.",
      "bad-vault": "A chave guardada está ilegível. Salve-a novamente.",
      "no-password": "É necessária uma senha.",
      "no-secret": "Cole sua chave privada primeiro.",
      keyFile: "Ou envie um arquivo de chave",
      "file-too-large": "O arquivo é grande demais para ser uma chave.",
      "file-failed": "Não foi possível ler o arquivo."
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
      "fetch-failed": "Não foi possível carregar a mensagem do servidor.",
      prefsTitle: "Decifragem OpenPGP",
      prefsHint: "Cole a sua chave privada uma vez. É selada com a palavra-passe abaixo e fica apenas neste browser; o servidor nunca a recebe.",
      vaultPassword: "Palavra-passe do cofre",
      save: "Guardar chave",
      saved: "Chave guardada neste browser",
      unlockTitle: "Desbloquear a sua chave PGP",
      unlockHint: "Esta mensagem está cifrada. Introduza a palavra-passe do cofre para a ler.",
      noVault: "Nenhuma chave guardada. Adicione uma nas preferências do SOGo.",
      "bad-vault": "A chave guardada está ilegível. Guarde-a novamente.",
      "no-password": "É necessária uma palavra-passe.",
      "no-secret": "Cole primeiro a sua chave privada.",
      keyFile: "Ou carregue um ficheiro de chave",
      "file-too-large": "O ficheiro é grande demais para ser uma chave.",
      "file-failed": "Não foi possível ler o ficheiro."
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
      "fetch-failed": "Die Nachricht konnte nicht vom Server geladen werden.",
      prefsTitle: "OpenPGP-Entschlüsselung",
      prefsHint: "Fügen Sie Ihren privaten Schlüssel einmal ein. Er wird mit dem Passwort unten versiegelt und bleibt nur in diesem Browser; der Server erhält ihn nie.",
      vaultPassword: "Tresor-Passwort",
      save: "Schlüssel speichern",
      saved: "Schlüssel in diesem Browser gespeichert",
      unlockTitle: "PGP-Schlüssel entsperren",
      unlockHint: "Diese Nachricht ist verschlüsselt. Geben Sie Ihr Tresor-Passwort ein.",
      noVault: "Noch kein Schlüssel gespeichert. Legen Sie einen in den SOGo-Einstellungen an.",
      "bad-vault": "Der gespeicherte Schlüssel ist unlesbar. Bitte erneut speichern.",
      "no-password": "Ein Passwort ist erforderlich.",
      "no-secret": "Fügen Sie zuerst Ihren privaten Schlüssel ein.",
      keyFile: "Oder eine Schlüsseldatei hochladen",
      "file-too-large": "Diese Datei ist zu groß für einen Schlüssel.",
      "file-failed": "Die Datei konnte nicht gelesen werden."
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
      "fetch-failed": "Не удалось загрузить сообщение с сервера.",
      prefsTitle: "Расшифровка OpenPGP",
      prefsHint: "Вставьте закрытый ключ один раз. Он запечатывается паролем ниже и хранится только в этом браузере; сервер его никогда не получает.",
      vaultPassword: "Пароль хранилища",
      save: "Сохранить ключ",
      saved: "Ключ сохранён в этом браузере",
      unlockTitle: "Разблокировать ключ PGP",
      unlockHint: "Сообщение зашифровано. Введите пароль хранилища.",
      noVault: "Ключ ещё не сохранён. Добавьте его в настройках SOGo.",
      "bad-vault": "Сохранённый ключ нечитаем. Сохраните его заново.",
      "no-password": "Требуется пароль.",
      "no-secret": "Сначала вставьте закрытый ключ.",
      keyFile: "Или загрузите файл ключа",
      "file-too-large": "Файл слишком велик для ключа.",
      "file-failed": "Не удалось прочитать файл."
    }
  };

  var STYLE = [
    "#mailcow-pgp-prefs{margin:16px;padding:16px;border:1px solid #e0e0e0;border-radius:6px;",
    "background:#fff;font:14px/1.5 sans-serif;max-width:760px}",
    "#mailcow-pgp-prefs h3{margin:0 0 6px;font-size:16px}",
    "#mailcow-pgp-prefs .mailcow-pgp-hint{color:#616161;font-size:12px;margin:0 0 12px}",
    "#mailcow-pgp-prefs label{display:block;font-weight:600;margin-bottom:4px}",
    "#mailcow-pgp-prefs textarea,#mailcow-pgp-prefs input{width:100%;box-sizing:border-box;",
    "border:1px solid #bdbdbd;border-radius:4px;padding:8px;font:13px monospace;margin-bottom:12px}",
    "#mailcow-pgp-prefs textarea{height:150px;resize:vertical}",
    "#mailcow-pgp-prefs input[type=file]{font:13px sans-serif;padding:6px}",
    "#mailcow-pgp-prefs button{border:0;border-radius:4px;padding:8px 14px;font:600 13px sans-serif;",
    "cursor:pointer;background:#eee;margin-right:8px}",
    "#mailcow-pgp-prefs button.mailcow-pgp-primary{background:#2e7d32;color:#fff}",
    ".mailcow-pgp-error{color:#c62828;font-weight:600;margin-bottom:12px}",
    ".mailcow-pgp-ok{color:#2e7d32;font-weight:600;margin-bottom:12px}",
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
    ".mailcow-pgp-panel input{width:100%;box-sizing:border-box;border:1px solid #bdbdbd;",
    "border-radius:4px;padding:8px;font:13px sans-serif;margin-bottom:12px}",
    ".mailcow-pgp-frame{width:100%;height:52vh;border:1px solid #e0e0e0;border-radius:4px;background:#fff}",
    ".mailcow-pgp-attachments{margin-top:14px}",
    ".mailcow-pgp-attachments a{display:inline-block;margin:0 8px 8px 0;padding:6px 10px;",
    "background:#eee;border-radius:4px;color:#1565c0;text-decoration:none}"
  ].join("");

  var VAULT_PREFIX = "mailcow.pgp.vault.";
  var MAX_KEY_BYTES = 512 * 1024;
  var ROUTE = /#\/Mail\/([^/]+)\/([^/]+)\/(\d+)/;

  var core = null;
  var vault = null;
  var labels = LABELS.en;
  var unlockedKeys = [];
  var blobUrls = [];
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

  function vaultKey() {
    return VAULT_PREFIX + (window.UserLogin || "");
  }

  function readVault() {
    try {
      return window.localStorage.getItem(vaultKey()) || "";
    } catch (error) {
      return "";
    }
  }

  function writeVault(sealed) {
    try {
      if (sealed) window.localStorage.setItem(vaultKey(), sealed);
      else window.localStorage.removeItem(vaultKey());
      return true;
    } catch (error) {
      return false;
    }
  }

  function element(tag, properties, children) {
    var node = document.createElement(tag);
    Object.keys(properties || {}).forEach(function (name) {
      if (name === "text") node.textContent = properties[name];
      else node.setAttribute(name, properties[name]);
    });
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function releaseBlobUrls() {
    blobUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    blobUrls = [];
  }

  function closeOverlay() {
    var overlay = document.getElementById("mailcow-pgp-overlay");
    if (overlay) overlay.remove();
    releaseBlobUrls();
  }

  function openOverlay(title, bodyNodes, footerNodes) {
    closeOverlay();
    var panel = element("div", { class: "mailcow-pgp-panel" }, [
      element("header", { text: title }),
      element("div", { class: "mailcow-pgp-body" }, bodyNodes),
      element("footer", {}, footerNodes)
    ]);
    var overlay = element("div", { id: "mailcow-pgp-overlay" }, [panel]);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeOverlay();
    });
    document.body.appendChild(overlay);
  }

  function isPreferencesPage() {
    return /\/preferences/i.test(window.location.pathname || "");
  }

  function isMailPage() {
    return /\/Mail/i.test(window.location.pathname || "");
  }

  function buildPreferences() {
    if (document.getElementById("mailcow-pgp-prefs")) return;

    var status = element("div", {});
    var keyField = element("textarea", {
      spellcheck: "false",
      autocomplete: "off",
      placeholder: "-----BEGIN PGP PRIVATE KEY BLOCK-----"
    });
    var passwordField = element("input", { type: "password", autocomplete: "new-password" });
    var fileField = element("input", {
      type: "file",
      accept: ".asc,.key,.gpg,.pgp,application/pgp-keys,text/plain"
    });

    fileField.addEventListener("change", async function () {
      var file = fileField.files && fileField.files[0];
      if (!file) return;
      status.className = "mailcow-pgp-error";
      if (file.size > MAX_KEY_BYTES) {
        status.textContent = label("file-too-large");
        fileField.value = "";
        return;
      }
      try {
        keyField.value = await file.text();
        status.className = "";
        status.textContent = "";
      } catch (error) {
        status.textContent = label("file-failed");
      }
      fileField.value = "";
    });

    var saveButton = element("button", { class: "mailcow-pgp-primary", text: label("save") });
    var forgetButton = element("button", { text: label("forget") });

    var panel = element("div", { id: "mailcow-pgp-prefs" }, [
      element("h3", { text: label("prefsTitle") }),
      element("p", { class: "mailcow-pgp-hint", text: label("prefsHint") }),
      status,
      element("label", { text: label("keyLabel") }),
      keyField,
      element("label", { text: label("keyFile") }),
      fileField,
      element("label", { text: label("vaultPassword") }),
      passwordField,
      saveButton,
      forgetButton
    ]);

    if (readVault()) {
      status.className = "mailcow-pgp-ok";
      status.textContent = label("saved");
    }

    saveButton.addEventListener("click", async function () {
      status.className = "mailcow-pgp-error";
      try {
        await core.unlockPrivateKey(keyField.value, passwordField.value);
        var sealed = await vault.seal(keyField.value.trim(), passwordField.value);
        if (!writeVault(sealed)) throw { code: "bad-vault" };
        keyField.value = "";
        passwordField.value = "";
        status.className = "mailcow-pgp-ok";
        status.textContent = label("saved");
      } catch (error) {
        status.textContent = label(error.code) || String(error.message || error);
      }
    });

    forgetButton.addEventListener("click", function () {
      writeVault("");
      unlockedKeys = [];
      status.className = "";
      status.textContent = "";
    });

    document.body.appendChild(panel);
  }

  function askForPassword() {
    return new Promise(function (resolve) {
      var error = element("div", { class: "mailcow-pgp-error" });
      error.style.display = "none";
      var field = element("input", { type: "password", autocomplete: "current-password" });
      var unlockButton = element("button", {
        class: "mailcow-pgp-primary",
        text: label("unlockButton")
      });
      var cancelButton = element("button", { text: label("cancel") });

      openOverlay(
        label("unlockTitle"),
        [error, element("p", { text: label("unlockHint") }), field],
        [cancelButton, unlockButton]
      );

      cancelButton.addEventListener("click", function () {
        closeOverlay();
        resolve(false);
      });

      unlockButton.addEventListener("click", async function () {
        error.style.display = "none";
        try {
          var armored = await vault.open(readVault(), field.value);
          unlockedKeys = [await core.unlockPrivateKey(armored, field.value)];
          field.value = "";
          closeOverlay();
          resolve(true);
        } catch (failure) {
          error.textContent = label(failure.code) || String(failure.message);
          error.style.display = "block";
        }
      });

      field.addEventListener("keydown", function (event) {
        if (event.key === "Enter") unlockButton.click();
      });
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
        base + "Mail/" + encodeURIComponent(match[1]) + "/" + encodeURIComponent(match[2]) +
        "/" + encodeURIComponent(match[3]) + "/viewsource"
    };
  }

  async function fetchSource(url) {
    var response = await window.fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw { code: "fetch-failed" };
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
      : '<pre style="white-space:pre-wrap;font:14px/1.5 sans-serif"></pre>';
    frame.setAttribute(
      "srcdoc",
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta http-equiv="Content-Security-Policy" ' +
        "content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\">" +
        "</head><body>" + content + "</body></html>"
    );
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
      var url = URL.createObjectURL(new Blob([attachment.content], { type: attachment.mimeType }));
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
    var closeButton = element("button", { class: "mailcow-pgp-primary", text: label("close") });
    openOverlay(result.subject || label("noSubject"), nodes, [closeButton]);
    closeButton.addEventListener("click", closeOverlay);
  }

  function showError(code) {
    var closeButton = element("button", { class: "mailcow-pgp-primary", text: label("close") });
    openOverlay(
      label("locked"),
      [element("div", { class: "mailcow-pgp-error", text: label(code) })],
      [closeButton]
    );
    closeButton.addEventListener("click", closeOverlay);
  }

  async function refresh() {
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

    if (!unlockedKeys.length) {
      if (!readVault()) {
        showError("noVault");
        return;
      }
      if (!(await askForPassword())) return;
    }

    try {
      showResult(await core.decryptRawSource(source, unlockedKeys));
    } catch (error) {
      if (error.code !== "not-encrypted") showError(error.code || "decrypt-failed");
    }
  }

  function install() {
    if (typeof window.MailcowPGPCore === "undefined") return;
    if (typeof window.MailcowPGPVault === "undefined") return;
    if (typeof window.openpgp === "undefined") return;
    if (typeof window.MailcowPostalMime === "undefined") return;
    if (!window.UserFolderURL) return;

    labels = pickLabels();
    core = window.MailcowPGPCore.create({
      openpgp: window.openpgp,
      PostalMime: window.MailcowPostalMime
    });
    vault = window.MailcowPGPVault.create({ crypto: window.crypto });

    document.head.appendChild(element("style", { text: STYLE }));

    if (isPreferencesPage()) {
      buildPreferences();
      return;
    }

    if (!isMailPage()) return;

    window.addEventListener("hashchange", function () {
      refresh();
    });
    window.addEventListener("beforeunload", function () {
      unlockedKeys = [];
      releaseBlobUrls();
    });
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
