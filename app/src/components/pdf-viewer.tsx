"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
const Preview = dynamic(() => import("./pdf-preview"), {
  ssr: false,
  loading: () => <p role="status">Preparando visualização…</p>,
});
export function PdfViewer({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pdf-viewer">
      <button
        className="text-link"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Fechar PDF" : "Visualizar PDF"}
      </button>
      {open && <Preview id={id} name={name} close={() => setOpen(false)} />}
    </div>
  );
}
