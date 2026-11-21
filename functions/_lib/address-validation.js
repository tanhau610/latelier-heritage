const US_STATES=new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","ALABAMA","ALASKA","ARIZONA","ARKANSAS","CALIFORNIA","COLORADO","CONNECTICUT","DELAWARE","DISTRICT OF COLUMBIA","FLORIDA","GEORGIA","HAWAII","IDAHO","ILLINOIS","INDIANA","IOWA","KANSAS","KENTUCKY","LOUISIANA","MAINE","MARYLAND","MASSACHUSETTS","MICHIGAN","MINNESOTA","MISSISSIPPI","MISSOURI","MONTANA","NEBRASKA","NEVADA","NEW HAMPSHIRE","NEW JERSEY","NEW MEXICO","NEW YORK","NORTH CAROLINA","NORTH DAKOTA","OHIO","OKLAHOMA","OREGON","PENNSYLVANIA","RHODE ISLAND","SOUTH CAROLINA","SOUTH DAKOTA","TENNESSEE","TEXAS","UTAH","VERMONT","VIRGINIA","WASHINGTON","WEST VIRGINIA","WISCONSIN","WYOMING"]);
const CA_PROVINCES=new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT","ALBERTA","BRITISH COLUMBIA","MANITOBA","NEW BRUNSWICK","NEWFOUNDLAND AND LABRADOR","NOVA SCOTIA","NORTHWEST TERRITORIES","NUNAVUT","ONTARIO","PRINCE EDWARD ISLAND","QUEBEC","SASKATCHEWAN","YUKON"]);
const CA_POSTAL_PROVINCE={"A":["NL"],"B":["NS"],"C":["PE"],"E":["NB"],"G":["QC"],"H":["QC"],"J":["QC"],"K":["ON"],"L":["ON"],"M":["ON"],"N":["ON"],"P":["ON"],"R":["MB"],"S":["SK"],"T":["AB"],"V":["BC"],"X":["NT","NU"],"Y":["YT"]};
const foreignPlace=/\b(?:viet\s*nam|quang\s*ngai|ho\s*chi\s*minh|ha\s*noi|da\s*nang)\b|(?:việt\s*nam|quảng\s*ngãi|hồ\s*chí\s*minh|hà\s*nội|đà\s*nẵng)/iu;
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
  if(!US_STATES.has(region.toUpperCase()))return "Enter a valid US state, such as CA, NY or Wisconsin.";
 }else if(country==="United Kingdom"){
  if(!/^(GIR\s?0AA|(?:[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}))$/i.test(postal))return "Enter a valid UK postcode format (for example SW1A 1AA).";
 }else if(country==="Canada"){
  if(!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(postal))return "Enter a valid Canadian postal code format (for example K1A 0B1).";
  if(!CA_PROVINCES.has(region.toUpperCase()))return "Enter a valid Canadian province or territory (for example ON, BC or Ontario).";
  const provinceNames={"ONTARIO":"ON","BRITISH COLUMBIA":"BC","QUEBEC":"QC","ALBERTA":"AB","MANITOBA":"MB","NEW BRUNSWICK":"NB","NEWFOUNDLAND AND LABRADOR":"NL","NOVA SCOTIA":"NS","NORTHWEST TERRITORIES":"NT","NUNAVUT":"NU","PRINCE EDWARD ISLAND":"PE","SASKATCHEWAN":"SK","YUKON":"YT"};
  const province=provinceNames[region.toUpperCase()]||region.toUpperCase();
  if(!CA_POSTAL_PROVINCE[postal[0]]?.includes(province))return "The Canadian postal code does not match the selected province or territory.";
 }else return "Choose a supported delivery country.";
 if(foreignPlace.test([address.address1,address.address2,address.city,region].join(" ")))return "The delivery address contains a location outside the selected country. Please check the street, city and state.";
 return "";
}
