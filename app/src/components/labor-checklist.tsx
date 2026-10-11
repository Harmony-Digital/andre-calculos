"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  useForm,
  type FieldErrors,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "./ui/button";
import {
  checklistLaborV1,
  checklistSteps,
  calculationLabels,
  wageLabels,
  type ChecklistLaborV1,
} from "@/modules/checklist/v1";
import { classifyComplexity } from "@/modules/orders/complexity";

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

const emptyChecklist: ChecklistLaborV1 = {
  schemaVersion: 1,
  processNumber: "",
  tribunal: 10,
  court: "",
  side: "claimant",
  claimants: 1,
  calculationType: "initial",
  hasSentence: false,
  hasAppeal: false,
  hasInterlocutory: false,
  correctionRule: "unspecified",
  correctionDetails: "",
  strategy: "",
  admissionDate: "",
  dismissalDate: "",
  filingDate: "",
  baseDate: "",
  wageItems: [],
  otherWages: "",
  timecardFormat: "none",
  timecardMonths: 0,
  timecardPages: 0,
  documents: [],
  deductInss: false,
  deductIr: false,
  processPages: 0,
  noticeDate: "",
  actType: "other",
  deadlineDays: 8,
  urgency: false,
  instructions: "",
};

function Field({
  label,
  registration,
  errors,
  type = "text",
  children,
  hint,
  min,
  max,
}: {
  label: string;
  registration: UseFormRegisterReturn;
  errors: FieldErrors<ChecklistLaborV1>;
  type?: string;
  children?: React.ReactNode;
  hint?: string;
  min?: number;
  max?: number;
}) {
  const name = registration.name as keyof ChecklistLaborV1;
  const error = errors[name]?.message;
  const properties = {
    ...registration,
    id: name,
    "aria-invalid": Boolean(error),
    "aria-describedby": error
      ? `${name}-error`
      : hint
        ? `${name}-hint`
        : undefined,
  };
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      {children ? (
        <select {...properties}>{children}</select>
      ) : type === "textarea" ? (
        <textarea {...properties} rows={4} maxLength={4000} />
      ) : (
        <input {...properties} type={type} min={min} max={max} />
      )}
      {hint && <small id={`${name}-hint`}>{hint}</small>}
      {error && (
        <p className="field-error" id={`${name}-error`} role="alert">
          {String(error)}
        </p>
      )}
    </div>
  );
}

