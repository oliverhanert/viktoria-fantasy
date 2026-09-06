-- Kør EFTER du har oprettet bucket "avatars" (public) i Supabase Storage

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_coach_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and exists (select 1 from coaches c where c.id = auth.uid())
  );

create policy "avatars_coach_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and exists (select 1 from coaches c where c.id = auth.uid())
  );

create policy "avatars_coach_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and exists (select 1 from coaches c where c.id = auth.uid())
  );
