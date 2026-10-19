import type { Proposal } from "@/modules/quotes/proposal";
import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { revisionFixture } from "../e2e/revision-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
let f: Awaited<ReturnType<typeof revisionFixture>>;
let client: Awaited<ReturnType<typeof quoteSession>>, calculator: typeof client;
beforeAll(async () => {
  f = await revisionFixture();
  client = await quoteSession();
  calculator = await quoteSession("calculator");
});
afterAll(async () => {
  try {
    await Promise.all([
      client.auth.signOut({ scope: "local" }),
      calculator.auth.signOut({ scope: "local" }),
    ]);
  } finally {
    await f.cleanup();
  }
});
const revise = (args: Record<string, unknown>) =>
  f.db.rpc("revise_quote_system", args as never);
const count = (order: string) =>
  Number(sql(`select count(*) from public.quotes where order_id='${order}';`));
it("cria duas versões, preserva origem/contexto e recupera recibo antigo sem alterar cabeça", async () => {
  const s = await f.create(),
    old = sql(`select to_jsonb(q) from public.quotes q where id='${s.id}';`),
    ctx = sql(
      `select to_jsonb(c) from private.quote_contract_contexts c where quote_id='${s.id}';`,
    ),
    args = s.revisionArgs();
  const one = await revise(args);
  expect(one.error).toBeNull();
  const r = one.data as {
    quoteId: string;
    version: number;
    totalCents: number;
  };
  expect(r).toMatchObject({
    version: 2,
    previousQuoteId: s.id,
    reason: args.reason,
  });
  expect(
    sql(`select to_jsonb(q) from public.quotes q where id='${s.id}';`),
  ).toBe(old);
  expect(
    sql(
      `select to_jsonb(c) from private.quote_contract_contexts c where quote_id='${s.id}';`,
    ),
  ).toBe(ctx);
  const c = await calculator.rpc("get_quote_contract_context", {
    target_quote: r.quoteId,
  });
  expect(c.error).toBeNull();
  const newer = {
    ...args,
    target_quote: r.quoteId,
    expected_context: (c.data as { contextHash: string }).contextHash,
    expected_version: 2,
    request_id: randomUUID(),
    reason: "Segundo ajuste fictício",
    unit_prices: s.proposal.items.map(
      (item: Proposal["items"][number], i: number) => ({
        code: item.code,
        unitCents: item.unitCents + (i === 0 ? 203 : 0),
      }),
    ),
  };
  expect((await revise(newer)).error).toBeNull();
  expect(count(s.order_id)).toBe(3);
  expect((await revise(args)).data).toEqual(one.data);
  expect(count(s.order_id)).toBe(3);
  expect((await revise({ ...args, reason: "Outro motivo" })).error?.code).toBe(
    "PT409",
  );
  const history = await client.rpc("get_quote_revision_context", {
    target_quote: s.id,
  });
  expect(history.error).toBeNull();
  expect(history.data).toMatchObject({
    version: 1,
    isCurrent: false,
    canRevise: false,
    history: [{ version: 3 }, { version: 2 }, { version: 1 }],
  });
  expect(() =>
    sql(
      `update private.quote_adjustments set reason='outro' where previous_quote_id='${s.id}';`,
    ),
  ).toThrow();
});
it.each(["accept", "reject"])(
  "somente a versão vigente pode %s; a substituída não altera a atual",
  async (operation) => {
    const s = await f.create(),
      changed = await revise(s.revisionArgs());
    expect(changed.error).toBeNull();
    const id = (changed.data as { quoteId: string }).quoteId;
    expect((await f.db.rpc("accept_quote_system", s.args())).error?.code).toBe(
      "PT409",
    );
    expect(
      (await f.db.rpc("reject_quote_system", s.rejectionArgs())).error?.code,
    ).toBe("PT409");
    const c = (
      await client.rpc("get_quote_contract_context", { target_quote: id })
    ).data as { contextHash: string; canAccept: boolean; canReject: boolean };
    expect(c).toMatchObject({ canAccept: true, canReject: true });
    if (operation === "accept")
      expect(
        (
          await f.db.rpc(
            "accept_quote_system",
            s.args({ target_quote: id, expected_context: c.contextHash }),
          )
        ).error,
      ).toBeNull();
    else
      expect(
        (
          await f.db.rpc(
            "reject_quote_system",
            s.rejectionArgs({
              target_quote: id,
              expected_context: c.contextHash,
            }),
          )
        ).error,
      ).toBeNull();
    expect(
      (
        await revise(
          s.revisionArgs({
            target_quote: id,
            expected_context: c.contextHash,
            expected_version: 2,
          }),
        )
      ).error?.code,
    ).toBe("PT409");
    const old = (
      await client.rpc("get_quote_contract_context", { target_quote: s.id })
    ).data as { rejectionReceipt: unknown; canAccept: boolean };
    expect(old).toMatchObject({ canAccept: false, rejectionReceipt: null });
  },
);
it("duas revisões concorrentes têm uma vencedora", async () => {
  const s = await f.create();
  const results = await Promise.all([
    revise(s.revisionArgs()),
    revise(s.revisionArgs()),
  ]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(count(s.order_id)).toBe(2);
});
it.each(["accept", "reject"])(
  "ajuste concorrente com %s é serializado",
  async (operation) => {
    const s = await f.create();
    const results = await Promise.all([
      revise(s.revisionArgs()),
      operation === "accept"
        ? f.db.rpc("accept_quote_system", s.args())
        : f.db.rpc("reject_quote_system", s.rejectionArgs()),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
  },
);
it("nega papéis indevidos e acesso de outro cliente; tabela privada não tem grants", async () => {
  const s = await f.create();
  for (const role of ["client", "clientB", "admin"] as const) {
    const db = await quoteSession(role);
    try {
      expect(
        (await db.rpc("revise_quote_system", s.revisionArgs() as never)).error,
      ).not.toBeNull();
      const actor = (await db.auth.getUser()).data.user!.id;
      expect((await revise(s.revisionArgs({ actor }))).error).not.toBeNull();
      if (role !== "client")
        expect(
          (await db.rpc("get_quote_revision_context", { target_quote: s.id }))
            .error,
        ).not.toBeNull();
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
  }
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name='quote_adjustments' and grantee in('anon','authenticated','service_role');",
    ),
  ).toBe("0");
});
it("motivo vazio, valores inválidos e versão antiga não deixam efeito parcial", async () => {
  const s = await f.create();
  const before = sql(
    `select to_jsonb(o) from public.orders o where id='${s.order_id}';`,
  );
  for (const patch of [
    { reason: "  " },
    { expected_version: 9 },
    { expected_context: "a".repeat(64) },
    { unit_prices: [{ code: "base", unitCents: -1 }] },
  ])
    expect((await revise(s.revisionArgs(patch))).error).not.toBeNull();
  // Limite por multiplicação é validado antes de qualquer escrita.
  const tooLarge = s.proposal.items.map((item: Proposal["items"][number]) => ({
    code: item.code,
    unitCents: Number.MAX_SAFE_INTEGER + 1,
  }));
  expect(
    (await revise(s.revisionArgs({ unit_prices: tooLarge }))).error,
  ).not.toBeNull();
  expect(count(s.order_id)).toBe(1);
  expect(
    sql(`select to_jsonb(o) from public.orders o where id='${s.order_id}';`),
  ).toBe(before);
});

it("filtra versões substituídas antes da contagem/paginação de propostas abertas", async () => {
  const sample = await f.create();
  const result = await revise(sample.revisionArgs());
  expect(result.error).toBeNull();
  const id = (result.data as { quoteId: string }).quoteId;
  const list = await calculator
    .from("quotes")
    .select("id", { count: "exact" })
    .eq("order_id", sample.order_id)
    .filter("quote_is_current", "eq", true)
    .limit(1);
  expect(list.error).toBeNull();
  expect(list.count).toBe(1);
  expect(list.data).toEqual([{ id }]);
});
it("configuração indisponível bloqueia o formulário e o ajuste sem mudar a proposta", async () => {
  const sample = await f.create();
  try {
    expect(
      (
        await f.db
          .from("price_tables")
          .update({ active: false })
          .eq("id", f.price.id)
      ).error,
    ).toBeNull();
    const context = await calculator.rpc("get_quote_revision_context", {
      target_quote: sample.id,
    });
    expect(context.data).toMatchObject({
      canRevise: false,
      blockMessage: expect.any(String),
    });
    expect((await revise(sample.revisionArgs())).error?.code).toBe("PT409");
    expect(count(sample.order_id)).toBe(1);
  } finally {
    expect(
      (
        await f.db
          .from("price_tables")
          .update({ active: true })
          .eq("id", f.price.id)
      ).error,
    ).toBeNull();
  }
});
