// The astronomy against dates whose answers are public record. Run: node --test test/sky.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { sunPosition, sunTimes, moonPhase, moonPosition, moonTimes, lightPhase, nextLight, nightSpan, skyColors } from "../extension/sky.js";

const NYC = [40.7128, -74.006];
const minutes = (a, b) => Math.abs(a - b) / 60000;

test("sunrise and sunset in New York on the 2024 summer solstice", () => {
  const t = sunTimes(new Date("2024-06-21T16:00:00Z"), ...NYC);
  assert.ok(minutes(t.sunrise, new Date("2024-06-21T09:25:00Z")) < 3, `sunrise ${t.sunrise.toISOString()}`); // 5:25 AM EDT
  assert.ok(minutes(t.sunset, new Date("2024-06-22T00:31:00Z")) < 3, `sunset ${t.sunset.toISOString()}`); // 8:31 PM EDT
});

test("the light changes in order through the day", () => {
  const t = sunTimes(new Date("2024-06-21T16:00:00Z"), ...NYC);
  const order = ["midnight", "firstLight", "nauticalDawn", "dawn", "sunrise", "goldenEnd", "noon", "golden", "sunset", "dusk", "nauticalDusk", "lastLight"];
  for (let i = 1; i < order.length; i++) assert.ok(t[order[i - 1]] < t[order[i]], `${order[i - 1]} before ${order[i]}`);
});

test("at solar noon on an equinox the sun stands at 90° minus the latitude, due south", () => {
  const noon = sunTimes(new Date("2024-03-20T17:00:00Z"), ...NYC).noon;
  const p = sunPosition(noon, ...NYC);
  assert.ok(Math.abs(p.altitude - (90 - NYC[0])) < 0.6, `altitude ${p.altitude}`);
  assert.ok(Math.abs(p.hourAngle) < 0.002, `hour angle ${p.hourAngle}`);
});

test("the hour angle runs from −½ at solar midnight to +½ a day later", () => {
  const t = sunTimes(new Date("2024-06-21T16:00:00Z"), ...NYC);
  assert.ok(Math.abs(sunPosition(new Date(+t.noon - 6 * 3600e3), ...NYC).hourAngle + 0.25) < 0.005);
  assert.ok(Math.abs(sunPosition(new Date(+t.noon + 6 * 3600e3), ...NYC).hourAngle - 0.25) < 0.005);
});

test("a day belongs to the solar noon nearest it", () => {
  const late = sunTimes(new Date("2024-06-22T03:30:00Z"), ...NYC); // 11:30 PM in New York on the 21st
  assert.equal(late.noon.toISOString().slice(0, 10), "2024-06-21");
});

test("the moon is new at the April 2024 solar eclipse and full at the September 2024 lunar one", () => {
  const eclipse = moonPhase(new Date("2024-04-08T18:21:00Z"));
  assert.ok(eclipse.fraction < 0.005, `fraction ${eclipse.fraction}`);
  assert.equal(eclipse.name, "New moon");
  const full = moonPhase(new Date("2024-09-18T02:34:00Z"));
  assert.ok(full.fraction > 0.995, `fraction ${full.fraction}`);
  assert.equal(full.name, "Full moon");
  assert.equal(full.emoji, "🌕");
});

test("a week after new the moon is a waxing half, a week after full a waning one", () => {
  assert.equal(moonPhase(new Date("2024-04-15T19:13:00Z")).name, "First quarter");
  assert.equal(moonPhase(new Date("2024-09-24T18:50:00Z")).name, "Last quarter");
});

test("the full moon stands opposite the sun: up at midnight, rising near sunset", () => {
  const at = new Date("2024-09-18T04:55:00Z"); // close to solar midnight in New York
  assert.ok(moonPosition(at, ...NYC).altitude > 30);
  assert.ok(sunPosition(at, ...NYC).altitude < -30);
  const sunset = sunTimes(new Date("2024-09-17T17:00:00Z"), ...NYC).sunset;
  const { rise } = moonTimes(new Date("2024-09-17T17:00:00Z"), ...NYC);
  assert.ok(rise && minutes(rise, sunset) < 45, `moonrise ${rise && rise.toISOString()} vs sunset ${sunset.toISOString()}`);
});

test("light phases are named by the sun's height", () => {
  assert.deepEqual([30, 3, -3, -9, -15, -30].map(lightPhase), ["Daylight", "Golden hour", "Civil twilight", "Nautical twilight", "Astronomical twilight", "Night"]);
});

test("the next change of light is the first one after now, into tomorrow if need be", () => {
  const t = sunTimes(new Date("2024-06-21T16:00:00Z"), ...NYC);
  assert.equal(nextLight(new Date(+t.noon), ...NYC).label, "golden hour");
  assert.equal(nextLight(new Date(+t.sunset + 60e3), ...NYC).label, "dusk");
  const night = nextLight(new Date(+t.lastLight + 60e3), ...NYC);
  assert.equal(night.label, "first light");
  assert.ok(night.at > t.lastLight);
});

test("night runs from dusk to the next dawn, whichever side of midnight you ask from", () => {
  const t = sunTimes(new Date("2024-06-21T16:00:00Z"), ...NYC);
  const evening = nightSpan(new Date(+t.dusk + 3600e3), ...NYC);
  const smallHours = nightSpan(new Date(+t.dusk + 5 * 3600e3), ...NYC);
  assert.equal(+evening.from, +t.dusk);
  assert.ok(minutes(evening.to, smallHours.to) < 2 && minutes(evening.from, smallHours.from) < 2);
  assert.ok(evening.to > evening.from);
});

test("where the sun never sets, there is no sunset and no night", () => {
  const t = sunTimes(new Date("2024-06-21T12:00:00Z"), 78.22, 15.65); // Longyearbyen
  assert.equal(t.sunset, null);
  assert.equal(nightSpan(new Date("2024-06-21T12:00:00Z"), 78.22, 15.65), null);
});

test("the sky darkens with the sun, and the light and dark pages agree once it is night", () => {
  assert.equal(skyColors(40, false).top, "#cfe6fb");
  assert.equal(skyColors(-30, false).top, "#0b1026");
  assert.equal(skyColors(-9, false).top, skyColors(-9, true).top);
  assert.equal(skyColors(-6, false).horizon, skyColors(-6, true).horizon);
  assert.equal(skyColors(10, false).stars, 0);
  assert.equal(skyColors(-20, false).stars, 1);
  assert.equal(skyColors(5, false).lightInk, false);
  assert.equal(skyColors(-5, false).lightInk, true);
  assert.equal(skyColors(5, true).lightInk, true);
});
