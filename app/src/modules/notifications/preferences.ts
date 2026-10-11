import { z } from "zod";
export const notificationEvents = {
  new_signup: "Novo cadastro",
  quote_created: "Orçamento gerado",
  quote_accepted: "Proposta aceita",
  order_queued: "Pedido na fila",
  new_message: "Nova mensagem",
  deadline_two_days: "Prazo em dois dias úteis",
  deadline_one_day: "Prazo em um dia útil",
  deadline_overdue: "Prazo atrasado",
  account_deletion_requested: "Solicitação de exclusão de conta",
} as const;
export const notificationChannels = {
  email: "E-mail",
  whatsapp: "WhatsApp",
} as const;
export type NotificationEvent = keyof typeof notificationEvents;
export type NotificationChannel = keyof typeof notificationChannels;
export const preferenceFormSchema = z.object({
  event: z.enum(
    Object.keys(notificationEvents) as [
      NotificationEvent,
      ...NotificationEvent[],
    ],
  ),
  channel: z.enum(["email", "whatsapp"]),
  enabled: z.enum(["yes", "no"]).transform((value) => value === "yes"),
  revision: z
    .string()
    .regex(/^\d{1,10}$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(2147483646)),
  requestId: z.uuid(),
});
export function parsePreference(form: FormData) {
  return preferenceFormSchema.safeParse(Object.fromEntries(form));
}
export function defaultPreference(channel: NotificationChannel) {
  return channel === "email";
}
export type NotificationPreference = {
  event: NotificationEvent;
  channel: NotificationChannel;
  enabled: boolean;
  revision: number;
};
export function effectivePreferences(
  rows: {
    event: string;
    channel: string;
    enabled: boolean;
    revision: number;
  }[],
): NotificationPreference[] {
  return (Object.keys(notificationEvents) as NotificationEvent[]).flatMap(
    (event) =>
      (Object.keys(notificationChannels) as NotificationChannel[]).map(
        (channel) => {
          const row = rows.find(
            (r) => r.event === event && r.channel === channel,
          );
          return {
            event,
            channel,
            enabled: row?.enabled ?? defaultPreference(channel),
            revision: row?.revision ?? 0,
          };
        },
      ),
  );
}
