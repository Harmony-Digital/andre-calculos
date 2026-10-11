import { seedDev } from "../app/scripts/seed-local";
seedDev().catch(() => { console.error("Seed local não concluído. Confira as migrations e o Supabase local."); process.exitCode = 1; });
