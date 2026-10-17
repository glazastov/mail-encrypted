#!/usr/bin/env python3
"""Drives estelaz-push.lua against a fake `dovecot` API, with no Dovecot running.

The script is loaded by the real `lua` interpreter, so the assertions cover the
actual control flow: which deliveries notify, what the payload looks like, and
that a broken HTTP client never escapes as an error. The fake API records every
call instead of reaching the network.

  ./test_push_lua.py
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(
    HERE, "..", "..", "..",
    "data", "conf", "dovecot", "estelaz-push.lua",
)

failures = []
checks = [0]


def check(name, actual, expected):
    checks[0] += 1
    if actual == expected:
        return
    failures.append(name)
    sys.stderr.write(
        "FAIL {}\n  expected: {!r}\n  actual:   {!r}\n".format(name, expected, actual)
    )


HARNESS = r"""
local alvo = os.getenv("ALVO_LUA")
local modo = os.getenv("MODO_HTTP") or "ok"
local status = tonumber(os.getenv("STATUS_HTTP") or "202")

local registro = { pedidos = {}, avisos = {}, clientes = {} }

local function resposta()
  return { status = function() return status end }
end

local function pedido(_, opcoes)
  local atual = { url = opcoes.url, method = opcoes.method, headers = {}, payload = nil }
  table.insert(registro.pedidos, atual)

  return {
    add_header = function(_, nome, valor) atual.headers[nome] = valor end,
    set_payload = function(_, corpo) atual.payload = corpo end,
    submit = function()
      if modo == "explode" then error("conexao recusada") end
      return resposta()
    end,
  }
end

dovecot = {
  http = {
    client = function(opcoes)
      table.insert(registro.clientes, opcoes)
      if modo == "sem_cliente" then error("TLS not enabled") end
      return { request = pedido }
    end,
  },
  i_warning = function(texto) table.insert(registro.avisos, texto) end,
  i_error = function(texto) table.insert(registro.avisos, texto) end,
  i_info = function() end,
  i_debug = function() end,
}

assert(loadfile(alvo))()

local function entrega(usuario, eventos)
  local ctx = dovecot_lua_notify_begin_txn({ username = usuario })
  for _, evento in ipairs(eventos) do
    dovecot_lua_notify_event_message_new(ctx, evento)
  end
  dovecot_lua_notify_end_txn(ctx)
end

local roteiro = os.getenv("ROTEIRO")

if roteiro == "inbox" then
  entrega("Teste@Example.ORG", { { mailbox = "INBOX", uid = 1 } })
elseif roteiro == "outra_pasta" then
  entrega("teste@example.org", { { mailbox = "Junk", uid = 1 } })
elseif roteiro == "duas_na_inbox" then
  entrega("teste@example.org", { { mailbox = "INBOX", uid = 1 }, { mailbox = "INBOX", uid = 2 } })
elseif roteiro == "junk_e_inbox" then
  entrega("teste@example.org", { { mailbox = "Junk", uid = 1 }, { mailbox = "INBOX", uid = 2 } })
elseif roteiro == "sem_arroba" then
  entrega("semarroba", { { mailbox = "INBOX", uid = 1 } })
elseif roteiro == "pasta_com_aspas" then
  entrega('a"b@example.org', { { mailbox = "INBOX", uid = 1 } })
end

local saida = { pedidos = {}, avisos = registro.avisos, clientes = registro.clientes }

for i, p in ipairs(registro.pedidos) do
  saida.pedidos[i] = {
    url = p.url,
    method = p.method,
    payload = p.payload,
    autorizacao = p.headers["Authorization"],
    tipo = p.headers["Content-Type"],
  }
end

local function escapa(texto)
  return (texto:gsub('[\\"]', "\\%0"):gsub("%c", function(c)
    return string.format("\\u%04x", c:byte())
  end))
end

local function serializa(valor)
  if type(valor) == "table" then
    local vazio = true
    for _ in pairs(valor) do vazio = false break end
    if vazio then return "[]" end

    if valor[1] ~= nil then
      local partes = {}
      for _, v in ipairs(valor) do table.insert(partes, serializa(v)) end
      return "[" .. table.concat(partes, ",") .. "]"
    end

    local chaves = {}
    for k in pairs(valor) do table.insert(chaves, k) end
    table.sort(chaves)

    local partes = {}
    for _, k in ipairs(chaves) do
      table.insert(partes, '"' .. escapa(k) .. '":' .. serializa(valor[k]))
    end
    return "{" .. table.concat(partes, ",") .. "}"
  elseif type(valor) == "string" then
    return '"' .. escapa(valor) .. '"'
  elseif valor == nil then
    return "null"
  else
    return tostring(valor)
  end
