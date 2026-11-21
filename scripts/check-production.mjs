// Read-only Production availability checks. Never submit forms or create payments.
const base = "https://atelierhau.com";
const pages = ["/", "/gallery.html", "/commission.html", "/pricing", "/process.html", "/about.html", "/contact.html", "/policies.html", "/pet-portrait-photo-guide.html", "/oil-vs-digital-pet-portrait.html", "/pet-memorial-oil-portraits.html"];
const redirects = ["/contact", "/about", "/process", "/pricing.html"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function inspect(path) {
 let url = new URL(path, base).href;
 const seen = new Set();
 for (let hop = 0; hop < 8; hop++) {
  if (seen.has(url)) throw new Error("Redirect loop: " + [...seen, url].join(" -> "));
  seen.add(url);
  const response = await fetch(url, {redirect:"manual",signal:AbortSignal.timeout(15000),headers:{"user-agent":"ATELIER-HAU-Production-Healthcheck/1.0"}});
  if ([301,302,303,307,308].includes(response.status)) {
   const location = response.headers.get("location");
   if (!location) throw new Error(url + " redirects without Location");
   const next = new URL(location, url);
   if (next.hostname !== "atelierhau.com") throw new Error("Unexpected redirect host: " + next.hostname);
   url = next.href;
   continue;
  }
  if (response.status !== 200) throw new Error(url + " returned HTTP " + response.status);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) throw new Error(url + " returned non-HTML content: " + type);
  const body = await response.text();
  if (!/<html\b/i.test(body) || !/<main\b/i.test(body)) throw new Error(url + " is missing expected HTML layout");
  return {url, hops:seen.size-1};
 }
 throw new Error("Too many redirects for " + path);
}
let failed = 0;
for (const path of [...pages,...redirects]) {
 let error;
 for (let attempt=1;attempt<=3;attempt++) {
  try {
   const result=await inspect(path);
   console.log("PASS",path,"=>",result.url,"redirects:",result.hops);
   error=null;break;
  } catch(e) {
   error=e;
   if (attempt<3) await sleep(5000*attempt);
  }
 }
 if (error) {failed++;console.error("FAIL",path,error.message);}
}
if (failed) {console.error(failed+" production route(s) failed");process.exitCode=1;}
else console.log("All "+(pages.length+redirects.length)+" Production routes passed");
