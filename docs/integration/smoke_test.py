#!/usr/bin/env python3
"""
PRSLOY <-> Hellcat integration smoke test.

Reproduces EXACTLY what the PRSLOY site (src/lib/marzneshin-proxy.ts) sends to your
backend's  POST /external/issue-key , and validates the response the SAME way the site does.
If every check here is green against your LIVE endpoint, the handshake + contract are correct
and real paid orders will issue keys. NO real payment is involved.

It DOES create real (test) Marzneshin users for the test ids below -> delete them afterwards.

Usage:
    python3 smoke_test.py --url https://your-public-endpoint.example.com --secret 'THE_SHARED_SECRET'
  or via env:
    PRSLOY_PROXY_URL=...  PRSLOY_PROXY_SECRET=...  python3 smoke_test.py

Stdlib only - no pip install needed (Python 3.8+).
"""

import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import urllib.error
import urllib.request

TIMEOUT_S = 10  # mirror the site's 10s abort


# ---- exact reproduction of what the site sends -----------------------------

def canonical_body(payment_id, period_days, prsloy_user_id, email):
    """Byte-for-byte match of the site's JSON.stringify: compact, fixed key
    order, period_days as a bare number, UTF-8, no trailing newline."""
    obj = {
        "payment_id": payment_id,
        "period_days": period_days,
        "prsloy_user_id": prsloy_user_id,
        "email": email,
    }
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sign(raw, secret):
    """HMAC-SHA256 over the RAW body bytes, key = trimmed secret, lowercase hex.
    Mirrors marzneshin-proxy.ts: createHmac('sha256', secret.trim()).update(body).digest('hex')."""
    return hmac.new(secret.strip().encode("utf-8"), raw, hashlib.sha256).hexdigest()