end

io.write(serializa(saida))
"""


def roda(roteiro, ambiente=None, modo="ok", status=202):
    env = dict(os.environ)
    env.pop("ESTELAZ_PUSH_URL", None)
    env.pop("ESTELAZ_PUSH_TOKEN", None)
    env.pop("ESTELAZ_PUSH_TIMEOUT", None)
    env.update(
        {
            "ALVO_LUA": SCRIPT,
            "ROTEIRO": roteiro,
            "MODO_HTTP": modo,
            "STATUS_HTTP": str(status),
        }
    )
    env.update(ambiente or {})

    processo = subprocess.run(
        ["lua", "-"],
        input=HARNESS,
        env=env,
        capture_output=True,
        text=True,
    )

    if processo.returncode != 0:
        raise RuntimeError(
            "lua falhou no roteiro {}: {}".format(roteiro, processo.stderr.strip())
        )

    return json.loads(processo.stdout)


CONFIGURADO = {
    "ESTELAZ_PUSH_URL": "https://plataforma.example.org/",
    "ESTELAZ_PUSH_TOKEN": "token-de-teste",
}

RAIZ = os.path.join(HERE, "..", "..", "..")
DOVECOT_CONF = os.path.join(RAIZ, "data", "conf", "dovecot", "dovecot.conf")
ENTRYPOINT = os.path.join(
    RAIZ, "data", "Dockerfiles", "dovecot", "docker-entrypoint.sh"
)
COMPOSE = os.path.join(RAIZ, "docker-compose.yml")


def conteudo(caminho):
    with open(caminho, "r", encoding="utf-8") as arquivo:
        return arquivo.read()


def confere_fiacao():
    """The Sieve trigger this replaces shipped unwired and never fired once.

    These checks assert the plumbing, not the script: a driver pointing at a
    missing file, a plugin missing from the LMTP list or an unexported variable
    each leave the feature silently dead.
    """
    dovecot_conf = conteudo(DOVECOT_CONF)
    entrypoint = conteudo(ENTRYPOINT)
    compose = conteudo(COMPOSE)

    check(
        "fiação: o driver aponta para o script",
        "push_notification_driver = lua:file=/etc/dovecot/estelaz-push.lua" in dovecot_conf,
        True,
    )
    check(
        "fiação: o script existe no caminho montado",
        os.path.isfile(os.path.join(RAIZ, "data", "conf", "dovecot", "estelaz-push.lua")),
        True,
    )
    check(
        "fiação: a pasta do script é montada em /etc/dovecot",
        "./data/conf/dovecot:/etc/dovecot:z" in compose,
        True,
    )

    lmtp = [
        linha for linha in entrypoint.splitlines()
        if "mail_plugins_lmtp" in linha and "echo -n" in linha
    ]
    check("fiação: os dois ramos de FTS definem o lmtp", len(lmtp), 2)
    for i, linha in enumerate(lmtp):
        check(
            "fiação: ramo {} carrega push_notification".format(i),
            "push_notification" in linha,
            True,
        )
        check(
            "fiação: ramo {} carrega push_notification_lua".format(i),
            "push_notification_lua" in linha,
            True,
        )
        check(
            "fiação: ramo {} mantém o notify, exigido pelo push".format(i),
            "notify" in linha,
            True,
        )

    for variavel in ("ESTELAZ_PUSH_URL", "ESTELAZ_PUSH_TOKEN", "ESTELAZ_PUSH_TIMEOUT"):
        check(
            "fiação: {} sobrevive à limpeza de ambiente".format(variavel),
            any(
                variavel in linha
                for linha in dovecot_conf.splitlines()
                if linha.startswith("import_environment")
            ),
            True,
        )
        check(
            "fiação: {} chega ao contêiner".format(variavel),
            variavel in compose,
            True,
        )

    check(
        "fiação: o caminho Sieve antigo não voltou",
        "estelaz-avisa-push" in compose or "aviso-de-push" in dovecot_conf,
        False,
    )


def main():
    confere_fiacao()

    entregue = roda("inbox", CONFIGURADO)
    check("inbox: avisa uma vez", len(entregue["pedidos"]), 1)
    check(
        "inbox: bate no caminho do gancho",
        entregue["pedidos"][0]["url"],
        "https://plataforma.example.org/hooks/push/entrega",
    )
    check("inbox: usa POST", entregue["pedidos"][0]["method"], "POST")
    check(
        "inbox: manda o token como Bearer",
        entregue["pedidos"][0]["autorizacao"],
        "Bearer token-de-teste",
    )
    check(
        "inbox: declara JSON",
        entregue["pedidos"][0]["tipo"],
        "application/json",
    )
    check(
        "inbox: endereço em minúsculas e pasta, sem mais nada",
        json.loads(entregue["pedidos"][0]["payload"]),
        {"address": "teste@example.org", "folder": "INBOX"},
    )
    check("inbox: não registra aviso", entregue["avisos"], [])
    check(
        "inbox: uma só tentativa, com prazo",
        entregue["clientes"][0],
        {"max_attempts": 1, "request_timeout_msecs": 2000},
    )

    outra = roda("outra_pasta", CONFIGURADO)
    check("outra pasta: não avisa", len(outra["pedidos"]), 0)

    junk = roda("junk_e_inbox", CONFIGURADO)
    check("junk antes da inbox: avisa uma vez", len(junk["pedidos"]), 1)

    duas = roda("duas_na_inbox", CONFIGURADO)
    check("duas na inbox: um aviso só por entrega", len(duas["pedidos"]), 1)

    sem_token = roda("inbox", {"ESTELAZ_PUSH_URL": "https://plataforma.example.org"})
    check("sem token: sai calado", len(sem_token["pedidos"]), 0)
    check("sem token: não registra aviso", sem_token["avisos"], [])

    sem_url = roda("inbox", {"ESTELAZ_PUSH_TOKEN": "token-de-teste"})
    check("sem url: sai calado", len(sem_url["pedidos"]), 0)

    desconfigurado = roda("inbox", {})
    check("sem nada configurado: sai calado", len(desconfigurado["pedidos"]), 0)

    sem_arroba = roda("sem_arroba", CONFIGURADO)
    check("usuário sem arroba: não envia", len(sem_arroba["pedidos"]), 0)
    check("usuário sem arroba: registra aviso", len(sem_arroba["avisos"]), 1)

    aspas = roda("pasta_com_aspas", CONFIGURADO)
    check(
        "endereço com aspas: JSON segue válido",
        json.loads(aspas["pedidos"][0]["payload"])["address"],
        'a"b@example.org',
    )

    explodiu = roda("inbox", CONFIGURADO, modo="explode")
    check("submit que explode: registra aviso", len(explodiu["avisos"]), 1)
    check("submit que explode: nada foi entregue", len(explodiu["pedidos"]), 1)

    sem_cliente = roda("inbox", CONFIGURADO, modo="sem_cliente")
    check("cliente que explode: registra aviso", len(sem_cliente["avisos"]), 1)
    check("cliente que explode: nenhum pedido sai", len(sem_cliente["pedidos"]), 0)

    recusado = roda("inbox", CONFIGURADO, status=401)
    check("plataforma recusa: registra o status", len(recusado["avisos"]), 1)
    check(
        "plataforma recusa: diz o código",
        "401" in recusado["avisos"][0],
        True,
    )

    aceito = roda("inbox", CONFIGURADO, status=202)
    check("plataforma aceita: nenhum aviso", aceito["avisos"], [])

    prazo = roda("inbox", dict(CONFIGURADO, ESTELAZ_PUSH_TIMEOUT="5"))
    check(
        "prazo configurado vira milissegundos",
        prazo["clientes"][0]["request_timeout_msecs"],
        5000,
    )

    prazo_ruim = roda("inbox", dict(CONFIGURADO, ESTELAZ_PUSH_TIMEOUT="abacaxi"))
    check(
        "prazo inválido cai no padrão",
        prazo_ruim["clientes"][0]["request_timeout_msecs"],
        2000,
    )

    prazo_zero = roda("inbox", dict(CONFIGURADO, ESTELAZ_PUSH_TIMEOUT="0"))
    check(
        "prazo zero cai no padrão",
        prazo_zero["clientes"][0]["request_timeout_msecs"],
        2000,
    )

    espacos = roda(
        "inbox",
        {
            "ESTELAZ_PUSH_URL": "  https://plataforma.example.org  ",
            "ESTELAZ_PUSH_TOKEN": "  token-de-teste  ",
        },
    )
    check(
        "espaços em volta da url e do token são aparados",
        espacos["pedidos"][0]["url"],
        "https://plataforma.example.org/hooks/push/entrega",
    )
    check(
        "token aparado",
        espacos["pedidos"][0]["autorizacao"],
        "Bearer token-de-teste",
    )

    corpo = json.loads(roda("inbox", CONFIGURADO)["pedidos"][0]["payload"])
    for proibido in ("subject", "from", "from_address", "from_display_name", "snippet", "uid"):
        check(
            "payload não carrega {}".format(proibido),
            proibido in corpo,
            False,
        )

    sys.stderr.write("\n{} checagens, {} falhas\n".format(checks[0], len(failures)))
    for nome in failures:
        sys.stderr.write("  - {}\n".format(nome))

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
