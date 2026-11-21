// Country-specific postal format checks. These do not verify a street exists.
export function addressError(address){
 const country=String(address.country||"");
 const postal=String(address.postalCode||"").trim().toUpperCase();
 const region=String(address.region||"").trim();
 if(!String(address.address1||"").trim()||!String(address.city||"").trim())return "Enter a street address and city/suburb.";
 if(country==="Australia"){
  if(!/^\d{4}$/.test(postal))return "Australian postcodes must contain exactly 4 digits.";
  if(!/^(NSW|ACT|VIC|QLD|SA|WA|TAS|NT|NEW SOUTH WALES|AUSTRALIAN CAPITAL TERRITORY|VICTORIA|QUEENSLAND|SOUTH AUSTRALIA|WESTERN AUSTRALIA|TASMANIA|NORTHERN TERRITORY)$/i.test(region))return "Enter a valid Australian state or territory (for example NSW, VIC or QLD).";
 }else if(country==="United States"){
  if(!/^\d{5}(?:-\d{4})?$/.test(postal))return "US ZIP codes must contain 5 digits, optionally followed by -1234.";
  if(region.length<2)return "Enter a US state.";
 }else if(country==="United Kingdom"){
  if(!/^(GIR\s?0AA|(?:[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}))$/i.test(postal))return "Enter a valid UK postcode format (for example SW1A 1AA).";
 }else if(country==="Canada"){
  if(!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(postal))return "Enter a valid Canadian postal code format (for example K1A 0B1).";
  if(region.length<2)return "Enter a Canadian province or territory.";
 }else return "Choose a supported delivery country.";
 return "";
}
