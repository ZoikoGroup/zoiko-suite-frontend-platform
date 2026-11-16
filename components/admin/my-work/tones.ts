export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

export function severityTone(severity: string | undefined): Tone {
  switch ((severity ?? "").toUpperCase()) {
    case "BLOCKER":
    case "CRITICAL":
    case "HIGH":
      return "danger";
    case "MEDIUM":
    case "WARNING":
      return "warning";
    case "LOW":
    case "INFO":
      return "info";
    default:
      return "neutral";
  }
}
