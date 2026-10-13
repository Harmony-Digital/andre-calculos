import { randomUUID } from "node:crypto";
import { acceptanceFixture } from "./acceptance-helper";
export async function rejectionFixture() {
  const fixture = await acceptanceFixture();
  return {
    ...fixture,
    create: async (options: Parameters<typeof fixture.create>[0] = {}) => {
      const sample = await fixture.create(options);
      const result = await fixture.db
        .from("orders")
        .select("status_revision")
        .eq("id", sample.order_id)
        .single();
      if (result.error || !result.data)
        throw new Error("Revisão sintética indisponível.");
      const statusRevision = result.data.status_revision;
      return {
        ...sample,
        statusRevision,
        rejectionArgs: (patch: Record<string, unknown> = {}) => ({
          actor: sample.actor,
          target_quote: sample.id,
          expected_context: sample.contextHash,
          expected_revision: statusRevision,
          request_id: randomUUID(),
          confirmed: true,
          reason: "",
          ip_address: "192.0.2.44",
          user_agent: "Agente sintético de recusa",
          ...patch,
        }),
      };
    },
  };
}
