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
7. **Send it in** — *Copy report* for text, or **Save report** for either:
   - a **PDF** with a labeled photo appendix (1 large photo/page or 2/page), or
   - a **self-contained HTML report** with large embedded photos you can tap/click to view.
   Use **Backup (.json)** when you need a re-importable app record that carries the photos with it.

## Where the data lives

On the phone that recorded it, in the browser's own storage. Nothing is uploaded anywhere.
That means:

- Clearing browser data, or deleting the app, deletes the inspections.
- Each inspector's phone holds only their own work.
- To move records between phones, use the JSON **Backup / Export** and **Import** controls.
  JSON backups include the photos.
- For a human-readable office copy, use **Save report**. The PDF now adds every inspection photo
  to a labeled evidence appendix. The HTML option is a single portable file with the photos embedded
  at report resolution, so they remain easy to inspect on screen.

For recordkeeping, save the PDF and keep the JSON backup when you may need to restore the inspection.
The HTML report is useful when staff need to review or zoom the photos without opening the app.

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


## Photo report behavior

Newly added photos are resized to a maximum long edge of 1600 px at moderate JPEG compression.
That is a balance between evidence detail and offline phone storage. Existing photos are left unchanged.
The PDF checklist does not waste space on tiny thumbnails; instead, photos print in a dedicated appendix
with the room, inspection line, condition, note, sequence number, and saved timestamp.
