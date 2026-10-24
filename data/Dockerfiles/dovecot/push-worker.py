#!/usr/bin/env python3

import os
import json
import select
import sqlite3
import sys
import time
import urllib.error
import urllib.request


RAIZ_MAIL = "/var/vmail"
CAMINHO = "/hooks/push/entrega"
BANCO_PADRAO = "/var/vmail/.estelaz-push/queue.sqlite3"


def endereco_do_caminho(caminho):
    if any(parte == ".." for parte in caminho.split(os.sep)):
        return None

    caminho_real = os.path.realpath(caminho)
    raiz_real = os.path.realpath(RAIZ_MAIL)

    try:
        if os.path.commonpath((raiz_real, caminho_real)) != raiz_real:
            return None
    except ValueError:
        return None

    partes = os.path.relpath(os.path.normpath(caminho), RAIZ_MAIL).split(os.sep)
    if len(partes) < 5 or partes[-2] != "new":
        return None

    dominio, usuario = partes[0], partes[1]
    endereco = "{}@{}".format(usuario, dominio).lower()
    local, separador, dominio_normalizado = endereco.partition("@")
    if not separador or not local or not dominio_normalizado:
        return None
    if any(parte in ("", ".", "..") for parte in (dominio, usuario)):
        return None
    return endereco


def prepara_banco(banco):
    banco.execute(
        "CREATE TABLE IF NOT EXISTS notificacoes ("
        "caminho TEXT PRIMARY KEY, endereco TEXT NOT NULL, tentativas INTEGER NOT NULL DEFAULT 0, "
        "proxima_tentativa REAL NOT NULL DEFAULT 0)"
    )
    banco.commit()


def enfileira(banco, caminho, endereco):
    banco.execute(
        "INSERT OR IGNORE INTO notificacoes (caminho, endereco) VALUES (?, ?)",
        (caminho, endereco),
    )
    banco.commit()


def envia(url, token, endereco, timeout):
    pedido = urllib.request.Request(
        url.rstrip("/") + CAMINHO,
        data=json.dumps({"address": endereco, "folder": "INBOX"}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
        method="POST",
    )
    with urllib.request.urlopen(pedido, timeout=timeout) as resposta:
        if resposta.status < 200 or resposta.status >= 300:
            raise RuntimeError("resposta HTTP fora da faixa de sucesso")


def processa_uma(banco, url, token, timeout, agora):
    registro = banco.execute(
        "SELECT caminho, endereco, tentativas FROM notificacoes "
        "WHERE proxima_tentativa <= ? ORDER BY proxima_tentativa, caminho LIMIT 1",
        (agora,),
    ).fetchone()
    if registro is None:
        return False

    caminho, endereco, tentativas = registro
    try:
        envia(url, token, endereco, timeout)
    except Exception:
        espera = min(300, 2 ** min(tentativas + 1, 8))
        banco.execute(
            "UPDATE notificacoes SET tentativas = ?, proxima_tentativa = ? WHERE caminho = ?",
            (tentativas + 1, agora + espera, caminho),
        )
    else:
        banco.execute("DELETE FROM notificacoes WHERE caminho = ?", (caminho,))
    banco.commit()
    return True


def principal():
    url = os.environ.get("ESTELAZ_PUSH_URL", "").strip()
    token = os.environ.get("ESTELAZ_PUSH_TOKEN", "").strip()
    if not url or not token:
        return 0

    diretorio = os.path.dirname(os.environ.get("ESTELAZ_PUSH_QUEUE", BANCO_PADRAO))
    os.makedirs(diretorio, mode=0o700, exist_ok=True)
    banco = sqlite3.connect(os.environ.get("ESTELAZ_PUSH_QUEUE", BANCO_PADRAO))
    prepara_banco(banco)
    timeout = max(0.1, float(os.environ.get("ESTELAZ_PUSH_TIMEOUT", "2")))

    while True:
        leitura, _, _ = select.select([sys.stdin], [], [], 0.5)
        if leitura:
            linha = sys.stdin.readline()
            if not linha:
                return 0
            caminho = linha.rstrip("\n")
            endereco = endereco_do_caminho(caminho)
            if endereco:
                enfileira(banco, caminho, endereco)
        while processa_uma(banco, url, token, timeout, time.time()):
            pass


if __name__ == "__main__":
    try:
        sys.exit(principal())
    except KeyboardInterrupt:
        sys.exit(0)
