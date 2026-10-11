import { requireRole } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { ProfileForm, DeletionForm } from "@/components/profile-form";
import { AuthForm } from "@/components/auth-form";
export default async function Account() {
  const { profile, user } = await requireRole(["client"]);
  const db = await createSessionClient();
  const [details, client] = await Promise.all([
    db.from("profiles").select("city").eq("id", user.id).single(),
    db
      .from("clients")
      .select("legal_name,deletion_requested_at")
      .eq("owner_id", user.id)
      .single(),
  ]);
  if (details.error || client.error || !client.data)
    throw new Error("Não foi possível consultar sua conta.");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Minha conta</h1>
          <p>Seus dados e preferências de acesso.</p>
        </div>
      </div>
      <section className="panel">
        <ProfileForm
          email={user.email ?? ""}
          values={{
            fullName: profile.full_name,
            phone: profile.phone ?? "",
            oabNumber: profile.oab_number ?? "",
            oabState: profile.oab_state ?? "",
            city: details.data?.city ?? "",
            legalName: client.data.legal_name,
          }}
        />
      </section>
      <section className="panel">
        <div className="form-body">
          <h2>Trocar senha</h2>
          <p>Depois da alteração, você precisará entrar novamente.</p>
          <AuthForm mode="password" />
        </div>
      </section>
      <section className="panel">
        <DeletionForm requested={client.data.deletion_requested_at} />
      </section>
    </>
  );
}
