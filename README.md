# CIMCO Property Inspection - Simple Offline Visits v62

An offline-first app for move-in, move-out, rent-ready, and routine inspections.

## Offline visits and guided finish (v62)

The app runs locally after its static files are installed, or from the self-contained offline distribution. Inspection records, planned visits, preferences, photos and receipts stay in local browser storage. There is no account, backend, automatic synchronization, online note generation, or external font dependency. File transfers can use local Wi-Fi sharing or USB. Initial installation and an optional hosted-app update are separate from offline field use.

The office can choose **Prepare a visit**, select a saved property layout or starting checklist, enter the date, assigned inspector and instructions, then save a visit file. Inspectors open it with **Open office visit file** and tap **Start this visit**. Reopening a started visit resumes its record. Duplicate files do not create duplicate jobs, and plan revisions cannot rewrite work already started. Inspectors can add, remove or rename areas on site without a required room order.

Manual inspections remember a name explicitly entered by the inspector. **Show only unchecked items** leaves findings visible while an explanation is missing. **Mark remaining items Good** is visible at the room footer and still requires confirmation; it never overwrites recorded results. Suggested notes are item-specific and require an explicit tap. They append to existing notes and support Undo. Problem photo reminders are optional.

**Finish / PDF** offers three steps: Check, Sign, PDF / Print. Saving as PDF or printing is the primary finish action and never requires an office file or receipt. Sending is inside a collapsed **Send to office (optional)** section. Missing checks and signatures remain identified in the report; preparing an optional office copy requires a draft acknowledgement when unfinished. Files prepared before a signature or later edit cannot be reused as the current report. The top status display distinguishes local saving from an office confirmation. Sharing or saving does not confirm receipt; the office must return the matching confirmation file.

**Try a practice inspection** opens separate storage with a persistent Practice mode banner, fictional house and short walkthrough. Practice and real records never merge automatically. The offline package includes dedicated Field Practice and Office Practice files with links back to their corresponding real app files.

Complete backups include planned visits and the remembered inspector. They can capture current in-memory work even when browser storage is full, and the save-failure status remains visible. Restore requires an empty inspection and visit list. Backup creation is a file export; keep a copy with the office.

## Printed report layout (v62)

Reports use Letter portrait with safe print margins, repeated room names and table headers, and page numbers. Photo appendices begin on a new page. Long photo and completion descriptions remain complete in a full-width Extended photo descriptions section; their photographs point to that section. Long findings, checklist notes and office notes can continue across pages. The running footer abbreviates unusually long addresses and IDs, while the complete values remain in the report body.

Print review fixtures are fictional and cover all four inspection types, all three photo sizes, long captions and notes, maintenance completion and comparisons, and many office estimates. Run `node tests/make-print-fixtures.mjs`, print the generated files through the browser, then run `python tests/verify-printed-pdfs.py output/qa-v62/printed --poppler <path-to-pdftoppm>` and inspect the rendered pages. `tmp/print-review/app-print.html?selftest=1&suite=62-app-print` checks printing inside the full app with isolated storage.

## Default house checklist (v62)

New base forms start with Master Bedroom, Bedroom 2, Master bath, and Bathroom 2. Inspectors can remove any area under Room options and restore it from Recently deleted. New rooms receive unused numbered names after deletions. Saved inspections, assigned visits and property-specific layouts retain their existing structure.

HVAC, Thermostat and Air filter are independent areas in every new base inspection type. Battery-capable checklist items have a contextual **Needs replacement** button: it records Needs work, adds an explicit battery-replacement note, and selects Repair without assigning responsibility, urgency or cost. Air-filter checks offer the same shortcut with filter-specific wording. Existing notes and photographs remain attached. Undo reverses the finding; changes after signing still require renewed sign-off. Use Not present for batteries that are not fitted.

## Inspector workflow

1. Choose **Start inspection**, or open a saved inspection under **Continue an inspection**.
2. Choose any room or area, in any order. Return with **All rooms**. Add bedrooms, full or half bathrooms, garages, patios, or custom spaces during the visit. **Room options** offers renaming and custom checklist items.
3. Record **Good**, **Needs work**, **Not present**, or **Could not check**. Explain problems and inspection limits; common reasons include Power off and Water off. Add photos and notes to any result.
4. **Save and finish later** returns home. Reopening restores the selected room. Saved on this phone does not mean sent to the office.
5. Choose **Finish / PDF**, resolve missing information, review signatures, and save the report as a PDF or print it. Office sharing is optional. Incomplete or unsigned reports remain clearly identified.

The interface uses larger text, full labels, and generous touch targets. Rooms do not close or advance automatically. Repeated taps do not clear results. **Undo** reverses the last checklist selection or bulk marking. Notes remain when a result changes.

## Different house layouts

