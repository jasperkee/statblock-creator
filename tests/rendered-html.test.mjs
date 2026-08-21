import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("builds Statblock Creator as a static SPA with a Sites asset worker", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const sitesHtml = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const worker = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(html, /<title>Statblock Creator<\/title>/i);
  assert.match(html, /\/assets\/index-[^"]+\.js/);
  assert.equal(await exists(new URL("../dist/server/index.js", import.meta.url)), true);
  assert.equal(sitesHtml, html);
  assert.equal(await exists(new URL("../dist/client/assets/", import.meta.url)), true);
  assert.match(worker, /env\.ASSETS\.fetch/);
  assert.match(worker, /\/index\.html/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("includes selectable preview column modes", async () => {
  const assets = new URL("../dist/assets/", import.meta.url);
  const javascript = (await readdir(assets)).filter((name) => name.endsWith(".js"));
  const source = (await Promise.all(
    javascript.map((name) => readFile(new URL(name, assets), "utf8")),
  )).join("\n");
  assert.match(source, /Preview columns/);
  assert.match(source, /1 column/);
  assert.match(source, /2 columns/);
});

test("includes a session-only fallback storage warning dismissal", async () => {
  const assets = new URL("../dist/assets/", import.meta.url);
  const javascript = (await readdir(assets)).filter((name) => name.endsWith(".js"));
  const source = (await Promise.all(
    javascript.map((name) => readFile(new URL(name, assets), "utf8")),
  )).join("\n");
  assert.match(source, /Hide fallback storage warning/);
  assert.match(source, /Hide warning until this page is reloaded/);
});

test("keeps website-link importing out of the default build", async () => {
  const assets = new URL("../dist/assets/", import.meta.url);
  const javascript = (await readdir(assets)).filter((name) => name.endsWith(".js"));
  const source = (await Promise.all(
    javascript.map((name) => readFile(new URL(name, assets), "utf8")),
  )).join("\n");
  assert.doesNotMatch(source, /5etools Link/);
  assert.doesNotMatch(source, /main\/data\/bestiary/);
});

test("includes the encounter calculator only when its build flag is enabled", async () => {
  const assets = new URL("../dist/assets/", import.meta.url);
  const source = (await Promise.all(
    (await readdir(assets))
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(new URL(name, assets), "utf8")),
  )).join("\n");
  if (process.env.VITE_ENABLE_ENCOUNTER_CALCULATOR === "true") {
    assert.match(source, /Encounter Calculator/);
    assert.match(source, /Estimated difficulty/);
  } else {
    assert.doesNotMatch(source, /Encounter Calculator/);
    assert.doesNotMatch(source, /statblock-creator-encounter-calculator-v1/);
  }
});