def post_issue(base_url, raw, signature):
    req = urllib.request.Request(
        base_url.rstrip("/") + "/external/issue-key",
        data=raw,
        method="POST",
        headers={"Content-Type": "application/json", "X-PRSLOY-Signature": signature},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:  # 4xx/5xx
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # connection refused, TLS, timeout, DNS...
        return None, "EXC:" + repr(e)


def parse(body_text):
    try:
        return json.loads(body_text)
    except Exception:
        return None


def site_accepts(status, data):
    """Mirror src/lib/marzneshin-proxy.ts response handling: 401/400 -> reject;
    None/>=500/no-data -> reject; otherwise require non-empty marz_username +
    subscription_url (trimmed)."""
    if status is None or status in (401, 400) or status >= 500 or not isinstance(data, dict):
        return False
    mu = data.get("marz_username")
    su = data.get("subscription_url")
    mu = mu.strip() if isinstance(mu, str) else ""
    su = su.strip() if isinstance(su, str) else ""
    return bool(mu and su)


def url_public(su):
    if not isinstance(su, str):
        return False
    s = su.strip().lower()
    if not s.startswith("https://"):
        return False
    bad = ("127.0.0.1", "localhost", "0.0.0.0", "://10.", "://192.168.", "://172.16.")
    return not any(b in s for b in bad)


# ---- test runner -----------------------------------------------------------

class Runner:
    def __init__(self, base_url, secret):
        self.base_url = base_url
        self.secret = secret
        self.results = []  # (name, ok, detail)
        # Stable identity for this run; payment_id is per-call (24-hex, prod shape).
        self.uid = "smoketest-" + secrets.token_hex(6)
        self.email = "smoketest+%s@prsloy.test" % secrets.token_hex(3)
        self.issue_sub = None

    def record(self, name, ok, detail):
        self.results.append((name, ok, detail))
        mark = "PASS" if ok else "FAIL"
        print("  [%s] %s\n        %s" % (mark, name, detail))

    def call(self, payment_id, signature=None, period_days=30):
        raw = canonical_body(payment_id, period_days, self.uid, self.email)
        sig = signature if signature is not None else sign(raw, self.secret)
        status, text = post_issue(self.base_url, raw, sig)
        return status, text, parse(text), raw, sig

    # 0 - reachability + optional health
    def check_health(self):
        req = urllib.request.Request(self.base_url.rstrip("/") + "/external/health", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                self.record("health (optional)", resp.status == 200,
                            "GET /external/health -> %s" % resp.status)
        except Exception as e:
            # non-fatal; health is "с запасом"
            self.record("health (optional)", True,
                        "no /external/health (ok, optional): %r" % e)

    # 1 - fresh issue
    def check_issue(self):
        pid = secrets.token_hex(12)
        self.issue_pid = pid
        status, text, data, raw, sig = self.call(pid)
        print("        sent body: %s" % raw.decode("utf-8", "replace"))
        print("        signature: %s" % sig)
        if status is None:
            return self.record("issue (new key)", False,
                               "endpoint UNREACHABLE: %s | check public URL/TLS/firewall/IP-allowlist (brief 6)" % text)
        ok = status == 200 and site_accepts(status, data)
        su = data.get("subscription_url") if isinstance(data, dict) else None
        if ok and not url_public(su):
            return self.record("issue (new key)", False,
                               "200 but subscription_url is not a public https host: %r (brief 5)" % su)
        if ok:
            self.issue_sub = su
        self.record("issue (new key)", ok,
                    ("200 + {marz_username, subscription_url}: %s" % su) if ok
                    else self._hint(status, text, data, expect="200 + body"))

    # 2 - idempotent replay (same payment_id)
    def check_replay(self):
        status, text, data, _, _ = self.call(self.issue_pid)
        su = data.get("subscription_url") if isinstance(data, dict) else None
        ok = status == 409 and site_accepts(status, data) and su == self.issue_sub
        self.record("idempotent replay (same payment_id)", ok,
                    "409 + SAME body" if ok
                    else self._hint(status, text, data, expect="409 + same body (brief 4,5)"))

    # 3 - renewal (new payment_id, SAME user) -> same subscription_url
    def check_renewal(self):
        pid = secrets.token_hex(12)
        status, text, data, _, _ = self.call(pid)
        su = data.get("subscription_url") if isinstance(data, dict) else None
        ok = status == 200 and site_accepts(status, data) and su == self.issue_sub
        self.record("renewal (new payment_id, same user)", ok,
                    "200 + SAME subscription_url (key stable)" if ok
                    else self._hint(status, text, data,
                                    expect="200 + SAME url as issue; renewal must extend the same user by prsloy_user_id (brief 4)"))

    # 4 - bad signature -> 401
    def check_bad_sig(self):
        pid = secrets.token_hex(12)
        status, text, data, _, _ = self.call(pid, signature="00" * 32)
        ok = status == 401
        self.record("bad signature -> 401", ok,
                    "401 as expected" if ok
                    else "expected 401, got %s: %s | sign over RAW body w/ trimmed secret (brief 2,3)" % (status, _short(text)))

    # 5 - concurrency: two identical payment_id in parallel -> agree, no 5xx
    def check_concurrency(self):
        pid = secrets.token_hex(12)
        out = [None, None]

        def worker(i):
            out[i] = self.call(pid)

        ts = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        oks, subs = [], []
        for status, text, data, _, _ in out:
            oks.append(site_accepts(status, data))
            subs.append(data.get("subscription_url") if isinstance(data, dict) else None)
        ok = all(oks) and subs[0] == subs[1]
        self.record("concurrency (same payment_id x2)", ok,
                    "both accepted, same subscription_url (verify ONE marz user in admin)" if ok
                    else "parallel duplicates disagreed/failed: %r | idempotency must be atomic (brief 4)" % subs)

    def _hint(self, status, text, data, expect):
        if status is None:
            return "UNREACHABLE: %s (brief 6)" % text
        base = "expected %s, got %s." % (expect, status)
        if status == 401:
            return base + " 401: secret .strip() both sides? HMAC over RAW body? not re-serialized JSON? (brief 2,3)"
        if status in (400, 422):
            return base + " %s: don't bind a Pydantic body model / don't EmailStr-reject; 400 not 422 (brief 3)" % status
        if status >= 500:
            return base + " 5xx: Marzneshin/backend down, or a CDN/WAF HTML page instead of JSON (brief 5,6)"
        if data is None:
            return base + " body is empty/non-JSON: return JSONResponse(both fields), not empty/HTML/HTTPException (brief 5)"
        return base + " body missing marz_username/subscription_url (non-empty strings) (brief 5): %s" % _short(text)

    def run(self):
        print("PRSLOY <-> Hellcat smoke test")
        print("  endpoint: %s/external/issue-key" % self.base_url.rstrip("/"))
        print("  run user: %s   email: %s\n" % (self.uid, self.email))
        self.check_health()
        self.check_issue()
        if self.issue_sub is None:
            print("\nABORTED: the first issue failed; fix that before the rest.\n")
        else:
            self.check_replay()
            self.check_renewal()
            self.check_concurrency()
        self.check_bad_sig()
        crit = [r for r in self.results if r[0] != "health (optional)"]
        passed = sum(1 for _, ok, _ in crit if ok)
        print("\n%d/%d critical checks passed." % (passed, len(crit)))
        if passed == len(crit):
            print("ALL GREEN -> handshake + contract are correct. Still: confirm ONE marz user")
            print("per run in admin, and open subscription_url in Happ from an EXTERNAL network.")
            return 0
        print("NOT READY -> fix the FAILs above (each points to a brief section), then re-run.")
        return 1


def _short(t):
    t = (t or "").replace("\n", " ")
    return t[:160] + ("..." if len(t) > 160 else "")


def main():
    ap = argparse.ArgumentParser(description="PRSLOY issue-key smoke test")
    ap.add_argument("--url", default=os.environ.get("PRSLOY_PROXY_URL"),
                    help="public base URL of the partner endpoint (without /external/issue-key)")
    ap.add_argument("--secret", default=os.environ.get("PRSLOY_PROXY_SECRET"),
                    help="shared MARZNESHIN_PROXY_HMAC_SECRET")
    a = ap.parse_args()
    if not a.url or not a.secret:
        ap.error("need --url and --secret (or PRSLOY_PROXY_URL / PRSLOY_PROXY_SECRET env)")
    sys.exit(Runner(a.url, a.secret).run())


if __name__ == "__main__":
    main()
