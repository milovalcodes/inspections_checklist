# CIMCO Property Inspection

A phone-first replacement for the paper CIMCO inspection sheets. Static files — no server,
no build step, no accounts. Works offline once loaded.

## What's in here

| File | What it is |
|---|---|
| `index.html` | **One app, three jobs.** Choose move-in, move-out, or rent-ready when starting an inspection. |
| `move-in.html` | The same app, locked to move-in. Installs as its own icon. |
| `move-out.html` | The same app, locked to move-out. Installs as its own icon. |
| `manifest.json` / `manifest-in.json` / `manifest-out.json` | Install settings for each of the three. |
| `service-worker.js` | Makes it work with no signal. |
| `icon-192.png` / `icon-512.png` | Home-screen icons. |

The unified `index.html` is the recommended field app. The locked pages remain available for teams
that want separate home-screen icons.
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

1. **Start** a move-in, move-out, or rent-ready. Type the address and unit before opening the sheet.
2. **Rent-ready header** — market status, work category, responsible party, and estimated cost are
   separate fields. Access / lockbox details stay internal and are not placed in shared reports.
   Its core walkthrough has 31 distinct checks; pool, well/septic, rural, and prior-broker handover
   checks appear only when the inspector turns that property-specific option on.
3. **Walk the property.** Each line gets one of three outcomes: **Good**, **Needs work**, or **N/A**.
   Cleaning, repairs, replacement, malfunctions, and things that could not be tested all use **Needs work**;
   the note holds the detail, such as “Not tested — no power on site.”
4. **Pass the rest** fills untouched lines in a section in one tap. Only reviewed lines appear in reports.
5. **Add or rename rooms** as the unit needs — bedrooms, baths, anything else.
6. **Sign** move-in/move-out sheets when appropriate. Rent-ready reports are owner/vendor notations and have no tenant sign-off.
7. **Send it in** — *Copy report* for text, *Print / PDF* for the file copy,
   or *Export this one* for a file that carries the photos with it.

## Built for the walkthrough

The field sheet now gives small, practical cues while an inspector works:

- A live **pace card** turns the running total into clear guidance: start, on pace, final stretch, or report ready.
- The room rail highlights the space currently being walked, so it is easier to jump around a larger property.
- Marking a line gives immediate touch feedback; **Pass the rest** acknowledges the section without extra taps.
- Completing every line produces a brief, optional celebration and a clear “report ready” message.

These are deliberately subtle and respect the phone's reduced-motion setting. They are there to make the job feel lighter, not to distract from an accurate inspection.

## Dictating the walkthrough

Open an inspection and use **Dictate the walkthrough**. Two ways in:

- **Record** — tap the mic and talk while you walk. Needs Chrome or Safari and a signal.
- **Paste a transcript** — from a video, a voice memo, or any transcription tool. Works offline.

Say the room, then each line and how it looks:

> "Living room. Floor good, walls dirty, scuffs by the slider. Baseboard has a crack on the north side."
>
> "Moving to the kitchen. Cabinets fine, fridge not working, ice maker doesn't fill."

You can also pass a whole room quickly: **"Kitchen is clean"**, **"the bathroom looks good"**,
or **"everything else in here is fine"**. The app marks only the untouched lines in that room as
Good, so a specific issue already recorded is preserved. A broad issue such as **"Kitchen is filthy"**
becomes one “Overall condition” exception instead of being guessed onto the wrong fixture.

Hit **Read it** and the app shows what it heard — room, line, and code — before changing anything.
Drop any line it misheard with the ✕, then **Apply to the sheet**.

Words it recognises: good, clean, fine, works — dirty, stained, scuffed, mold — broken, cracked,
torn, loose, missing — not working, no power, leaking, running — not tested / could not test — needs replacing — not applicable.
Everything except a good or N/A statement becomes **Needs work**, while the spoken condition is kept as the note on that line.

The live recorder removes repeated final fragments such as `Kitchen. Kitchen is clean.` before they
reach the transcript. Always review the proposed changes before applying them.

**Always read the sheet before signing.** Dictation is a first pass, not the record. It keeps the
spoken condition with a Needs work result, so review and tighten that note wherever a deposit might be argued.

## Offline video transcription

The **Offline video transcription** area is part of Dictate the walkthrough. It keeps walkthrough media on the inspector's phone:

1. While on Wi-Fi, tap **Download offline voice pack** once for each phone. The full-quality pack is intentionally used for wider iPhone and mobile-browser compatibility.
2. Choose a video or audio walkthrough. For a video, the app makes a temporary audio-only copy on the phone; it never uploads the original video.
3. The on-device voice pack writes the transcript into the existing dictation box. Read and review it before applying the proposed checks.

For phone reliability, keep the app open while it prepares the recording and use walkthroughs of 12 minutes or less. The audio-only copy is temporary and is discarded when transcription finishes. The local voice pack is an English quick-transcription model: always review the proposed inspection results before applying them.

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
- **The three outcomes:** `CODES` and `CODE_LABEL`.

The three pages share the same storage key but are separate static copies. Keep `index.html` as the
source for the unified field workflow; regenerate the locked pages after changing the app logic.

## One note on the deposit letter

The move-out worksheet mentions Florida's deposit-claim timing (Fla. Stat. 83.49) as a
reminder. Confirm the dates and the wording with your broker or attorney before anything
goes out to a tenant.
