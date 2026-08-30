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
      "password-too-short": "Use at least 10 characters.",
      contactsTitle: "Contact public keys",
      contactsHint: "Keys used to check the signature of messages you receive. Public keys only.",
      contactKey: "Public key",
      addContact: "Add key",
      noContacts: "No contact keys yet.",
      contactAdded: "Key added",
      sigValid: "Signature valid",
      sigInvalid: "Signature does not match",
      sigUnknown: "Signed, but no matching contact key",
      sigNone: "Encrypted, not signed",
      signedBy: "Signed by",
      "not-a-public-key": "That is a private key. Only public keys belong here.",
      encStorage: "Encrypted on the server only",
      encStorageHint: "It reached the server in the clear and was encrypted at rest.",
      encE2E: "End-to-end encrypted",
      encE2EHint: "The sender encrypted it before sending.",
      addSenderKey: "Add this key to contacts",
      senderKeyAdded: "Contact key added",
      noSenderKey: "The message carries no key. Add it in the preferences.",
      otherIdentities: "Other identities on this key:",
      sendingTitle: "Outgoing mail",
      signOutgoing: "Sign what I send",
      encryptOutgoing: "Encrypt when every recipient has a key",
      sendPlainTitle: "Send as plain text?",
      sendPlainHint: "Signing and encrypting replace the body with an OpenPGP block, so formatting is lost.",
      sendAttachHint: "Attachments are sent unencrypted: SOGo adds them after this point.",
      proceed: "Send anyway",
      "send-cancelled": "Sending was cancelled.",
      sigMismatch: "Signature not from the sender",
      sigMismatchHint: "The signature is cryptographically valid, but the key does not belong to the address this message claims to come from."
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
      "password-too-short": "Use pelo menos 10 caracteres.",
      contactsTitle: "Chaves públicas dos contatos",
      contactsHint: "Chaves usadas para verificar a assinatura das mensagens recebidas. Somente chaves públicas.",
      contactKey: "Chave pública",
      addContact: "Adicionar chave",
      noContacts: "Nenhuma chave de contato ainda.",
      contactAdded: "Chave adicionada",
      sigValid: "Assinatura válida",
      sigInvalid: "A assinatura não confere",
      sigUnknown: "Assinada, mas sem chave de contato correspondente",
      sigNone: "Criptografada, sem assinatura",
      signedBy: "Assinada por",
      "not-a-public-key": "Isso é uma chave privada. Aqui só entram chaves públicas.",
      encStorage: "Criptografada apenas no servidor",
      encStorageHint: "Chegou em texto claro ao servidor e foi criptografada em repouso.",
      encE2E: "Criptografada de ponta a ponta",
      encE2EHint: "O remetente criptografou antes de enviar.",
      addSenderKey: "Adicionar esta chave aos contatos",
      senderKeyAdded: "Chave do contato adicionada",
      noSenderKey: "A mensagem não traz a chave. Adicione nas preferências.",
      otherIdentities: "Outras identidades desta chave:",
      sendingTitle: "Mensagens enviadas",
      signOutgoing: "Assinar o que eu enviar",
      encryptOutgoing: "Criptografar quando todos os destinatários têm chave",
      sendPlainTitle: "Enviar como texto puro?",
      sendPlainHint: "Assinar e criptografar substituem o corpo por um bloco OpenPGP, então a formatação é perdida.",
      sendAttachHint: "Os anexos vão sem criptografia: o SOGo os adiciona depois deste ponto.",
      proceed: "Enviar mesmo assim",
      "send-cancelled": "O envio foi cancelado.",
      sigMismatch: "Assinatura não é do remetente",
      sigMismatchHint: "A assinatura é criptograficamente válida, mas a chave não pertence ao endereço de onde a mensagem diz vir."
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
      "password-too-short": "Use pelo menos 10 caracteres.",
      contactsTitle: "Chaves públicas dos contactos",
      contactsHint: "Chaves usadas para verificar a assinatura das mensagens recebidas. Apenas chaves públicas.",
      contactKey: "Chave pública",
      addContact: "Adicionar chave",
      noContacts: "Ainda não há chaves de contactos.",
      contactAdded: "Chave adicionada",
      sigValid: "Assinatura válida",
      sigInvalid: "A assinatura não corresponde",
      sigUnknown: "Assinada, mas sem chave de contacto correspondente",
      sigNone: "Cifrada, sem assinatura",
      signedBy: "Assinada por",
      "not-a-public-key": "Isso é uma chave privada. Aqui só entram chaves públicas.",
      encStorage: "Cifrada apenas no servidor",
      encStorageHint: "Chegou em claro ao servidor e foi cifrada em repouso.",
      encE2E: "Cifrada de ponta a ponta",
      encE2EHint: "O remetente cifrou-a antes de enviar.",
      addSenderKey: "Adicionar esta chave aos contactos",
      senderKeyAdded: "Chave do contacto adicionada",
      noSenderKey: "A mensagem não traz a chave. Adicione-a nas preferências.",
      otherIdentities: "Outras identidades desta chave:",
      sendingTitle: "Mensagens enviadas",
      signOutgoing: "Assinar o que eu enviar",
      encryptOutgoing: "Cifrar quando todos os destinatários têm chave",
      sendPlainTitle: "Enviar como texto simples?",
      sendPlainHint: "Assinar e cifrar substituem o corpo por um bloco OpenPGP, pelo que a formatação se perde.",
      sendAttachHint: "Os anexos seguem sem cifra: o SOGo junta-os depois deste ponto.",
      proceed: "Enviar mesmo assim",
      "send-cancelled": "O envio foi cancelado.",
      sigMismatch: "Assinatura não é do remetente",
      sigMismatchHint: "A assinatura é criptograficamente válida, mas a chave não pertence ao endereço de onde a mensagem diz vir."
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
      "password-too-short": "Mindestens 10 Zeichen verwenden.",
      contactsTitle: "Öffentliche Schlüssel der Kontakte",
      contactsHint: "Schlüssel zur Prüfung der Signatur eingehender Nachrichten. Nur öffentliche Schlüssel.",
      contactKey: "Öffentlicher Schlüssel",
      addContact: "Schlüssel hinzufügen",
      noContacts: "Noch keine Kontaktschlüssel.",
      contactAdded: "Schlüssel hinzugefügt",
      sigValid: "Signatur gültig",
      sigInvalid: "Signatur stimmt nicht",
      sigUnknown: "Signiert, aber kein passender Kontaktschlüssel",
      sigNone: "Verschlüsselt, nicht signiert",
      signedBy: "Signiert von",
      "not-a-public-key": "Das ist ein privater Schlüssel. Hier gehören nur öffentliche hin.",
      encStorage: "Nur auf dem Server verschlüsselt",
      encStorageHint: "Sie erreichte den Server im Klartext und wurde erst dort verschlüsselt.",
      encE2E: "Ende-zu-Ende verschlüsselt",
      encE2EHint: "Der Absender hat sie vor dem Senden verschlüsselt.",
      addSenderKey: "Diesen Schlüssel zu Kontakten hinzufügen",
      senderKeyAdded: "Kontaktschlüssel hinzugefügt",
      noSenderKey: "Die Nachricht enthält keinen Schlüssel. Fügen Sie ihn in den Einstellungen hinzu.",
      otherIdentities: "Weitere Identitäten dieses Schlüssels:",
      sendingTitle: "Ausgehende Nachrichten",
      signOutgoing: "Meine Nachrichten signieren",
      encryptOutgoing: "Verschlüsseln, wenn alle Empfänger einen Schlüssel haben",
      sendPlainTitle: "Als reinen Text senden?",
      sendPlainHint: "Signieren und Verschlüsseln ersetzen den Text durch einen OpenPGP-Block, die Formatierung geht verloren.",
      sendAttachHint: "Anhänge gehen unverschlüsselt: SOGo fügt sie erst danach hinzu.",
      proceed: "Trotzdem senden",
      "send-cancelled": "Das Senden wurde abgebrochen.",
      sigMismatch: "Signatur stammt nicht vom Absender",
      sigMismatchHint: "Die Signatur ist kryptografisch gültig, aber der Schlüssel gehört nicht zu der Adresse, von der die Nachricht zu stammen behauptet."
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
      "password-too-short": "Используйте не менее 10 символов.",
      contactsTitle: "Открытые ключи контактов",
      contactsHint: "Ключи для проверки подписи входящих сообщений. Только открытые ключи.",
      contactKey: "Открытый ключ",
      addContact: "Добавить ключ",
      noContacts: "Ключей контактов пока нет.",
      contactAdded: "Ключ добавлен",
      sigValid: "Подпись верна",
      sigInvalid: "Подпись не совпадает",
      sigUnknown: "Подписано, но нет подходящего ключа контакта",
      sigNone: "Зашифровано, без подписи",
      signedBy: "Подписал",
      "not-a-public-key": "Это закрытый ключ. Сюда добавляются только открытые.",
      encStorage: "Зашифровано только на сервере",
      encStorageHint: "Пришло на сервер открытым текстом и было зашифровано при хранении.",
      encE2E: "Сквозное шифрование",
      encE2EHint: "Отправитель зашифровал сообщение до отправки.",
      addSenderKey: "Добавить этот ключ в контакты",
      senderKeyAdded: "Ключ контакта добавлен",
      noSenderKey: "В сообщении нет ключа. Добавьте его в настройках.",
      otherIdentities: "Другие личности этого ключа:",
      sendingTitle: "Исходящие сообщения",
      signOutgoing: "Подписывать мои письма",
      encryptOutgoing: "Шифровать, когда у всех получателей есть ключ",
      sendPlainTitle: "Отправить обычным текстом?",
      sendPlainHint: "Подпись и шифрование заменяют тело письма блоком OpenPGP, форматирование теряется.",
      sendAttachHint: "Вложения уйдут незашифрованными: SOGo добавляет их позже.",
      proceed: "Всё равно отправить",
      "send-cancelled": "Отправка отменена.",
      sigMismatch: "Подпись не от отправителя",
      sigMismatchHint: "Подпись криптографически верна, но ключ не принадлежит адресу, от которого якобы пришло письмо."
    }
  };

  var STYLE = [
    ".mailcow-pgp-frame{width:100%;height:60vh;border:0;background:#fff}",
    ".mailcow-pgp-badges{gap:6px;padding:4px 8px}",
    ".mailcow-pgp-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 10px 2px 6px;",
    "border:1px solid;border-radius:12px;font-size:12px;line-height:20px;white-space:nowrap}",
    ".mailcow-pgp-badge>span{display:block;line-height:16px}",
    ".mailcow-pgp-badge md-icon{margin:0;padding:0;min-width:16px;width:16px;height:16px;",
    "font-size:16px;line-height:16px;display:flex;align-items:center;justify-content:center;",
    "vertical-align:middle}"
  ].join("");

  var VAULT_PREFIX = "mailcow.pgp.vault.";
  var CONTACTS_PREFIX = "mailcow.pgp.contacts.";
  var SENDING_PREFIX = "mailcow.pgp.sending.";
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


  var CONTACTS_TEMPLATE = [
    '<div layout="column" class="mailcow-pgp-contacts">',
    '<h4 class="md-subhead">{{ pgp.text.contactsTitle }}</h4>',
    '<div class="md-caption">{{ pgp.text.contactsHint }}</div>',
    '<div class="md-caption" ng-if="pgp.status" ng-style="{color: pgp.failed ? \'#c62828\' : \'#2e7d32\'}">',
    "{{ pgp.status }}</div>",
    '<div class="md-caption" ng-if="!pgp.contacts.length">{{ pgp.text.noContacts }}</div>',
    '<md-list ng-if="pgp.contacts.length">',
    '<md-list-item class="md-2-line" ng-repeat="contact in pgp.contacts">',
    '<div class="md-list-item-text">',
    "<h3>{{ contact.userIds.join(', ') }}</h3>",
    "<p>{{ contact.fingerprint }}</p>",
    "</div>",
    '<md-button class="md-secondary md-icon-button" ng-click="pgp.removeContact(contact)">',
    "<md-icon>delete</md-icon></md-button>",
    "</md-list-item>",
    "</md-list>",
    '<md-input-container class="md-block">',
    "<label>{{ pgp.text.contactKey }}</label>",
    '<textarea ng-model="pgp.armored" rows="4" spellcheck="false" autocomplete="off"></textarea>',
    "</md-input-container>",
    '<div layout="row" layout-align="start center">',
    '<md-button class="md-raised" ng-click="pgp.pickFile()">{{ pgp.text.keyFile }}</md-button>',
    '<md-button class="md-raised md-primary" ng-disabled="!pgp.armored"',
    ' ng-click="pgp.add()">{{ pgp.text.addContact }}</md-button>',
    '<span class="md-caption">{{ pgp.fileName }}</span>',
    "</div>",
    "</div>"
  ].join("");

  var INPLACE_TEMPLATE = [
    '<div class="mailcow-pgp-message" layout="column">',

    '<div layout="row" layout-align="end center" layout-wrap="layout-wrap"',
    ' class="mailcow-pgp-badges">',

    '<span class="mailcow-pgp-badge" ng-style="{color: pgp.encryption.color,',
    " borderColor: pgp.encryption.color}\">",
    "<md-icon ng-style=\"{color: pgp.encryption.color}\">{{ pgp.encryption.icon }}</md-icon>",
    "<span>{{ pgp.encryption.text }}</span>",
    '<md-tooltip md-direction="bottom">{{ pgp.encryption.hint }}</md-tooltip>',
    "</span>",

    '<span class="mailcow-pgp-badge" ng-style="{color: pgp.signature.color,',
    " borderColor: pgp.signature.color}\">",
    "<md-icon ng-style=\"{color: pgp.signature.color}\">{{ pgp.signature.icon }}</md-icon>",
    "<span>{{ pgp.signature.text }}</span>",
    '<md-tooltip md-direction="bottom" ng-if="pgp.signature.tooltip">',
    "{{ pgp.signature.tooltip }}</md-tooltip>",
    "</span>",

    '<md-button class="md-raised md-primary md-sm" ng-if="pgp.senderKey && !pgp.senderKeyAdded"',
    ' ng-click="pgp.addSenderKey()">{{ pgp.text.addSenderKey }}</md-button>',
    '<span class="md-caption" ng-if="pgp.senderKeyAdded">{{ pgp.text.senderKeyAdded }}</span>',
    '<span class="md-caption" ng-if="pgp.showNoSenderKey">{{ pgp.text.noSenderKey }}</span>',
    "</div>",

    '<iframe class="mailcow-pgp-frame" sandbox="" referrerpolicy="no-referrer"></iframe>',
    '<div layout="row" layout-wrap="layout-wrap" ng-if="pgp.attachments.length">',
    '<md-button class="md-raised" ng-repeat="file in pgp.attachments"',
    ' ng-href="{{ file.url }}" download="{{ file.filename }}">',
    "<md-icon>attachment</md-icon> {{ file.filename }}</md-button>",
    "</div>",
    "</div>"
  ].join("");

  var SENDING_TEMPLATE = [
    '<div layout="column" class="mailcow-pgp-sending">',
    '<h4 class="md-subhead">{{ pgp.text.sendingTitle }}</h4>',
    '<md-switch ng-model="pgp.settings.sign" ng-change="pgp.save()">',
    "{{ pgp.text.signOutgoing }}</md-switch>",
    '<md-switch ng-model="pgp.settings.encrypt" ng-change="pgp.save()">',
    "{{ pgp.text.encryptOutgoing }}</md-switch>",
    "</div>"
  ].join("");

  var CONFIRM_TEMPLATE = [
    '<md-dialog aria-label="{{ pgp.text.sendPlainTitle }}" flex="40" flex-xs="100">',
    '<md-dialog-content class="md-dialog-content">',
    '<h2 class="md-title">{{ pgp.text.sendPlainTitle }}</h2>',
    "<p>{{ pgp.text.sendPlainHint }}</p>",
    '<p ng-if="pgp.hasAttachments">{{ pgp.text.sendAttachHint }}</p>',
    "</md-dialog-content>",
    "<md-dialog-actions>",
    '<md-button ng-click="pgp.cancel()">{{ pgp.text.cancel }}</md-button>',
    '<md-button class="md-primary md-raised" ng-click="pgp.confirm()">',
    "{{ pgp.text.proceed }}</md-button>",
    "</md-dialog-actions>",
    "</md-dialog>"
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
  var failed = {};
  var knownFolders = {};
  var decryptedCache = null;
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

  function sendingKey() {
    return SENDING_PREFIX + (window.UserLogin || "");
  }

  function readSending() {
    var defaults = { sign: true, encrypt: true };
    try {
      var stored = JSON.parse(window.localStorage.getItem(sendingKey()) || "null");
      if (!stored || typeof stored !== "object") return defaults;
      return {
        sign: stored.sign !== false,
        encrypt: stored.encrypt !== false
      };
    } catch (error) {
      return defaults;
    }
  }

  function writeSending(settings) {
    try {
      window.localStorage.setItem(sendingKey(), JSON.stringify(settings));
    } catch (error) {
      return;
    }
  }

  function contactsKey() {
    return CONTACTS_PREFIX + (window.UserLogin || "");
  }

  function readContacts() {
    try {
      var stored = JSON.parse(window.localStorage.getItem(contactsKey()) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch (error) {
      return [];
    }
  }

  function writeContacts(contacts) {
    try {
      window.localStorage.setItem(contactsKey(), JSON.stringify(contacts));
      return true;
    } catch (error) {
      return false;
    }
  }

  async function verificationKeys() {
    var contacts = readContacts();
    var parsed = [];
    for (var index = 0; index < contacts.length; index++) {
      try {
        parsed.push(await window.openpgp.readKey({ armoredKey: contacts[index].armored }));
      } catch (error) {
        note("contact key unreadable: " + contacts[index].fingerprint);
      }
    }
    return parsed;
  }

  function describeEncryption(kind) {
    if (kind === "end-to-end") {
      return {
        icon: "lock",
        color: "#2e7d32",
        text: label("encE2E"),
        hint: label("encE2EHint")
      };
    }
    return {
      icon: "storage",
      color: "#ef6c00",
      text: label("encStorage"),
      hint: label("encStorageHint")
    };
  }

  function addContactKeys(found) {
    var contacts = readContacts();
    found.forEach(function (key) {
      var existing = contacts.filter(function (contact) {
        return contact.fingerprint === key.fingerprint;
      })[0];
      if (existing) {
        existing.armored = key.armored;
        existing.userIds = key.userIds;
      } else {
        contacts.push(key);
      }
    });
    return writeContacts(contacts);
  }

  function describeSignature(signature, sender) {
    var matches = core.signatureMatchesSender(signature, sender);
    var byStatus = {
      valid: matches
        ? { icon: "verified_user", color: "#2e7d32", text: label("sigValid") }
        : { icon: "report_problem", color: "#c62828", text: label("sigMismatch") },
      invalid: { icon: "report_problem", color: "#c62828", text: label("sigInvalid") },
      "unknown-key": { icon: "help_outline", color: "#ef6c00", text: label("sigUnknown") },
      none: { icon: "lock", color: "#616161", text: label("sigNone") }
    };
    var described = byStatus[signature.status] || byStatus.none;
    var who = "";
    var others = [];

    if (signature.status === "valid" && matches) {
      var chosen = core.pickUserId(signature.userIds, sender && sender.address);
      who = label("signedBy") + " " + chosen;
      others = (signature.userIds || []).filter(function (userId) {
        return userId !== chosen;
      });
    } else if (signature.status === "valid") {
      who = label("sigMismatchHint");
      others = signature.userIds || [];
    } else if (signature.keyId) {
      who = signature.keyId;
    }

    var tooltip = who;
    if (others.length) {
      tooltip += (tooltip ? "\n" : "") + label("otherIdentities") + " " + others.join(", ");
    }

    return {
      icon: described.icon,
      color: described.color,
      text: described.text,
      who: who,
      others: others,
      tooltip: tooltip
    };
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
    var folder = knownFolders[message.folder] || core.soFolder(message.folder);
    return (
      base + "Mail/" + encodeURIComponent(message.account) + "/" +
      folder.split("/").map(encodeURIComponent).join("/") + "/" +
      encodeURIComponent(message.uid) + "/viewsource"
    );
  }

  function learnFolder(folder) {
    if (!folder || folder.indexOf("folder") !== 0) return;
    var bare = folder
      .split("/")
      .map(function (segment) {
        return segment.indexOf("folder") === 0 ? segment.slice(6) : segment;
      })
      .join("/");
    knownFolders[bare] = folder;
    knownFolders[folder] = folder;
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

  function buildContacts(host) {
    if (host.querySelector(".mailcow-pgp-contacts")) return;

    var $compile = service("$compile");
    var $rootScope = service("$rootScope");
    if (!$compile || !$rootScope) return;

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
      contacts: readContacts(),
      armored: "",
      fileName: "",
      status: "",
      failed: false,

      pickFile: function () {
        picker.click();
      },

      add: function () {
        var state = scope.pgp;
        state.failed = false;
        core
          .readPublicKeys(state.armored)
          .then(function (found) {
            var contacts = readContacts();
            found.forEach(function (key) {
              var existing = contacts.filter(function (contact) {
                return contact.fingerprint === key.fingerprint;
              })[0];
              if (existing) {
                existing.armored = key.armored;
                existing.userIds = key.userIds;
              } else {
                contacts.push(key);
              }
            });
            if (!writeContacts(contacts)) throw { code: "bad-vault" };
            state.contacts = contacts;
            state.armored = "";
            state.fileName = "";
            state.status = label("contactAdded");
            scope.$applyAsync();
          })
          .catch(fail);
      },

      removeContact: function (contact) {
        var contacts = readContacts().filter(function (item) {
          return item.fingerprint !== contact.fingerprint;
        });
        writeContacts(contacts);
        scope.pgp.contacts = contacts;
        scope.pgp.status = "";
        scope.pgp.failed = false;
      }
    };

    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      if (!file) return;
      if (file.size > MAX_KEY_BYTES) {
        picker.value = "";
        fail({ code: "file-too-large" });
        return;
      }
      file
        .text()
        .then(function (content) {
          scope.pgp.armored = content;
          scope.pgp.fileName = file.name;
          scope.pgp.failed = false;
          scope.pgp.status = "";
          scope.$applyAsync();
        })
        .catch(function () {
          fail({ code: "file-failed" });
        })
        .then(function () {
          picker.value = "";
        });
    });

    var compiled = $compile(window.angular.element(CONTACTS_TEMPLATE))(scope);
    host.appendChild(compiled[0]);
    scope.$applyAsync();
    note("preferences: contacts panel installed");
  }

  function buildSending(host) {
    if (host.querySelector(".mailcow-pgp-sending")) return;

    var $compile = service("$compile");
    var $rootScope = service("$rootScope");
    if (!$compile || !$rootScope) return;

    var scope = $rootScope.$new(true);
    scope.pgp = {
      text: labels,
      settings: readSending(),
      save: function () {
        writeSending(scope.pgp.settings);
      }
    };

    host.appendChild($compile(window.angular.element(SENDING_TEMPLATE))(scope)[0]);
    scope.$applyAsync();
    note("preferences: sending panel installed");
  }

  function waitForPreferences() {
    var host = document.querySelector(PREFS_HOST);
    if (host) {
      buildPreferences(host);
      buildContacts(host);
      buildSending(host);
      return;
    }
    var observer = new MutationObserver(function () {
      var target = document.querySelector(PREFS_HOST);
      if (!target) return;
      observer.disconnect();
      buildPreferences(target);
      buildContacts(target);
      buildSending(target);
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
            failed = {};
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

  function attachmentLinks(result) {
    return result.attachments.map(function (attachment) {
      var url = URL.createObjectURL(
        new Blob([attachment.content], { type: core.safeAttachmentType(attachment.mimeType) })
      );
      blobUrls.push(url);
      return { filename: attachment.filename, url: url };
    });
  }

  var HIDE_SELECTORS = ["[class*=msg-attachment]", ".mailer_mailcontent", ".sg-mail-part"];
  var hideObserver = null;

  function hideNode(node) {
    if (!node || node.hasAttribute("data-mailcow-pgp-hidden")) return;
    if (node.closest && node.closest(".mailcow-pgp-message")) return;
    node.hidden = true;
    node.setAttribute("data-mailcow-pgp-hidden", "1");
  }

  function hideOriginalParts(card) {
    HIDE_SELECTORS.forEach(function (selector) {
      Array.prototype.forEach.call(card.querySelectorAll(selector), hideNode);
    });
  }

  function keepHidden(card) {
    if (hideObserver) hideObserver.disconnect();
    hideObserver = new MutationObserver(function () {
      if (!document.querySelector(".mailcow-pgp-message")) return;
      hideOriginalParts(card);
    });
    hideObserver.observe(card, { childList: true, subtree: true });
  }

  function clearInPlace() {
    if (hideObserver) {
      hideObserver.disconnect();
      hideObserver = null;
    }
    var previous = document.querySelector(".mailcow-pgp-message");
    if (previous) previous.remove();
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-mailcow-pgp-hidden]"),
      function (node) {
        node.hidden = false;
        node.removeAttribute("data-mailcow-pgp-hidden");
      }
    );
  }

  function findScope(root, test) {
    var queue = [root];
    while (queue.length) {
      var scope = queue.shift();
      try {
        if (test(scope)) return scope;
      } catch (error) {
        return null;
      }
      for (var child = scope.$$childHead; child; child = child.$$nextSibling) {
        queue.push(child);
      }
    }
    return null;
  }

  function applyRealSubject(body, subject) {
    if (!subject) return;

    var $rootScope = service("$rootScope");
    var scope = $rootScope
      ? findScope($rootScope, function (candidate) {
          return Boolean(candidate.viewer && candidate.viewer.message);
        })
      : null;

    if (scope) {
      if (!core.isObscuredSubject(scope.viewer.message.subject)) return;
      scope.viewer.message.subject = subject;
      scope.$applyAsync();
      note("real subject applied to the model");
      return;
    }

    var card = (body.closest && body.closest("md-card")) || document;
    var header = card.querySelector("h5.sg-md-headline") || card.querySelector("h5");
    if (!header) {
      note("subject: no place to put it");
      return;
    }
    if (!core.isObscuredSubject(header.textContent)) return;
    header.textContent = subject;
    note("real subject applied to the header");
  }

  function waitForBody(timeout) {
    return new Promise(function (resolve) {
      var found = document.querySelector("div.msg-body");
      if (found) {
        resolve(found);
        return;
      }

      var settled = false;
      var observer = new MutationObserver(function () {
        var target = document.querySelector("div.msg-body");
        if (!target || settled) return;
        settled = true;
        observer.disconnect();
        window.clearTimeout(timer);
        resolve(target);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        observer.disconnect();
        note("message body never appeared, falling back to a dialog");
        resolve(null);
      }, timeout);
    });
  }

  function renderInPlace(result, body) {
    var $compile = service("$compile");
    var $rootScope = service("$rootScope");
    if (!body || !$compile || !$rootScope) return false;

    clearInPlace();

    Array.prototype.forEach.call(body.children, hideNode);

    var card = (body.closest && body.closest("md-card")) || document.body;
    hideOriginalParts(card);

    var scope = $rootScope.$new(true);
    var signature = result.signature || { status: "none" };
    scope.pgp = {
      text: labels,
      encryption: describeEncryption(result.encryption),
      signature: describeSignature(signature, result.from),
      attachments: attachmentLinks(result),
      senderKey: null,
      senderKeyAdded: false,
      showNoSenderKey: false,

      addSenderKey: function () {
        if (!scope.pgp.senderKey) return;
        if (addContactKeys([scope.pgp.senderKey])) {
          scope.pgp.senderKeyAdded = true;
          scope.$applyAsync();
        }
      }
    };

    if (signature.status === "unknown-key") {
      core
        .findSenderKeys(result)
        .then(function (found) {
          var match = found.filter(function (key) {
            return !signature.keyId || key.fingerprint.slice(-16) === signature.keyId;
          })[0];
          scope.pgp.senderKey = match || found[0] || null;
          scope.pgp.showNoSenderKey = !scope.pgp.senderKey;
          scope.$applyAsync();
        })
        .catch(function () {
          scope.pgp.showNoSenderKey = true;
          scope.$applyAsync();
        });
    }

    var srcdoc = frameDocument(result);
    var compiled = $compile(window.angular.element(INPLACE_TEMPLATE))(scope);
    body.appendChild(compiled[0]);
    scope.$applyAsync();

    var frame = compiled[0].querySelector(".mailcow-pgp-frame");
    if (frame) frame.setAttribute("srcdoc", srcdoc);
    applyRealSubject(body, result.subject);
    keepHidden(card);
    note("rendered in place");
    return true;
  }

  async function showResult(result) {
    releaseBlobUrls();

    var body = await waitForBody(4000);
    if (body && renderInPlace(result, body)) return;

    return showDialog(MESSAGE_TEMPLATE, {
      text: labels,
      subject: result.subject || label("noSubject"),
      attachments: attachmentLinks(result),
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
    var state = {
      lastHandled: lastHandled,
      rendered: Boolean(document.querySelector(".mailcow-pgp-message")),
      failed: failed
    };
    if (busy || !core.shouldHandleMessage(token, state)) return;
    busy = true;
    lastHandled = token;
    clearInPlace();
    try {
      var remembered = decryptedCache.get(token);
      if (remembered) {
        await showResult(remembered);
        note("message " + token + ": shown from cache");
        return;
      }

      var source = await fetchSource(sourceUrl(message));
      if (!core.isEncryptedSource(source)) {
        note("message " + token + ": not encrypted");
        return;
      }

      if (!unlockedKeys.length) {
        if (!readVault()) {
          await showError("noVault");
          return;
        }
        if (!(await askForPassword())) {
          failed[token] = true;
          return;
        }
      }

      var decrypted = await core.decryptRawSource(source, unlockedKeys, await verificationKeys());
      decryptedCache.set(token, decrypted);
      await showResult(decrypted);
      note("message " + token + ": shown");
    } catch (error) {
      note("message " + token + ": " + (error && error.code ? error.code : error));
      if (error && error.code === "fetch-failed") return;
      if (error && error.code === "not-encrypted") return;
      failed[token] = true;
      await showError((error && error.code) || "decrypt-failed");
    } finally {
      busy = false;
    }
  }

  function observeRequests() {
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var message = messageFrom(url);
      if (message) {
        learnFolder(message.folder);
        window.setTimeout(function () { handleMessage(message); }, 0);
      }
      return open.apply(this, arguments);
    };

    var originalFetch = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === "string" ? input : input && input.url;
      var message = messageFrom(url);
      if (message && String(url).indexOf("/viewsource") === -1) {
        learnFolder(message.folder);
        window.setTimeout(function () { handleMessage(message); }, 0);
      }
      return originalFetch.apply(this, arguments);
    };
  }

  function fromLocation() {
    var message = messageFrom(window.location.hash) || messageFrom(window.location.pathname);
    if (message) handleMessage(message);
  }

  function observeLocation() {
    window.addEventListener("hashchange", fromLocation);
    window.addEventListener("popstate", fromLocation);

    ["pushState", "replaceState"].forEach(function (name) {
      var original = window.history[name];
      if (typeof original !== "function") return;
      window.history[name] = function () {
        var result = original.apply(this, arguments);
        window.setTimeout(fromLocation, 0);
        return result;
      };
    });

    var $rootScope = service("$rootScope");
    if ($rootScope) {
      $rootScope.$on("$locationChangeSuccess", function () {
        window.setTimeout(fromLocation, 0);
      });
      $rootScope.$on("$stateChangeSuccess", function () {
        window.setTimeout(fromLocation, 0);
      });
    }

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

  function wipeEverything() {
    unlockedKeys = [];
    failed = {};
    lastHandled = "";
    if (decryptedCache) decryptedCache.clear();
    releaseBlobUrls();
    clearInPlace();
    try {
      vault.wipe(window.localStorage, [vaultKey(), contactsKey()]);
      note("wiped stored key material");
    } catch (error) {
      note("wipe failed");
    }
  }

  function observeLogout() {
    var previous = window.mc_logout;
    window.mc_logout = function () {
      wipeEverything();
      if (typeof previous === "function") return previous.apply(this, arguments);
      return undefined;
    };

    document.addEventListener(
      "click",
      function (event) {
        var anchor = event.target && event.target.closest && event.target.closest("a[href]");
        if (!anchor) return;
        if (!/logoff|logout/i.test(anchor.getAttribute("href") || "")) return;
        wipeEverything();
      },
      true
    );
  }

  function htmlToText(html) {
    var holder = document.createElement("div");
    holder.innerHTML = String(html);
    return holder.textContent || "";
  }

  function confirmPlainSend(hasAttachments) {
    var $mdDialog = service("$mdDialog");
    if (!$mdDialog) return Promise.resolve(true);

    var state = { text: labels, hasAttachments: hasAttachments };
    state.confirm = function () {
      $mdDialog.hide(true);
    };
    return showDialog(CONFIRM_TEMPLATE, state).then(function (result) {
      return result === true;
    });
  }

  async function ownPublicKey() {
    return unlockedKeys.length ? unlockedKeys[0].toPublic() : null;
  }

  async function prepareOutgoing(message) {
    var settings = readSending();
    if (!settings.sign && !settings.encrypt) return;

    var recipients = []
      .concat(message.to || [], message.cc || [], message.bcc || [])
      .filter(Boolean);
    if (!recipients.length) return;

    var match = core.keysForRecipients(recipients, readContacts());
    var wantEncrypt =
      settings.encrypt && match.found.length > 0 && match.missing.length === 0;
    var wantSign = settings.sign;
    if (!wantEncrypt && !wantSign) return;

    if (!unlockedKeys.length) {
      if (!readVault()) {
        note("outgoing: no key stored, sending as is");
        return;
      }
      if (!(await askForPassword())) throw { code: "send-cancelled" };
    }

    var hasAttachments = Boolean(
      (message.attachmentAttrs && message.attachmentAttrs.length) ||
        (message.attachments && message.attachments.length)
    );
    if (message.isHTML || (wantEncrypt && hasAttachments)) {
      if (!(await confirmPlainSend(wantEncrypt && hasAttachments))) {
        throw { code: "send-cancelled" };
      }
    }

    var text = message.isHTML ? htmlToText(message.text || "") : String(message.text || "");

    if (wantEncrypt) {
      var recipientKeys = [];
      for (var index = 0; index < match.found.length; index++) {
        recipientKeys.push(
          await window.openpgp.readKey({ armoredKey: match.found[index].armored })
        );
      }
      var mine = await ownPublicKey();
      if (mine) recipientKeys.push(mine);

      message.text = await core.encryptText(
        text,
        recipientKeys,
        wantSign ? unlockedKeys[0] : null
      );
      note("outgoing: encrypted to " + recipientKeys.length + " keys");
    } else {
      message.text = await core.signText(text, unlockedKeys[0]);
      note("outgoing: signed");
    }

    message.isHTML = 0;
  }

  function observeSending() {
    var Message = service("Message");
    if (!Message || !Message.prototype || Message.prototype.$mailcowPgpWrapped) return false;

    var $q = service("$q");
    var original = Message.prototype.$send;
    if (typeof original !== "function") return false;

    Message.prototype.$send = function () {
      var self = this;
      var args = arguments;
      var started = prepareOutgoing(self);
      var chained = $q ? $q.when(started) : Promise.resolve(started);
      return chained.then(function () {
        return original.apply(self, args);
      });
    };
    Message.prototype.$mailcowPgpWrapped = true;
    note("outgoing: send wrapped");
    return true;
  }

  function isPreferencesPage() {
    return /\/preferences/i.test(window.location.pathname || "");
  }

  function install() {
    window.MailcowPGP = { selfTest: selfTest, trace: trace, wipe: null };

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
    decryptedCache = core.createCache(20);
    window.MailcowPGP.wipe = wipeEverything;

    var style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    observeLogout();

    if (isPreferencesPage()) {
      waitForPreferences();
      note("installed on preferences");
      return;
    }

    observeRequests();
    observeLocation();
    if (!observeSending()) {
      window.setTimeout(observeSending, 2000);
    }
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
