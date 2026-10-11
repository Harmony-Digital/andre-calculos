"use client";
import { useActionState, useState } from "react";
import { addNote, type NoteState } from "@/modules/timeline/actions";
export function NoteComposer({
  processId,
  requestId,
}: {
  processId: string;
  requestId: string;
}) {
  const [initialRequestId] = useState(requestId),
    [body, setBody] = useState("");
  const [state, action, pending] = useActionState<NoteState, FormData>(
    async (previous, form) => {
      try {
        const result = await addNote(previous, form);
        if (result.success) setBody("");
        return result;
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível registrar. Seu texto foi preservado; tente novamente.",
        };
      }
    },
    {},
  );
  return (
    <form
      className="message-form note-form"
      action={action}
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="processId" value={processId} />
      <input
        type="hidden"
        name="requestId"
        value={state.nextRequestId ?? initialRequestId}
      />
      <label htmlFor="timeline-note">Registrar nota na pasta</label>
      <textarea
        id="timeline-note"
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        readOnly={pending}
        required
        maxLength={2000}
        rows={3}
        aria-invalid={!!state.errors?.body}
        aria-describedby={`timeline-note-help${state.errors?.body ? " timeline-note-error" : ""}`}
      />
      <p id="timeline-note-help" className="field-help">
        Até 2.000 caracteres. O cliente também verá esta nota na pasta do
        processo.
      </p>
      {state.errors?.body && (
        <p id="timeline-note-error" className="field-error">
          {state.errors.body.join(" ")}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Registrando nota…" : "Registrar nota"}
      </button>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
