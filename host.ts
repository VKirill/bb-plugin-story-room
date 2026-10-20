// Runs on the machine that holds the story repo: one call, one `node tools/story/room.ts …`, JSON back.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract.js";

const exec = promisify(execFile);

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    room: async ({ repo, args }, context) => {
      const script = join(repo, "tools/story/room.ts");
      if (!existsSync(script)) throw new Error(`No tools/story/room.ts in ${repo}`);
      try {
        const { stdout } = await exec("node", [script, ...args], {
          cwd: repo,
          timeout: 25_000,
          maxBuffer: 8 * 1024 * 1024,
          signal: context.signal,
        });
        return JSON.parse(stdout);
      } catch (error) {
        const e = error as { stderr?: string; message?: string };
        throw new Error((e.stderr || e.message || String(error)).trim().split("\n").slice(-3).join("\n"));
      }
    },
  },
});
