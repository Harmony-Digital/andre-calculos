-- Um pagamento nunca muda de pedido, inclusive parcelas legadas ou pendentes.
-- A validação precede a FK e não adquire locks: evita o ciclo pagamento → pedido
-- contra os fluxos comerciais que trancam pedido → pagamento.
create function private.preserve_payment_order() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.order_id is distinct from old.order_id then
  raise exception 'O pagamento não pode trocar de pedido';
 end if;
 return new;
end;
$$;
revoke all on function private.preserve_payment_order() from public,anon,authenticated,service_role;
create trigger payments_preserve_order before update of order_id on public.payments
 for each row execute function private.preserve_payment_order();
