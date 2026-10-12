import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  authConfirmationVariable,
  authEmailManifest,
  authTemplateDefinitions,
  prepareAuthEmailTemplates,
} from "./auth-email-templates";
import {
  fictionalConfirmationUrl,
  renderAuthTemplateFixture,
} from "../../../tests/fixtures/auth-templates";

describe("modelos nativos de autenticação", () => {
  it("artefatos e assuntos revisáveis correspondem ao gerador sem configurar Auth", async () => {
    const templates = await prepareAuthEmailTemplates();
    for (const template of templates) {
      expect(
        await readFile(
          resolve(
            process.cwd(),
            "../supabase/templates/auth",
            template.htmlFile,
          ),
          "utf8",
        ),
      ).toBe(template.html);
    }
    const manifest = JSON.parse(
      await readFile(
        resolve(process.cwd(), "../supabase/templates/auth/manifest.json"),
        "utf8",
      ),
    );
    expect(manifest).toEqual(authEmailManifest(templates));
    expect(manifest.demonstration).toBe(true);
  });

  it.each(authTemplateDefinitions)(
    "$name mantém somente o interpolador oficial e os dados fictícios",
    async (definition) => {
      const template = (await prepareAuthEmailTemplates()).find(
        (t) => t.name === definition.name,
      )!;
      const variables = template.html.match(/\{\{[\s\S]*?\}\}/g);
      expect(variables).toEqual([
        authConfirmationVariable,
        authConfirmationVariable,
      ]);
      const dom = new JSDOM(template.html);
      expect(dom.window.document.body.textContent).toContain(
        "CRC DEMO-000000/O",
      );
      expect(dom.window.document.body.textContent).toContain("Contador");
      expect(dom.window.document.body.textContent).toContain("dados fictícios");
      expect(dom.window.document.body.lang).toBe("pt-BR");
      expect(dom.window.document.querySelectorAll("title")).toHaveLength(1);
      expect(dom.window.document.title).toBe(definition.subject);
      dom.window.close();
      expect(template.html).not.toMatch(
        /\.Data|\.Token|\.RedirectTo|auth\/confirm\?/,
      );
      expect(template.subject).toContain("Marco");
    },
  );

  it.each(authTemplateDefinitions)(
    "$name preserva URL longa, caracteres e retorno sem atributos injetados",
    async (definition) => {
      const template = (await prepareAuthEmailTemplates()).find(
        (t) => t.name === definition.name,
      )!;
      const url = `${fictionalConfirmationUrl(definition.next)}&attack="><img src=x onerror=alert(1)>`;
      const dom = new JSDOM(renderAuthTemplateFixture(template.html, url));
      const document = dom.window.document;
      const anchors = [...document.querySelectorAll("a")];
      expect(anchors).toHaveLength(2);
      expect(anchors.map((a) => a.getAttribute("href"))).toEqual([url, url]);
      expect(
        document.querySelectorAll("img, script, [onerror], [onclick]"),
      ).toHaveLength(0);
      const redirect = new URL(new URL(url).searchParams.get("redirect_to")!);
      expect(redirect.pathname).toBe("/auth/callback");
      expect(redirect.searchParams.get("next")).toBe(definition.next);
      dom.window.close();
    },
  );

  it("a prévia recusa variável desconhecida, token puro e URL externa/insegura", async () => {
    const html = (await prepareAuthEmailTemplates())[0].html;
    for (const url of [
      "javascript:alert(1)",
      "https://cliente.example.test/",
      "//auth.example.test/",
      "https://user:password@auth.example.test/",
    ])
      expect(() => renderAuthTemplateFixture(html, url)).toThrow();
    for (const variable of [
      "{{ .Data.name }}",
      "{{ .Token }}",
      "{{ .ConfirmationURL | html }}",
    ])
      expect(() =>
        renderAuthTemplateFixture(
          html.replace(authConfirmationVariable, variable),
          fictionalConfirmationUrl("/app"),
        ),
      ).toThrow();
  });
});
