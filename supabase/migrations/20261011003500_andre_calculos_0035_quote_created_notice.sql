-- RF-25: a proposta e seu aviso pertencem à mesma transação.
-- Simulações nunca entram na fila de envio; a emissão comercial de snapshots
-- continua bloqueada pela migration 0033 e pelos insumos protegidos de RF-22.
create function private.notify_quote_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare job public.orders%rowtype; recipient uuid;
begin
 if new.is_simulation or new.proposal_snapshot->>'mode'='fixture' then return new; end if;
 select * into job from public.orders where id=new.order_id;
 if job.id is null then raise exception 'Pedido indisponível'; end if;
 -- O vínculo é também o lock da edição de preferências. Mantém responsável,
 -- papel, contatos e escolhas dos dois canais estáveis até terminar o enqueue.
 perform id from public.settings where singleton for share;
 select r.profile_id into recipient from private.calculator_notification_recipient r
  join public.profiles p on p.id=r.profile_id and p.role='calculator'
  where r.singleton for share of r,p;
 if recipient is null then return new; end if;
 perform private.notify_calculator('quote_created',jsonb_build_object(
  'quote_id',new.id,'order_id',job.id,'process_id',job.process_id,
  'number',new.number,'code',job.code,'path','/painel/processos/'||job.process_id::text),
  'quote:'||new.id::text);
 return new;
end;
$$;
revoke all on function private.notify_quote_created() from public,anon,authenticated,service_role;
create trigger quotes_notify_created after insert on public.quotes
 for each row execute function private.notify_quote_created();
