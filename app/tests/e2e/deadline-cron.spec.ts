import { test, expect } from "@playwright/test";
import { localSystem, leaseLocalSettings } from "./local-helper";
test.setTimeout(90000);
test("cron HTTP local exige Bearer e bloqueia parâmetros; fora da janela não enfileira", async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "Endpoint sem interface; ensaio único de autorização HTTP.",
  );
  const release = await leaseLocalSettings(),
    db = localSystem();
  const prior = (
    await db
      .from("settings")
      .select("deadline_window_start,deadline_window_end")
      .eq("singleton", true)
      .single()
  ).data!;
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    const window =
      hour < 12
        ? { deadline_window_start: "23:58", deadline_window_end: "23:59" }
        : { deadline_window_start: "00:00", deadline_window_end: "00:01" };
    expect(
      (await db.from("settings").update(window).eq("singleton", true)).error,
    ).toBeNull();
    expect((await request.get("/api/cron/deadlines")).status()).toBe(401);
    expect(
      (
        await request.get("/api/cron/deadlines", {
          headers: { authorization: "Bearer fixture-invalid" },
        })
      ).status(),
    ).toBe(401);
    const headers = { authorization: `Bearer ${process.env.CRON_SECRET!}` };
    expect(
      (
        await request.get("/api/cron/deadlines?now=2030-01-01", { headers })
      ).status(),
    ).toBe(400);
    const response = await request.get("/api/cron/deadlines", { headers });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      status: "outside_window",
      scanned: 0,
      consumed: 0,
    });
    expect(response.headers()["cache-control"]).toBe("no-store");
  } finally {
    expect(
      (await db.from("settings").update(prior).eq("singleton", true)).error,
    ).toBeNull();
    await release();
  }
});
