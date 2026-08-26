import { Schema } from "effect";

export class HealthStatus extends Schema.Class<HealthStatus>("HealthStatus")({
  ok: Schema.Boolean,
  service: Schema.Literal("bernise-server"),
}) {}
