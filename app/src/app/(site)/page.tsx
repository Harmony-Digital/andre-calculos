import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  FileCheck2,
  FolderOpen,
  ShieldCheck,
  Clock3,
  Check,
  ScrollText,
  Layers3,
} from "lucide-react";
export default function Home() {
  return (
    <main id="conteudo">
      <div className="container">
        <section className="hero" aria-labelledby="titulo-principal">
          <div>
            <span className="eyebrow">
              Critério técnico, do pedido à entrega
            </span>
            <h1 id="titulo-principal">
              Seu processo merece
              <br />
              um cálculo <em>bem fundamentado.</em>
            </h1>
            <p className="hero-copy">
              Cálculos trabalhistas com análise cuidadosa, prazo definido e
              decisões documentadas. Você cuida da estratégia. Nós cuidamos dos
              números.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/cadastro">
                Solicitar meu orçamento{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link className="text-link" href="#como-funciona">
                Conhecer o processo <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="hero-note">
              Cadastro gratuito. Contratação por serviço, sem mensalidade.
            </p>
          </div>
          <div
            className="dossier-scene"
            aria-label="Documentos incluídos no serviço"
          >
            <div className="scene-label">
              <span>Sua pasta do processo</span>
              <FolderOpen size={16} aria-hidden="true" />
            </div>
            <div className="paper">
              <div className="paper-heading">
                <div>
                  <h2>Uma entrega completa.</h2>
                  <p>Organizada para o seu próximo passo.</p>
                </div>
                <FileCheck2
                  className="paper-icon"
                  size={27}
                  strokeWidth={1.4}
                  aria-hidden="true"
                />
              </div>
              <div className="paper-row">
                <span>
                  <FileText size={17} aria-hidden="true" />
                  Cálculo discriminado
                </span>
                <span className="paper-filetype">PDF</span>
              </div>
              <div className="paper-row">
                <span>
                  <Layers3 size={17} aria-hidden="true" />
                  Arquivo do PJe-Calc
                </span>
                <span className="paper-filetype">.PJC</span>
              </div>
              <div className="paper-row">
                <span>
                  <ScrollText size={17} aria-hidden="true" />
                  Parecer técnico assinado
                </span>
                <span className="paper-filetype">PDF</span>
              </div>
              <div className="paper-foot">
                <ShieldCheck size={16} aria-hidden="true" />
                Revisão do responsável antes da entrega
              </div>
            </div>
            <div className="process-strip">
              <Check size={21} aria-hidden="true" />
              <div>
                <strong>Cada decisão tem um registro.</strong>
                <small>Origem, fundamento e comunicação na mesma pasta.</small>
              </div>
            </div>
          </div>
        </section>
        <div className="principles">
          <div className="principle">
            <FileCheck2 size={25} strokeWidth={1.4} aria-hidden="true" />
            <div>
              <strong>Revisão técnica</strong>
              <span>Cálculo e parecer conferidos</span>
            </div>
          </div>
          <div className="principle">
            <Clock3 size={25} strokeWidth={1.4} aria-hidden="true" />
            <div>
              <strong>Prazo acompanhado</strong>
              <span>Visibilidade em cada etapa</span>
            </div>
          </div>
          <div className="principle">
            <ShieldCheck size={25} strokeWidth={1.4} aria-hidden="true" />
            <div>
              <strong>Documentos protegidos</strong>
              <span>Acesso restrito ao seu processo</span>
            </div>
          </div>
        </div>
        <section className="section" id="como-funciona">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Como funciona</span>
              <h2>
                Um caminho claro.
                <br />
                Do orçamento à entrega.
              </h2>
            </div>
            <p>
              Informações organizadas desde o início para você acompanhar o
              trabalho sem perder tempo procurando mensagens.
            </p>
          </div>
          <div className="steps">
            {[
              [
                "01",
                "Conte sobre o processo",
                "Preencha o checklist com o tipo de cálculo, os documentos e o prazo.",
              ],
              [
                "02",
                "Confira sua proposta",
                "Veja cada serviço, o valor e as condições antes de contratar.",
              ],
              [
                "03",
                "Acompanhe o trabalho",
                "Após o aceite e o sinal, envie os documentos e acompanhe sua pasta.",
              ],
              [
                "04",
                "Receba a entrega",
                "Acesse o cálculo, o arquivo .PJC e o parecer técnico revisado.",
              ],
            ].map(([n, title, copy]) => (
              <article key={n}>
                <span className="step-number">{n}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
      <section className="section included" id="entregas">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">O que você recebe</span>
              <h2>
                Os documentos certos.
                <br />
                Com fundamento técnico.
              </h2>
            </div>
            <p>
              Uma entrega que reúne o resultado e os critérios utilizados,
              pronta para sua conferência e uso no processo.
            </p>
          </div>
          <div className="included-grid">
            <article className="included-card">
              <FileText size={30} strokeWidth={1.3} aria-hidden="true" />
              <h3>Cálculo em PDF</h3>
              <p>
                Demonstrativos discriminados para você revisar as parcelas e os
                valores apurados.
              </p>
            </article>
            <article className="included-card">
              <Layers3 size={30} strokeWidth={1.3} aria-hidden="true" />
              <h3>Arquivo do PJe-Calc</h3>
              <p>
                O arquivo .PJC para conferência, uso no processo e futuras
                atualizações.
              </p>
            </article>
            <article className="included-card">
              <ScrollText size={30} strokeWidth={1.3} aria-hidden="true" />
              <h3>Parecer assinado</h3>
              <p>
                Registro dos critérios adotados, revisado e assinado pelo
                responsável técnico.
              </p>
            </article>
          </div>
        </div>
      </section>
      <div className="container">
        <section className="section faq-layout" id="duvidas">
          <div>
            <span className="eyebrow">Antes de começar</span>
            <h2>
              Respostas para
              <br />
              seguir com segurança.
            </h2>
          </div>
          <div className="faq">
            <details>
              <summary>Quais cálculos posso solicitar?</summary>
              <p>
                O portal começa com cálculos trabalhistas: inicial, liquidação,
                impugnação e atualização. O checklist identifica os serviços
                necessários.
              </p>
            </details>
            <details>
              <summary>Como funciona o pagamento?</summary>
              <p>
                Para novas contratações, a proposta prevê 50% de entrada e 50%
                na entrega. Você confere os valores e as condições antes de
                aceitar.
              </p>
            </details>
            <details>
              <summary>Como o prazo é definido?</summary>
              <p>
                O prazo considera a complexidade e o vencimento informado. A
                data de entrega aparece na proposta, antes da contratação.
              </p>
            </details>
            <details>
              <summary>Onde acompanho e envio os documentos?</summary>
              <p>
                Cada processo tem sua própria pasta, com documentos, mensagens,
                decisões técnicas e linha do tempo.
              </p>
            </details>
            <details>
              <summary>Quem revisa o cálculo?</summary>
              <p>
                O André analisa o caso, confere o cálculo no PJe-Calc e revisa
                os documentos antes da entrega. A responsabilidade técnica
                permanece com o profissional.
              </p>
            </details>
          </div>
        </section>
        <section className="closing">
          <div>
            <h2>Vamos organizar o próximo cálculo?</h2>
            <p>Comece pelo cadastro gratuito e conheça os próximos passos.</p>
          </div>
          <Link className="button" href="/cadastro">
            Criar minha conta <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}
