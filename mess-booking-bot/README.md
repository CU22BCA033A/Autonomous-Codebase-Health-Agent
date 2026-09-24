# 🍽️ SpaceBasic Mess Booking Bot

**Stuck in class when mess booking opens?** This bot sits on the SpaceBasic
*Mess Manager → Allocations* page, refreshes it every few seconds, and the
moment **Sagarfoods** becomes bookable it clicks it for you, confirms any
"Are you sure?" popup, saves a screenshot as proof, and can ping your phone.

- ✅ Runs on **your own laptop**, logged in as **you**. It never sees your password.
- ✅ Works with cards, tables, radio buttons, dropdowns and confirmation popups.
- ✅ Never clicks another mess's button, and never clicks Cancel, Delete or Logout.
- ✅ Can be pointed at any mess, not only Sagarfoods (change it in Settings).

---

## ⚡ Quick start (about 10 minutes, done once)

### Step 1: Install Python (skip if you already have it)

- **Windows:** download from <https://www.python.org/downloads/>.
  On the first install screen, **tick "Add python.exe to PATH"**, then click Install.
- **Mac:** download from the same link, or run `brew install python`.

### Step 2: Get the bot

Download this folder (`mess-booking-bot`) to your laptop, for example to
your Desktop. If you got it as a ZIP, right-click it and choose **Extract All**.

### Step 3: Install the bot

| Windows | Mac / Linux |
|---|---|
| Double-click **`SETUP.bat`** | Open Terminal in the folder, run `./setup.sh` |

It downloads a private browser for the bot. Wait until it says **Done!**

### Step 4: Log in once

| Windows | Mac / Linux |
|---|---|
| Double-click **`START.bat`** | `./start.sh` |

You'll see this menu:

```
==============================================
   SpaceBasic Mess Booking Bot  ->  Sagarfoods
==============================================
  1) First-time login (do this once)
  2) Test: can the bot find Sagarfoods? (no clicking)
  3) START: book as soon as booking opens
  4) START at a time (e.g. 18:00) - sleep until then
  5) Settings (mess name, phone alerts, speed)
  6) Send a test phone notification
  7) Inspect page (for troubleshooting)
  0) Exit
```

Type **`1`** and press Enter. A browser window opens. **Log in to SpaceBasic
normally**, make sure you can see the Allocations page, then go back to the
black window and press **Enter**.

Your login is saved in the `browser-profile` folder, so you won't need to
do this again until SpaceBasic logs you out.

### Step 5: Test it (strongly recommended)

Choose **`2`**. The bot opens the page and looks for Sagarfoods **without
clicking anything**:

- **"Found it!"**: it saves a screenshot in the `output` folder with the
  button it *would* click **outlined in red**. Check that it's the right one.
- **"not on the page right now"**: normal if booking hasn't opened yet.
  The real run keeps refreshing until Sagarfoods appears.

---

## 🎯 On booking day

### Option A: You know when booking opens (best)

1. Before class, open the bot and choose **`4`**.
2. Type the opening time, e.g. `18:00`, `6pm`, `tomorrow 09:00` or `2026-09-25 18:00`.
3. Leave the laptop **open, plugged in and connected to Wi-Fi**. Go to class. 🎒

The bot sleeps until 90 seconds before that time, checking every 10 minutes
that you're still logged in. Then it refreshes every 3 seconds and books
the moment Sagarfoods opens.

### Option B: Booking is about to open or already open

Choose **`3`**. The bot starts refreshing right away.

### When it finishes you'll see

```
[18:00:04] Sagarfoods is OPEN - booking now!
[18:00:04] Clicked 'Book'
[18:00:05] Clicked 'Yes, confirm' in popup
[18:00:05] [SUCCESS] Mess allocated successfully: Sagarfoods
[18:00:05] Screenshot saved: output/20260925-180005-booked.png
```

**Always open SpaceBasic afterwards and check that your allocation says Sagarfoods.**

---

## ⚠️ Keep your laptop awake (important)

A sleeping laptop can't book anything.

- **Windows:** Settings → System → Power → set *Screen and sleep* to **Never**
  (when plugged in). Also set *Lid close action* to **Do nothing** under
  Control Panel → Power Options → *Choose what closing the lid does*.
- **Mac:** run `caffeinate -dims ./start.sh` instead of `./start.sh`, and keep the lid open.
- Keep it **plugged in** and on **reliable Wi-Fi**.
- Don't close the black bot window or the bot's browser window.

