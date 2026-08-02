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

test("builds Statblock Creator as a static SPA", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Statblock Creator<\/title>/i);
  assert.match(html, /\/assets\/index-[^"]+\.js/);
  assert.equal(await exists(new URL("../dist/server/index.js", import.meta.url)), false);
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
