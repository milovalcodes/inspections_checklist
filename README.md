# Move In / Move Out Inspection

A phone-first replacement for the paper CIMCO move in/out sheet. Static files — no server,
no build step, no accounts. Works offline once loaded.

## What's in here

| File | What it is |
|---|---|
| `index.html` | **One app, both jobs.** Choose move-in or move-out when starting an inspection. |
| `move-in.html` | The same app, locked to move-in. Installs as its own icon. |
| `move-out.html` | The same app, locked to move-out. Installs as its own icon. |
| `manifest.json` / `manifest-in.json` / `manifest-out.json` | Install settings for each of the three. |
| `service-worker.js` | Makes it work with no signal. |
| `icon-192.png` / `icon-512.png` | Home-screen icons. |

Pick whichever suits the team — you can publish all three and let people use what they like.
All three share the same saved inspections on a given phone, so a move-out started in
`move-out.html` can still pull its baseline from a move-in recorded in `index.html`.

## Publishing on GitHub Pages

1. Put these files in the repo (root, or a folder like `/inspection`).
2. Settings → Pages → Source: **Deploy from a branch** → `main` → `/ (root)` → Save.
3. Wait a minute, then open the URL it gives you.

## Installing on a phone

Open the URL, then:

- **iPhone (Safari):** Share → Add to Home Screen.
- **Android (Chrome):** menu → Install app / Add to Home Screen.

It then opens full-screen like an app and runs without signal. Load it once on wifi first so
the fonts and files cache.

## How an inspection runs

1. **Start** a move-in or a move-out. For a move-out, pick the matching move-in sheet and every
   line will show how the unit was handed over.
2. **Header & details** — date, address, tenant, owner, keys, meters, clean yes/no.
3. **Walk the unit.** Each line gets a code: ✓ Good, D dirty, B broken, C not working,
   R replace, or N/A. Anything not Good opens a note box and should get a photo.
4. **Mark rest good** fills the untouched lines in a room in one tap.
5. **Add or rename rooms** as the unit needs — bedrooms, baths, anything else.
6. **Sign** — tenant and inspector, on the screen.
7. **Send it in** — *Copy report* for text, *Print / PDF* for the file copy,
   or *Export this one* for a file that carries the photos with it.

## Dictating the walkthrough

Open an inspection and use **Dictate the walkthrough**. Two ways in:

- **Record** — tap the mic and talk while you walk. Needs Chrome or Safari and a signal.
- **Paste a transcript** — from a video, a voice memo, or any transcription tool. Works offline.

Say the room, then each line and how it looks:

> "Living room. Floor good, walls dirty, scuffs by the slider. Baseboard has a crack on the north side."
>
> "Moving to the kitchen. Cabinets fine, fridge not working, ice maker doesn't fill."

Hit **Read it** and the app shows what it heard — room, line, and code — before changing anything.
Drop any line it misheard with the ✕, then **Apply to the sheet**.

Words it recognises: good, clean, fine, works — dirty, stained, scuffed, mold — broken, cracked,
torn, loose, missing — not working, no power, leaking, running — needs replacing — not applicable.
Whatever you say after a problem becomes the note on that line.

**Always read the sheet before signing.** Dictation is a first pass, not the record. It leaves the
note blank when you only stated the condition, which shows up as "note needed" in the flagged list
— that is deliberate, so real detail gets added where a deposit might be argued.

## Saving the report

Three ways out, under Header & details:

| | What you get | Best for |
|---|---|---|
| **Save report (web page)** | One `.html` file — full-size photos, signatures, everything. Opens in any browser, emails fine. | Sending to the office or an owner |
| **Print / PDF** | Browser print dialog, then Save as PDF. Photos print in a numbered photo log at the back, referenced from each line ("Fig 3"). | The file copy |
| **Export data file** | `.json` another phone can import, photos included. | Moving work between devices |

Photos are the reason the web report exists: a thumbnail in a table proves nothing, so both the web
report and the PDF put every photo in a numbered log at full width, captioned with the room, the
line, the code, and the note. Under **Photos in the printout** you can choose two across (default),
three across, or one full page each for close-up damage.

## Where the data lives

On the phone that recorded it, in the browser's own storage. Nothing is uploaded anywhere.
That means:

- Clearing browser data, or deleting the app, deletes the inspections.
- Each inspector's phone holds only their own work.
- To move records between phones or send them to the office, use **Export** and **Import**
  on the home screen. Exported files include the photos.

Treat the printed PDF as the record of file.

## Changing it

Everything is in one `<script>` block near the bottom of each HTML page.

- **Company name:** the `ORG` constant.
- **Room checklists:** the `T` object — each room type lists its lines.
- **Which rooms a new inspection starts with:** `DEFAULT_SPACES`.
- **The codes themselves:** `CODES` and `CODE_LABEL`.

The three pages are generated from one source, so if you edit by hand, make the same edit
in each — or keep editing `index.html` only and let the team use that one.

## One note on the deposit letter

The move-out worksheet mentions Florida's deposit-claim timing (Fla. Stat. 83.49) as a
reminder. Confirm the dates and the wording with your broker or attorney before anything
goes out to a tenant.