---

## 📱 Phone notifications (optional, free)

Get a ping on your phone in class when the booking is done, or if something
goes wrong (for example, you got logged out).

1. Install the **ntfy** app ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iPhone](https://apps.apple.com/app/ntfy/id1625396347)).
2. In the app, tap **+** and subscribe to a topic with a hard-to-guess name,
   e.g. `messbot-ravi-8f3k2`. Anyone who knows the name can read it, so make it unique.
3. In the bot, choose **`5` Settings** and paste the same topic name.
4. Choose **`6`** to send a test ping.

You'll be notified when:
- 🎉 the mess is booked
- 🔒 you got logged out before booking opened (log in again in time)
- ❓ the bot clicked but couldn't confirm success (check the portal)
- ⏰ the bot gave up (default: after 45 minutes)

---

## ⚙️ Settings (`config.json`)

Menu option **5** changes the common settings. Everything else is in
`config.json`, which is created on first run and can be opened in Notepad.

| Setting | Default | What it does |
|---|---|---|
| `mess_name` | `Sagarfoods` | The mess to book. Case and spaces don't matter, so "Sagar Foods" also matches. |
| `refresh_every_seconds` | `3` | How often to refresh while waiting. Don't go below 2 (see Fair use below). |
| `start_early_seconds` | `90` | With a start time, begin refreshing this many seconds early. |
| `give_up_after_minutes` | `45` | Stop trying after this long. |
| `show_browser` | `true` | Show the bot's browser window. Set to `false` to hide it. |
| `ntfy_topic` | empty | Your phone notification topic. |
| `pre_clicks` | `[]` | Buttons or tabs to click before the mess list appears, e.g. `["Book Mess", "October"]`. |
| `action_words` / `confirm_words` | book, select, opt, yes, ok… | Button words the bot is allowed to click. |
| `avoid_words` | cancel, delete, logout… | Buttons with these words are never clicked. |

### When do I need `pre_clicks`?

If the mess list isn't on the Allocations page straight away, and you first
have to click something like **"New Allocation"** or pick a month, list those
button texts in order:

```json
"pre_clicks": ["New Allocation", "October 2026"]
```

Then run the **Test (2)** again to check it works.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `python` is not recognized | Reinstall Python and tick **"Add python.exe to PATH"**. |
| "Not logged in" | Run option **1** again. SpaceBasic sessions expire eventually. |
| Test says "not on the page" | Normal before booking opens. If booking *is* open, you probably need `pre_clicks`. |
| Red outline is on the wrong button | Don't run it. Use option **7** and see *Getting help* below. |
| "The bot's browser is already open" | Close the other bot browser window, then retry. |
| Google login says "browser not secure" | Log in with your SpaceBasic email/phone and password instead. |
| Clicked but "didn't see a success message" | Check the portal. The booking may have worked with a different message. See the `output` folder screenshots. |

### Getting help / improving the bot

Choose **`7` Inspect page** while the mess list is showing. It saves a
screenshot, a `.json` summary and the page `.html` in `output/`. Share the
**screenshot and .json** with whoever is helping you.

> 🔒 **Never share the `browser-profile` folder.** It contains your logged-in
> session, and anyone who has it can use your SpaceBasic account.

---

## 🧪 For developers: offline self-test

`test_site/index.html` is a fake allocations page with 5 layouts: cards,
radio + Submit, dropdown, table with a "current mess" decoy, and clickable
div cards. It also has a delayed opening and confirmation popups. To check
that the bot books Sagarfoods in all of them:

```bash
python test_site/run_mock_tests.py
```

Command-line usage without the menu:

```bash
python mess_bot.py login
python mess_bot.py test
python mess_bot.py run                      # book as soon as possible
python mess_bot.py run --at 18:00           # sleep until 18:00, then book
python mess_bot.py run --at 18:00 --headless
python mess_bot.py inspect
python mess_bot.py notify-test
```

---

## 🤝 Fair use

- The bot refreshes about **once every 3 seconds**, about as often as an
  impatient human pressing F5. Please don't lower it much: hammering the
  portal slows it down for everyone and may get your account flagged.
- One bot, **one account (your own)**. Don't use it to book for other people.
- Automated tools may be against your hostel's or SpaceBasic's rules.
  Check before using it. You're responsible for how you use it.
