# Preferências de aviso (M2.31)

Data: 2026-10-11. Aplicação em `127.0.0.1:3000` e Supabase local exclusivo
`andre-calculos`. Contas, contatos, mensagens e processos inteiramente fictícios.

## O que foi conferido

- Nove eventos, cada um com e-mail e WhatsApp. Sem preferência gravada, e-mail
  começa ligado e WhatsApp desligado. A configuração persiste após recarregar.
- Os contatos do serviço pertencem a um responsável persistente. Outro
  calculista não altera suas escolhas nem assume os contatos automaticamente.
  Ausência ou perda do papel do responsável impede o enfileiramento, sem impedir
  o registro da mensagem do cliente.
- Se o vínculo estiver vazio, somente o único calculista pode confirmá-lo ao
  salvar. A confirmação, a preferência, o recibo e a auditoria são transacionais:
  uma revisão inválida desfaz também a confirmação do responsável.
- Cliente, admin e anônimo não salvam preferências. Leitura de preferências usa
  a sessão e RLS; tabelas internas não têm acesso de `anon` ou `authenticated`.
- Duas gravações da mesma revisão com chaves diferentes têm um único vencedor.
  A segunda sessão recebe orientação para recarregar antes de salvar.
- Duas tentativas iguais retornam o mesmo recibo, com uma única auditoria.
  Reenviar um recibo antigo depois de outra alteração não reaplica o valor
  antigo; reutilizar a chave com outros dados é recusado. Recibos são imutáveis.
- A mensagem do cliente enfileira e-mail por padrão; desligar e-mail não cria
  aviso para a nova mensagem. Ao ligar WhatsApp, uma nova mensagem gera os dois
  canais. Avisos pendentes anteriores permanecem pendentes e mensagens que
  ocorreram com o canal desligado não são recuperadas automaticamente.
- Falhas de rede antes e depois de gravar preservam a seleção e a chave da
  tentativa. Se outra sessão altera a preferência antes do reenvio, o recibo
  antigo não desfaz a mudança e a tela orienta recarregar, sem apresentar o
  valor antigo como escolha vigente. Admin não vê essa seção e cliente recebe
  acesso negado.
- Salvar outro canal na mesma página não troca a revisão nem a chave de uma
  tentativa cuja resposta se perdeu. O par permanece o mesmo até uma resposta
  confirmada ou uma recarga completa da página.
- Ensaios nas larguras de 375/1440 px verificaram os formulários, persistência,
  concorrência, falha de rede, axe e ausência de transbordamento horizontal.

Os ensaios verificam a criação dos avisos na fila local. Não houve envio externo.
A entrega por e-mail/WhatsApp depende dos provedores em M2.28/M2.29.

## Verificação executada

```sh
bash scripts/dev-env.sh npm run check
bash scripts/dev-env.sh npm run test:rls
bash scripts/dev-env.sh npm run test:e2e -- --workers=2 tests/e2e/notification-preferences.spec.ts
bash scripts/dev-env.sh npm run test:e2e -- --workers=4
DOCKER_HOST='unix:///Users/fabioalmeida/.colima/andre-calculos/docker.sock' supabase db lint --local --level warning
```

- `check`: formatação, lint, tipos, 273 testes unitários com cobertura e build
  aprovados.
- RLS: 71 testes aprovados, incluindo sete novos ensaios específicos.
- Interface específica: dois ensaios aprovados, um em cada largura.
- Suíte completa: 81 aprovados, cinco ensaios únicos omitidos no projeto celular.
- Migration local `0029`: verificação SQL sem erros. Consultas dos catálogos
  confirmaram zero tabelas públicas/internas sem RLS, zero funções
  `SECURITY DEFINER` sem `search_path` vazio, zero privilégios de cliente nas
  duas novas tabelas internas e zero chaves estrangeiras novas sem índice.

A primeira regressão completa teve um ensaio de PDF que esgotou a espera de
30 segundos pelo lock das configurações fictícias, antes de testar o documento.
A espera continua limitada, agora em 60 segundos; os ensaios de cadastro e
configurações têm o mesmo limite de execução de 90 segundos dos demais ensaios
que usam esse lock. O lock de outro ensaio nunca é removido durante a espera.

O ensaio de resposta perdida foi sincronizado com o fim da interceptação da
requisição. Uma versão anterior retirava a interceptação cedo e interrompia a
limpeza; o único processo com marcador exato, três recibos e duas preferências
fictícias restantes foram identificados e removidos, com contatos restaurados.

Após a última conferência específica, foram verificados quatro perfis fictícios,
dois clientes com papel de cliente, 29 migrations e RLS nas 25 tabelas públicas
e quatro internas. Zero processos temporários, entregas, aprovações, recibos de
preferência ou preferências restantes; vínculo do responsável correto. Nome/CRC,
Pix, contatos, versões legais aprovadas e política de entrega continuaram vazios;
nenhuma tabela de preços real ativa. As capturas finais foram inspecionadas.

## Capturas

| Seção | Computador | Celular |
|---|---|---|
| Preferências de aviso | [1440 px](preferencias-avisos-1440.png) | [375 px](preferencias-avisos-375.png) |
