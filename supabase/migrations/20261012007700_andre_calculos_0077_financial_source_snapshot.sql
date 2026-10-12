-- Leitura coerente de revisoes, historico e fingerprint na mesma query.
-- Escritores/guards transacionais continuam VOLATILE.
alter function public.get_financial_projection_source(uuid) stable;
alter function private.require_payment_fixture_system(uuid,uuid) stable;
