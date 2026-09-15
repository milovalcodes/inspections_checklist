import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pages=["index.html","move-in.html","move-out.html"];
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

for(const page of pages){
  const html=read(page);
  const inline=html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);
  assert.ok(inline,`${page} main script is present`);
  new Function('"use strict";'+inline[1]);
  assert.match(html,/app-theme\.css\?v=50/);
  assert.match(html,/app-enhancements\.js\?v=50/);
}

new Function(read("app-enhancements.js"));
new Function(read("service-worker.js"));

const general=read("index.html");
assert.equal(general.replace("const MODE_LOCK = null;",'const MODE_LOCK = "in";'),read("move-in.html"),"move-in parity");
assert.equal(general.replace("const MODE_LOCK = null;",'const MODE_LOCK = "out";'),read("move-out.html"),"move-out parity");

const enhancements=read("app-enhancements.js");
for(const marker of ["openDialog","jumpNextUnreviewed","renderDashboard","updateHealth","processPhotos","initPwaHealth","runSelfTests"]){
  assert.ok(enhancements.includes(marker),`${marker} is included`);
}
const theme=read("app-theme.css");
assert.match(theme,/\.rec \.badge\{width:58px;[^}]*white-space:nowrap;overflow:hidden\}/,"record badges contain long labels");
assert.match(theme,/\.cam\{width:44px;height:44px\}/,"mobile photo controls keep a full tap target");
assert.match(read("tests/regression.html"),/selftest=1&amp;suite=50/,"browser tests use a release-specific isolated URL");
for(const marker of ["convertInspectionForm","photoPut","reportHTML","signatureSvg","insertSpaceNearFamily"]){
  assert.ok(general.includes(marker),`${marker} remains available`);
}

const worker=read("service-worker.js");
for(const asset of ["index.html","move-in.html","move-out.html","app-theme.css?v=50","app-enhancements.js?v=50"]){
  assert.ok(worker.includes(asset),`${asset} is cached for offline use`);
}
assert.match(worker,/self\.skipWaiting\(\)/,"new offline builds activate without waiting for every old tab to close");

console.log("CIMCO static regression checks passed.");
