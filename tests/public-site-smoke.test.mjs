import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const pages=["index.html","about.html","gallery.html","pricing.html","commission.html","process.html","pet-portrait-photo-guide.html","oil-vs-digital-pet-portrait.html","pet-memorial-oil-portraits.html","policies.html","contact.html"];
const sitemap=readFileSync("sitemap.xml","utf8");
const robots=readFileSync("robots.txt","utf8");
for(const page of pages){
 test("Public SEO metadata: "+page,()=>{
  const html=readFileSync(page,"utf8");
  const canonical="https://atelierhau.com/"+(page==="index.html"?"":page==="pricing.html"?"pricing":page);
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

test("Every public page offers an accessible policies link in its footer",()=>{
 for(const page of pages){
  const html=readFileSync(page,"utf8");
  const footer=html.split("<footer")[1]||"";
  assert.ok(footer.includes('href="policies.html"'),page+" is missing policies in footer");
 }
});

test("Homepage visibly features both editorial guides without changing the primary menu",()=>{
 const home=readFileSync("index.html","utf8");
 const main=home.split("<main>")[1]?.split("</main>")[0]||"";
 assert.match(main,/class="ah-guides"/);
 assert.match(main,/href="pet-portrait-photo-guide\.html"/);
 assert.match(main,/href="oil-vs-digital-pet-portrait\.html"/);
 const header=home.split("</header>")[0]||"";
 assert.doesNotMatch(header,/pet-portrait-photo-guide\.html|oil-vs-digital-pet-portrait\.html/);
});

test("Editorial guides have usable sharing metadata and truthful structured data",()=>{
 for(const page of ["pet-portrait-photo-guide.html","oil-vs-digital-pet-portrait.html"]){
  const html=readFileSync(page,"utf8");
  assert.match(html,/<meta property="og:title" content="[^"]+"/);
  assert.match(html,/<meta property="og:description" content="[^"]+"/);
  assert.match(html,/<meta property="og:image" content="https:\/\/atelierhau\.com\/assets\/10-dog-in-garden\.jpg"/);
  const match=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match,page+" is missing structured data");
  const article=JSON.parse(match[1]);
  assert.equal(article["@type"],"Article");
  assert.equal(article.author.name,"ATELIER HAU");
  assert.ok(article.mainEntityOfPage.endsWith(page));
  assert.ok(!("aggregateRating" in article));
 }
});

test("Do not introduce Cloudflare Pages clean URL redirect loops",()=>{
 assert.ok(!existsSync("_redirects"),"Avoid custom reverse redirects that conflict with Pages clean URL normalization");
});

test("Memorial portrait guide is linked from commission and photo guide without invented customer testimonials",()=>{
 const memorial=readFileSync("pet-memorial-oil-portraits.html","utf8");
 assert.match(memorial,/older photograph/);
 assert.match(memorial,/not a customer memorial commission/);
 assert.match(memorial,/href="commission\.html#portrait-builder"/);
 assert.match(readFileSync("commission.html","utf8"),/href="pet-memorial-oil-portraits\.html"/);
 assert.match(readFileSync("pet-portrait-photo-guide.html","utf8"),/href="pet-memorial-oil-portraits\.html"/);
});

test("Pricing keeps a single concise buying guide instead of stacked SEO blocks",()=>{
 const pricing=readFileSync("pricing.html","utf8");
 assert.equal((pricing.match(/<section class="seo-buying-guide"/g)||[]).length,1);
 assert.match(pricing,/href="oil-vs-digital-pet-portrait\.html"/);
});

test("Every public page has exactly one HTML document root",()=>{
 for(const page of pages){
  const html=readFileSync(page,"utf8");
  assert.equal((html.match(/<!doctype html>/gi)||[]).length,1,page+" must have one doctype");
  assert.equal((html.match(/<html\b/gi)||[]).length,1,page+" must have one html root");
  assert.equal((html.match(/<head\b/gi)||[]).length,1,page+" must have one head");
  assert.equal((html.match(/<body\b/gi)||[]).length,1,page+" must have one body");
 }
});
