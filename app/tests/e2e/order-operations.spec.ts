import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createQuoteDraft, quoteSession } from "./quote-helper";
import { localSystem } from "./local-helper";
import { localNotificationSql } from "./notification-helper";
import { loginAs } from "./auth-helper";
test.setTimeout(90000);
async function fixture() {
  const sample = await createQuoteDraft(),
    db = localSystem();
  expect(
    (
      await db
        .from("orders")
        .update({ status: "queued" })
        .eq("id", sample.order_id)
    ).error,
  ).toBeNull();
  const read = async () => {
    const r = await db
      .from("orders")
      .select("status,status_revision")
      .eq("id", sample.order_id)
      .single();
    expect(r.error).toBeNull();
    return r.data!;
  };
  const apply = async (event: string) => {
    const s = await read(),
      session = await quoteSession("calculator");
    try {
      const r = await session.rpc("operate_order", {
        target_process: sample.process_id,
        target_order: sample.order_id,
        request_id: randomUUID(),
        payload: {
          event,
          expectedState: s.status,
          expectedRevision: s.status_revision,
          reason: "",
        },
      });
      expect(r.error).toBeNull();
    } finally {
      await session.auth.signOut({ scope: "local" });
    }
  };
  return {
    ...sample,
    db,
    read,
    apply,
    cleanup: async () => {
      localNotificationSql(`begin;
delete from public.audit_log where target_id in(select id from private.order_operation_receipts where order_id='${sample.order_id}'::uuid) or target_id='${sample.order_id}'::uuid;
delete from public.timeline_events where process_id='${sample.process_id}'::uuid;
delete from public.deadlines where order_id='${sample.order_id}'::uuid;
delete from public.checklists where order_id='${sample.order_id}'::uuid;
delete from public.orders where id='${sample.order_id}'::uuid;
delete from public.processes where id='${sample.process_id}'::uuid;
commit;`);
    },
  };
}
test("resposta perdida preserva comando e replay não desfaz avanço posterior", async ({
  page,
}, info) => {
  const f = await fixture();
  try {
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${f.process_id}?aba=resumo`);
    const form = page.getByRole("form", { name: /Etapas do pedido/ }),
      reason = "Conferência inteiramente fictícia do processo.";
    await form.getByLabel("Motivo ou informação para o cliente").fill(reason);
    const key = await form.locator('[name="requestId"]').inputValue();
    let dropped = false;
    await page.route("**/painel/processos/**", async (route) => {
      if (
        !dropped &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        dropped = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await form
      .getByRole("button", { name: "Registrar etapa", exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText(
      "tentativa foi preservada",
    );
    expect(dropped).toBe(true);
    await expect(
      form.getByLabel("Motivo ou informação para o cliente"),
    ).toHaveValue(reason);
    await expect(
      form.getByLabel("Motivo ou informação para o cliente"),
    ).toHaveAttribute("readonly", "");
    expect((await f.read()).status).toBe("in_analysis");
    await f.apply("start_calculation");
    const advanced = await f.read();
    await form
      .getByRole("button", { name: "Repetir a mesma tentativa" })
      .click();
    await expect(form.getByRole("status")).toContainText("Etapa registrada");
    expect(await f.read()).toEqual(advanced);
    expect(
      (await f.db.from("timeline_events").select("id").eq("id", key)).data,
    ).toHaveLength(1);
    expect(
      (await f.db.from("audit_log").select("id").eq("target_id", key)).data,
    ).toHaveLength(1);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(info.project.use.viewport!.width);
    await page.screenshot({
      path: info.outputPath("etapa-replay.png"),
      fullPage: true,
    });
  } finally {
    await f.cleanup();
  }
});
test("sessão antiga recebe conflito; conferir recarrega e permite nova etapa", async ({
  page,
}) => {
  const f = await fixture();
  try {
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${f.process_id}?aba=resumo`);
    const form = page.getByRole("form", { name: /Etapas do pedido/ });
    await f.apply("start_analysis");
    await form
      .getByRole("button", { name: "Registrar etapa", exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText(
      "Confira a situação atual",
    );
    await expect(
      form.getByRole("button", { name: "Repetir a mesma tentativa" }),
    ).toBeDisabled();
    await form.getByRole("link", { name: "Conferir situação atual" }).click();
    await expect(form.getByLabel("Próxima etapa")).toBeEnabled();
    await form.getByLabel("Próxima etapa").selectOption("start_calculation");
    await form
      .getByRole("button", { name: "Registrar etapa", exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText("Etapa registrada");
    expect((await f.read()).status).toBe("in_calculation");
  } finally {
    await f.cleanup();
  }
});
