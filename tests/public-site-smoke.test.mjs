import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const pages=["index.html","about.html","gallery.html","pricing.html","commission.html","process.html","shipping.html","policies.html","contact.html"];
const sitemap=readFileSync("sitemap.xml","utf8");
const robots=readFileSync("robots.txt","utf8");
for(const page of pages){
 test("Public SEO metadata: "+page,()=>{
  const html=readFileSync(page,"utf8");
  const canonical="https://atelierhau.com/"+(page==="index.html"?"":page);
  assert.match(html,/<html lang="en">/i);
  assert.match(html,/<title>[^<]+<\/title>/i);
  assert.match(html,/<meta name="description" content="[^"]+"/i);
  assert.match(html,/<h1\b/i);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes('rel="canonical" href="'+canonical+'"'));
  assert.ok(sitemap.includes("<loc>"+canonical+"</loc>"));
 });
}
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
