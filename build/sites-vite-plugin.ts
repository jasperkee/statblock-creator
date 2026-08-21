import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

const STATIC_SPA_WORKER = `const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    if (request.method !== "GET" || !request.headers.get("accept")?.includes("text/html")) {
      return response;
    }
    const indexRequest = new Request(new URL("/index.html", request.url), request);
    return env.ASSETS.fetch(indexRequest);
  },
};

export default worker;
`;

// Packages Sites metadata after Vite finishes compiling.
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const serverDirectory = resolve(root, "dist", "server");
      const hostingConfig = resolve(root, ".openai", "hosting.json");

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });
      await mkdir(serverDirectory, { recursive: true });
      await writeFile(resolve(serverDirectory, "index.js"), STATIC_SPA_WORKER);

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }
    },
  };
}
