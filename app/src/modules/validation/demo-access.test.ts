import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  system: vi.fn(),
  session: vi.fn(),
  before: vi.fn(),
  generate: vi.fn(),
  profile: vi.fn(),
  otherProfiles: vi.fn(),
  activeProfile: vi.fn(),
  verify: vi.fn(),
  currentUser: vi.fn(),
  signOut: vi.fn(),
  audit: vi.fn(),
  headers: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: mocks.system }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: mocks.session,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { createDemoSession, demoRequestAllowed } from "./demo-access";
import { enterDemo } from "./demo-access-actions";

const validEnvironment = {
  ANDRE_VALIDATION_MODE: "1",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_tdmzmC6utVU2fHPz0iVhroMD8NtI",
  APP_BASE_URL: "https://project-rucji.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://qtofwbxujshroaafxowr.supabase.co",
};
const requestHeaders = () =>
  new Headers({
    origin: "https://project-rucji.vercel.app",
    host: "project-rucji.vercel.app",
  });
afterEach(() => vi.unstubAllEnvs());
function form(persona: string = "lawyer") {
  const data = new FormData();
  data.set("persona", persona);
  return data;
}
function account(persona: "lawyer" | "calculator" = "lawyer") {
  const calculator = persona === "calculator";
  const name = calculator
    ? "André Modelo — validação"
    : "Advogada de demonstração";
  return {
    id: `6d07e560-0010-4000-8000-00000000000${calculator ? "2" : "1"}`,
    email: calculator
      ? "andre@validacao.invalid"
      : "advogada@validacao.invalid",
    role: "authenticated",
    user_metadata: { full_name: name, legal_name: name, accepted_legal: false },
  };
}
function arrange(persona: "lawyer" | "calculator" = "lawyer") {
  const user = account(persona);
  const profile = {
    id: user.id,
    role: persona === "calculator" ? "calculator" : "client",
    full_name: user.user_metadata.full_name,
  };
  mocks.before.mockResolvedValue({ data: { user }, error: null });
  mocks.generate.mockResolvedValue({
    data: {
      user,
      properties: {
        hashed_token: "hash-ficticio-somente-no-mock",
        verification_type: "magiclink",
      },
    },
    error: null,
  });
  mocks.profile.mockResolvedValue({ data: profile, error: null });
  mocks.activeProfile.mockResolvedValue({ data: profile, error: null });
  mocks.verify.mockResolvedValue({
    data: { user, session: { user } },
    error: null,
  });
  mocks.currentUser.mockResolvedValue({ data: { user }, error: null });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  arrange();
  mocks.otherProfiles.mockResolvedValue({ data: [], error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.audit.mockResolvedValue({ error: null });
  const profileQuery = (single: typeof mocks.profile) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ single })),
      not: vi.fn(() => ({ limit: mocks.otherProfiles })),
    })),
  });
  mocks.system.mockReturnValue({
    auth: {
      admin: { getUserById: mocks.before, generateLink: mocks.generate },
    },
    from: vi.fn(() => profileQuery(mocks.profile)),
  });
  mocks.session.mockResolvedValue({
    auth: {
      verifyOtp: mocks.verify,
      getUser: mocks.currentUser,
      signOut: mocks.signOut,
    },
    from: vi.fn(() => profileQuery(mocks.activeProfile)),
    rpc: mocks.audit,
  });
  mocks.headers.mockResolvedValue(requestHeaders());
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirect-ficticio");
  });
});

it("fecha o gate antes de acessar Auth fora do modo/projeto de validação", async () => {
  for (const key of Object.keys(validEnvironment)) {
    const env = { ...validEnvironment, [key]: undefined };
    expect(await createDemoSession(form(), requestHeaders(), env)).toBeNull();
  }
  expect(mocks.system).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});
