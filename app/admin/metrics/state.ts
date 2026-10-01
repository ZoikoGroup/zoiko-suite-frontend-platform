import type { ReportMetricDefinition } from "@/lib/api/metric-registry";

export type CreateMetricState =
  | { status: "idle" }
  | { status: "created"; metric: ReportMetricDefinition; message: string }
  | { status: "conflict"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_CREATE_METRIC: CreateMetricState = { status: "idle" };

export type PublishVersionState =
  | { status: "idle" }
  | { status: "published"; metric: ReportMetricDefinition; message: string }
  | { status: "notFound"; message: string }
  | { status: "refused"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_PUBLISH_VERSION: PublishVersionState = { status: "idle" };
