const RAW_DATA_ROOT =
  "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary";

type JsonRecord = Record<string, unknown>;

export type FiveToolsUrlResult = {
  monster: JsonRecord;
  legendaryGroup?: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseFiveToolsBestiaryUrl(source: string) {
  let url: URL;
  try {
    url = new URL(source.trim());
  } catch {
    throw new Error("Enter a complete 5e.tools bestiary URL.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || hostname !== "5e.tools" || url.pathname !== "/bestiary.html") {
    throw new Error("Use a URL like https://5e.tools/bestiary.html#adult%20red%20dragon_xmm");
  }

  const hash = decodeURIComponent(url.hash.slice(1));
  const separator = hash.lastIndexOf("_");
  if (separator <= 0 || separator === hash.length - 1) {
    throw new Error("The 5e.tools URL must identify both a monster and its source.");
  }

  return {
    name: hash.slice(0, separator).trim(),
    source: hash.slice(separator + 1).trim().toUpperCase(),
  };
}

async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "default", signal });
  if (!response.ok) {
    throw new Error(`The external data request failed (${response.status}).`);
  }
  return response.json() as Promise<unknown>;
}

export async function fetchFiveToolsMonsterUrl(
  sourceUrl: string,
  signal: AbortSignal,
): Promise<FiveToolsUrlResult> {
  const target = parseFiveToolsBestiaryUrl(sourceUrl);
  const rawIndex = await fetchJson(`${RAW_DATA_ROOT}/index.json`, signal);
  if (!isRecord(rawIndex)) throw new Error("The external bestiary index is invalid.");

  const indexEntry = Object.entries(rawIndex).find(
    ([source]) => source.toUpperCase() === target.source,
  );
  if (!indexEntry || typeof indexEntry[1] !== "string") {
    throw new Error(`Unknown 5e.tools source: ${target.source}`);
  }

  const rawBestiary = await fetchJson(`${RAW_DATA_ROOT}/${indexEntry[1]}`, signal);
  if (!isRecord(rawBestiary) || !Array.isArray(rawBestiary.monster)) {
    throw new Error("The external bestiary source is invalid.");
  }

  const monster = rawBestiary.monster.find((value) => {
    if (!isRecord(value)) return false;
    return String(value.name ?? "").toLowerCase() === target.name.toLowerCase()
      && String(value.source ?? "").toUpperCase() === target.source;
  });
  if (!isRecord(monster)) {
    throw new Error(`${target.name} was not found in source ${target.source}.`);
  }

  const legendaryReference = isRecord(monster.legendaryGroup)
    ? monster.legendaryGroup
    : undefined;
  if (!legendaryReference) return { monster };

  const rawGroups = await fetchJson(`${RAW_DATA_ROOT}/legendarygroups.json`, signal);
  const groups = isRecord(rawGroups) && Array.isArray(rawGroups.legendaryGroup)
    ? rawGroups.legendaryGroup
    : [];
  const legendaryGroup = groups.find((value) => {
    if (!isRecord(value)) return false;
    return String(value.name ?? "").toLowerCase()
      === String(legendaryReference.name ?? "").toLowerCase()
      && String(value.source ?? "").toUpperCase()
      === String(legendaryReference.source ?? "").toUpperCase();
  });

  return isRecord(legendaryGroup) ? { monster, legendaryGroup } : { monster };
}