There is no required room sequence or room-count setup. Custom names and checklist items are retained. Another inspection of the same type at the same address and unit can reuse the latest layout on that device with blank results, notes, estimates, and signatures. Move-out creation from a move-in preserves the existing baseline workflow. Layouts can move between devices in an inspection backup.

Older N/A results remain labeled as earlier N/A records; the app does not guess whether they meant absent or untested. Legacy Not tested results become Could not check.

## Office tools

See [OFFLINE-SHARING.md](OFFLINE-SHARING.md) for the v62 phone-to-Windows workflow. Portable ZIP packets carry inspection data, photographs, move-in comparison evidence, and a self-contained printable report. LocalSend can transfer them over local Wi-Fi without internet or an inspection backend.

SHA-256 covers packet identity, timestamps, and payload. Imports validate images before allowing a receipt. Repeated imports are idempotent; conflicting condition versions stay separate. Only a matching returned receipt confirms the particular packet. Receipts are manually identified acknowledgements, not authenticated signatures.

Office Desk adds shared property layouts with revision checks, urgent/repair/cleaning flags, assignments, work status, completion photos, and Recently deleted. Work progress stays separate from signed observations. Comparisons use exact normalized room names, types, and checklist text, without inferring responsibility.

Complete backups include records, photos, layouts, original packet snapshots, receipts, and deleted items. Restore validates files and requires an empty app. Ordinary packets add visits to a populated app. Full personal backups can contain access notes; office packets omit them.

Scheduling and backups are under **Office tools & backups** on the home screen. Within an inspection, open **Property details**, then **Office tools**, for estimates, backups, report export, and form conversion.

Inspectors record conditions. Responsibility classifications and estimates are separate office-review decisions. Entering a cost never automatically selects tenant damage. Invalid amounts are not silently changed into positive estimates.

Automatic office email delivery remains paused. The implementation and private setup instructions remain in [office-delivery](office-delivery/README.md). Optional office walkthrough analysis remains hidden. Normal inspections need no cloud account or office connection.

## Reports and signatures

Printing, PDF printing, shareable HTML, and copied report text use one report model. Reports include property details, an ID and content version, coverage counts, findings and inspection limits, every area's checklist and notes, office classifications and estimates, signature status, and numbered photographs with captions.

- Room notes, Good-result notes, unreviewed items, and photo references are retained.
- Missing amounts show Not estimated; incomplete estimates show a partial subtotal. An explicitly entered zero stays zero.
- Photos belong to the requested inspection. Added-to-inspection dates are not claimed as verified camera capture dates.
- Changing signed content, photographs, or inspection type archives the previous signatures and requires renewed review. Earlier signatures without version metadata remain in the record and are not presented as current sign-off. Version identifiers detect changes; they are not cryptographic signature certificates.
- Printing waits for report images to decode and stops if an image fails.
- Routine reports retain handwriting space and additional maintenance-pricing rows.
- Property and report identity appear in printed footers. Page X of Y uses CSS page-margin counters in supporting browsers. Phone PDF output depends on the device's browser and print service.

## Saving and recovery

Production browser storage and photo-database keys are preserved. Saves flush when backgrounded and when finishing later. Storage failures are shown. Backup restoration waits for photographs before reporting success.

Records remain on the device. Back up after field work; local saving is not a central-office backup. Do not publish real inspection records, photographs, pairing details, or private office configuration.

## Verification

Run:

```text
node tests/static-check.mjs
node tests/report-check.mjs
node tests/office-model-check.mjs
node tests/visit-model-check.mjs
python tests/build-offline.py
node tests/make-office-demo.mjs
python tests/package-release.py
```

Serve the project locally and open `tests/regression.html` for the browser checks. Each test namespace uses separate storage and a separate photo database. Checks cover autosave, conversion, signature archival, photos, flexible room selection, custom layouts, notes, Undo, pricing, reopening after a fresh render, and clean results on repeat visits.

`node tests/report-check.mjs --samples` generates demonstration HTML for all four inspection types under `tmp/qa-v57/`. Sample names, findings, and images are fictitious.

## Publishing

The offline ZIP includes self-contained Office Desk, Practice, and Field App files, instructions, license, and a fictional example packet. There are no external script, stylesheet, image, or font dependencies. Keep local app filenames and folders stable; browser file storage varies. A standalone HTML file is not a verified phone installation method. Practice always uses isolated storage.

The separate website ZIP is an optional update for the existing installed field app. Publish only its static `website-upload` contents when rollout is authorized. Keep the existing origin and paths so devices retain records. The v62 service worker caches all report, field, office, and vendor files. Exclude `output/`, `tmp/`, tests, real records, and private office configuration. Office Desk and file handoff require no publishing.

Before field rollout, check camera access, offline reopening, signatures, and PDF saving on the inspectors' actual iPhone and Android devices. Desktop verification does not establish physical-device behavior.
