"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { attachUpdatePjc } from "@/modules/calculation-updates/actions";
import { Button } from "./ui/button";
export function UpdatePjcPicker({
  orderId,
  files,
}: {
  orderId: string;
  files: { id: string; name: string }[];
}) {
  const router = useRouter(),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const r = await attachUpdatePjc({
            orderId,
            fileId: selected,
          });
          if (r.success) router.refresh();
          else setError(r.error ?? "Não foi possível confirmar.");
        } catch {
          setError("Tente novamente para confirmar o vínculo.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-field">
        <label htmlFor="received-pjc">PJC enviado para esta atualização</label>
        <select
          id="received-pjc"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy}
        >
          <option value="">Selecione o arquivo</option>
          {files.map((f) => (
            <option value={f.id} key={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !selected}>
        {busy ? "Confirmando…" : "Usar este PJC"}
      </Button>
    </form>
  );
}
