"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  FileText,
  Check,
  CheckCheck,
  Clock3,
  ChevronRight,
  RotateCcw,
  MessageSquare,
  Download,
  ShieldCheck,
  Scale,
  Bell,
  CircleHelp,
  X,
  Send,
  Paperclip,
  Circle,
} from "lucide-react";
import {
  checklistSteps,
  calculationTypes,
  calculationLabels,
  wageLabels,
  checklistLaborV1,
  type ChecklistLaborV1,
} from "@/modules/checklist/v1";
import {
  createDemoOrder,
  dateLabel,
  demoIdentity,
  demoPriceTable,
  demoStages,
  initialDemoState,
  money,
  newDemoAnswers,
  restoreDemoState,
  stageLabels,
  transitionDemo,
  type DemoAction,
  type DemoOrder,
  type DemoState,
} from "./model";

type View = "welcome" | "dashboard" | "checklist" | "order" | "calendar";
const storageKey = "marco-demonstracao-v1";
const tabs = ["Linha do tempo", "Proposta", "Documentos", "Mensagens"] as const;
type Tab = (typeof tabs)[number];
function Mark() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M9 33V11l13 15 13-15v22M9 33h6m14 0h6M22 26v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}
function Brand() {
  return (
    <span className="demo-brand">
      <span className="demo-mark">
        <Mark />
      </span>
      <span>
        <strong>
          marco<span>.</span>
        </strong>
        <small>CÁLCULOS JUDICIAIS</small>
      </span>
    </span>
  );
}
function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="demo-icon-button"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Badge({ stage }: { stage: DemoOrder["stage"] }) {
  return (
    <span className={`demo-badge demo-badge-${stage}`}>
      {stage === "delivered" ? <CheckCheck size={13} /> : <span />}
      {stageLabels[stage]}
    </span>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="demo-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function DemoPortal() {
  const [state, setState] = useState<DemoState>(initialDemoState);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("welcome");
  const [role, setRole] = useState<"lawyer" | "professional">("lawyer");
  const [selectedId, setSelectedId] = useState("MAR-2026-001");
  const [tab, setTab] = useState<Tab>("Linha do tempo");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ChecklistLaborV1>(newDemoAnswers);
  const [title, setTitle] = useState("Aurora Tecnologia × Reclamante fictício");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [accepted, setAccepted] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // Sincronização inicial com o armazenamento externo; o SSR sempre usa exemplos determinísticos.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && stored.length < 2000000)
        setState(restoreDemoState(JSON.parse(stored)));
      if (sessionStorage.getItem("marco-access")) setView("dashboard");
    } catch {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* Armazenamento bloqueado: continuar em memória. */
      }
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        /* A apresentação também funciona sem armazenamento local. */
      }
    }
  }, [state, hydrated]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view, step]);
  const order =
    state.orders.find((o) => o.id === selectedId) ?? state.orders[0];
  const activeCount = state.orders.filter(
    (o) => demoStages.indexOf(o.stage) >= 2 && o.stage !== "delivered",
  ).length;
  const proposalCount = state.orders.filter((o) => o.stage === "quoted").length;
  const completedCount = state.orders.filter(
    (o) => o.stage === "delivered",
  ).length;
  const update = <K extends keyof ChecklistLaborV1>(
    key: K,
    value: ChecklistLaborV1[K],
  ) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
    setError("");
  };
  const openOrder = (id: string, nextTab: Tab = "Linha do tempo") => {
    setSelectedId(id);
    setTab(nextTab);
    setAccepted(false);
    setNotice("");
    setView("order");
  };
  const enter = () => {
    try {
      sessionStorage.setItem("marco-access", "demo");
    } catch {}
    setView("dashboard");
  };
  const reset = () => {
    setState(initialDemoState());
    setAnswers(newDemoAnswers());
    setStep(0);
    setSelectedId("MAR-2026-001");
    setTab("Linha do tempo");
    setRole("lawyer");
    setFilter("all");
    setNotice("Demonstração reiniciada com os exemplos originais.");
    setResetOpen(false);
    setView("dashboard");
  };
  const act = (action: DemoAction) => {
    try {
      const next = transitionDemo(order, action);
      setState((previous) => ({
        ...previous,
        orders: previous.orders.map((o) => (o.id === order.id ? next : o)),
      }));
      setNotice(
        action === "deposit"
          ? "Sinal simulado. Nenhum pagamento foi realizado."
          : action === "document"
            ? "Documento fictício adicionado. Nenhum arquivo foi enviado."
            : action === "accept"
              ? "Aceite simulado. Agora você pode simular o sinal e anexar o exemplo."
              : "Etapa demonstrativa atualizada na linha do tempo.",
      );
      setAccepted(false);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível avançar.");
    }
  };
  const nextStep = () => {
    const result = checklistLaborV1.safeParse(answers);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        checklistSteps[step].fields.includes(
          i.path[0] as keyof ChecklistLaborV1,
        ),
      );
      if (issue) {
        setError(issue.message);
        return;
      }
    }
    setError("");
    setStep(step + 1);
  };
  const createQuote = () => {
    if (state.orders.length >= 12) {
      setError(
        "Você já criou os nove pedidos extras desta demonstração. Reinicie para criar outros exemplos.",
      );
      return;
    }
    try {
      const id = `MAR-2026-${String(state.orders.length + 1).padStart(3, "0")}`;
      const created = createDemoOrder(answers, id, title);
      setState((previous) => ({
        ...previous,
        orders: [created, ...previous.orders],
      }));
      openOrder(id, "Proposta");
      setNotice(
        "Orçamento gerado. Valores e prazos são fictícios para esta apresentação.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.startsWith("[")
            ? "Revise os campos do checklist antes de gerar o orçamento."
            : e.message
          : "Confira as respostas.",
      );
    }
  };
  const newRequest = () => {
    setAnswers(newDemoAnswers());
    setTitle("Aurora Tecnologia × Reclamante fictício");
    setStep(0);
    setError("");
    setNotice("");
    setRole("lawyer");
    setView("checklist");
  };
  const sendMessage = () => {
    if (!message.trim() || order.messages.length >= 50) return;
    setState((previous) => ({
      ...previous,
      orders: previous.orders.map((o) =>
        o.id === order.id
          ? {
              ...o,
              messages: [...o.messages, { author: role, text: message.trim() }],
            }
          : o,
      ),
    }));
    setMessage("");
    setNotice(
      "Mensagem salva somente nesta demonstração. Nenhum aviso foi enviado.",
    );
  };
  const downloadExample = () => {
    const blob = new Blob(
      [
        `MARCO — EXEMPLO FICTÍCIO\n${order.id}\n${demoIdentity.professional}\n${demoIdentity.crc}\n\nEste arquivo demonstra a área de entregas. Não é um cálculo judicial, parecer ou arquivo PJe-Calc válido.\nNenhuma pessoa, documento ou processo real foi utilizado.`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.id}-exemplo-ficticio.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      "Exemplo fictício baixado. Os arquivos de cálculo reais dependem da revisão do responsável.",
    );
  };
  return (
    <div className="demo-portal">
      <div className="demo-ribbon">
        <span>
          <span className="demo-dot" />
          Demonstração com dados fictícios
        </span>
        <span className="demo-ribbon-note">
          Marca, CRC, preços e calendário provisórios
        </span>
        <button onClick={() => setResetOpen(true)}>
          <RotateCcw size={13} />
          Reiniciar
        </button>
      </div>
      {view === "welcome" ? (
        <>
          <header className="demo-public-header">
            <Brand />
            <nav aria-label="Navegação da apresentação">
              <a href="#demo-como-funciona">Como funciona</a>
              <button
                className="demo-button demo-button-outline"
                onClick={enter}
              >
                Acessar como advogado <ArrowUpRight size={16} />
              </button>
            </nav>
          </header>
          <main id="conteudo" className="demo-welcome">
            <div className="demo-hero">
              <section>
                <span className="demo-eyebrow">
                  Do primeiro pedido à última conferência
                </span>
                <h1>
                  O próximo passo
                  <br />
                  do seu processo.
                  <br />
                  <em>Com clareza.</em>
                </h1>
                <p>
                  Solicite seu cálculo, conheça o investimento e acompanhe cada
                  etapa. Tudo organizado em uma única pasta.
                </p>
                <button className="demo-button" onClick={enter}>
                  Conhecer a área do advogado <ArrowUpRight size={19} />
                </button>
                <span className="demo-hero-caption">
                  Acesso demonstrativo de Marina Duarte. Sem cadastro real.
                </span>
                <div className="demo-hero-proof">
                  <span>
                    <ShieldCheck size={17} />
                    Documentos organizados
                  </span>
                  <span>
                    <Clock3 size={17} />
                    Prazo sempre visível
                  </span>
                </div>
              </section>
              <div className="demo-preview">
                <span className="demo-preview-overline">
                  Uma pasta. Todo o percurso.
                </span>
                <div className="demo-preview-paper">
                  <div className="demo-preview-paper-header">
                    <span className="demo-mark">
                      <Mark />
                    </span>
                    <span>
                      MAR-2026-001
                      <small>Liquidação trabalhista · exemplo</small>
                    </span>
                    <span className="demo-preview-stamp">EM ANÁLISE</span>
                  </div>
                  <h2>
                    Você sabe onde está.
                    <br />
                    <em>E o que vem depois.</em>
                  </h2>
                  <div className="demo-mini-timeline">
                    {[
                      "Solicitação recebida",
                      "Proposta aceita",
                      "Sinal confirmado",
                      "Análise dos documentos",
                      "Revisão e entrega",
                    ].map((label, i) => (
                      <div
                        key={label}
                        className={i < 3 ? "done" : i === 3 ? "current" : ""}
                      >
                        <span>
                          {i < 3 ? (
                            <Check size={12} />
                          ) : i === 3 ? (
                            <span />
                          ) : null}
                        </span>
                        <p>
                          {label}
                          <small>
                            {i === 3
                              ? "Etapa atual · simulação"
                              : i === 4
                                ? "Próximo passo"
                                : "Concluído · exemplo"}
                          </small>
                        </p>
                        {i === 3 && <span className="demo-now">agora</span>}
                      </div>
                    ))}
                  </div>
                  <div className="demo-preview-bottom">
                    <span>
                      Entrega prevista<strong>20 out. 2026</strong>
                    </span>
                    <span>
                      Investimento fictício<strong>R$ 650,00</strong>
                    </span>
                  </div>
                </div>
                <div className="demo-preview-note">
                  <Scale size={23} strokeWidth={1.4} />
                  <span>
                    Critério técnico.
                    <br />
                    <strong>Acompanhamento próximo.</strong>
                  </span>
                </div>
              </div>
            </div>
            <section id="demo-como-funciona" className="demo-how">
              <div>
                <span className="demo-eyebrow">Um caminho simples</span>
                <h2>
                  Seu trabalho segue.
                  <br />O cálculo acompanha.
                </h2>
              </div>
              {[
                {
                  n: "01",
                  title: "Conte sobre o processo",
                  copy: "Um checklist guiado reúne as informações para o orçamento.",
                },
                {
                  n: "02",
                  title: "Veja a proposta",
                  copy: "Serviços discriminados, valores e prazo antes do aceite.",
                },
                {
                  n: "03",
                  title: "Acompanhe a entrega",
                  copy: "Documentos, mensagens e cada avanço na linha do tempo.",
                },
              ].map((item) => (
                <article key={item.n}>
                  <span>{item.n}</span>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </section>
          </main>
        </>
      ) : (
        <div className="demo-shell">
          <aside className="demo-sidebar">
            <button
              className="demo-brand-button"
              onClick={() => setView("dashboard")}
              aria-label="Marco, voltar ao início"
            >
              <Brand />
            </button>
            <span className="demo-sidebar-label">SEU ESCRITÓRIO</span>
            <nav aria-label="Menu principal">
              {[
                {
                  label: "Visão geral",
                  icon: LayoutDashboard,
                  target: "dashboard",
                },
                {
                  label: "Meus processos",
                  icon: FolderOpen,
                  target: "dashboard",
                },
                { label: "Calendário", icon: CalendarDays, target: "calendar" },
              ].map((item) => (
                <button
                  key={item.label}
                  className={
                    view === item.target &&
                    (item.label !== "Meus processos" || filter !== "all")
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    setView(item.target as View);
                    setFilter("all");
                  }}
                >
                  <item.icon size={18} />
                  {item.label}
                  {item.label === "Meus processos" && (
                    <span>{state.orders.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <button className="demo-sidebar-new" onClick={newRequest}>
              <Plus size={17} />
              Solicitar orçamento
            </button>
            <div className="demo-sidebar-help">
              <CircleHelp size={23} strokeWidth={1.3} />
              <strong>Um exemplo para explorar.</strong>
              <p>As ações são simuladas e ficam neste navegador.</p>
              <button
                onClick={() => {
                  setView("welcome");
                  setNotice("");
                }}
              >
                Ver apresentação <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="demo-sidebar-user">
              <span className="demo-avatar">MD</span>
              <span>
                <strong>Marina Duarte</strong>
                <small>Advogada · perfil fictício</small>
              </span>
            </div>
          </aside>
          <div className="demo-workspace">
            <header className="demo-topbar">
              <span className="demo-breadcrumb">
                Escritório demonstrativo <ChevronRight size={12} />
                <strong>
                  {view === "order"
                    ? order.id
                    : view === "checklist"
                      ? "Novo orçamento"
                      : view === "calendar"
                        ? "Calendário"
                        : "Visão geral"}
                </strong>
              </span>
              <div className="demo-topbar-actions">
                <label className="demo-role">
                  <span>Explorar como</span>
                  <select
                    aria-label="Visão demonstrativa"
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                  >
                    <option value="lawyer">Advogado</option>
                    <option value="professional">Calculista</option>
                  </select>
                </label>
                <IconButton
                  label="Ver avisos demonstrativos"
                  onClick={() =>
                    setNotice(
                      "Os avisos são exemplos. Nenhum e-mail ou WhatsApp é enviado nesta apresentação.",
                    )
                  }
                >
                  <Bell size={19} />
                </IconButton>
                <span className="demo-avatar">
                  {role === "lawyer" ? "MD" : "AC"}
                </span>
              </div>
            </header>
            <main id="conteudo" className="demo-main">
              {notice && (
                <div className="demo-notice" role="status">
                  <Check size={16} />
                  <span>{notice}</span>
                  <IconButton
                    label="Fechar aviso"
                    onClick={() => setNotice("")}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
              )}
              {view === "dashboard" && (
                <>
                  <div className="demo-page-heading">
                    <div>
                      <span className="demo-eyebrow">
                        {role === "lawyer"
                          ? "Sua área de trabalho"
                          : "Visão do responsável · simulação"}
                      </span>
                      <h1>
                        {role === "lawyer"
                          ? "Bom dia, Marina."
                          : "Bom dia, André."}
                      </h1>
                      <p>
                        Seus processos em movimento, com cada próximo passo à
                        vista.
                      </p>
                    </div>
                    <button className="demo-button" onClick={newRequest}>
                      <Plus size={17} />
                      Solicitar orçamento
                    </button>
                  </div>
                  <div className="demo-stats">
                    {[
                      {
                        n: activeCount,
                        title: "Em andamento",
                        copy: "Da fila à revisão",
                        icon: FolderOpen,
                        filter: "active",
                      },
                      {
                        n: proposalCount,
                        title: "Propostas disponíveis",
                        copy: "Aguardam seu aceite",
                        icon: FileText,
                        filter: "quoted",
                      },
                      {
                        n: completedCount,
                        title: "Entregas disponíveis",
                        copy: "Prontas para consultar",
                        icon: CheckCheck,
                        filter: "delivered",
                      },
                    ].map((item) => (
                      <button
                        className="demo-stat"
                        key={item.title}
                        onClick={() => setFilter(item.filter)}
                      >
                        <span>
                          <item.icon size={19} strokeWidth={1.4} />
                          {item.title}
                        </span>
                        <strong>{String(item.n).padStart(2, "0")}</strong>
                        <small>
                          {item.copy}
                          <ArrowRight size={15} />
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="demo-dashboard-grid">
                    <section className="demo-panel demo-processes">
                      <div className="demo-panel-title">
                        <div>
                          <h2>Meus processos</h2>
                          <p>Uma pasta para cada solicitação.</p>
                        </div>
                        <span>{state.orders.length} exemplos</span>
                      </div>
                      <div
                        className="demo-filter-row"
                        role="group"
                        aria-label="Filtrar processos"
                      >
                        {[
                          { value: "all", title: "Todos" },
                          { value: "active", title: "Em andamento" },
                          { value: "quoted", title: "Propostas" },
                          { value: "delivered", title: "Entregues" },
                        ].map((f) => (
                          <button
                            key={f.value}
                            className={filter === f.value ? "active" : ""}
                            onClick={() => setFilter(f.value)}
                          >
                            {f.title}
                          </button>
                        ))}
                      </div>
                      <div className="demo-order-list">
                        {state.orders
                          .filter((o) =>
                            filter === "all" || filter === "active"
                              ? filter === "all" ||
                                (demoStages.indexOf(o.stage) >= 2 &&
                                  o.stage !== "delivered")
                              : o.stage === filter,
                          )
                          .map((o) => (
                            <button
                              className="demo-order-row"
                              key={o.id}
                              onClick={() => openOrder(o.id)}
                            >
                              <span className="demo-file-icon">
                                <FolderOpen size={22} strokeWidth={1.3} />
                              </span>
                              <span className="demo-order-name">
                                <small>
                                  {o.id} · TRT-{o.answers.tribunal}
                                </small>
                                <strong>{o.title}</strong>
                                <span>
                                  {calculationLabels[o.answers.calculationType]}
                                </span>
                              </span>
                              <span className="demo-order-meta">
                                <Badge stage={o.stage} />
                                <small>
                                  Entrega {dateLabel(o.quote.deliveryDate)}
                                </small>
                              </span>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        {state.orders.filter((o) =>
                          filter === "all" || filter === "active"
                            ? filter === "all" ||
                              (demoStages.indexOf(o.stage) >= 2 &&
                                o.stage !== "delivered")
                            : o.stage === filter,
                        ).length === 0 && (
                          <p className="demo-empty">
                            Nenhum exemplo neste filtro. Crie uma nova
                            solicitação.
                          </p>
                        )}
                      </div>
                    </section>
                    <aside className="demo-dashboard-aside">
                      <section className="demo-next">
                        <span className="demo-eyebrow">Seu próximo passo</span>
                        <h2>
                          Do pedido
                          <br />à proposta.
                        </h2>
                        <p>
                          Explore um orçamento novo com informações fictícias já
                          preenchidas.
                        </p>
                        <button
                          className="demo-button demo-button-light"
                          onClick={newRequest}
                        >
                          Começar solicitação <ArrowUpRight size={17} />
                        </button>
                        <div className="demo-next-decoration">
                          <Mark />
                        </div>
                      </section>
                      <section className="demo-calendar-note">
                        <CalendarDays size={22} strokeWidth={1.4} />
                        <h3>Agenda demonstrativa</h3>
                        <p>
                          Referência: 13 de outubro de 2026. Prazos em dias
                          úteis e uma suspensão fictícia no dia 23.
                        </p>
                        <button
                          className="demo-text-button"
                          onClick={() => setView("calendar")}
                        >
                          Ver calendário <ArrowRight size={15} />
                        </button>
                      </section>
                    </aside>
                  </div>
                </>
              )}
              {view === "checklist" && (
                <>
                  <button
                    className="demo-back"
                    onClick={() => setView("dashboard")}
                  >
                    <ArrowLeft size={15} />
                    Voltar à visão geral
                  </button>
                  <div className="demo-page-heading">
                    <div>
                      <span className="demo-eyebrow">
                        Uma proposta com todas as informações
                      </span>
                      <h1>Solicitar orçamento.</h1>
                      <p>
                        Os campos começam com exemplos. Explore as opções sem
                        inserir dados reais.
                      </p>
                    </div>
                    <span className="demo-step-count">
                      {String(step + 1).padStart(2, "0")} / 09
                    </span>
                  </div>
                  <div className="demo-checklist-layout">
                    <nav
                      className="demo-step-nav"
                      aria-label="Etapas do checklist"
                    >
                      {checklistSteps.map((s, i) => (
                        <button
                          key={s.title}
                          className={
                            step === i ? "active" : i < step ? "complete" : ""
                          }
                          aria-current={step === i ? "step" : undefined}
                          onClick={() => {
                            setStep(i);
                            setError("");
                          }}
                        >
                          <span>{i < step ? <Check size={12} /> : i + 1}</span>
                          {s.title}
                        </button>
                      ))}
                    </nav>
                    <section className="demo-panel demo-form-panel">
                      <div className="demo-form-title">
                        <span className="demo-eyebrow">
                          Etapa {step + 1} de 9
                        </span>
                        <h2>{checklistSteps[step].title}</h2>
                        <p>
                          {
                            [
                              "Identifique o processo e quem você representa.",
                              "Escolha o serviço que este processo precisa.",
                              "Conte quais decisões orientam o trabalho.",
                              "Defina o período e a referência do cálculo.",
                              "Selecione as verbas que serão analisadas.",
                              "Informe como os registros de jornada estão disponíveis.",
                              "Indique os documentos e descontos aplicáveis.",
                              "O prazo da proposta respeita uma folga de dois dias úteis.",
                              "Revise a solicitação e gere sua proposta demonstrativa.",
                            ][step]
                          }
                        </p>
                      </div>
                      <div className="demo-form-fields">
                        {step === 0 && (
                          <>
                            <Field label="Nome do processo demonstrativo">
                              <input
                                value={title}
                                maxLength={100}
                                onChange={(e) => setTitle(e.target.value)}
                              />
                            </Field>
                            <Field
                              label="Número CNJ fictício"
                              hint="Número de exemplo reservado à apresentação."
                            >
                              <input
                                value={answers.processNumber}
                                onChange={(e) =>
                                  update("processNumber", e.target.value)
                                }
                              />
                            </Field>
                            <div className="demo-field-grid">
                              <Field label="TRT">
                                <input
                                  type="number"
                                  min={1}
                                  max={24}
                                  value={answers.tribunal}
                                  onChange={(e) =>
                                    update("tribunal", Number(e.target.value))
                                  }
                                />
                              </Field>
                              <Field label="Reclamantes">
                                <input
                                  type="number"
                                  min={1}
                                  max={1000}
                                  value={answers.claimants}
                                  onChange={(e) =>
                                    update("claimants", Number(e.target.value))
                                  }
                                />
                              </Field>
                            </div>
                            <Field label="Vara">
                              <input
                                value={answers.court}
                                maxLength={160}
                                onChange={(e) =>
                                  update("court", e.target.value)
                                }
                              />
                            </Field>
                            <Field label="Lado representado">
                              <select
                                value={answers.side}
                                onChange={(e) =>
                                  update(
                                    "side",
                                    e.target.value as ChecklistLaborV1["side"],
                                  )
                                }
                              >
                                <option value="claimant">Reclamante</option>
                                <option value="respondent">Reclamada</option>
                              </select>
                            </Field>
                          </>
                        )}
                        {step === 1 && (
                          <div className="demo-choice-list">
                            {calculationTypes.map((type) => (
                              <label
                                key={type}
                                className={
                                  answers.calculationType === type
                                    ? "selected"
                                    : ""
                                }
                              >
                                <input
                                  type="radio"
                                  name="calculationType"
                                  value={type}
                                  checked={answers.calculationType === type}
                                  onChange={() =>
                                    update("calculationType", type)
                                  }
                                />
                                <span>
                                  <strong>{calculationLabels[type]}</strong>
                                  <small>
                                    {
                                      {
                                        initial:
                                          "Estimativa para instruir o pedido inicial.",
                                        liquidation:
                                          "Apuração das verbas deferidas na decisão.",
                                        challenge:
                                          "Análise dos cálculos apresentados pela outra parte.",
                                        update:
                                          "Atualização de um cálculo já existente.",
                                      }[type]
                                    }
                                  </small>
                                </span>
                                <strong>
                                  {money(demoPriceTable.base[type]!)}
                                </strong>
                              </label>
                            ))}
                          </div>
                        )}
                        {step === 2 && (
                          <>
                            <div className="demo-checkboxes">
                              {(
                                [
                                  {
                                    key: "hasSentence",
                                    label: "Existe sentença",
                                  },
                                  { key: "hasAppeal", label: "Existe acórdão" },
                                  {
                                    key: "hasInterlocutory",
                                    label: "Existe decisão interlocutória",
                                  },
                                ] as const
                              ).map((f) => (
                                <label key={f.key}>
                                  <input
                                    type="checkbox"
                                    checked={answers[f.key]}
                                    onChange={(e) =>
                                      update(f.key, e.target.checked)
                                    }
                                  />
                                  {f.label}
                                </label>
                              ))}
                            </div>
                            <Field label="Regra de correção fixada na decisão">
                              <select
                                value={answers.correctionRule}
                                onChange={(e) =>
                                  update(
                                    "correctionRule",
                                    e.target
                                      .value as ChecklistLaborV1["correctionRule"],
                                  )
                                }
                              >
                                <option value="unspecified">
                                  Não especificada — conferir na análise
                                </option>
                                <option value="adc58">ADC 58</option>
                                <option value="law14905">
                                  Lei 14.905/2024
                                </option>
                                <option value="other">Outra regra</option>
                              </select>
                            </Field>
                            {answers.correctionRule === "other" && (
                              <Field label="Descreva a regra">
                                <textarea
                                  maxLength={4000}
                                  value={answers.correctionDetails}
                                  onChange={(e) =>
                                    update("correctionDetails", e.target.value)
                                  }
                                />
                              </Field>
                            )}
                            <Field label="Observações sobre a estratégia">
                              <textarea
                                maxLength={4000}
                                value={answers.strategy}
                                onChange={(e) =>
                                  update("strategy", e.target.value)
                                }
                                placeholder="Observação fictícia para a análise"
                              />
                            </Field>
                          </>
                        )}
                        {step === 3 && (
                          <div className="demo-field-grid">
                            {(
                              [
                                { key: "admissionDate", label: "Admissão" },
                                { key: "dismissalDate", label: "Demissão" },
                                { key: "filingDate", label: "Ajuizamento" },
                                { key: "baseDate", label: "Data-base" },
                              ] as const
                            ).map((f) => (
                              <Field key={f.key} label={f.label}>
                                <input
                                  type="date"
                                  value={answers[f.key]}
                                  onChange={(e) =>
                                    update(f.key, e.target.value)
                                  }
                                />
                              </Field>
                            ))}
                          </div>
                        )}
                        {step === 4 && (
                          <>
                            <div className="demo-checkboxes demo-wages">
                              {Object.entries(wageLabels).map(
                                ([key, label]) => (
                                  <label key={key}>
                                    <input
                                      type="checkbox"
                                      checked={answers.wageItems.includes(
                                        key as keyof typeof wageLabels,
                                      )}
                                      onChange={(e) =>
                                        update(
                                          "wageItems",
                                          e.target.checked
                                            ? [
                                                ...answers.wageItems,
                                                key as keyof typeof wageLabels,
                                              ]
                                            : answers.wageItems.filter(
                                                (v) => v !== key,
                                              ),
                                        )
                                      }
                                    />
                                    {label}
                                  </label>
                                ),
                              )}
                            </div>
                            {answers.wageItems.includes("other") && (
                              <Field label="Descreva as outras verbas">
                                <textarea
                                  value={answers.otherWages}
                                  maxLength={4000}
                                  onChange={(e) =>
                                    update("otherWages", e.target.value)
                                  }
                                />
                              </Field>
                            )}
                            <div className="demo-inline-note">
                              A primeira verba está incluída no serviço base.
                              Cada verba adicional custa R$ 100,00 nesta tabela
                              fictícia.
                            </div>
                          </>
                        )}
                        {step === 5 && (
                          <>
                            <Field label="Formato dos cartões de ponto">
                              <select
                                value={answers.timecardFormat}
                                onChange={(e) =>
                                  update(
                                    "timecardFormat",
                                    e.target
                                      .value as ChecklistLaborV1["timecardFormat"],
                                  )
                                }
                              >
                                <option value="none">Não há cartões</option>
                                <option value="digital">Digitais</option>
                                <option value="handwritten">Manuscritos</option>
                                <option value="image">Imagens</option>
                                <option value="judicial">
                                  Jornada fixada pelo juiz
                                </option>
                              </select>
                            </Field>
                            {["handwritten", "image"].includes(
                              answers.timecardFormat,
                            ) && (
                              <div className="demo-field-grid">
                                <Field
                                  label="Meses para digitação"
                                  hint="R$ 35,00 por mês na tabela fictícia."
                                >
                                  <input
                                    type="number"
                                    min={1}
                                    max={1200}
                                    value={answers.timecardMonths}
                                    onChange={(e) =>
                                      update(
                                        "timecardMonths",
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </Field>
                                <Field label="Quantidade de páginas">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100000}
                                    value={answers.timecardPages}
                                    onChange={(e) =>
                                      update(
                                        "timecardPages",
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </Field>
                              </div>
                            )}
                          </>
                        )}
                        {step === 6 && (
                          <>
                            <div className="demo-checkboxes demo-wages">
                              {Object.entries({
                                financial: "Fichas financeiras",
                                payslips: "Holerites",
                                timecards: "Cartões de ponto",
                                employment: "CTPS",
                                sentence: "Sentença",
                                appeal: "Acórdão",
                                previousCalculation: "Cálculo anterior",
                              }).map(([key, label]) => (
                                <label key={key}>
                                  <input
                                    type="checkbox"
                                    checked={answers.documents.includes(
                                      key as ChecklistLaborV1["documents"][number],
                                    )}
                                    onChange={(e) =>
                                      update(
                                        "documents",
                                        e.target.checked
                                          ? [
                                              ...answers.documents,
                                              key as ChecklistLaborV1["documents"][number],
                                            ]
                                          : answers.documents.filter(
                                              (v) => v !== key,
                                            ),
                                      )
                                    }
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            <div className="demo-checkboxes">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={answers.deductInss}
                                  onChange={(e) =>
                                    update("deductInss", e.target.checked)
                                  }
                                />
                                Considerar desconto de INSS
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={answers.deductIr}
                                  onChange={(e) =>
                                    update("deductIr", e.target.checked)
                                  }
                                />
                                Considerar desconto de IR
                              </label>
                            </div>
                            <Field label="Páginas do processo">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                value={answers.processPages}
                                onChange={(e) =>
                                  update("processPages", Number(e.target.value))
                                }
                              />
                            </Field>
                            <div className="demo-inline-note">
                              Nesta apresentação, os documentos são simulados.
                              Nenhum arquivo real será enviado.
                            </div>
                          </>
                        )}
                        {step === 7 && (
                          <>
                            <Field label="Data de intimação fictícia">
                              <input
                                type="date"
                                value={answers.noticeDate}
                                onChange={(e) =>
                                  update("noticeDate", e.target.value)
                                }
                              />
                            </Field>
                            <Field label="Tipo de ato">
                              <select
                                value={answers.actType}
                                onChange={(e) =>
                                  update(
                                    "actType",
                                    e.target
                                      .value as ChecklistLaborV1["actType"],
                                  )
                                }
                              >
                                <option value="other">
                                  Outro — informar prazo fictício
                                </option>
                                <option value="challenge">
                                  Impugnação — 8 dias úteis
                                </option>
                                <option value="embargo">
                                  Embargos — 5 dias úteis
                                </option>
                                <option value="appeal">
                                  Recurso — 8 dias úteis
                                </option>
                              </select>
                            </Field>
                            {answers.actType === "other" && (
                              <Field label="Prazo em dias úteis">
                                <input
                                  type="number"
                                  min={3}
                                  max={365}
                                  value={answers.deadlineDays}
                                  onChange={(e) =>
                                    update(
                                      "deadlineDays",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </Field>
                            )}
                            <div className="demo-checkboxes">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={answers.urgency}
                                  onChange={(e) =>
                                    update("urgency", e.target.checked)
                                  }
                                />
                                Solicitação urgente — adicional fictício de 30%
                              </label>
                            </div>
                            <div className="demo-inline-note">
                              Calendário fictício, com referência em 13/10/2026
                              e suspensão no dia 23. Não utilizar para controlar
                              prazos reais.
                            </div>
                          </>
                        )}
                        {step === 8 && (
                          <>
                            <Field label="Instruções para o responsável">
                              <textarea
                                rows={4}
                                maxLength={4000}
                                value={answers.instructions}
                                onChange={(e) =>
                                  update("instructions", e.target.value)
                                }
                              />
                            </Field>
                            <div className="demo-review-box">
                              <FileText size={25} strokeWidth={1.3} />
                              <div>
                                <strong>{title}</strong>
                                <p>
                                  {calculationLabels[answers.calculationType]} ·{" "}
                                  {answers.wageItems.length} verbas ·{" "}
                                  {answers.processPages} páginas
                                </p>
                                <small>
                                  Ao gerar, você verá a proposta discriminada e
                                  a linha do tempo.
                                </small>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      {error && (
                        <p className="demo-form-error" role="alert">
                          {error}
                        </p>
                      )}
                      <div className="demo-form-footer">
                        <button
                          className="demo-button demo-button-outline"
                          onClick={() =>
                            step === 0
                              ? setView("dashboard")
                              : setStep(step - 1)
                          }
                        >
                          <ArrowLeft size={15} />
                          {step === 0 ? "Cancelar" : "Anterior"}
                        </button>
                        {step < 8 ? (
                          <button className="demo-button" onClick={nextStep}>
                            Continuar <ArrowRight size={16} />
                          </button>
                        ) : (
                          <button className="demo-button" onClick={createQuote}>
                            Gerar orçamento fictício <ArrowUpRight size={16} />
                          </button>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}
              {view === "order" && (
                <>
                  <button
                    className="demo-back"
                    onClick={() => setView("dashboard")}
                  >
                    <ArrowLeft size={15} />
                    Todos os processos
                  </button>
                  <div className="demo-page-heading demo-order-heading">
                    <div>
                      <span className="demo-eyebrow">
                        {order.id} ·{" "}
                        {calculationLabels[order.answers.calculationType]}
                      </span>
                      <h1>{order.title}</h1>
                      <p>
                        {order.answers.processNumber} · TRT-
                        {order.answers.tribunal} · Exemplo fictício
                      </p>
                    </div>
                    <Badge stage={order.stage} />
                  </div>
                  <div className="demo-order-summary">
                    <span>
                      <small>Investimento fictício</small>
                      <strong>{money(order.quote.totalCents)}</strong>
                    </span>
                    <span>
                      <small>Entrega prevista</small>
                      <strong>{dateLabel(order.quote.deliveryDate)}</strong>
                    </span>
                    <span>
                      <small>Responsável fictício</small>
                      <strong>André Costa</strong>
                    </span>
                    <span>
                      <small>Último avanço</small>
                      <strong>{stageLabels[order.stage]}</strong>
                    </span>
                  </div>
                  <div
                    className="demo-tabs"
                    role="tablist"
                    aria-label="Pasta do processo"
                  >
                    {tabs.map((t) => (
                      <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        tabIndex={tab === t ? 0 : -1}
                        aria-controls={`demo-tab-${tabs.indexOf(t)}`}
                        id={`demo-tab-button-${tabs.indexOf(t)}`}
                        className={tab === t ? "active" : ""}
                        onClick={() => setTab(t)}
                        onKeyDown={(e) => {
                          if (
                            ![
                              "ArrowRight",
                              "ArrowLeft",
                              "Home",
                              "End",
                            ].includes(e.key)
                          )
                            return;
                          e.preventDefault();
                          const current = tabs.indexOf(t);
                          const index =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? tabs.length - 1
                                : (current +
                                    (e.key === "ArrowRight" ? 1 : -1) +
                                    tabs.length) %
                                  tabs.length;
                          setTab(tabs[index]);
                          e.currentTarget.parentElement
                            ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
                            [index]?.focus();
                        }}
                      >
                        {t === "Linha do tempo" ? (
                          <Clock3 size={16} />
                        ) : t === "Proposta" ? (
                          <FileText size={16} />
                        ) : t === "Documentos" ? (
                          <FolderOpen size={16} />
                        ) : (
                          <MessageSquare size={16} />
                        )}
                        {t}
                        {t === "Mensagens" && (
                          <span>{order.messages.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div
                    role="tabpanel"
                    id={`demo-tab-${tabs.indexOf(tab)}`}
                    aria-labelledby={`demo-tab-button-${tabs.indexOf(tab)}`}
                  >
                    {tab === "Linha do tempo" && (
                      <div className="demo-detail-grid">
                        <section className="demo-panel demo-timeline-panel">
                          <div className="demo-panel-title">
                            <div>
                              <h2>O percurso deste processo</h2>
                              <p>Cada avanço, registrado em ordem.</p>
                            </div>
                            <span className="demo-small-tag">
                              Histórico simulado
                            </span>
                          </div>
                          <ol className="demo-timeline">
                            {order.events.map((e, i) => (
                              <li
                                key={`${e.label}-${i}`}
                                className={
                                  i === order.events.length - 1
                                    ? "current"
                                    : "done"
                                }
                              >
                                <span className="demo-timeline-dot">
                                  {i === order.events.length - 1 ? (
                                    <Circle size={10} fill="currentColor" />
                                  ) : (
                                    <Check size={13} />
                                  )}
                                </span>
                                <div>
                                  <time dateTime={e.at}>
                                    {new Intl.DateTimeFormat("pt-BR", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      timeZone: "America/Sao_Paulo",
                                    }).format(new Date(e.at))}{" "}
                                    · exemplo
                                  </time>
                                  <h3>{e.label}</h3>
                                  <p>{e.detail}</p>
                                </div>
                              </li>
                            ))}
                            {order.stage === "quoted" && (
                              <li className="future">
                                <span className="demo-timeline-dot" />
                                <div>
                                  <span className="demo-future-label">
                                    Próxima etapa
                                  </span>
                                  <h3>Aceitar a proposta fictícia</h3>
                                  <p>
                                    Após conferir os serviços, valores e prazo.
                                  </p>
                                </div>
                              </li>
                            )}
                            {["quoted", "awaiting_payment"].includes(
                              order.stage,
                            ) && (
                              <li className="future">
                                <span className="demo-timeline-dot" />
                                <div>
                                  <span className="demo-future-label">
                                    Próxima etapa
                                  </span>
                                  <h3>Sinal e documentos</h3>
                                  <p>
                                    Simular o sinal de 50% e anexar o documento
                                    fictício para entrar na fila.
                                  </p>
                                </div>
                              </li>
                            )}
                            {demoStages
                              .slice(
                                Math.max(
                                  2,
                                  demoStages.indexOf(order.stage) + 1,
                                ),
                              )
                              .map((s) => (
                                <li className="future" key={s}>
                                  <span className="demo-timeline-dot" />
                                  <div>
                                    <span className="demo-future-label">
                                      Próxima etapa
                                    </span>
                                    <h3>{stageLabels[s]}</h3>
                                    <p>
                                      {s === "delivered"
                                        ? `Previsão fictícia: ${dateLabel(order.quote.deliveryDate)}. Sem evento de entrega ainda.`
                                        : "Será registrada quando esta etapa acontecer na simulação."}
                                    </p>
                                  </div>
                                </li>
                              ))}
                          </ol>
                        </section>
                        <ActionPanel
                          order={order}
                          role={role}
                          accepted={accepted}
                          setAccepted={setAccepted}
                          act={act}
                          setTab={setTab}
                        />
                      </div>
                    )}
                    {tab === "Proposta" && (
                      <div className="demo-detail-grid">
                        <section className="demo-panel demo-proposal">
                          <div className="demo-proposal-header">
                            <Brand />
                            <span>
                              PROPOSTA DE SERVIÇOS
                              <small>{order.id} · versão demo-2026-v1</small>
                            </span>
                          </div>
                          <div className="demo-proposal-intro">
                            <span className="demo-eyebrow">
                              Preparada para Marina Duarte · fictício
                            </span>
                            <h2>
                              {calculationLabels[order.answers.calculationType]}
                            </h2>
                            <p>{order.title}</p>
                          </div>
                          <div className="demo-proposal-items">
                            <div className="demo-items-label">
                              <span>Serviço</span>
                              <span>Valor</span>
                            </div>
                            {order.quote.items.map((item) => (
                              <div key={item.code}>
                                <span>
                                  <strong>{item.description}</strong>
                                  <small>
                                    {item.quantity} × {money(item.unitCents)}
                                  </small>
                                </span>
                                <strong>{money(item.amountCents)}</strong>
                              </div>
                            ))}
                            <div className="demo-proposal-total">
                              <span>Investimento total</span>
                              <strong>{money(order.quote.totalCents)}</strong>
                            </div>
                          </div>
                          <div className="demo-proposal-terms">
                            <div>
                              <small>50% no aceite</small>
                              <strong>{money(order.quote.depositCents)}</strong>
                            </div>
                            <div>
                              <small>50% na entrega</small>
                              <strong>{money(order.quote.balanceCents)}</strong>
                            </div>
                            <div>
                              <small>Entrega prevista</small>
                              <strong>
                                {dateLabel(order.quote.deliveryDate)}
                              </strong>
                            </div>
                          </div>
                          <div className="demo-proposal-scope">
                            <h3>O que está incluído</h3>
                            <p>
                              Cálculo discriminado em PDF, arquivo do PJe-Calc e
                              parecer técnico revisado pelo responsável. Os
                              itens apresentados aqui são exemplos, sem cálculo
                              ou assinatura reais.
                            </p>
                            <h3>Prazo e condições demonstrativos</h3>
                            <p>
                              {order.quote.businessDays} dias úteis de trabalho.
                              Início após aceite, sinal e documento mínimo.
                              Validade fictícia: até 20/10/2026. O calendário e
                              os valores ainda dependem de definição final.
                            </p>
                          </div>
                          <div className="demo-proposal-signature">
                            <span>
                              {demoIdentity.professional}
                              <small>{demoIdentity.crc}</small>
                            </span>
                            <span className="demo-small-tag">
                              Sem validade comercial
                            </span>
                          </div>
                          <button
                            className="demo-text-button demo-print"
                            onClick={() => window.print()}
                          >
                            <Download size={16} />
                            Imprimir / salvar proposta em PDF
                          </button>
                        </section>
                        <ActionPanel
                          order={order}
                          role={role}
                          accepted={accepted}
                          setAccepted={setAccepted}
                          act={act}
                          setTab={setTab}
                        />
                      </div>
                    )}
                    {tab === "Documentos" && (
                      <section className="demo-panel demo-documents">
                        <div className="demo-panel-title">
                          <div>
                            <h2>Documentos do processo</h2>
                            <p>
                              Pastas demonstrativas. Nenhum processo real foi
                              enviado.
                            </p>
                          </div>
                          <button
                            className="demo-button demo-button-outline"
                            disabled={order.document}
                            onClick={() => act("document")}
                          >
                            <Paperclip size={16} />
                            {order.document
                              ? "Exemplo anexado"
                              : "Anexar exemplo fictício"}
                          </button>
                        </div>
                        <div className="demo-document-folders">
                          {[
                            "Processo e decisões",
                            "Documentos complementares",
                            "Cálculos e versões",
                            "Entrega final",
                          ].map((f, i) => (
                            <div key={f}>
                              <FolderOpen size={26} strokeWidth={1.3} />
                              <strong>{f}</strong>
                              <small>
                                {i === 0 && order.document
                                  ? "1 documento fictício"
                                  : i === 3 && order.stage === "delivered"
                                    ? "3 entregáveis demonstrativos"
                                    : "Sem documentos"}
                              </small>
                            </div>
                          ))}
                        </div>
                        {order.document && (
                          <div className="demo-document-row">
                            <FileText size={20} />
                            <span>
                              <strong>Sentença demonstrativa</strong>
                              <small>
                                Exemplo ilustrativo · sem documento judicial
                              </small>
                            </span>
                            <span className="demo-small-tag">Fictício</span>
                          </div>
                        )}
                        {order.stage === "delivered" && (
                          <div className="demo-example-delivery">
                            <h3>Como a entrega aparecerá</h3>
                            <p>
                              Cálculo.pdf · Cálculo.pjc · Parecer-assinado.pdf
                            </p>
                            <small>
                              Representação visual. Estes arquivos judiciais não
                              foram produzidos.
                            </small>
                            <button
                              className="demo-button demo-button-outline"
                              onClick={downloadExample}
                            >
                              <Download size={16} />
                              Baixar explicação do exemplo
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                    {tab === "Mensagens" && (
                      <section className="demo-panel demo-messages">
                        <div className="demo-panel-title">
                          <div>
                            <h2>Conversa sobre o processo</h2>
                            <p>
                              Mensagens armazenadas neste navegador, sem envio
                              externo.
                            </p>
                          </div>
                          <MessageSquare size={22} strokeWidth={1.3} />
                        </div>
                        <div className="demo-message-list">
                          {order.messages.map((m, i) => (
                            <div
                              className={`demo-message ${m.author === role ? "own" : ""}`}
                              key={i}
                            >
                              <small>
                                {m.author === "lawyer"
                                  ? "Marina Duarte · advogada fictícia"
                                  : "André Costa · calculista fictício"}
                              </small>
                              <p>{m.text}</p>
                            </div>
                          ))}
                        </div>
                        <form
                          className="demo-message-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage();
                          }}
                        >
                          <label htmlFor="demo-message">
                            Mensagem demonstrativa
                          </label>
                          <textarea
                            id="demo-message"
                            value={message}
                            maxLength={1000}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Escreva uma mensagem fictícia para explorar a conversa..."
                          />
                          <button
                            className="demo-button"
                            disabled={
                              !message.trim() || order.messages.length >= 50
                            }
                            type="submit"
                          >
                            <Send size={16} />
                            Simular envio
                          </button>
                        </form>
                      </section>
                    )}
                  </div>
                </>
              )}
              {view === "calendar" && (
                <>
                  <div className="demo-page-heading">
                    <div>
                      <span className="demo-eyebrow">Planejamento à vista</span>
                      <h1>Calendário demonstrativo.</h1>
                      <p>
                        Outubro de 2026 · agenda fictícia para explorar a
                        funcionalidade.
                      </p>
                    </div>
                    <CalendarDays size={30} strokeWidth={1.2} />
                  </div>
                  <div className="demo-detail-grid">
                    <section className="demo-panel demo-calendar">
                      <div className="demo-panel-title">
                        <h2>Outubro 2026</h2>
                        <span className="demo-small-tag">Exemplo</span>
                      </div>
                      <div className="demo-calendar-grid">
                        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                          (d) => (
                            <span className="demo-weekday" key={d}>
                              {d}
                            </span>
                          ),
                        )}
                        {Array.from({ length: 4 }, (_, i) => (
                          <span key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(
                          (day) => (
                            <div
                              key={day}
                              className={`${day === 13 ? "reference" : ""} ${[12, 23].includes(day) ? "holiday" : ""} ${state.orders.some((o) => o.quote.deliveryDate === `2026-10-${String(day).padStart(2, "0")}`) ? "delivery" : ""}`}
                            >
                              <span>{day}</span>
                              {day === 13 && <small>Referência</small>}
                              {day === 12 && <small>Feriado</small>}
                              {day === 23 && <small>Suspensão fictícia</small>}
                              {state.orders.some(
                                (o) =>
                                  o.quote.deliveryDate ===
                                  `2026-10-${String(day).padStart(2, "0")}`,
                              ) && <small>Entrega prevista</small>}
                            </div>
                          ),
                        )}
                      </div>
                      <p className="demo-calendar-disclaimer">
                        Feriados nacionais e recesso considerados pelo motor de
                        dias úteis, com suspensão demonstrativa em 23/10. Este
                        calendário não representa um TRT validado e não deve
                        controlar prazos reais.
                      </p>
                    </section>
                    <aside className="demo-panel demo-calendar-agenda">
                      <h2>Próximas entregas</h2>
                      {[...state.orders]
                        .sort((a, b) =>
                          a.quote.deliveryDate.localeCompare(
                            b.quote.deliveryDate,
                          ),
                        )
                        .map((o) => (
                          <button key={o.id} onClick={() => openOrder(o.id)}>
                            <span>{dateLabel(o.quote.deliveryDate)}</span>
                            <strong>{o.id}</strong>
                            <small>
                              {calculationLabels[o.answers.calculationType]}
                            </small>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                    </aside>
                  </div>
                </>
              )}
            </main>
          </div>
        </div>
      )}
      <footer className="demo-footer">
        <span>
          <strong>marco.</strong> Marca fictícia para apresentação.
        </span>
        <span>
          {demoIdentity.professional}
          <small>{demoIdentity.crc}</small>
        </span>
      </footer>
      {resetOpen && (
        <ResetDialog close={() => setResetOpen(false)} reset={reset} />
      )}
    </div>
  );
}

function ResetDialog({
  close,
  reset,
}: {
  close: () => void;
  reset: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="demo-reset-modal"
      aria-labelledby="demo-reset-title"
      onCancel={close}
    >
      <RotateCcw size={25} />
      <h2 id="demo-reset-title">Reiniciar a demonstração?</h2>
      <p>
        Os pedidos e mensagens criados neste navegador serão substituídos pelos
        exemplos originais.
      </p>
      <div>
        <button className="demo-button demo-button-outline" onClick={close}>
          Continuar explorando
        </button>
        <button className="demo-button" onClick={reset}>
          Reiniciar exemplos
        </button>
      </div>
    </dialog>
  );
}

function ActionPanel({
  order,
  role,
  accepted,
  setAccepted,
  act,
  setTab,
}: {
  order: DemoOrder;
  role: "lawyer" | "professional";
  accepted: boolean;
  setAccepted: (v: boolean) => void;
  act: (a: DemoAction) => void;
  setTab: (t: Tab) => void;
}) {
  return (
    <aside className="demo-action-panel">
      <section className="demo-panel demo-next-action">
        <span className="demo-eyebrow">Próximo passo</span>
        <h2>
          {order.stage === "quoted"
            ? "Sua proposta está pronta."
            : order.stage === "awaiting_payment"
              ? "Vamos iniciar o trabalho."
              : order.stage === "delivered"
                ? "Tudo na sua pasta."
                : "Seu cálculo está a caminho."}
        </h2>
        <p>
          {order.stage === "quoted"
            ? "Confira os serviços e o prazo. Nesta apresentação, você pode simular o aceite."
            : order.stage === "awaiting_payment"
              ? "O pedido entra na fila após o sinal de 50% e um documento de exemplo."
              : order.stage === "delivered"
                ? "Explore como os arquivos ficam organizados após a revisão do responsável fictício."
                : "Cada etapa será registrada aqui. Explore a visão do calculista para avançar o exemplo."}
        </p>
        {order.stage === "quoted" && (
          <>
            <label className="demo-accept">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              Li a proposta fictícia e quero simular o aceite, sem contrato
              real.
            </label>
            <button
              className="demo-button"
              disabled={!accepted}
              onClick={() => act("accept")}
            >
              Simular aceite <ArrowRight size={16} />
            </button>
          </>
        )}
        {order.stage === "awaiting_payment" && (
          <>
            <div className="demo-deposit">
              <span>Sinal fictício · 50%</span>
              <strong>{money(order.quote.depositCents)}</strong>
            </div>
            <button
              className="demo-button"
              disabled={order.deposit}
              onClick={() => act("deposit")}
            >
              {order.deposit ? (
                <>
                  <Check size={15} />
                  Sinal simulado
                </>
              ) : (
                "Simular sinal de 50%"
              )}
            </button>
            <button
              className="demo-button demo-button-outline"
              disabled={order.document}
              onClick={() => act("document")}
            >
              {order.document ? (
                <>
                  <Check size={15} />
                  Exemplo anexado
                </>
              ) : (
                <>
                  <Paperclip size={15} />
                  Anexar documento fictício
                </>
              )}
            </button>
          </>
        )}
        {order.stage === "delivered" && (
          <button className="demo-button" onClick={() => setTab("Documentos")}>
            Ver entrega demonstrativa <ArrowRight size={16} />
          </button>
        )}
        {demoStages.indexOf(order.stage) >= 2 &&
          order.stage !== "delivered" &&
          role === "professional" && (
            <button className="demo-button" onClick={() => act("advance")}>
              {order.stage === "in_review"
                ? "Simular revisão e entrega"
                : "Simular próxima etapa"}
              <ArrowRight size={15} />
            </button>
          )}
        <small className="demo-action-disclaimer">
          Nenhuma cobrança, contrato, envio ou assinatura real acontece aqui.
        </small>
      </section>
      <section className="demo-panel demo-deadline-card">
        <span>
          <CalendarDays size={18} />
          Prazos deste exemplo
        </span>
        <dl>
          <div>
            <dt>Entrega prevista</dt>
            <dd>{dateLabel(order.quote.deliveryDate)}</dd>
          </div>
          <div>
            <dt>Limite interno</dt>
            <dd>{dateLabel(order.quote.internalDueDate)}</dd>
          </div>
          <div>
            <dt>Vencimento fictício</dt>
            <dd>{dateLabel(order.quote.dueDate)}</dd>
          </div>
        </dl>
        <p>
          Calendário demonstrativo. A entrega fica antes do limite interno, com
          folga de dois dias úteis.
        </p>
      </section>
    </aside>
  );
}
