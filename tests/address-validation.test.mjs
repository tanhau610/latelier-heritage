import test from "node:test";
import assert from "node:assert/strict";
import {addressError} from "../functions/_lib/address-validation.js";
const address={address1:"10 Example Street",city:"Sydney",region:"NSW",country:"Australia",postalCode:"2000"};
test("Australia rejects non-four-digit postcodes and non-Australian regions",()=>{
 assert.equal(addressError(address),"");
 assert.match(addressError({...address,postalCode:"54117"}),/4 digits/);
 assert.match(addressError({...address,region:"Ho Chi Minh City"}),/Australian state/);
});
test("United States ZIP format",()=>{
 assert.equal(addressError({...address,country:"United States",region:"CA",postalCode:"94105"}),"");
 assert.match(addressError({...address,country:"United States",postalCode:"2000"}),/ZIP/);
});
test("UK and Canada postal formats",()=>{
 assert.equal(addressError({...address,country:"United Kingdom",region:"",postalCode:"SW1A 1AA"}),"");
 assert.equal(addressError({...address,country:"Canada",region:"ON",postalCode:"K1A 0B1"}),"");
 assert.match(addressError({...address,country:"Canada",postalCode:"12345"}),/Canadian/);
});

test("US delivery rejects a Vietnamese city and non-US state",()=>{
 assert.match(addressError({...address,country:"United States",region:"Quảng Ngãi",city:"Quảng Ngãi",postalCode:"54117"}),/valid US state/);
 assert.match(addressError({...address,country:"United States",region:"WI",city:"Quảng Ngãi",postalCode:"54117"}),/outside the selected country/);
});
