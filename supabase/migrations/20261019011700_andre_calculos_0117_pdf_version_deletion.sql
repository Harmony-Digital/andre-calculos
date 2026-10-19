-- O vínculo continua restritivo, mas a exclusão autorizada de uma pasta inteira
-- pode remover todos os PDFs/estados na mesma transação, sem depender da ordem.
alter table private.pdf_versions alter constraint pdf_versions_previous_file_id_fkey deferrable initially deferred;
