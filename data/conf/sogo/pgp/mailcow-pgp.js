(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  var STORAGE_PREFIX = "mailcow.pgp.key.";
  var ROUTE = /#\/Mail\/([^/]+)\/([^/]+)\/(\d+)/;

  var LABELS = {
    en: {
      locked: "PGP locked",
      keyLabel: "Private key",
      passphrase: "Passphrase",
      unlockButton: "Unlock",
      cancel: "Cancel",
      forget: "Forget key",
      close: "Close",
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
      "file-failed": "The file could not be read.",
      verify: "Verify key",
      keyPassphraseTitle: "This key is protected",
      keyPassphraseHint: "Enter the passphrase of the PGP key itself.",
      keyPassphrase: "Key passphrase",
      verified: "Key verified",
      vaultTitle: "Protect the key in this browser",
      vaultHint: "Choose a password. It encrypts both the key and its passphrase before anything is stored.",
      confirm: "Confirm password",
      continue: "Continue",
      startOver: "Use another key",
      "password-mismatch": "The passwords do not match.",
      "password-too-short": "Use at least 10 characters."
    },
    "pt-br": {
      locked: "PGP bloqueado",
      keyLabel: "Chave privada",
      passphrase: "Senha da chave",
      unlockButton: "Desbloquear",
      cancel: "Cancelar",
      forget: "Esquecer chave",
      close: "Fechar",
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
      "file-failed": "Não foi possível ler o arquivo.",
      verify: "Verificar chave",
      keyPassphraseTitle: "Esta chave está protegida",
      keyPassphraseHint: "Digite a senha da própria chave PGP.",
      keyPassphrase: "Senha da chave PGP",
      verified: "Chave verificada",
      vaultTitle: "Proteger a chave neste navegador",
      vaultHint: "Escolha uma senha. Ela criptografa a chave e a senha dela antes de qualquer coisa ser armazenada.",
      confirm: "Confirmar senha",
      continue: "Continuar",
      startOver: "Usar outra chave",
      "password-mismatch": "As senhas não coincidem.",
      "password-too-short": "Use pelo menos 10 caracteres."
    },
    "pt-pt": {
      locked: "PGP bloqueado",
      keyLabel: "Chave privada",
      passphrase: "Frase-passe",
      unlockButton: "Desbloquear",
      cancel: "Cancelar",
      forget: "Esquecer chave",
      close: "Fechar",
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
      "file-failed": "Não foi possível ler o ficheiro.",
      verify: "Verificar chave",
      keyPassphraseTitle: "Esta chave está protegida",
      keyPassphraseHint: "Introduza a frase-passe da própria chave PGP.",
      keyPassphrase: "Frase-passe da chave PGP",
      verified: "Chave verificada",
      vaultTitle: "Proteger a chave neste browser",
      vaultHint: "Escolha uma palavra-passe. Cifra a chave e a frase-passe dela antes de algo ser guardado.",
      confirm: "Confirmar palavra-passe",
      continue: "Continuar",
      startOver: "Usar outra chave",
      "password-mismatch": "As palavras-passe não coincidem.",
      "password-too-short": "Use pelo menos 10 caracteres."
    },
    de: {
      locked: "PGP gesperrt",
      keyLabel: "Privater Schlüssel",
      passphrase: "Passphrase",
      unlockButton: "Entsperren",
      cancel: "Abbrechen",
      forget: "Schlüssel verwerfen",
      close: "Schließen",
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
      "file-failed": "Die Datei konnte nicht gelesen werden.",
      verify: "Schlüssel prüfen",
      keyPassphraseTitle: "Dieser Schlüssel ist geschützt",
      keyPassphraseHint: "Geben Sie die Passphrase des PGP-Schlüssels ein.",
      keyPassphrase: "Schlüssel-Passphrase",
      verified: "Schlüssel geprüft",
      vaultTitle: "Schlüssel in diesem Browser schützen",
      vaultHint: "Wählen Sie ein Passwort. Es verschlüsselt Schlüssel und Passphrase, bevor etwas gespeichert wird.",
      confirm: "Passwort bestätigen",
      continue: "Weiter",
      startOver: "Anderen Schlüssel verwenden",
      "password-mismatch": "Die Passwörter stimmen nicht überein.",
      "password-too-short": "Mindestens 10 Zeichen verwenden."
    },
    ru: {
      locked: "PGP заблокирован",
      keyLabel: "Закрытый ключ",
      passphrase: "Пароль ключа",
      unlockButton: "Разблокировать",
      cancel: "Отмена",
      forget: "Забыть ключ",
      close: "Закрыть",
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
      "file-failed": "Не удалось прочитать файл.",
      verify: "Проверить ключ",
      keyPassphraseTitle: "Ключ защищён",
      keyPassphraseHint: "Введите пароль самого ключа PGP.",
      keyPassphrase: "Пароль ключа PGP",
      verified: "Ключ проверен",
      vaultTitle: "Защитить ключ в этом браузере",
      vaultHint: "Выберите пароль. Он шифрует и ключ, и его пароль до сохранения.",
      confirm: "Повторите пароль",
      continue: "Продолжить",
      startOver: "Другой ключ",
      "password-mismatch": "Пароли не совпадают.",
      "password-too-short": "Используйте не менее 10 символов."
    }
  };

  var STYLE = ".mailcow-pgp-frame{width:100%;height:60vh;border:0;background:#fff}";

  var VAULT_PREFIX = "mailcow.pgp.vault.";
  var MAX_KEY_BYTES = 512 * 1024;
  var MIN_VAULT_PASSWORD = 10;
  var MESSAGE_URL = /\/Mail\/([^/?#]+)\/([^/?#]+)\/(\d+)(?:\/(?:view|viewsource))?(?:[?#]|$)/;
  var PREFS_HOST = "#generalOptionsView-content div[layout=column]";

  var PREFS_TEMPLATE = [
    '<div layout="column" class="mailcow-pgp-prefs">',
    '<h4 class="md-subhead">{{ pgp.text.prefsTitle }}</h4>',
    '<div class="md-caption">{{ pgp.text.prefsHint }}</div>',
    '<div class="md-caption" ng-if="pgp.status" ng-style="{color: pgp.failed ? \'#c62828\' : \'#2e7d32\'}">',
    "{{ pgp.status }}</div>",

    '<div ng-if="pgp.step === \'input\'" layout="column">',
    '<md-input-container class="md-block">',
    "<label>{{ pgp.text.keyLabel }}</label>",
    '<textarea ng-model="pgp.armored" rows="6" spellcheck="false" autocomplete="off"></textarea>',
    "</md-input-container>",
    '<div layout="row" layout-align="start center">',
    '<md-button class="md-raised" ng-click="pgp.pickFile()">{{ pgp.text.keyFile }}</md-button>',
    '<span class="md-caption">{{ pgp.fileName }}</span>',
    "</div>",
    '<div layout="row"><md-button class="md-raised md-primary" ng-disabled="!pgp.armored"',
    ' ng-click="pgp.verify()">{{ pgp.text.verify }}</md-button></div>',
    "</div>",

    '<div ng-if="pgp.step === \'passphrase\'" layout="column">',
    '<div class="md-body-2">{{ pgp.text.keyPassphraseTitle }}</div>',
    '<div class="md-caption">{{ pgp.text.keyPassphraseHint }}</div>',
    '<md-input-container class="md-block">',
    "<label>{{ pgp.text.keyPassphrase }}</label>",
    '<input type="password" ng-model="pgp.keyPassphrase" autocomplete="off"',
    " ng-keydown=\"$event.key === 'Enter' && pgp.checkPassphrase()\"/>",
    "</md-input-container>",
    '<div layout="row">',
    '<md-button class="md-raised md-primary" ng-click="pgp.checkPassphrase()">',
    "{{ pgp.text.continue }}</md-button>",
    '<md-button ng-click="pgp.reset()">{{ pgp.text.startOver }}</md-button>',
    "</div>",
    "</div>",

    '<div ng-if="pgp.step === \'vault\'" layout="column">',
    '<div class="md-body-2">{{ pgp.text.vaultTitle }}</div>',
    '<div class="md-caption">{{ pgp.identity }}</div>',
    '<div class="md-caption">{{ pgp.text.vaultHint }}</div>',
    '<md-input-container class="md-block">',
    "<label>{{ pgp.text.vaultPassword }}</label>",
    '<input type="password" ng-model="pgp.vaultPassword" autocomplete="new-password"/>',
    "</md-input-container>",
    '<md-input-container class="md-block">',
    "<label>{{ pgp.text.confirm }}</label>",
    '<input type="password" ng-model="pgp.vaultConfirm" autocomplete="new-password"',
    " ng-keydown=\"$event.key === 'Enter' && pgp.save()\"/>",
    "</md-input-container>",
    '<div layout="row">',
    '<md-button class="md-raised md-primary" ng-click="pgp.save()">{{ pgp.text.save }}</md-button>',
    '<md-button ng-click="pgp.reset()">{{ pgp.text.startOver }}</md-button>',
    "</div>",
    "</div>",

    '<div ng-if="pgp.step === \'saved\'" layout="row">',
    '<md-button class="md-raised" ng-click="pgp.reset()">{{ pgp.text.startOver }}</md-button>',
    '<md-button class="md-raised md-warn" ng-click="pgp.forget()">{{ pgp.text.forget }}</md-button>',
    "</div>",
    "</div>"
  ].join("");

  var UNLOCK_TEMPLATE = [
    '<md-dialog aria-label="{{ pgp.text.unlockTitle }}" flex="40" flex-sm="80" flex-xs="100">',
    '<md-dialog-content class="md-dialog-content">',
    '<h2 class="md-title">{{ pgp.text.unlockTitle }}</h2>',
    "<p>{{ pgp.text.unlockHint }}</p>",
    '<div class="md-caption" ng-if="pgp.error" ng-style="{color: \'#c62828\'}">{{ pgp.error }}</div>',
    '<md-input-container class="md-block">',
    "<label>{{ pgp.text.vaultPassword }}</label>",
    '<input type="password" ng-model="pgp.password" autocomplete="current-password"',
    " ng-keydown=\"$event.key === 'Enter' && pgp.submit()\"/>",
    "</md-input-container>",
    "</md-dialog-content>",
    "<md-dialog-actions>",
    '<md-button ng-click="pgp.cancel()">{{ pgp.text.cancel }}</md-button>',
    '<md-button class="md-primary md-raised" ng-click="pgp.submit()">{{ pgp.text.unlockButton }}</md-button>',
    "</md-dialog-actions>",
    "</md-dialog>"
  ].join("");

  var MESSAGE_TEMPLATE = [
    '<md-dialog aria-label="{{ pgp.subject }}" flex="80" flex-xs="100">',
    "<md-toolbar>",
    '<div class="md-toolbar-tools"><h2 class="md-flex">{{ pgp.subject }}</h2></div>',
    "</md-toolbar>",
    '<md-dialog-content class="md-dialog-content">',
    '<iframe class="mailcow-pgp-frame" sandbox="" referrerpolicy="no-referrer"></iframe>',
    '<div layout="row" layout-wrap="layout-wrap" ng-if="pgp.attachments.length">',
    '<md-button class="md-raised" ng-repeat="file in pgp.attachments"',
    ' ng-href="{{ file.url }}" download="{{ file.filename }}">',
    "<md-icon>attachment</md-icon> {{ file.filename }}</md-button>",
    "</div>",
    "</md-dialog-content>",
    "<md-dialog-actions>",
    '<md-button class="md-primary" ng-click="pgp.close()">{{ pgp.text.close }}</md-button>',
    "</md-dialog-actions>",
    "</md-dialog>"
  ].join("");

  var ERROR_TEMPLATE = [
    '<md-dialog aria-label="{{ pgp.text.locked }}" flex="40" flex-xs="100">',
    '<md-dialog-content class="md-dialog-content">',
    '<h2 class="md-title">{{ pgp.text.locked }}</h2>',
    "<p>{{ pgp.message }}</p>",
    "</md-dialog-content>",
    "<md-dialog-actions>",
    '<md-button class="md-primary" ng-click="pgp.close()">{{ pgp.text.close }}</md-button>',
    "</md-dialog-actions>",
    "</md-dialog>"
  ].join("");

  var core = null;
  var vault = null;
  var labels = LABELS.en;
  var unlockedKeys = [];
  var blobUrls = [];
  var lastHandled = "";
  var busy = false;
  var angularInjector = null;
  var trace = [];

  function note(message) {
    trace.push(new Date().toISOString() + " " + message);
    if (trace.length > 50) trace.shift();
  }

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

  function injector() {
    if (angularInjector) return angularInjector;
    if (!window.angular) return null;
    try {
      angularInjector = window.angular.element(document.body).injector() || null;
    } catch (error) {
      angularInjector = null;
    }
    return angularInjector;
  }

  function service(name) {
    var found = injector();
    return found && found.has(name) ? found.get(name) : null;
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

  function releaseBlobUrls() {
    blobUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    blobUrls = [];
  }

  function messageFrom(url) {
    var match = MESSAGE_URL.exec(String(url || ""));
    if (!match) return null;
    return { account: match[1], folder: match[2], uid: match[3] };
  }

  function sourceUrl(message) {
    var base = window.UserFolderURL || "";
    if (base.charAt(base.length - 1) !== "/") base += "/";
    return (
      base + "Mail/" + encodeURIComponent(message.account) + "/" +
      encodeURIComponent(message.folder) + "/" + encodeURIComponent(message.uid) + "/viewsource"
    );
  }

  async function fetchSource(url) {
    var response = await window.fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw { code: "fetch-failed" };
    return response.text();
  }

  function buildPreferences(host) {
    if (host.querySelector(".mailcow-pgp-prefs")) return;

    var $compile = service("$compile");
    var $rootScope = service("$rootScope");
    if (!$compile || !$rootScope) {
      note("preferences: angular services unavailable");
      return;
    }

    var picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".asc,.key,.gpg,.pgp,application/pgp-keys,text/plain";
    picker.style.display = "none";
    document.body.appendChild(picker);

    var scope = $rootScope.$new(true);

    function fail(error) {
      scope.pgp.failed = true;
      scope.pgp.status = label(error && error.code) || String((error && error.message) || error);
      scope.$applyAsync();
    }

    scope.pgp = {
      text: labels,
      step: readVault() ? "saved" : "input",
      armored: "",
      fileName: "",
      keyPassphrase: "",
      identity: "",
      vaultPassword: "",
      vaultConfirm: "",
      status: readVault() ? label("saved") : "",
      failed: false,

      pickFile: function () {
        picker.click();
      },

      reset: function () {
        var state = scope.pgp;
        state.step = "input";
        state.armored = "";
        state.fileName = "";
        state.keyPassphrase = "";
        state.identity = "";
        state.vaultPassword = "";
        state.vaultConfirm = "";
        state.failed = false;
        state.status = "";
      },

      verify: function () {
        var state = scope.pgp;
        state.failed = false;
        state.status = "";
        core
          .inspectPrivateKey(state.armored)
          .then(function (report) {
            state.identity = report.userIds.join(", ") + " (" + report.fingerprint + ")";
            state.step = report.needsPassphrase ? "passphrase" : "vault";
            if (!report.needsPassphrase) {
              state.keyPassphrase = "";
              state.status = label("verified");
            }
            scope.$applyAsync();
          })
          .catch(fail);
      },

      checkPassphrase: function () {
        var state = scope.pgp;
        state.failed = false;
        core
          .unlockPrivateKey(state.armored, state.keyPassphrase)
          .then(function () {
            state.status = label("verified");
            state.step = "vault";
            scope.$applyAsync();
          })
          .catch(fail);
      },

      save: function () {
        var state = scope.pgp;
        state.failed = false;
        if (state.vaultPassword !== state.vaultConfirm) {
          fail({ code: "password-mismatch" });
          return;
        }
        if (state.vaultPassword.length < MIN_VAULT_PASSWORD) {
          fail({ code: "password-too-short" });
          return;
        }
        vault
          .seal(
            JSON.stringify({ key: String(state.armored).trim(), passphrase: state.keyPassphrase }),
            state.vaultPassword
          )
          .then(function (sealed) {
            if (!writeVault(sealed)) throw { code: "bad-vault" };
            scope.pgp.reset();
            state.step = "saved";
            state.status = label("saved");
            scope.$applyAsync();
          })
          .catch(fail);
      },

      forget: function () {
        writeVault("");
        unlockedKeys = [];
        scope.pgp.reset();
      }
    };

    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      if (!file) return;
      var state = scope.pgp;
      if (file.size > MAX_KEY_BYTES) {
        picker.value = "";
        fail({ code: "file-too-large" });
        return;
      }
      file
        .text()
        .then(function (content) {
          state.armored = content;
          state.fileName = file.name;
          state.failed = false;
          state.status = "";
          scope.$applyAsync();
        })
        .catch(function () {
          fail({ code: "file-failed" });
        })
        .then(function () {
          picker.value = "";
        });
    });

    var compiled = $compile(window.angular.element(PREFS_TEMPLATE))(scope);
    host.appendChild(compiled[0]);
    scope.$applyAsync();
    note("preferences: panel installed");
  }

  function waitForPreferences() {
    var host = document.querySelector(PREFS_HOST);
    if (host) {
      buildPreferences(host);
      return;
    }
    var observer = new MutationObserver(function () {
      var target = document.querySelector(PREFS_HOST);
      if (!target) return;
      observer.disconnect();
      buildPreferences(target);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function showDialog(template, state) {
    var $mdDialog = service("$mdDialog");
    var $rootScope = service("$rootScope");
    if (!$mdDialog || !$rootScope) {
      note("dialog: $mdDialog unavailable");
      return Promise.resolve(false);
    }

    var scope = $rootScope.$new(true);
    scope.pgp = state;

    var shown = $mdDialog.show({
      template: template,
      scope: scope,
      preserveScope: false,
      clickOutsideToClose: true,
      escapeToClose: true,
      onComplete: function (dialogScope, element) {
        if (!state.srcdoc) return;
        var frame = element[0].querySelector(".mailcow-pgp-frame");
        if (frame) frame.setAttribute("srcdoc", state.srcdoc);
      }
    });

    state.close = function () {
      $mdDialog.hide(false);
    };
    state.cancel = function () {
      $mdDialog.cancel();
    };

    return shown.catch(function () {
      return false;
    });
  }

  function unlockedFromVault(sealed, password) {
    return vault.open(sealed, password).then(function (opened) {
      var payload;
      try {
        payload = JSON.parse(opened);
      } catch (error) {
        payload = null;
      }
      if (payload && typeof payload === "object" && payload.key) {
        return core.unlockPrivateKey(payload.key, payload.passphrase || "");
      }
      return core.unlockPrivateKey(opened, password);
    });
  }

  function askForPassword() {
    var $mdDialog = service("$mdDialog");
    if (!$mdDialog) return Promise.resolve(false);

    var state = {
      text: labels,
      password: "",
      error: "",
      submit: function () {
        unlockedFromVault(readVault(), state.password)
          .then(function (key) {
            unlockedKeys = [key];
            state.password = "";
            $mdDialog.hide(true);
          })
          .catch(function (error) {
            state.error = label(error && error.code) || String((error && error.message) || error);
            var $rootScope = service("$rootScope");
            if ($rootScope) $rootScope.$applyAsync();
          });
      }
    };

    return showDialog(UNLOCK_TEMPLATE, state).then(function (result) {
      return result === true;
    });
  }

  function escapeText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function frameDocument(result) {
    var body = result.html
      ? result.html
      : '<pre style="white-space:pre-wrap;font:14px/1.5 sans-serif">' +
        escapeText(result.text) +
        "</pre>";
    return (
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" ' +
      "content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\">" +
      "</head><body>" +
      body +
      "</body></html>"
    );
  }

  function showResult(result) {
    releaseBlobUrls();
    var attachments = result.attachments.map(function (attachment) {
      var url = URL.createObjectURL(new Blob([attachment.content], { type: attachment.mimeType }));
      blobUrls.push(url);
      return { filename: attachment.filename, url: url };
    });

    return showDialog(MESSAGE_TEMPLATE, {
      text: labels,
      subject: result.subject || label("noSubject"),
      attachments: attachments,
      srcdoc: frameDocument(result)
    }).then(function () {
      releaseBlobUrls();
    });
  }

  function showError(code) {
    return showDialog(ERROR_TEMPLATE, { text: labels, message: label(code) });
  }

  async function handleMessage(message) {
    var token = message.account + "/" + message.folder + "/" + message.uid;
    if (busy || token === lastHandled) return;
    busy = true;
    try {
      var source = await fetchSource(sourceUrl(message));
      if (!core.isEncryptedSource(source)) {
        note("message " + token + ": not encrypted");
        return;
      }
      lastHandled = token;

      if (!unlockedKeys.length) {
        if (!readVault()) {
          await showError("noVault");
          return;
        }
        if (!(await askForPassword())) return;
      }

      await showResult(await core.decryptRawSource(source, unlockedKeys));
      note("message " + token + ": shown");
    } catch (error) {
      note("message " + token + ": " + (error && error.code ? error.code : error));
      if (error && error.code === "fetch-failed") return;
      if (error && error.code === "not-encrypted") return;
      await showError((error && error.code) || "decrypt-failed");
    } finally {
      busy = false;
    }
  }

  function observeRequests() {
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var message = messageFrom(url);
      if (message) window.setTimeout(function () { handleMessage(message); }, 0);
      return open.apply(this, arguments);
    };

    var originalFetch = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === "string" ? input : input && input.url;
      var message = messageFrom(url);
      if (message && String(url).indexOf("/viewsource") === -1) {
        window.setTimeout(function () { handleMessage(message); }, 0);
      }
      return originalFetch.apply(this, arguments);
    };
  }

  function observeLocation() {
    function fromLocation() {
      var message = messageFrom(window.location.hash) || messageFrom(window.location.pathname);
      if (message) handleMessage(message);
    }
    window.addEventListener("hashchange", fromLocation);
    window.addEventListener("popstate", fromLocation);
    fromLocation();
  }

  function selfTest() {
    var message = messageFrom(window.location.hash) || messageFrom(window.location.pathname);
    var report = {
      scripts: {
        openpgp: typeof window.openpgp,
        postalMime: typeof window.MailcowPostalMime,
        core: typeof window.MailcowPGPCore,
        vault: typeof window.MailcowPGPVault
      },
      angular: {
        present: Boolean(window.angular),
        injector: Boolean(injector()),
        mdDialog: Boolean(service("$mdDialog"))
      },
      user: { login: window.UserLogin || null, folderUrl: window.UserFolderURL || null },
      vaultStored: Boolean(readVault()),
      keysUnlocked: unlockedKeys.length,
      routeDetected: message,
      trace: trace.slice()
    };

    if (!message) return Promise.resolve(report);

    return fetchSource(sourceUrl(message))
      .then(function (source) {
        report.viewsource = { ok: true, bytes: source.length };
        report.encrypted = core.isEncryptedSource(source);
        report.armorFound = Boolean(core.findArmoredMessage(source));
        return report;
      })
      .catch(function (error) {
        report.viewsource = { ok: false, error: (error && error.code) || String(error) };
        return report;
      });
  }

  function isPreferencesPage() {
    return /\/preferences/i.test(window.location.pathname || "");
  }

  function install() {
    window.MailcowPGP = { selfTest: selfTest, trace: trace };

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

    var style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    if (isPreferencesPage()) {
      waitForPreferences();
      note("installed on preferences");
      return;
    }

    observeRequests();
    observeLocation();
    window.addEventListener("beforeunload", function () {
      unlockedKeys = [];
      releaseBlobUrls();
    });
    note("installed on mail");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
