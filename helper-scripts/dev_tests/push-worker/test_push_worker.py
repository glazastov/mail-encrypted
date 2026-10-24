#!/usr/bin/env python3

import importlib.util
import os
import sqlite3
import tempfile
import unittest


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MODULE_PATH = os.path.join(ROOT, "data", "Dockerfiles", "dovecot", "push-worker.py")
SPEC = importlib.util.spec_from_file_location("push_worker", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PushWorkerTest(unittest.TestCase):
    def test_lmtp_nao_carrega_push(self):
        with open(
            os.path.join(ROOT, "data", "Dockerfiles", "dovecot", "docker-entrypoint.sh"),
            encoding="utf-8",
        ) as arquivo:
            entrypoint = arquivo.read()
        with open(
            os.path.join(ROOT, "data", "conf", "dovecot", "dovecot.conf"),
            encoding="utf-8",
        ) as arquivo:
            configuracao = arquivo.read()
        self.assertNotIn("push_notification", entrypoint)
        self.assertNotIn("push_notification_driver", configuracao)

    def test_deriva_endereco_apenas_da_caixa_de_entrada(self):
        caminho = "/var/vmail/example.org/alice/Maildir/new/123:2,S"
        self.assertEqual(MODULE.endereco_do_caminho(caminho), "alice@example.org")

    def test_rejeita_caminho_fora_da_caixa_de_entrada(self):
        caminho = "/var/vmail/example.org/alice/Maildir/cur/123:2,S"
        self.assertIsNone(MODULE.endereco_do_caminho(caminho))

    def test_rejeita_travessia_de_caminho(self):
        caminho = "/var/vmail/example.org/../other/Maildir/new/123"
        self.assertIsNone(MODULE.endereco_do_caminho(caminho))

    def test_fila_e_idempotente(self):
        with tempfile.TemporaryDirectory() as diretorio:
            banco = sqlite3.connect(os.path.join(diretorio, "queue.sqlite3"))
            MODULE.prepara_banco(banco)
            caminho = "/var/vmail/example.org/alice/Maildir/new/123"
            MODULE.enfileira(banco, caminho, "alice@example.org")
            MODULE.enfileira(banco, caminho, "alice@example.org")
            total = banco.execute("SELECT COUNT(*) FROM notificacoes").fetchone()[0]
            self.assertEqual(total, 1)
            banco.close()

    def test_falha_de_envio_mantem_item_e_programa_reagenda(self):
        with tempfile.TemporaryDirectory() as diretorio:
            banco = sqlite3.connect(os.path.join(diretorio, "queue.sqlite3"))
            MODULE.prepara_banco(banco)
            MODULE.enfileira(banco, "/var/vmail/example.org/alice/Maildir/new/123", "alice@example.org")
            original = MODULE.envia
            MODULE.envia = lambda *args: (_ for _ in ()).throw(OSError("indisponivel"))
            try:
                self.assertTrue(MODULE.processa_uma(banco, "https://example.org", "token", 1, 100))
            finally:
                MODULE.envia = original
            registro = banco.execute(
                "SELECT tentativas, proxima_tentativa FROM notificacoes"
            ).fetchone()
            self.assertEqual(registro[0], 1)
            self.assertGreater(registro[1], 100)
            banco.close()


if __name__ == "__main__":
    unittest.main()
