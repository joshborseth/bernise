import { BerniseRpcs, Pong } from "@bernise/contracts";
import { Effect } from "effect";

export const PingLive = BerniseRpcs.toLayer({
  Ping: () => Effect.succeed(new Pong({ pong: true })),
});
