# PRSLOY ↔ HELLCAT — автовыдача ключей. Handoff для Claude Code (бэкенд)

> Самодостаточный бриф. Кинь его И соседний файл `smoke_test.py` в Claude Code на стороне
> бэкенда Hellcat. Контракт ниже снят дословно из замороженного кода сайта
> (`src/lib/marzneshin-proxy.ts`) и проверен смоук-тестом.

---

## 0. ИНСТРУКЦИЯ ДЛЯ ИИ — прочитай первым и следуй

Ты — Claude Code на бэкенде Hellcat (FastAPI + Marzneshin + aiogram). Реализуй ОДИН публичный
HTTPS-эндпоинт, который сайт PRSLOY **уже умеет вызывать**, строго по разделу «СПЕЦИФИКАЦИЯ».

Порядок:
1. Реализуй `POST /external/issue-key` точно по СПЕЦИФИКАЦИИ. Это контракт **замороженного**
   клиента (сайт менять нельзя) — не меняй формат тела/ответа, путь, заголовок, коды статусов.
2. Рядом лежит `smoke_test.py` — он шлёт ровно то, что шлёт сайт, и проверяет ответ так же.
   Запусти против своего **живого** эндпоинта:
   `python3 smoke_test.py --url https://<твой-публичный-url> --secret '<общий-секрет>'`
3. Чини, пока **все** проверки не станут PASS. Каждый FAIL в выводе указывает номер раздела ниже.
4. Когда зелено — проверь в админке Marzneshin, что на один прогон создаётся **один** пользователь,
   и что `subscription_url` открывается в Happ **с внешней сети**. Потом отдай владельцу сайта
   публичный URL и секрет (он впишет их в Vercel).

НЕ додумывай «улучшения» контракта (REST-переименования полей, Bearer/timestamp/nonce, 201/429) —
они сломают замороженного клиента. Контракт непонятен — спроси владельца, не делай молча.
ВАЖНО: при любой ошибке сайт её проглатывает (только `console.warn`) и ключ просто не выдаётся.
Ошибки тут невидимы — проверяй сам смоук-тестом и чеклистом.

---

## 1. СПЕЦИФИКАЦИЯ

### 1.1 Что шлёт сайт (точно)
`POST {MARZNESHIN_PROXY_URL}/external/issue-key` — путь **ровно** такой, на корне домена, без префикса `/api`.

Заголовки (ровно эти, других нет):
- `Content-Type: application/json` (без charset; не гейти строго, не отдавай 415)
- `X-PRSLOY-Signature: <строчный hex HMAC-SHA256, без префикса sha256=, не base64>`

Тело — компактный JSON, **без пробелов**, без финального `\n`, порядок ключей фиксирован,
`period_days` — **число**:
```
{"payment_id":"<24-симв hex>","period_days":30,"prsloy_user_id":"<id>","email":"<email>"}
```
`period_days` ∈ {30, 180, 365} (календарные дни). `email` может быть нестандартным — **не браковать**.

### 1.2 Подпись (ломается чаще всего)
- Ключ HMAC = `secret.strip().encode("utf-8")`. Сайт подписывает **тримленным** секретом —
  обрежь пробелы/переводы строк в env **с обеих сторон**. «Побайтовое равенство сырого env» —
  неверно: равны должны быть тримленные значения.
- Сообщение = **ровно сырые байты тела**: `raw = await request.body()`. HMAC считай по `raw`.
  НЕ `json.loads`→`json.dumps` (Python по умолчанию `ensure_ascii=True` и ставит пробелы → для
  non-ASCII email или любого поля байты разойдутся → вечный 401).
- Сравнение: `hmac.compare_digest(computed.hexdigest(), header.strip())` — обе строки lowercase hex.
  Не uppercase, не `bytes.fromhex` без try/except.
- Нет заголовка / не сошлось / кривой hex → **401** (не 400, не 500). Имя заголовка не переименовывай
  (не Authorization/X-Signature/X-Hub-Signature-256) — сайт шлёт ровно `X-PRSLOY-Signature`.

### 1.3 Обработчик — строго этот порядок (FastAPI)
```python
async def issue_key(request: Request):     # БЕЗ Pydantic-параметра тела!
    raw = await request.body()             # один раз, ДО парсинга
    # 1) проверь HMAC по raw -> провал: 401 и выход
    # 2) data = json.loads(raw)            # вручную; JSONDecodeError/нет ключей -> 400 (не 422)
    # 3) валидация минимальна: payment_id и prsloy_user_id непустые строки,
    #    period_days in {30,180,365}, email непустая строка (НЕ EmailStr/TLD), лишние поля игнорь
    # 4) идемпотентность + выдача (раздел 1.4)
```
Почему без Pydantic-модели тела: FastAPI вычитает стрим до тела функции → `request.body()` вернёт
пусто → HMAC по `b''` → 401; и авто-валидация даст 422 раньше проверки подписи. Никаких
`request.stream()`. Не вешай request-decompression/body-rewriting middleware; reverse-proxy
(nginx/caddy) не должен трогать тело (gzip/charset/WAF-rebuffer) — байты должны дойти как есть.

