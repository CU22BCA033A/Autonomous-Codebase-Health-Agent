# 🍽️ SpaceBasic Mess Booking Bot (v2)

**Stuck in class when mess booking opens?** This bot keeps the SpaceBasic
*Mess Manager → Allocations* page open in its own browser, refreshes it
quickly around the opening time, and the moment **Sagarfoods** can be booked
it clicks it, confirms the popups, checks the server's reply, saves proof and
pings your phone.

- ⚡ **Fast.** On the offline test portal it books in about 0.5–0.7 seconds after the mess shows up.
- 🕒 **Uses SpaceBasic's clock.** It times itself by the portal's clock, not your laptop's, which may be off by a few seconds.
- 🔐 **Checks your login in advance.** It reads when your login expires and warns you *before class* if it will expire before booking opens.
- 🧠 **Learns your portal.** A read-only "Learn my portal" step records how your college's booking page and API work.
- 🛡️ **Safe.** It only clicks Sagarfoods' own button, never another mess's, and never Cancel, Delete or Logout.
- ♻️ **Keeps going.** If the browser crashes it reopens it, and it retries if the page loads badly.
- 🍛 **Backup messes (optional).** If Sagarfoods is *full*, it can book your second choice.
- 🔒 **Private.** It runs on your laptop with your login. Tokens, cookies and passwords are never saved in its report files.

---

## How it works

```
 before class                                 booking time
 ─────────────                                ────────────
 You: "opens at 18:00"  ──►  bot sleeps  ──►  17:58:30 starts refreshing (every 1.5s)
                              │ every 10 min:        │ Sagarfoods not open yet? refresh
                              │ still logged in?     │ Sagarfoods open? ──► click it
                              │ (phone alert if not) │   ──► Submit / "Yes, confirm"
                                                     │   ──► read the server's reply
                                                     └─► ✅ screenshot + phone ping
```

SpaceBasic's web app gets its data from `api.spacebasic.com/api/v3/messmanager/…`
and sends your login token with each request. The bot does **not** send any
requests of its own. It clicks the real page like you would, and meanwhile
**listens** to the page's traffic. That's how it:

1. **Knows when the page has finished loading.** It moves on as soon as the portal's API answers, instead of waiting a fixed time.
2. **Knows the server's time.** It reads the time the server puts on every response.
3. **Knows when your login expires.** It reads the expiry time stored inside your login token.
4. **Checks whether the booking worked.** It reads the server's reply to the booking click.
5. **Records the booking request** (with secrets removed) in `output/`, so the booking flow can be analysed and made faster next cycle.

---

## ⚡ Setup (about 10 minutes, done once)

1. **Install Python.** Download it from <https://www.python.org/downloads/>.
   On Windows, **tick "Add python.exe to PATH"** during install.
2. **Get this folder** (`mess-booking-bot`) onto your laptop. If it came as a ZIP, extract it.
3. **Install the bot:**
   - Windows: double-click **`SETUP.bat`**
   - Mac/Linux: run `./setup.sh`
4. **Start the bot:**
   - Windows: double-click **`START.bat`**
   - Mac/Linux: run `./start.sh`

You'll see this menu:

```
==================================================
   SpaceBasic Mess Booking Bot  ->  Sagarfoods
==================================================
  1) First-time login (do this once)
  2) Learn my portal (records how booking works - do once)
  3) Test: can the bot find Sagarfoods? (no clicking)
  4) START at a time (e.g. 18:00) - recommended
  5) START now: book as soon as it opens
  6) Settings (mess name, backups, phone alerts, speed)
  7) Send a test phone notification
  0) Exit
```

---

## 🧪 Rehearsal: do this a day or more BEFORE booking day

Don't let booking day be the first time the bot runs.

| Step | Menu | What to check |
|---|---|---|
| 1. Log in | `1` | Log in to SpaceBasic in the window that opens, go to Mess Manager → Allocations, press Enter. It should say **Logged in!** and show your session expiry. |
| 2. Learn your portal | `2` | Go to the mess booking page in the bot's browser and click around (**don't book**), then press Enter. It lists the API calls, whether it found **Sagarfoods in the portal's data**, and any **dates/times** (one is often the booking opening time). |
| 3. Test | `3` | Should say **Found it!** and save a screenshot with the button it would click **outlined in red**. If booking isn't open yet, "not bookable right now" is normal. |
| 4. Phone alerts | `6` → `7` | Set up ntfy or Telegram (see below) and make sure the test ping arrives. |
| 5. Laptop | – | Turn sleep off and plug it in (see *Keep your laptop awake*). |

**Want it tuned exactly for your college's portal?** After step 2, share
`output/…-discovery.json` and the `…-discover.png` screenshot with whoever
maintains the bot. They show the page's buttons and the API layout, with
**no passwords or tokens**, which is enough to hard-code the exact flow.

---

## 🎯 Booking day

1. **Before class:** start the bot and choose **`4`**. Enter the opening time, e.g. `18:00`, `6pm`, `tomorrow 09:00` or `2026-09-25 18:00`.
2. The bot checks you're logged in and that your login lasts past the opening time.
   If it won't, you get a phone alert right away. Log in again (option `1`) and restart.
3. Leave the laptop **open, plugged in and online**, and go to class. 🎒
4. From 90 s before opening it refreshes every **1.5 s**, and books the moment Sagarfoods opens:

```
[17:58:30] Watching for Sagarfoods (every 3.0s, 1.5s around opening time; give up at 18:45).
[18:00:01] Sagarfoods is OPEN - booking now!
[18:00:01] Clicked 'Book'
[18:00:02] Clicked 'Yes, confirm' in popup
[18:00:02] [SUCCESS] Mess allocated successfully  (0.7s from open to done)
[18:00:02] Booking API request(s) recorded (secrets removed): 20260925-180002-booking-requests.json
```

