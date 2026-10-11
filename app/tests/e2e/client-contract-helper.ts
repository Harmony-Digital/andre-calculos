import { randomUUID } from "node:crypto";
import { acceptanceFixture } from "./acceptance-helper";
import { localNotificationSql } from "./notification-helper";
export async function clientContractFixture() {
  const fixture = await acceptanceFixture();
  const requests = new Set<string>();
  return {
    ...fixture,
    remember: (id: string) => {
      if (!/^[0-9a-f-]{36}$/i.test(id))
        throw new Error("UUID sintético inválido.");
      requests.add(id);
      return id;
    },
    args: async (
      patch: {
        has_contract?: boolean;
        reason?: string;
        expected_revision?: number;
        request_id?: string;
        target_client?: string;
      } = {},
    ) => {
      const current = await fixture.db
        .from("clients")
        .select("contract_revision")
        .eq("id", fixture.owner.id)
        .single();
      if (current.error) throw new Error("Revisão sintética indisponível.");
      const id = patch.request_id ?? randomUUID();
      requests.add(id);
      return {
        target_client: fixture.owner.id,
        has_contract: true,
        reason: "Contrato exclusivamente fictício para o ensaio local.",
        expected_revision: current.data.contract_revision,
        ...patch,
        request_id: id,
      };
    },
    cleanup: async () => {
      try {
        if (requests.size) {
          const ids = [...requests].map((id) => `'${id}'::uuid`).join(",");
          localNotificationSql(
            `delete from public.audit_log where action='client_contract_changed' and target_id=any(array[${ids}]); delete from private.client_contract_changes where id=any(array[${ids}]);`,
          );
        }
      } finally {
        await fixture.cleanup();
      }
    },
  };
}
