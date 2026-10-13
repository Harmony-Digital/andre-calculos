import type { Page, Request, TestInfo } from "@playwright/test";
import type { notificationFixture } from "./notification-helper";
import { localNotificationSql } from "./notification-helper";

type Channel = "E-mail" | "WhatsApp";
type Attempt = {
  page: Page;
  event: "new_message" | "payment_updated";
  channel: Channel;
  key: string;
  startedAt: number;
  postStarted: boolean;
  responseStatus: number | null;
  responseFinished: boolean;
  requestFailed: boolean;
};

export function preferenceDiagnostic() {
  let stage = "fixture",
    current: Attempt | undefined;
  const requests = new Map<Request, Attempt>();
  const observed = new Set<Page>();
  const observe = (page: Page) => {
    if (observed.has(page)) return;
    observed.add(page);
    page.on("request", (request) => {
      // Comparar em memória; nunca conservar payload, headers ou cookies.
      if (
        current?.page !== page ||
        request.method() !== "POST" ||
        new URL(request.url()).pathname !== "/painel/configuracoes" ||
        !request.postData()?.includes(current.key)
      )
        return;
      current.postStarted = true;
      requests.set(request, current);
    });
    page.on("response", (response) => {
      const attempt = requests.get(response.request());
      if (attempt) attempt.responseStatus = response.status();
    });
    page.on("requestfinished", (request) => {
      const attempt = requests.get(request);
      if (attempt) attempt.responseFinished = true;
      requests.delete(request);
    });
    page.on("requestfailed", (request) => {
      const attempt = requests.get(request);
      if (attempt) attempt.requestFailed = true;
      requests.delete(request);
    });
  };
  return {
    stage: (name: string) => {
      stage = name;
    },
    begin: (
      page: Page,
      event: Attempt["event"],
      channel: Channel,
      key: string,
    ) => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          key,
        )
      )
        throw new Error("Tentativa fictícia inválida.");
      observe(page);
      current = {
        page,
        event,
        channel,
        key,
        startedAt: Date.now(),
        postStarted: false,
        responseStatus: null,
        responseFinished: false,
        requestFailed: false,
      };
    },
    capture: async (
      fixture: Awaited<ReturnType<typeof notificationFixture>>,
      info: TestInfo,
    ) => {
      const attempt = current;
      const report: Record<string, unknown> = {
        diagnostic: "notification_preference_return",
        stage,
        viewport: info.project.use.viewport,
        ...(attempt
          ? {
              event: attempt.event,
              channel: attempt.channel,
              elapsedMs: Date.now() - attempt.startedAt,
              pageClosed: attempt.page.isClosed(),
              postStarted: attempt.postStarted,
              responseStatus: attempt.responseStatus,
              responseFinished: attempt.responseFinished,
              requestFailed: attempt.requestFailed,
            }
          : {}),
      };
      if (attempt) {
        try {
          // Somente estado/revisão e existência do recibo, sem IDs/contatos.
          report.database = JSON.parse(
            localNotificationSql(
              `select json_build_object('receiptExists',exists(select 1 from private.notification_preference_changes where id='${attempt.key}'::uuid and profile_id='${fixture.id}'::uuid),'preference',(select json_build_object('enabled',enabled,'revision',revision) from public.notification_preferences where profile_id='${fixture.id}'::uuid and event='${attempt.event}' and channel='${attempt.channel === "E-mail" ? "email" : "whatsapp"}'));`,
              1000,
            ),
          );
        } catch {
          report.databaseUnavailable = true;
        }
        if (!attempt.page.isClosed()) {
          const form = attempt.page.getByRole("form", {
            name: `${attempt.channel} para ${attempt.event === "new_message" ? "Nova mensagem" : "Situação financeira atualizada"}`,
            exact: true,
          });
          try {
            report.form = await form.evaluate(
              (node, key) => ({
                pending: node.querySelector("fieldset")?.disabled,
                revision: node.querySelector<HTMLInputElement>(
                  'input[name="revision"]',
                )?.value,
                selected: node.querySelector("select")?.value,
                requestIdChanged:
                  node.querySelector<HTMLInputElement>(
                    'input[name="requestId"]',
                  )?.value !== key,
                statusEmpty: !node
                  .querySelector('[role="status"]')
                  ?.textContent?.trim(),
                successMessage:
                  node.querySelector('[role="status"]')?.textContent?.trim() ===
                  "Preferência salva.",
              }),
              attempt.key,
              { timeout: 1000 },
            );
          } catch {
            report.formUnavailable = true;
          }
          try {
            await form.screenshot({
              path: info.outputPath("preferencia-retorno-falha.png"),
              timeout: 1000,
            });
          } catch {
            report.screenshotUnavailable = true;
          }
        }
      }
      console.info(JSON.stringify(report));
      return report;
    },
  };
}
