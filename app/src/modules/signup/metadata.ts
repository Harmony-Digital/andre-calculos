import type { z } from "zod";
import type { signupSchema } from "./forms";

// Contrato canônico entre o parser do formulário e o hook Auth.
export function signupMetadata(
  value: z.output<typeof signupSchema>,
  legal: { termsVersion: string; privacyVersion: string },
) {
  return {
    full_name: value.fullName,
    phone: value.phone,
    oab_number: value.oabNumber,
    oab_state: value.oabState,
    city: value.city,
    kind: value.kind,
    document: value.document,
    legal_name: value.legalName,
    accepted_legal: true,
    terms_version: legal.termsVersion,
    privacy_version: legal.privacyVersion,
  };
}
