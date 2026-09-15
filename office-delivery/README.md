# CIMCO automatic PDF delivery

This private Google Apps Script sends inspection PDFs from `cimcomngmt1@gmail.com` to the fixed main-office address `cimcomngmt@gmail.com`. Gmail credentials and the pairing key are never committed to GitHub.

## One-time setup

1. Sign in to [Google Apps Script](https://script.google.com/) as `cimcomngmt1@gmail.com` and create a new project named **CIMCO Inspection Delivery**.
2. Replace the default `Code.gs` with the contents of this folder's `Code.gs`.
3. In Project Settings, enable the manifest file in the editor and replace `appsscript.json` with this folder's manifest.
4. Select and run `setupDelivery`. Approve the requested send-mail permission, then copy the pairing key from the execution log. Keep it private.
5. Choose **Deploy → New deployment → Web app**. Run the app as **Me** and allow access to **Anyone**. Copy the deployment URL ending in `/exec`.
6. Open an inspection, scroll to **Finish & deliver**, and choose **Connect office delivery**. Paste the `/exec` URL and pairing key. Repeat this last step once on each inspection phone.

After pairing, **Send PDF to main office** creates the report and sends it without opening a mail composer. The inspection stays on the phone if sending fails, and the app displays a delivery receipt only after the office script confirms success.

Running `setupDelivery` again creates a new pairing key and disconnects every phone using the old key.
