"use client";
import { useActionState, useState } from "react";
import { sendMessage, type MessageState } from "@/modules/messages/actions";
export function MessageComposer({
  processId,
  requestId,
  files,
}: {
  processId: string;
  requestId: string;
  files: { id: string; name: string }[];
}) {
  const [initialRequestId] = useState(requestId);
  const [body, setBody] = useState(""),
    [attachments, setAttachments] = useState<string[]>([]);
  const [state, action, pending] = useActionState<MessageState, FormData>(
    async (previous, form) => {
      try {
        const result = await sendMessage(previous, form);
        if (result.success) {
          setBody("");
          setAttachments([]);
        }
        return result;
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível enviar. Seu texto foi preservado; tente novamente.",
        };
      }
    },
    {},
  );
  return (
    <form
      className="message-form"
      action={action}
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="processId" value={processId} />
      <input
        type="hidden"
        name="requestId"
        value={state.nextRequestId ?? initialRequestId}
      />
      <label htmlFor="message-body">Sua mensagem</label>
      <textarea
        id="message-body"
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        readOnly={pending}
        rows={5}
        maxLength={10000}
        required
        aria-invalid={!!state.errors?.body}
        aria-describedby="message-body-help"
      />
      <p id="message-body-help" className="field-help">
        Até 10.000 caracteres. Os documentos ficam privados nesta pasta.
      </p>
      {state.errors?.body && (
        <p className="field-error">{state.errors.body.join(" ")}</p>
      )}
      {!!files.length && (
        <fieldset className="message-attachments">
          <legend>Anexar documentos do cliente</legend>
          {files.map((file) => (
            <label key={file.id}>
              <input
                type="checkbox"
                name="attachments"
                value={file.id}
                checked={attachments.includes(file.id)}
                disabled={
                  pending ||
                  (attachments.length >= 10 && !attachments.includes(file.id))
                }
                onChange={(event) =>
                  setAttachments(
                    event.target.checked
                      ? [...attachments, file.id]
                      : attachments.filter((id) => id !== file.id),
                  )
                }
              />
              <span>{file.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      {state.errors?.attachments && (
        <p className="field-error">{state.errors.attachments.join(" ")}</p>
      )}
      <div className="message-submit">
        <button className="button" disabled={pending} type="submit">
          {pending ? "Enviando mensagem…" : "Enviar mensagem"}
        </button>
        <span>
          {attachments.length ? `${attachments.length} anexo(s)` : "Sem anexos"}
        </span>
      </div>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