5. **Always open SpaceBasic afterwards and confirm your allocation says Sagarfoods.**

Don't know the exact time? Choose **`5`**. It starts refreshing every 3 s
right away and keeps going for up to 45 minutes (you can change this).

### What the bot does when something goes wrong

| Situation | What the bot does |
|---|---|
| Logged out before booking opens | Phone alert, stops, and tells you to log in again |
| Logged out *during* booking | Urgent phone alert: "book manually NOW" |
| Sagarfoods is **full** | Books your backup mess if you set one, otherwise keeps watching |
| Server returns an error (e.g. "seats full") | Records it, retries, and stops after 3 failed attempts with an alert |
| Browser crashes or is closed | Reopens it (your login is kept) and continues |
| Portal slow or throwing errors | Retries on the next refresh |
| Never opens before the time limit | Phone alert: "gave up" |

Every run is logged to `output/<date>-run.log`, with screenshots next to it.

---

## ⚠️ Keep your laptop awake

- **Windows:** Settings → System → Power → *Screen and sleep* → **Never** (plugged in).
  Control Panel → Power Options → *Choose what closing the lid does* → **Do nothing**.
- **Mac:** run `caffeinate -dims ./start.sh` and keep the lid open.
- Use reliable Wi-Fi, and don't close the bot's black window or its browser window.

---

## 📱 Phone notifications (pick one or both, both free)

**ntfy (easiest):**
1. Install **ntfy** ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iPhone](https://apps.apple.com/app/ntfy/id1625396347)).
2. Subscribe to a hard-to-guess topic, e.g. `messbot-ravi-8f3k2`.
3. Put the same topic name in menu `6` Settings, then test with `7`.

**Telegram:**
1. Message **@BotFather** → `/newbot` → copy the token.
2. Send any message to your new bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id":…}`.
3. Put both in `config.json` as `telegram_bot_token` and `telegram_chat_id`.

---

## ⚙️ Settings (`config.json`)

Menu `6` covers the common ones. Everything else is in `config.json`, which
is created on first run and can be opened in Notepad.

| Setting | Default | Meaning |
|---|---|---|
| `mess_name` | `Sagarfoods` | The mess to book. Case and spaces don't matter. |
| `backup_messes` | `[]` | e.g. `["Royal Kitchen"]`. Only used if the main mess shows as **full**. |
| `refresh_every_seconds` | `3` | Normal refresh speed. Minimum 1. |
| `burst_every_seconds` | `1.5` | Speed from 90 s before until 2 min after the opening time. Minimum 1. |
| `start_early_seconds` | `90` | How early to start refreshing. |
| `give_up_after_minutes` | `45` | Stop after this long. |
| `pre_clicks` | `[]` | Buttons or tabs to click before the list appears, e.g. `["New Allocation", "October"]`. |
| `show_browser` | `true` | Set to `false` to hide the browser window. |
| `block_heavy_resources` | `true` | Skip images, fonts and videos while refreshing, so pages load faster. |
| `ntfy_topic`, `telegram_*` | empty | Phone alerts. |
| `api_url_contains` | `api.spacebasic.com`, `/messmanager/` | Which traffic the bot listens to. |
| `action_words`, `confirm_words`, `avoid_words`, `success_words`, `error_words`, `full_words` | sensible lists | Which buttons the bot may or may never click, and how it reads results. |

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `python` is not recognized | Reinstall Python and tick **Add python.exe to PATH**. |
| "Not logged in" | Menu `1` again. Sessions expire. |
| "session may expire before booking" | Log in again (`1`) right before class, then restart with `4`. |
| Test: "not bookable right now" | Normal before booking opens. If booking *is* open, you probably need `pre_clicks`. |
| Red outline on the wrong button | Don't run it. Share the files from step 2 (Learn my portal) to get it tuned. |
| "browser is already open" | Close the other bot browser window. |
| Google login says "browser not secure" | Log in with email/phone and password instead. |
| "didn't see a success message" | Check the portal and the screenshots and log in `output/`. |

> 🔒 **Never share the `browser-profile` folder.** It *is* your logged-in
> session. The files in `output/` are safe to share: tokens, cookies and
> passwords are removed from them.

---

## 🤝 Fair use

- It refreshes about as often as a person pressing F5 (3 s, or 1.5 s for a
  few minutes around opening). There's a hard minimum of 1 s. Faster
  refreshing slows the portal for everyone and can get accounts flagged.
- Use it for **one account, your own**.
- Automated tools may be against your hostel's or SpaceBasic's rules. Check
  first. You're responsible for how you use it.

---

## 👩‍💻 For developers

```
mess_bot.py            entry point: menu + CLI (login / discover / test / run / notify-test / settings)
messbot/config.py      defaults and config.json handling (with minimum-interval limits)
messbot/browser.py     Playwright engine: persistent login, fast page loads, crash recovery, booking clicks
messbot/page_js.py     in-page code that finds the mess's own card or row and never another mess's button
messbot/network.py     read-only API listener: server clock, login expiry, API data, booking requests, secret removal
messbot/commands.py    run loop (sleep → fast refresh → book → verify), discovery report, settings
test_site/             fake SpaceBasic-like portal + API, and the scenario tests
```

Offline tests: a fake portal and API with 5 page layouts, confirmation
popups, a decoy "current mess" line, and a full-mess / backup case. Each
test checks what the **server** booked.

```bash
python test_site/run_mock_tests.py          # run all scenarios
python test_site/run_mock_tests.py --serve  # open the fake portal yourself
```

CLI:

```bash
python mess_bot.py login | discover | test | notify-test | settings
python mess_bot.py run --at 18:00 [--headless]
```
