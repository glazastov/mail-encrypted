#!/usr/bin/env python3
"""Saves mail through the PGP storage plugin the ways a message enters a mailbox.

IMAP APPEND, MULTIAPPEND, CATENATE and LMTP, with literals sent in chunks as a
client over the network does. Dovecot runs the plugins mailcow loads (quota,
acl, zlib, mail_crypt), so the stored mail is read back with doveadm. The
filter is a stand-in that prepends a header, and exits 75 for users whose name
starts with "fail", as the real one does when a message cannot be encrypted.

Runs inside the container built by run.sh:

  ./run.sh
"""

import glob
import os
import shutil
import socket
import subprocess
import sys
import time

failures = []
checks = [0]


def check(name, cond, detail=""):
    checks[0] += 1
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else "  " + detail))
    if not cond:
        failures.append(name)


def message(tag, size):
    body = b"".join(b"line %06d of %s\r\n" % (i, tag.encode())
                    for i in range(size // 20 + 1))
    return (b"From: a@example.org\r\nTo: b@example.org\r\nSubject: " +
            tag.encode() + b"\r\n\r\n" + body)


class Imap:
    def __init__(self, user):
        self.s = socket.create_connection(("127.0.0.1", 143))
        self.buf = b""
        self.n = 0
        self.readline()
        self.cmd(b"LOGIN %s pw" % user.encode())

    def readline(self):
        while b"\r\n" not in self.buf:
            data = self.s.recv(65536)
            if not data:
                raise EOFError("connection closed")
            self.buf += data
        line, self.buf = self.buf.split(b"\r\n", 1)
        return line

    def tagged(self, tag):
        while True:
            line = self.readline()
            if line.startswith(tag + b" "):
                return line

    def cmd(self, text):
        self.n += 1
        tag = b"a%d" % self.n
        self.s.sendall(tag + b" " + text + b"\r\n")
        return self.tagged(tag)

    def append(self, parts, chunk=4096, delay=0.002, catenate=False):
        """parts: the messages of a MULTIAPPEND, or the TEXT parts of a CATENATE."""
        self.n += 1
        tag = b"a%d" % self.n
        self.s.sendall(tag + b" APPEND INBOX" + (b" CATENATE (" if catenate else b""))
        for i, part in enumerate(parts):
            sep = b" " if not catenate or i else b""
            self.s.sendall(sep + (b"TEXT " if catenate else b"") + b"{%d}\r\n" % len(part))
            line = self.readline()
            if not line.startswith(b"+"):
                return line
            for off in range(0, len(part), chunk):
                self.s.sendall(part[off:off + chunk])
                if delay:
                    time.sleep(delay)
        self.s.sendall((b")" if catenate else b"") + b"\r\n")
        return self.tagged(tag)

    def logout(self):
        self.cmd(b"LOGOUT")
        self.s.close()


def doveadm(*args):
    return subprocess.run(["doveadm"] + list(args), capture_output=True, check=True).stdout


def stored(user):
    """The messages in the user's INBOX, as read back through the storage."""
    uids = doveadm("search", "-u", user, "mailbox", "INBOX", "all").split()[1::2]
    msgs = []
    for uid in uids:
        out = doveadm("-f", "pager", "fetch", "-u", user, "text",
                      "mailbox", "INBOX", "uid", uid.decode())
        assert out.startswith(b"text:\n"), out[:40]
        msg = out[len(b"text:\n"):]
        if msg.endswith(b"\f\n"):
            msg = msg[:-2]
        msgs.append(msg.replace(b"\r\n", b"\n"))
    return msgs


def reset(user):
    shutil.rmtree("/var/vmail/" + user, ignore_errors=True)


def expected(user, msg):
    msg = msg.replace(b"\r\n", b"\n")
    if user.startswith("fail") or user == "plain":
        return msg
    return b"X-Fake-Encrypted: " + user.encode() + b"\n" + msg


def check_saved(name, user, resp, msgs):
    if user == "faildefer":
        check(name + " refused", b" NO " in resp, resp.decode())
        check(name + " stores nothing", stored(user) == [])
    else:
        check(name + " accepted", b" OK " in resp, resp.decode())
        got = stored(user)
        check(name + " stored exactly",
              sorted(got) == sorted(expected(user, m) for m in msgs),
              "stored sizes %s" % [len(g) for g in got])


def lmtp_deliver(user, msg):
    s = socket.create_connection(("127.0.0.1", 24))
    f = s.makefile("rb")

    def reply(line=None):
        if line is not None:
            s.sendall(line + b"\r\n")
        while True:
            r = f.readline()
            if r[3:4] != b"-":
                return r

    reply()
    reply(b"LHLO test")
    reply(b"MAIL FROM:<a@example.org>")
    reply(b"RCPT TO:<%s>" % user.encode())
    reply(b"DATA")
    s.sendall(msg.replace(b"\r\n.", b"\r\n..") + b".\r\n")
    resp = reply()
    s.sendall(b"QUIT\r\n")
    s.close()
    return resp


# defer and deliver encrypt; faildefer refuses and faildeliver stores in the
# clear when the filter fails; plain has storage encryption off.
for user in ["defer", "deliver", "faildefer", "faildeliver", "plain"]:
    # A message that arrives in one packet is still not there at
    # save_begin(): Dovecot begins the save before sending "+".
    for shape, size, chunk, delay in [
        ("one packet", 300, 1 << 20, 0),
        ("200K in 4K chunks", 200_000, 4096, 0.002),
        ("2M in 64K chunks", 2_000_000, 65536, 0.001),
    ]:
        reset(user)
        c = Imap(user)
        msg = message("%s %s" % (user, shape), size)
        check_saved("%s: APPEND %s" % (user, shape), user, c.append([msg], chunk, delay), [msg])
        c.logout()

    reset(user)
    c = Imap(user)
    m1, m2 = message(user + " multi 1", 100_000), message(user + " multi 2", 150_000)
    check_saved("%s: MULTIAPPEND" % user, user, c.append([m1, m2]), [m1, m2])
    c.logout()

    reset(user)
    c = Imap(user)
    full = message(user + " catenate", 120_000)
    half = len(full) // 2
    check_saved("%s: CATENATE" % user, user,
                c.append([full[:half], full[half:]], catenate=True), [full])
    c.logout()

    reset(user)
    msg = message(user + " lmtp", 300_000)
    resp = lmtp_deliver(user, msg)
    name = "%s: LMTP" % user
    if user == "faildefer":
        check(name + " deferred", resp.startswith(b"4"), resp.decode())
        check(name + " stores nothing", stored(user) == [])
    else:
        check(name + " accepted", resp.startswith(b"250"), resp.decode())
        got = stored(user)
        # LMTP puts Return-Path and Delivered-To ahead of the filtered message
        ok = len(got) == 1 and got[0].endswith(msg.replace(b"\r\n", b"\n"))
        encrypted = len(got) == 1 and b"X-Fake-Encrypted: " in got[0]
        want_encrypted = expected(user, b"") != b""
        check(name + " stored", ok and encrypted == want_encrypted,
              "stored sizes %s" % [len(g) for g in got])

# A refused save leaves the mailbox usable for the next one.
user = "overquota"
reset(user)
c = Imap(user)
resp = c.append([message("over", 1_000_000)], 16384, 0.001)
check("overquota: APPEND refused", b" NO " in resp and b"QUOTA" in resp.upper(), resp.decode())
check("overquota: stores nothing", stored(user) == [])
small = message("fits", 10_000)
resp = c.append([small])
check("overquota: a message that fits is accepted", b" OK " in resp, resp.decode())
check("overquota: and stored", stored(user) == [expected(user, small)])
c.logout()

leftover = glob.glob("/tmp/dovecot.*")
check("no temporary files left behind", leftover == [], str(leftover))

print("\n%d checks, %d failed" % (checks[0], len(failures)))
sys.exit(1 if failures else 0)
