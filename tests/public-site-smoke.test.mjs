import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const pages=["index.html","about.html","gallery.html","pricing.html","commission.html","process.html","policies.html","contact.html"];
const sitemap=readFileSync("sitemap.xml","utf8");
const robots=readFileSync("robots.txt","utf8");
for(const page of pages){
 test("Public SEO metadata: "+page,()=>{
  const html=readFileSync(page,"utf8");
  const canonical="https://atelierhau.com/"+(page==="index.html"?"":page);
  assert.match(html,/<html lang="en">/i);
  assert.match(html,/<title>[^<]+<\/title>/i);
  assert.match(html,/<meta\b(?=[^>]*\bname="description")(?=[^>]*\bcontent="[^"]+")[^>]*>/i);
  assert.match(html,/<h1\b/i);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes('rel="canonical" href="'+canonical+'"'));
  assert.ok(sitemap.includes("<loc>"+canonical+"</loc>"));
 });
}
test("Private shipping form is noindex and absent from public sitemap",()=>{
 const html=readFileSync("shipping.html","utf8");
 assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/i);
 assert.ok(!sitemap.includes("https://atelierhau.com/shipping.html"));
});
test("SEO sitemap and crawler boundaries",()=>{
 assert.match(sitemap,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
 assert.match(robots,/Sitemap: https:\/\/atelierhau.com\/sitemap.xml/);
 for(const route of ["/studio","/checkout","/payment","/api/"])assert.ok(robots.includes("Disallow: "+route));
});
test("Referenced local assets exist",()=>{
 for(const page of pages){
  const html=readFileSync(page,"utf8");
  for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
   const url=m[1];
   if(!url||url.startsWith("#")||/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(url)||url.startsWith("//"))continue;
   const path=url.split(/[?#]/)[0].replace(/^\/+/,"");
   if(!path||!/\.[a-z0-9]+$/i.test(path))continue;
   assert.ok(existsSync(path),page+" references missing file "+path);
  }
 }
});

test("Studio film degrades gracefully until authentic video is deployed",()=>{
 const process=readFileSync("process.html","utf8");
 const script=readFileSync("assets/atelier-film.js","utf8");
 assert.match(process,/id="atelier-film-fallback"/);
 assert.match(process,/id="atelier-film-video" hidden controls playsinline/);
 assert.match(process,/preload="auto"/);
 assert.doesNotMatch(process,/poster="art\/black-dog-classic-portrait\.webp"/);
 assert.match(script,/ATELIER_HAU_video_nhac_vui_tuoi\.mp4/);
 assert.ok(existsSync("ATELIER_HAU_video_nhac_vui_tuoi.mp4"));
 assert.match(script,/method:"HEAD"/);
 assert.match(script,/response\.ok/);
});
