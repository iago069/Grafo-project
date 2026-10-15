-- Documentos do projeto: arquivos (manuais em PDF etc.) no Supabase Storage.
-- Antes de rodar: Storage → New bucket → nome "documentos", Public desligado,
-- limite de 50 MB por arquivo. Depois rode este arquivo no SQL Editor.
-- Cada pessoa só lê, envia, atualiza e apaga arquivos dentro da pasta com o
-- próprio id (o app grava em <id do usuário>/<projeto>/<arquivo>).
-- Sem este passo, "Enviar arquivo" avisa que o armazenamento não foi criado;
-- os procedimentos escritos funcionam normalmente (ficam no próprio projeto).

create policy "documentos: ler os seus"
on storage.objects for select to authenticated
using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documentos: enviar os seus"
on storage.objects for insert to authenticated
with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documentos: atualizar os seus"
on storage.objects for update to authenticated
using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documentos: apagar os seus"
on storage.objects for delete to authenticated
using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
