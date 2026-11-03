import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir,"dist");
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const f of ["index.html","styles.css","app.js","graphic-elements.js","scene-layout.js","_headers"]){
  await copyFile(join(dir,f),join(out,f));
}
await mkdir(join(out,"assets"),{recursive:true});
for(const asset of ["anons-logo-approved.webp","anons-icon-approved.webp"]){
  await copyFile(join(dir,"assets",asset),join(out,"assets",asset));
}
await build({
  entryPoints:[join(dir,"auth-entry.js")],
  outfile:join(out,"auth.bundle.js"),
  platform:"browser",
  target:"es2022",
  format:"iife",
  bundle:true,
  minify:true,
  legalComments:"none",
  sourcemap:false
});
console.log("Anons Studio dist generated (static HTML, CSS, editor, bundled auth)");
