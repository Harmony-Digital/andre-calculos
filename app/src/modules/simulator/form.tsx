"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import {
  estimatePrice,
  parseSimulator,
  simulatorTypes,
  type PublicPriceTable,
} from "./model";
import "./simulator.css";
import { simulatorStyles as styles } from "./styles";
export function SimulatorForm({ table }: { table: PublicPriceTable }) {
  const [format, setFormat] = useState("none"),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReturnType<typeof estimatePrice> | null>(
    null,
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSimulator(new FormData(event.currentTarget));
    setResult(null);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        if (!next[field]) next[field] = issue.message;
      }
      setErrors(next);
      document.getElementById(`estimate-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    try {
      setResult(estimatePrice(parsed.data, table));
      setErrors({});
    } catch {
      setErrors({
        form: "Não foi possível calcular a estimativa. Use o checklist completo para solicitar seu orçamento.",
      });
    }
  }
  const field = (name: string) => ({
    id: `estimate-${name}`,
    name,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `estimate-error-${name}` : undefined,
  });
  const error = (name: string) =>
    errors[name] ? (
      <span className="field-error" id={`estimate-error-${name}`}>
        {errors[name]}
      </span>
    ) : null;
  const digitized = ["image", "handwritten"].includes(format);
  return (
    <div className={styles.workspace}>
      <form
        className={styles.form}
        onSubmit={submit}
        onChange={() => setResult(null)}
        noValidate
        aria-label="Simular valor do serviço"
      >
        <div className={styles.sectionNumber}>
          <span>01</span>
          <h2>Conte um pouco sobre o trabalho</h2>
        </div>
        <div className={styles.fields}>
          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor="estimate-calculationType">Serviço</label>
            <select {...field("calculationType")} defaultValue="initial">
              {Object.entries(simulatorTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {error("calculationType")}
          </div>
          <div className={styles.field}>
            <label htmlFor="estimate-wageCount">Quantidade de verbas</label>
            <input
              {...field("wageCount")}
              type="number"
              inputMode="numeric"
              min="1"
              max="100"
              step="1"
              defaultValue={table.isExample ? "1" : ""}
            />
            {error("wageCount")}
          </div>
          <div className={styles.field}>
            <label htmlFor="estimate-contractMonths">
              Período contratual (meses)
            </label>
            <input
              {...field("contractMonths")}
              type="number"
              inputMode="numeric"
              min="0"
              max="1200"
              step="1"
              defaultValue={table.isExample ? "36" : ""}
            />
            {error("contractMonths")}
          </div>
          <div className={styles.field}>
            <label htmlFor="estimate-claimants">
              Quantidade de reclamantes
            </label>
            <input
              {...field("claimants")}
              type="number"
              inputMode="numeric"
              min="1"
              max="100"
              step="1"
              defaultValue="1"
            />
            {error("claimants")}
          </div>
          <div className={styles.field}>
            <label htmlFor="estimate-urgency">Há urgência?</label>
            <select {...field("urgency")} defaultValue="no">
              <option value="no">Não</option>
              <option value="yes">Sim</option>
            </select>
            {error("urgency")}
          </div>
          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor="estimate-timecardFormat">Cartões de ponto</label>
            <select
              {...field("timecardFormat")}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="none">Sem cartões de ponto</option>
              <option value="digital">Arquivo digital ou planilha</option>
              <option value="image">Imagens ou documentos digitalizados</option>
              <option value="handwritten">Cartões manuscritos</option>
            </select>
            {error("timecardFormat")}
          </div>
          {digitized ? (
            <div className={`${styles.field} ${styles.full}`}>
              <label htmlFor="estimate-timecardQuantity">
                {table.timecardUnit === "month"
                  ? "Meses de cartões para digitação"
                  : "Páginas de cartões para digitação"}
              </label>
              <input
                {...field("timecardQuantity")}
                type="number"
                inputMode="numeric"
                min="1"
                max="3000"
                step="1"
                defaultValue=""
              />
              {error("timecardQuantity")}
            </div>
          ) : (
            <input type="hidden" name="timecardQuantity" value="0" />
          )}
        </div>
        <p className={styles.help}>
          Informe as quantidades que você conhece. O checklist completo permite
          conferir o período, as verbas e os documentos do trabalho.
        </p>
        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}
        <button className="button" type="submit">
          Calcular estimativa <ArrowUpRight size={18} aria-hidden="true" />
        </button>
      </form>
      <section
        className={styles.result}
        aria-label="Resultado da estimativa"
        aria-live="polite"
      >
        <div className={styles.sectionNumber}>
          <span>02</span>
          <h2>Uma referência para planejar</h2>
        </div>
        {result ? (
          <>
            <p className={styles.totalLabel}>
              {result.isExample
                ? "Estimativa fictícia"
                : "Estimativa do serviço"}
            </p>
            <p className={styles.total}>{formatMoney(result.totalCents)}</p>
            <ul className={styles.items}>
              {result.items.map((item) => (
                <li key={item.code}>
                  <div>
                    <strong>{item.description}</strong>
                    <small>
                      {item.quantity} × {formatMoney(item.unitCents)}
                    </small>
                  </div>
                  <span>{formatMoney(item.amountCents)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.version}>Tabela · {result.tableVersion}</p>
            <p className={styles.help}>
              O valor considera as quantidades informadas e os adicionais
              discriminados acima. A proposta e o prazo serão confirmados após o
              checklist completo e a análise da disponibilidade.
            </p>
            <Link className="button" href="/cadastro">
              Preencher o checklist completo{" "}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </>
        ) : (
          <div className={styles.empty}>
            <p>Serviço, período, verbas e documentos.</p>
            <p>
              Preencha os campos para ver o valor e cada adicional da sua
              estimativa.
            </p>
            <div className={styles.rule} />
            <small>Cadastro gratuito para seguir com a solicitação.</small>
          </div>
        )}
        {table.isExample && (
          <p className={styles.example}>
            Demonstração com preços fictícios. Este resultado não cria proposta,
            contratação ou cobrança.
          </p>
        )}
      </section>
    </div>
  );
}
