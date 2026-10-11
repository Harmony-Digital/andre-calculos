"use client";
import { useActionState, useId, useState, useSyncExternalStore } from "react";
import {
  saveNotificationPreference,
  type PreferenceState,
} from "@/modules/notifications/actions";
import {
  notificationEvents,
  notificationChannels,
  type NotificationPreference,
} from "@/modules/notifications/preferences";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function NotificationPreferenceForm({
  preference,
  requestId,
  canEdit,
}: {
  preference: NotificationPreference;
  requestId: string;
  canEdit: boolean;
}) {
  const id = useId(),
    ready = useSyncExternalStore(subscribeReady, clientReady, serverReady),
    [selected, setSelected] = useState(preference.enabled ? "yes" : "no"),
    [initialKey] = useState(requestId),
    [initialRevision] = useState(preference.revision);
  const [state, action, pending] = useActionState<PreferenceState, FormData>(
    async (previous, form) => {
      try {
        return await saveNotificationPreference(previous, form);
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível salvar. Sua escolha foi preservada; tente novamente.",
        };
      }
    },
    {},
  );
  const label = `${notificationChannels[preference.channel]} para ${notificationEvents[preference.event]}`;
  return (
    <form
      action={action}
      aria-label={label}
      className="notification-preference"
      noValidate
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="event" value={preference.event} />
      <input type="hidden" name="channel" value={preference.channel} />
      <input
        type="hidden"
        name="revision"
        value={state.revision ?? initialRevision}
      />
      <input
        type="hidden"
        name="requestId"
        value={state.nextRequestId ?? initialKey}
      />
      <fieldset disabled={!ready || pending || !canEdit}>
        <legend className="sr-only">{label}</legend>
        <label htmlFor={id}>{notificationChannels[preference.channel]}</label>
        <select
          id={id}
          name="enabled"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-invalid={!!state.errors?.enabled}
          aria-describedby={state.errors?.enabled ? `${id}-error` : undefined}
        >
          <option value="yes">Ligado</option>
          <option value="no">Desligado</option>
        </select>
        <button type="submit" className="button button-secondary">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {state.errors?.enabled && (
          <p id={`${id}-error`} className="field-error">
            {state.errors.enabled.join(" ")}
          </p>
        )}
      </fieldset>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