export function LaborChecklist() {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const [step, setStep] = useState(0),
    [result, setResult] = useState<ChecklistLaborV1 | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<ChecklistLaborV1>({
    resolver: zodResolver(checklistLaborV1),
    defaultValues: emptyChecklist,
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    shouldUnregister: false,
  });
  const current = checklistSteps[step];
  const field = (
    name: keyof ChecklistLaborV1,
    label: string,
    options: {
      type?: string;
      hint?: string;
      min?: number;
      max?: number;
      children?: React.ReactNode;
    } = {},
  ) => (
    <Field
      key={name}
      label={label}
      registration={register(
        name,
        options.type === "number" ? { valueAsNumber: true } : {},
      )}
      errors={errors}
      {...options}
    />
  );
  const checkbox = (
    name: keyof ChecklistLaborV1,
    label: string,
    value?: string,
  ) => (
    <label key={value ?? name} className="check-option">
      <input type="checkbox" {...register(name)} value={value} />
      {label}
    </label>
  );
  const move = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  };
  const next = async () => {
    if (await trigger(current.fields, { shouldFocus: true })) move(step + 1);
  };
  const onInvalid = (invalid: FieldErrors<ChecklistLaborV1>) => {
    const first = checklistSteps.findIndex((s) =>
      s.fields.some((f) => invalid[f]),
    );
    if (first >= 0) move(first);
  };

  if (result) {
    const complexity = classifyComplexity(result);
    return (
      <div className="panel">
        <div className="form-body">
          <span className="eyebrow">Checklist concluído nesta prévia</span>
          <h2 tabIndex={-1} ref={heading}>
            Confira as informações
          </h2>
          <p>
            Estas respostas estão apenas na memória desta tela. Ainda não há
            pedido salvo nem proposta emitida.
          </p>
          <dl className="summary-grid">
            <div>
              <dt>Processo</dt>
              <dd>{result.processNumber}</dd>
            </div>
            <div>
              <dt>Tipo de cálculo</dt>
              <dd>{calculationLabels[result.calculationType]}</dd>
            </div>
            <div>
              <dt>Representação</dt>
              <dd>{result.side === "claimant" ? "Reclamante" : "Reclamada"}</dd>
            </div>
            <div>
              <dt>Reclamantes</dt>
              <dd>{result.claimants}</dd>
            </div>
            <div>
              <dt>Verbas</dt>
              <dd>{result.wageItems.map((w) => wageLabels[w]).join(", ")}</dd>
            </div>
            <div>
              <dt>Complexidade sugerida</dt>
              <dd>
                {
                  { simple: "Simples", medium: "Média", high: "Alta" }[
                    complexity.level
                  ]
                }
              </dd>
            </div>
          </dl>
          <p className="notice">
            O orçamento precisa da tabela real de preços. O André revisará o
            calendário do TRT e as decisões antes de confirmar os prazos.
          </p>
        </div>
        <div className="form-actions">
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              move(0);
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Revisar respostas
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="checklist-layout">
      <aside aria-label="Etapas do checklist">
        <ol
          className="checklist-steps"
          tabIndex={0}
          aria-label="Etapas do pedido"
        >
          {checklistSteps.map((s, i) => (
            <li key={s.title} aria-current={step === i ? "step" : undefined}>
              <span className="step-dot" aria-hidden="true">
                {i < step ? <Check size={13} /> : i + 1}
              </span>
              {s.title}
            </li>
          ))}
        </ol>
      </aside>
      <form
        className="panel"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 8) void next();
          else void handleSubmit(setResult, onInvalid)(event);
        }}
      >
        <div className="form-body">
          <span className="eyebrow">Etapa {step + 1} de 9</span>
          <h2 ref={heading} tabIndex={-1}>
            {current.title}
          </h2>
          <p>
            {
              [
                "Informe os dados do processo e o lado que você representa.",
                "Selecione o serviço de que você precisa.",
                "O cálculo seguirá as decisões registradas no processo.",
                "Informe as datas que delimitam o cálculo.",
                "Marque as verbas que precisam de apuração.",
                "Indique como os registros de jornada estão disponíveis.",
                "Informe os documentos que poderão apoiar a análise.",
                "O prazo será conferido com o calendário do tribunal.",
                "Acrescente orientações úteis à análise do André.",
              ][step]
            }
          </p>
          <div className="form-grid">
            {step === 0 && (
              <>
                {field("processNumber", "Número do processo", {
                  hint: "Formato CNJ: NNNNNNN-DD.AAAA.5.TR.OOOO.",
                })}
                {field("tribunal", "TRT", { type: "number", min: 1, max: 24 })}
                {field("court", "Vara do trabalho")}
                {field("side", "Lado representado", {
                  children: (
                    <>
                      <option value="claimant">Reclamante</option>
                      <option value="respondent">Reclamada</option>
                    </>
                  ),
                })}
                {field("claimants", "Número de reclamantes", {
                  type: "number",
                  min: 1,
                  max: 1000,
                })}
              </>
            )}
            {step === 1 && (
              <div className="form-wide">
                {field("calculationType", "Tipo de cálculo", {
                  children: Object.entries(calculationLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  ),
                })}
              </div>
            )}
            {step === 2 && (
              <>
                <div className="form-wide">
                  {checkbox("hasSentence", "Existe sentença")}
                  {checkbox("hasAppeal", "Há acórdão que alterou a sentença")}
                  {checkbox(
                    "hasInterlocutory",
                    "Há decisão interlocutória relevante",
                  )}
                </div>
                <div className="form-wide">
                  {field(
                    "correctionRule",
                    "Índice e juros fixados na decisão",
                    {
                      children: (
                        <>
                          <option value="unspecified">
                            Não fixou ou não sei informar
                          </option>
                          <option value="adc58">ADC 58 — IPCA-E e Selic</option>
                          <option value="law14905">
                            Lei 14.905/2024 — IPCA e taxa legal
                          </option>
                          <option value="other">
                            Outro índice expressamente fixado
                          </option>
                        </>
                      ),
                    },
                  )}
                  {field("correctionDetails", "Detalhes do índice", {
                    type: "textarea",
                  })}
                  {field("strategy", "Estratégia do advogado", {
                    type: "textarea",
                    hint: "Indique se a estratégia difere da decisão.",
                  })}
                </div>
              </>
            )}
            {step === 3 && (
              <>
                {field("admissionDate", "Data de admissão", { type: "date" })}
                {field("dismissalDate", "Data de demissão", {
                  type: "date",
                  hint: "Deixe em branco se o contrato estiver ativo.",
                })}
                {field("filingDate", "Data de ajuizamento", { type: "date" })}
                {field("baseDate", "Data-base do cálculo", { type: "date" })}
              </>
            )}
            {step === 4 && (
              <div className="form-wide">
                <fieldset className="plain-fieldset">
                  <legend>Verbas a calcular</legend>
                  {Object.entries(wageLabels).map(([value, label]) =>
                    checkbox("wageItems", label, value),
                  )}
                </fieldset>
                {errors.wageItems && (
                  <p className="field-error" role="alert">
                    {errors.wageItems.message}
                  </p>
                )}
                {field("otherWages", "Descreva outras verbas", {
                  type: "textarea",
                })}
              </div>
            )}
            {step === 5 && (
              <>
                <div className="form-wide">
                  {field("timecardFormat", "Registros de jornada", {
                    children: (
                      <>
                        <option value="none">Sem análise de jornada</option>
                        <option value="digital">Cartões digitais</option>
                        <option value="handwritten">Cartões manuscritos</option>
                        <option value="image">Cartões em imagem</option>
                        <option value="judicial">
                          Jornada fixada pelo juiz
                        </option>
                      </>
                    ),
                  })}
                </div>
                {field("timecardMonths", "Meses de cartões para digitar", {
                  type: "number",
                  min: 0,
                  max: 1200,
                })}
                {field("timecardPages", "Páginas de cartões para digitar", {
                  type: "number",
                  min: 0,
                  max: 100000,
                })}
              </>
            )}
            {step === 6 && (
              <>
                <div className="form-wide">
                  <fieldset className="plain-fieldset">
                    <legend>Documentos disponíveis</legend>
                    {[
                      ["financial", "Fichas financeiras"],
                      ["payslips", "Holerites"],
                      ["timecards", "Cartões de ponto"],
                      ["employment", "CTPS"],
                      ["sentence", "Sentença"],
                      ["appeal", "Acórdão"],
                      ["previousCalculation", "Cálculo anterior"],
                    ].map(([value, label]) =>
                      checkbox("documents", label, value),
                    )}
                  </fieldset>
                  {checkbox("deductInss", "Considerar desconto de INSS")}
                  {checkbox("deductIr", "Considerar desconto de IR")}
                </div>
                {field(
                  "processPages",
                  "Quantidade estimada de páginas do processo",
                  { type: "number", min: 0, max: 100000 },
                )}
              </>
            )}
            {step === 7 && (
              <>
                {field("noticeDate", "Data da ciência da intimação", {
                  type: "date",
                })}
                {field("actType", "Tipo de ato", {
                  children: (
                    <>
                      <option value="other">
                        Outro prazo informado pelo advogado
                      </option>
                      <option value="challenge">
                        Impugnação — 8 dias úteis
                      </option>
                      <option value="embargo">Embargos — 5 dias úteis</option>
                      <option value="appeal">
                        Agravo de petição — 8 dias úteis
                      </option>
                    </>
                  ),
                })}
                {field("deadlineDays", "Dias úteis para outro ato", {
                  type: "number",
                  min: 1,
                  max: 365,
                })}
                <div className="form-wide">
                  {checkbox("urgency", "Preciso de atendimento urgente")}
                </div>
              </>
            )}
            {step === 8 && (
              <div className="form-wide">
                {field("instructions", "Instruções ao André", {
                  type: "textarea",
                  hint: "Nesta prévia, use apenas informações fictícias. Anexos serão adicionados após a configuração segura do armazenamento.",
                })}
              </div>
            )}
          </div>
        </div>
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => move(step - 1)}
            disabled={step === 0 || !ready}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Voltar
          </Button>
          <Button type="submit" disabled={!ready}>
            {step === 8 ? "Conferir respostas" : "Continuar"}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}