it.each([
  { origin: "" },
  { origin: "https://outro.vercel.app" },
  { origin: "https://project-rucji.vercel.app/" },
  { host: "outro.vercel.app" },
  { "x-forwarded-host": "outro.vercel.app" },
  { "x-forwarded-proto": "http" },
])("recusa cabeçalhos divergentes ou Origin ausente: %o", async (patch) => {
  const headers = requestHeaders();
  for (const [key, value] of Object.entries(patch)) headers.set(key, value);
  expect(demoRequestAllowed(headers, validEnvironment)).toBe(false);
  expect(await createDemoSession(form(), headers, validEnvironment)).toBeNull();
  expect(mocks.system).not.toHaveBeenCalled();
});
it("não aceita email, UUID, terceiro perfil, persona desconhecida ou duplicada", async () => {
  for (const selected of [
    "",
    "client",
    "admin",
    "outsider",
    account().email,
    account().id,
  ])
    expect(
      await createDemoSession(
        form(selected),
        requestHeaders(),
        validEnvironment,
      ),
    ).toBeNull();
  const duplicate = form();
  duplicate.append("persona", "calculator");
  expect(
    await createDemoSession(duplicate, requestHeaders(), validEnvironment),
  ).toBeNull();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.system).not.toHaveBeenCalled();
});
it.each([
  { id: "6d07e560-0010-4000-8000-000000000003" },
  { email: "outro@validacao.invalid" },
  { role: "service_role" },
  { user_metadata: { ...account().user_metadata, accepted_legal: true } },
  { user_metadata: { ...account().user_metadata, legal_name: "Outro nome" } },
  { user_metadata: { ...account().user_metadata, full_name: "Outro nome" } },
])("não gera link se a identidade existente divergir: %o", async (patch) => {
  mocks.before.mockResolvedValue({
    data: { user: { ...account(), ...patch } },
    error: null,
  });
  expect(
    await createDemoSession(form(), requestHeaders(), validEnvironment),
  ).toBeNull();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("recusa perfil errado ou presença de qualquer perfil não reservado", async () => {
  mocks.profile.mockResolvedValueOnce({
    data: {
      id: account().id,
      role: "admin",
      full_name: account().user_metadata.full_name,
    },
    error: null,
  });
  expect(
    await createDemoSession(form(), requestHeaders(), validEnvironment),
  ).toBeNull();
  mocks.otherProfiles.mockResolvedValueOnce({
    data: [{ id: "outro-perfil" }],
    error: null,
  });
  expect(
    await createDemoSession(form(), requestHeaders(), validEnvironment),
  ).toBeNull();
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("falha do provedor ou conta ausente não criam sessão nem expõem detalhes", async () => {
  mocks.before.mockResolvedValueOnce({
    data: { user: null },
    error: { message: "privado" },
  });
  expect(
    await createDemoSession(form(), requestHeaders(), validEnvironment),
  ).toBeNull();
  expect(mocks.generate).not.toHaveBeenCalled();
  mocks.generate.mockRejectedValueOnce(
    new Error("link privado que não pode sair"),
  );
  expect(
    await createDemoSession(form(), requestHeaders(), validEnvironment),
  ).toBeNull();
  expect(mocks.session).not.toHaveBeenCalled();
});
it("reconfere o usuário retornado pelo link e o UUID após a geração", async () => {
  mocks.generate.mockResolvedValueOnce({
    data: {
      user: account("calculator"),
      properties: { hashed_token: "ficticio", verification_type: "magiclink" },
    },
    error: null,
  });
  expect(
    await createDemoSession(form(), requestHeaders(), validEnvironment),
  ).toBeNull();
  mocks.before.mockResolvedValueOnce({
    data: { user: account() },
    error: null,
  });
  mocks.before.mockResolvedValueOnce({ data: { user: null }, error: null });
  expect(
    await createDemoSession(form(), requestHeaders(), validEnvironment),
  ).toBeNull();
  expect(mocks.verify).not.toHaveBeenCalled();
});
it.each(["verification", "current-user", "profile", "audit"])(
  "limpa a sessão local em falha de %s",
  async (failure) => {
    if (failure === "verification")
      mocks.verify.mockRejectedValueOnce(new Error("privado"));
    if (failure === "current-user")
      mocks.currentUser.mockResolvedValueOnce({
        data: { user: account("calculator") },
        error: null,
      });
    if (failure === "profile")
      mocks.activeProfile.mockResolvedValueOnce({ data: null, error: null });
    if (failure === "audit")
      mocks.audit.mockResolvedValueOnce({ error: { message: "privado" } });
    expect(
      await createDemoSession(form(), requestHeaders(), validEnvironment),
    ).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  },
);
it.each([
  ["lawyer", "/app"],
  ["calculator", "/painel"],
] as const)(
  "autentica somente %s, audita e retorna destino fixo %s",
  async (persona, destination) => {
    arrange(persona);
    const data = form(persona);
    data.set("email", "nao-utilizar@validacao.invalid");
    data.set("next", "https://outro.vercel.app");
    expect(
      await createDemoSession(data, requestHeaders(), validEnvironment),
    ).toBe(destination);
    expect(mocks.before).toHaveBeenCalledTimes(2);
    expect(mocks.before).toHaveBeenCalledWith(account(persona).id);
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith({
      type: "magiclink",
      email: account(persona).email,
    });
    expect(mocks.verify).toHaveBeenCalledExactlyOnceWith({
      type: "email",
      token_hash: "hash-ficticio-somente-no-mock",
    });
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith("record_auth_audit", {
      event: "login",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  },
);
it("a ação devolve só mensagem genérica em falha e redireciona fora do catch no sucesso", async () => {
  expect(await enterDemo({}, form())).toEqual({
    message: "O acesso de demonstração está temporariamente indisponível.",
  });
  for (const [key, value] of Object.entries(validEnvironment))
    vi.stubEnv(key, value);
  await expect(enterDemo({}, form())).rejects.toThrow("redirect-ficticio");
  expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/app");
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});
