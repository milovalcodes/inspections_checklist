const CIMCO_DELIVERY = Object.freeze({
  sender: 'cimcomngmt1@gmail.com',
  recipient: 'cimcomngmt@gmail.com',
  tokenProperty: 'CIMCO_REPORT_TOKEN',
  maxEncodedReportBytes: 24 * 1024 * 1024
});

/**
 * Run once while signed in as cimcomngmt1@gmail.com. Authorize mail access,
 * then copy the returned pairing key into each inspection phone.
 * Running this again rotates the key and disconnects previously paired phones.
 */
function setupDelivery() {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(CIMCO_DELIVERY.tokenProperty, token);
  console.log('CIMCO OFFICE DELIVERY PAIRING KEY: ' + token);
  return token;
}

function doGet() {
  return ContentService.createTextOutput('CIMCO office PDF delivery is online.');
}

function doPost(e) {
  const requestId = cleanText_(e && e.parameter && e.parameter.request_id, 120);
  try {
    const fields = (e && e.parameter) || {};
    const expected = PropertiesService.getScriptProperties().getProperty(CIMCO_DELIVERY.tokenProperty);
    if (!expected) throw new Error('Office delivery has not been paired. Run setupDelivery first.');
    if (!secureEqual_(String(fields.token || ''), expected)) throw new Error('The office pairing key was rejected.');

    const encoded = String(fields.report_b64 || '');
    if (!encoded) throw new Error('The inspection report was empty.');
    if (encoded.length > CIMCO_DELIVERY.maxEncodedReportBytes) throw new Error('The inspection report is too large to email.');

    const fileName = safeFileName_(fields.file_name || 'cimco-inspection.pdf');
    const htmlName = fileName.replace(/\.pdf$/i, '') + '.html';
    const htmlBytes = Utilities.base64DecodeWebSafe(encoded);
    const pdf = Utilities.newBlob(htmlBytes, 'text/html', htmlName)
      .getAs(MimeType.PDF)
      .setName(fileName);

    const property = cleanText_(fields.property, 180) || 'Untitled property';
    const inspectionType = cleanText_(fields.inspection_type, 60) || 'Property';
    const reviewed = cleanText_(fields.reviewed, 20) || '0';
    const total = cleanText_(fields.total, 20) || '0';
    const flags = cleanText_(fields.flags, 20) || '0';
    const submittedAt = cleanText_(fields.submitted_at, 60) || new Date().toISOString();

    MailApp.sendEmail({
      to: CIMCO_DELIVERY.recipient,
      replyTo: CIMCO_DELIVERY.sender,
      name: 'CIMCO Inspections',
      subject: 'CIMCO ' + inspectionType + ' inspection — ' + property,
      body: [
        'A completed CIMCO inspection report is attached as a PDF.',
        '',
        'Property: ' + property,
        'Inspection type: ' + inspectionType,
        'Checklist progress: ' + reviewed + ' of ' + total,
        'Items needing attention: ' + flags,
        'Submitted: ' + submittedAt,
        '',
        'Sent automatically by the CIMCO Inspection App.'
      ].join('\n'),
      attachments: [pdf]
    });

    return deliveryResponse_({ok: true, requestId: requestId});
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return deliveryResponse_({
      ok: false,
      requestId: requestId,
      error: error && error.message ? error.message : 'The report could not be sent.'
    });
  }
}

function deliveryResponse_(payload) {
  const json = JSON.stringify(Object.assign({type: 'cimco-report-delivery'}, payload)).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>parent.postMessage(' + json + ',"*");<\/script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function cleanText_(value, limit) {
  return String(value || '').replace(/[\r\n\u0000-\u001f]+/g, ' ').trim().slice(0, limit || 200);
}

function safeFileName_(value) {
  const cleaned = cleanText_(value, 160).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const base = cleaned || 'cimco-inspection.pdf';
  return /\.pdf$/i.test(base) ? base : base + '.pdf';
}

function secureEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
