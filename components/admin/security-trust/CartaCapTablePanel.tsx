"use client";

// Re-export CartaAssessmentPanel under CartaCapTablePanel for backward compatibility,
// since carta-svc (:8142) is a Continuous Adaptive Risk & Trust Assessment engine,
// not an equity cap table.
export { CartaAssessmentPanel as CartaCapTablePanel } from "./CartaAssessmentPanel";