### 1.4 Выдача / продление / идемпотентность (вторая по частоте поломка)
Две сущности:
- `payment_id` — ключ **идемпотентности** оплаты (новый при каждом платеже).
- `prsloy_user_id` — **личность** пользователя в Marzneshin (1:1, стабильна навсегда).

Храни **две durable-связи** (БД/Redis, не in-memory; переживают рестарт/редеплой; держать ≥14 дней):
- (a) `payment_id → {marz_username, subscription_url}`
- (b) `prsloy_user_id → marz_username`

Алгоритм (**атомарно**, под гонкой — сайт может прислать два одинаковых `payment_id` ~0.5с подряд,
второй пока первый ещё крутится):
1. Атомарно зарезервируй `payment_id` (UNIQUE / `INSERT … ON CONFLICT` / Redis `SET NX`) **до** Marzneshin.
   Если `payment_id` уже обработан → верни сохранённое (a), статус **409**.
2. Резолвни `prsloy_user_id` по (b):
   - есть marz-пользователь → **продли** его и верни **тот же** `subscription_url`:
     `expire = текущий_expire + period_days` (если активен); иначе `now + period_days`.
   - нет → создай нового (`expire = now + period_days`), сохрани (b).
   Уникальность и по `prsloy_user_id` (UNIQUE/лок): два разных `payment_id` одного юзера = **один**
   marz-пользователь, не два.
3. Сохрани (a), верни `{marz_username, subscription_url}`, статус **200**.

Всё время — **UTC** (`datetime.now(timezone.utc)`, не naive). `period_days` — календарные дни от
текущего момента (или от текущего UTC-expire при продлении), не от времени создания заказа, не в секундах.

### 1.5 Ответы (сайт распознаёт успех ТОЛЬКО по 200 и 409)
- **200** — новый ключ. **409** — повтор того же `payment_id`.
- Тело 200 **и** 409 **одинаковое**, валидный непустой JSON, `Content-Type: application/json`,
  обе строки непустые после trim:
  `{"marz_username":"...","subscription_url":"https://<публичный>/sub/..."}`
- НЕ 201/204/3xx, НЕ пустое тело, НЕ `raise HTTPException(409)` (он даёт `{"detail":...}` без наших
  полей → сайт покажет ошибку). Для 409 используй `JSONResponse(status_code=409, content=сохранённое)`.
- **401** — подпись. **400** — кривой/неполный вход (не 422). **5xx** — реальное падение Marzneshin/бэкенда.
- **НЕ ставь rate-limit и не возвращай 429** на трафик сайта: сайт не ретраит 4xx и трактует 429 как
  malformed → ключ платящего теряется без повтора. Перегрузка → 5xx (его сайт повторит один раз).
- `subscription_url` — публичный https с **внешним** хостом, открывается из интернета и из РФ. Не
  127.0.0.1, не внутренний хост Marzneshin, не за челленджем. Если Marzneshin отдаёт внутренний
  sub-URL — перепиши хост на публичный домен прокси. Проверяй с внешней сети, не с самого сервера.

### 1.6 Сеть / деплой
- Публичный TLS. Сайт ходит как **Vercel Serverless Function с динамических IP** (большой ротируемый
  пул) — не делай IP-allowlist, не geo-block, не Cloudflare «Under Attack»/JS-challenge/bot-fight.
  Единственный гейт — HMAC.
- Любой статус (200/400/401/409/5xx) возвращай как `application/json`. Если перед FastAPI есть
  nginx/CDN — его страницы ошибок (502/504/челлендж) не должны быть HTML: сайт парсит JSON,
  не-JSON-тело = падение апстрима.
- Обработчик обязан ответить за **~8с** (сайт обрывает на 10с). Поставь **свой** таймаут (~6с) на
  вызов Marzneshin → при тормозах верни JSON-5xx быстро, а не дай оборвать тебя на середине создания.
- Логируй каждый вызов: `payment_id`, итоговый статус, длительность.

### 1.7 Без анти-реплей
Не добавляй timestamp/nonce/anti-replay/freshness-окно: сайт повторяет тот же байт-идентичный запрос
(retry после таймаута; поздний реплей), который **должен** проходить. От реплея защищает
идемпотентность по `payment_id`.

