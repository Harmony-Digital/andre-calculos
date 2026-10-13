import { execFileSync } from "node:child_process";
import { localSystem, leaseLocalSettings } from "./local-helper";
import { fictionalServiceSettings } from "../settings-fixture";
const uuid = (value: string) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("Identificador fictício inválido.");
  return `'${value}'::uuid`;
};
export function localNotificationSql(sql: string, timeout?: number) {
  localSystem();
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_andre-calculos",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        env: process.env,
        input: sql,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf8",
        timeout,
      },
    ).trim();
  } catch {
    throw new Error("Consulta das fixtures de aviso não concluída.");
  }
}
export function setFixtureNotificationRecipient(id: string | null) {
  localNotificationSql(
    `update private.calculator_notification_recipient set profile_id=${id ? uuid(id) : "null"} where singleton;`,
  );
}
export function setFixtureCalculatorRole(
  id: string,
  role: "calculator" | "admin",
) {
  localNotificationSql(
    `update public.profiles set role='${role}' where id=${uuid(id)};`,
  );
}
export async function notificationFixture() {
  const release = await leaseLocalSettings(),
    db = localSystem();
  try {
    const profile = await db
      .from("profiles")
      .select("id")
      .eq("role", "calculator")
      .single();
    if (profile.error) throw new Error("Calculista fictício indisponível.");
    const id = profile.data.id;
    const priorRecipientAudits = new Set(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("actor_id", id)
          .eq("action", "notification_recipient_confirmed")
      ).data?.map((row) => row.id) ?? [],
    );
    const binding = JSON.parse(
      localNotificationSql(
        "select json_build_object('profile_id',profile_id) from private.calculator_notification_recipient where singleton;",
      ),
    ) as { profile_id: string | null };
    if (binding.profile_id !== id)
      throw new Error("Vínculo fictício inesperado.");
    const prior = (
      await db
        .from("settings")
        .select("contact_email,contact_phone")
        .eq("singleton", true)
        .single()
    ).data!;
    const preferences = (
      await db.from("notification_preferences").select("*").eq("profile_id", id)
    ).data!;
    if (!prior || !preferences)
      throw new Error("Configurações fictícias indisponíveis.");
    const changed = await db
      .from("settings")
      .update({
        contact_email: fictionalServiceSettings.contactEmail,
        contact_phone: fictionalServiceSettings.contactPhone,
      })
      .eq("singleton", true);
    if (changed.error) throw new Error("Contatos fictícios não configurados.");
    const keys = new Set<string>();
    return {
      db,
      id,
      keys,
      remember: (key: string) => {
        uuid(key);
        keys.add(key);
        return key;
      },
      cleanup: async () => {
        try {
          setFixtureCalculatorRole(id, "calculator");
          setFixtureNotificationRecipient(binding.profile_id);
          const recipientAudits = await db
            .from("audit_log")
            .select("id")
            .eq("actor_id", id)
            .eq("action", "notification_recipient_confirmed");
          if (recipientAudits.error)
            throw new Error("Auditorias do vínculo fictício indisponíveis.");
          const added = recipientAudits.data
            .filter((row) => !priorRecipientAudits.has(row.id))
            .map((row) => row.id);
          if (
            added.length &&
            (await db.from("audit_log").delete().in("id", added)).error
          )
            throw new Error("Auditorias do vínculo fictício não restauradas.");
          if (keys.size) {
            const audit = await db
              .from("audit_log")
              .delete()
              .in("target_id", [...keys]);
            if (audit.error)
              throw new Error("Auditorias fictícias não restauradas.");
            localNotificationSql(
              `delete from private.notification_preference_changes where id=any(array[${[...keys].map(uuid).join(",")}]);`,
            );
          }
          const removed = await db
            .from("notification_preferences")
            .delete()
            .eq("profile_id", id);
          if (removed.error)
            throw new Error("Preferências fictícias não restauradas.");
          if (
            preferences.length &&
            (await db.from("notification_preferences").insert(preferences))
              .error
          )
            throw new Error("Preferências anteriores não restauradas.");
          if (
            (await db.from("settings").update(prior).eq("singleton", true))
              .error
          )
            throw new Error("Contatos anteriores não restaurados.");
        } finally {
          await release();
        }
      },
    };
  } catch (error) {
    await release();
    throw error;
  }
}
