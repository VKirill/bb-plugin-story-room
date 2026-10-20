// The one host call: run the story repo's room script (`node tools/story/room.ts <args>`) in the repo and return its JSON.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Room commands the server may ask for; the script itself validates the rest. */
export const ROOM_COMMANDS = ["tree", "read", "canon", "brief", "run", "runs", "log"] as const;

export const hostContract = defineRpcContract({
  room: {
    input: z
      .object({
        repo: z.string().min(1),
        args: z.tuple([z.enum(ROOM_COMMANDS)]).rest(z.string().max(500)),
      })
      .strict(),
    output: z.json(),
  },
});
