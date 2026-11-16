// Show the authentic studio film only when its optimized MP4 has been published.
// Until then, keep the real artwork fallback visible and never display a broken player.
(async()=>{
 const video=document.getElementById("atelier-film-video");
 const fallback=document.getElementById("atelier-film-fallback");
 if(!video||!fallback)return;
 const src="/assets/atelier-hau-painting-process.mp4";
 try{
  const response=await fetch(src,{method:"HEAD",cache:"no-store"});
  if(!response.ok||!(response.headers.get("content-type")||"").includes("video/"))return;
  video.src=src+"#t=0.1";
  video.addEventListener("loadedmetadata",()=>{try{video.currentTime=0.1;}catch{}},{once:true});
  video.hidden=false;
  fallback.hidden=true;
 }catch{
  // Network errors must not interfere with the rest of the page.
 }
})();
