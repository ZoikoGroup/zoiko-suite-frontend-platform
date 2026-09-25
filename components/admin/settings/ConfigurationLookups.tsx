"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupConfigEntry, lookupFeatureFlag } from "@/app/admin/settings/actions";
import type { ConfigEntry, FeatureFlag } from "@/lib/api/configuration";
import { ConfigEntrySummary } from "./ConfigEntrySummary";
import { FeatureFlagSummary } from "./FeatureFlagSummary";

/**
 * "Name a setting, read what is in force."
 *
 * Client components purely to hold the render functions: `renderRecord` is an
 * ordinary function prop, which cannot cross the server/client boundary, so the
 * page cannot pass it to LookupById directly. Without one, LookupById falls back
 * to dumping the record as JSON — which is what both of these lookups did, and
 * the reason they were unusable to anyone who does not read a wire format.
 */
export function FeatureFlagLookup() {
  return (
    <LookupById<FeatureFlag>
      action={lookupFeatureFlag}
      inputName="flag_key"
      label="Is a feature switched on?"
      placeholder="checkout.new_flow local this-organisation"
      hint="The feature name, then the environment, then who it applies to — this-organisation or everyone. Defaults to local and this-organisation."
      buttonLabel="Check this feature"
      renderRecord={(flag) => <FeatureFlagSummary flag={flag} />}
    />
  );
}

export function ConfigEntryLookup() {
  return (
    <LookupById<ConfigEntry>
      action={lookupConfigEntry}
      inputName="config_key"
      label="What is a setting set to?"
      placeholder="payroll.cutoff_hour local this-organisation"
      hint="The same three parts. Finding nothing here does not mean the setting is unset — see the note above."
      buttonLabel="Check this setting"
      renderRecord={(entry) => <ConfigEntrySummary entry={entry} />}
    />
  );
}
