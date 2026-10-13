import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { provisionLocalUser } from "../../scripts/provision-local-user";
import {
  localSystem,
  removeLocalUser,
  leaseLocalSettings,
} from "./local-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { logoutAndConfirm } from "./logout-helper";
test.setTimeout(90000);
test("logout atrasado conclui sessão antes de iniciar recuperação", async ({
  page,
  context,
}) => {
  const db = localSystem(),
    release = await leaseLocalSettings();
  const email = `logout-delay-${randomUUID()}@exemplo.com`;
  const name = "logout_sync_" + randomUUID().replaceAll("-", "");
  let userId: string | undefined,
    trigger = false;
  try {
    const created = await provisionLocalUser({
      email,
      password: process.env.ANDRE_TEST_PASSWORD!,
      email_confirm: true,
      user_metadata: { full_name: "Saída fictícia" },
    });
    expect(created.error === null).toBe(true);
    userId = created.data.user!.id;
    sql(
      `create function private.${name}() returns trigger language plpgsql set search_path='' as $$begin if new.action='logout' and new.actor_id='${userId}' then perform pg_catalog.pg_sleep(2);end if;return new;end$$;create trigger ${name} before insert on public.audit_log for each row execute function private.${name}();`,
    );
    trigger = true;
    await page.goto("/entrar");
    await page.locator("#login-email").fill(email);
    await page
      .getByLabel("Senha", { exact: true })
      .fill(process.env.ANDRE_TEST_PASSWORD!);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect(
      (await context.cookies()).filter(
        (c) =>
          c.name.includes("-auth-token") && !c.name.includes("-code-verifier"),
      ).length,
    ).toBeGreaterThan(0);
    await logoutAndConfirm(page, context);
    // Mesma ordenação do Mailpit: navegação pública depois de clicar em Sair.
    await page.goto("/recuperar-senha");
    const sessions = (await context.cookies()).filter(
      (c) =>
        c.name.includes("-auth-token") && !c.name.includes("-code-verifier"),
    ).length;
    expect(sessions).toBe(0);
    await page.goto("/app");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/entrar");
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("actor_id", userId)
          .eq("action", "logout")
      ).data,
    ).toHaveLength(1);
  } finally {
    if (trigger)
      sql(
        `drop trigger if exists ${name} on public.audit_log;drop function if exists private.${name}();`,
      );
    try {
      if (userId) {
        await removeLocalUser(userId);
        expect(
          (await db.from("profiles").select("id").eq("id", userId)).data
            ?.length,
        ).toBe(0);
        expect(
          (
            await db
              .from("audit_log")
              .select("id")
              .or(`actor_id.eq.${userId},target_id.eq.${userId}`)
          ).data?.length,
        ).toBe(0);
        expect(
          sql(
            `select count(*) from private.user_provisioning_grants where user_id='${userId}';`,
          ),
        ).toBe("0");
      }
    } finally {
      await release();
    }
  }
});