### 1.8 ENV и владение
Один и тот же секрет в **двух** местах:
- твой хост: `MARZNESHIN_PROXY_HMAC_SECRET`
- владелец в Vercel → Settings → Environment Variables (Production): то же
  `MARZNESHIN_PROXY_HMAC_SECRET` + `MARZNESHIN_PROXY_URL` (твой публичный URL).

Генерь как hex: `openssl rand -hex 32` (переживает копипаст). Читай со `.strip()`. Авто-выдача на
сайте включается **только** когда обе переменные заданы в Vercel.
(с запасом, без авторизации) `GET /external/health` → 200 `{"ok":true}`.

### 1.9 Чеклист готовности (все «да»)
- [ ] `/external/issue-key` публичный https, доступен с Vercel (без IP-allowlist/CDN-челленджа)
- [ ] обработчик `async def(request: Request)` без Pydantic-тела; HMAC по raw до парсинга
- [ ] секрет `.strip()` с обеих сторон; верная подпись → 200; неверная/нет/кривой hex → 401
- [ ] 200 и 409 — одинаковое непустое JSON `{marz_username, subscription_url}`, `application/json`
- [ ] повтор того же `payment_id` (в т.ч. параллельный) → 409, второй marz-пользователь не создан
- [ ] продление (новый `payment_id`, тот же `prsloy_user_id`) → тот же `subscription_url`, `expire = старый + days`
- [ ] два разных `payment_id` одного `prsloy_user_id` → один marz-пользователь
- [ ] идемпотентность durable (переживает рестарт), ≥14 дней, две связи (payment_id→рез; user_id→marz)
- [ ] нет rate-limit/429, нет Bearer/timestamp/nonce на трафик сайта
- [ ] ответ < 8с; свой таймаут на Marzneshin; ошибки — 5xx (JSON), не 429/HTML
- [ ] `subscription_url` открывается в Happ с внешней сети и из РФ (не с сервера)
- [ ] все expire в UTC
- [ ] секрет + URL переданы владельцу для Vercel (Production)

---

## 2. Сценарий совместного теста (до первого реального платежа)

1. **Партнёр:** реализует эндпоинт по разделу 1, поднимает публично по TLS.
2. **Партнёр:** `python3 smoke_test.py --url https://<url> --secret '<секрет>'` → все PASS.
   Затем в админке Marzneshin: один тест-юзер на прогон; `subscription_url` открыть в Happ
   **с внешней сети** (мобильный канал / другой VPS — не с самого сервера). Удалить тест-юзеров после.
3. **Партнёр → владельцу** (надёжным каналом, не в открытый чат): публичный URL + секрет.
4. **Владелец (сайт):** закоммитить+задеплоить склейку (`marzneshin-proxy.ts` + вызов в `payments.ts`);
   в Vercel → Settings → Environment Variables (Production) задать `MARZNESHIN_PROXY_URL` +
   `MARZNESHIN_PROXY_HMAC_SECRET` (то же значение, без лишних пробелов/кавычек); Redeploy.
5. **Оба:** один реальный тест-платёж на минимальный период. На `/dashboard` появляется ключ → открыть в Happ.
6. **Если ключ не появился:** Vercel → Function logs дадут код ошибки из `issueKey`. Сопоставь:

   | Код в логах Vercel | Что не так | Раздел |
   |---|---|---|
   | `proxy_bad_signature` | подпись/секрет не сошлись | 1.2, 1.8 |
   | `proxy_bad_request` | бэкенд вернул 400 на валидный запрос | 1.3, 1.5 |
   | `proxy_malformed_response` | 200/409 без полей, не-JSON, HTML от CDN | 1.5, 1.6 |
   | `proxy_upstream_failure` | 5xx, не-JSON тело, или эндпоинт недоступен | 1.5, 1.6 |
   | `proxy_not_configured` | владелец не задал env в Vercel | 1.8 |

   Плюс лог на бэкенде по тому же `payment_id` — видно, дошёл ли запрос вообще.

---

## 3. `smoke_test.py`

Лежит соседним файлом — запускай его. Для самодостаточности встроен ниже целиком (если переслали
только этот markdown — сохрани как `smoke_test.py`). Он воспроизводит **ровно** то, что шлёт сайт
(тот же байтовый формат тела и подпись), и валидирует ответ так же, как `marzneshin-proxy.ts`.
Проверен против эталонной реализации: корректную проходит 5/5, сломанную (HMAC по пересобранному
JSON) ловит на первом же шаге. Только stdlib, Python 3.8+.

```python
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
```
