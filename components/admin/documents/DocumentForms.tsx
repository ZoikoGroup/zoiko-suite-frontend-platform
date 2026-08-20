"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { CLASSIFICATIONS } from "@/lib/api/documents";
import { fileDocumentAction } from "@/app/admin/documents/actions";
import { IDLE_FILE_DOCUMENT, type FileDocumentState } from "@/app/admin/documents/state";

/**
 * Tones.
 *
 * `refused` is amber, not red. This service has five separate grants, and being
 * refused one is a governance answer — a principal who can list the register
 * and not open a RESTRICTED document is the control working. Painting that red
 * reads as a fault and invites a retry, which is the wrong response.
 */
const TONE = {
  filed: "success",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Strip the `data:<mime>;base64,` prefix a FileReader data URL carries. */
function splitDataUrl(dataUrl: string): { contentType: string; base64: string } {
  // [\s\S] rather than the `s` flag: this tsconfig targets below es2018, where
  // dotAll is not available and tsc rejects it outright.
  const match = /^data:([^;]*);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return { contentType: "application/octet-stream", base64: "" };
  return { contentType: match[1] || "application/octet-stream", base64: match[2] };
}

export function FileDocumentForm({ legalEntityId }: { legalEntityId: string }) {
  const [state, action, pending] = useActionState<FileDocumentState, FormData>(
    fileDocumentAction,
    IDLE_FILE_DOCUMENT,
  );

  // The bytes are read in the browser and submitted as base64 in a hidden
  // field. The vault's API takes content_base64 inline, so this avoids a
  // multipart round trip the rest of the console has no use for.
  const [file, setFile] = useState<{ name: string; contentType: string; base64: string } | null>(null);
  const [reading, setReading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) {
      setFile(null);
      return;
    }
    setReading(true);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(picked);
    });
    const { contentType, base64 } = splitDataUrl(dataUrl);
    setFile({ name: picked.name, contentType, base64 });
    setReading(false);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="content_base64" value={file?.base64 ?? ""} />
      <input type="hidden" name="content_type" value={file?.contentType ?? ""} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="title">
            Title
          </label>
          <input className={FIELD} id="title" name="title" placeholder="Q4 board pack" required />
        </div>

        <div>
          <label className={LABEL} htmlFor="classification">
            Classification
          </label>
          <select className={FIELD} id="classification" name="classification" defaultValue="INTERNAL" required>
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className={HINT}>
            Decides how the document is protected. The vault refuses a document without one rather
            than defaulting to the least restrictive.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="legal_entity_id">
            Legal entity <span className={OPTIONAL}>(defaults to your session)</span>
          </label>
          <input className={FIELD} id="legal_entity_id" name="legal_entity_id" defaultValue={legalEntityId} />
          <p className={HINT}>Documents are authorized per legal entity, not per tenant.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="retention_policy">
            Retention policy <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="retention_policy" name="retention_policy" placeholder="DEFAULT" />
        </div>

        <div>
          <label className={LABEL} htmlFor="residency_region_code">
            Residency region <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="residency_region_code" name="residency_region_code" placeholder="eu" />
          <p className={HINT}>
            When set, the vault checks it against the tenant&rsquo;s region and fails closed — it
            refuses rather than serving the content and noting the violation afterwards.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="file">
            File
          </label>
          <input className={FIELD} id="file" type="file" onChange={onPick} required />
          <p className={HINT}>
            {file
              ? `${file.name} — ${file.contentType}`
              : "Read in the browser and submitted inline; the vault computes the SHA-256 on write and re-verifies it on every read."}
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending || reading || !file}>
        {pending ? "Filing…" : reading ? "Reading file…" : "File document"}
      </Button>

      <ResultBanner tone={TONE[state.status]} message={state.status === "idle" ? undefined : state.message}>
        {state.status === "filed" && (
          <div className="mt-2 text-xs">
            <CopyableId value={state.document.document_id} />
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
