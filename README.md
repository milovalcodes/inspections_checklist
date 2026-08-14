# CIMCO Property Inspection — Resilient Local AI 22.4

This build keeps the field inspection app offline-first and adds optional automatic walkthrough analysis on the always-on office computer. It does not use an OpenAI API key, a ChatGPT account, or a cloud transcription service.

## Field workflow

1. Start or reopen an inspection on the phone.
2. Use **Office AI walkthrough → Analyze video / audio**.
3. Choose the inspector's recording and keep the page open. For video, the phone first makes a temporary audio-only copy to reduce the upload; if that is unsupported, it safely sends the original.
4. The office computer transcribes the recording and matches observations to the exact checklist.
5. Review the proposed Good, Needs work, and N/A results, then apply them to the sheet.

The upload percentage and the office-processing percentage are one continuous progress display. A weak phone connection no longer discards the job: the page keeps reconnecting, and a reopened inspection can recover its recent matching office job without uploading the recording again.

The normal checklist, photos, signatures, reports, and manual dictation remain available without the office connection. Inspection records still live on the phone unless the inspector exports them.

## Important privacy boundary

Only the selected walkthrough recording and a temporary checklist map are sent to the office computer. The bridge deletes the uploaded media when processing finishes. It retains the transcript and proposed results for up to 24 hours so a phone can reconnect after a weak signal.

The office connection address and pairing password are stored only on the paired phone. Bug reports exclude the address, password, inspection contents, photos, and media.

## Publishing the field app

Upload only the contents of the packaged `website-upload` folder to GitHub Pages. Do not upload the `office-computer` folder, its `config.json`, or its `data` folder.

After publishing, open the site once on Wi-Fi. On iPhone use Safari → Share → Add to Home Screen. On Android use Chrome → Install app or Add to Home Screen.

## Office setup

On the office Windows computer:

1. Open PowerShell as Administrator in the `office-computer` folder.
2. Run `Set-ExecutionPolicy -Scope Process Bypass`, then `./SETUP-BETA.ps1`.
3. Start `START-CIMCO-BRIDGE.cmd` and leave that window open for the first test.
4. Run `./SETUP-FIELD-TUNNEL.ps1` to create the private HTTPS field address.
5. Copy the displayed office address and pairing password into **Set up office connection** on an inspector's phone.
6. After testing, run `./INSTALL-AUTO-START.ps1` so the bridge starts when the office user signs in.

The one-time setup downloads the local language models. Allow roughly 5–6 GB and use a reliable office connection. Processing speed depends on the office computer; a supported NVIDIA GPU is faster, while CPU-only mode still works.

Run `./CHECK-BRIDGE.ps1` whenever the phone cannot connect. See `FIELD-CONNECTION.md` for pairing and troubleshooting.

## Record keeping

The printed/PDF report removes app controls and unreviewed clutter. Routine reports preserve blank lines for maintenance handwriting, and their estimated work total remains blank until at least one price is entered.

This is a beta. Review every proposed result before applying it, and review the completed report before it is signed or filed.
