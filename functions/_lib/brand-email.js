// Preserve the verified sending address, but always show the current studio brand.
export function atelierSender(env){
  const configured=String(env?.RESEND_FROM||"onboarding@resend.dev").trim();
  const bracket=configured.match(/<([^<>]+)>\s*$/);
  const address=(bracket?bracket[1]:configured).trim();
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))throw Error("Invalid RESEND_FROM sender address");
  return "ATELIER HAU <"+address+">";
}
