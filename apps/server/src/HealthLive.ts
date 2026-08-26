import { HealthStatus } from "@bernise/contracts";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

const encodeHealth = HttpServerResponse.schemaJson(HealthStatus);

export const HealthLive = HttpRouter.add(
  "GET",
  "/health",
  encodeHealth(new HealthStatus({ ok: true, service: "bernise-server" })),
);
