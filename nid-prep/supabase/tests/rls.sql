-- RLS assertions: run after shim + migrations. Any failed assertion raises.
\set ON_ERROR_STOP on
grant all on all tables in schema public to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'veeru@example.com'), ('00000000-0000-0000-0000-00000000000b', 'gb@example.com'), ('00000000-0000-0000-0000-00000000000c', 'stranger@example.com');
insert into public.profiles values ('00000000-0000-0000-0000-00000000000a', 'student', 'Veeru'), ('00000000-0000-0000-0000-00000000000b', 'mentor', 'GB');
insert into public.categories values ('colour', 'Colour', '', 1);
insert into public.subtopics values ('colour.wheel', 'colour', 'Colour wheel');
insert into public.items (id, type, category_id, subtopic_id, difficulty, source, stem, explanation, content_hash)
  values ('i1', 'mcq', 'colour', 'colour.wheel', 2, 'Practice', 'Which is a primary colour?', 'Red.', 'h1');

set role authenticated;
-- Student
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.attempts (user_id, item_id, context, correct) values ('00000000-0000-0000-0000-00000000000a', 'i1', 'daily', true);
do $$ begin
  if (select count(*) from public.items) <> 1 then raise exception 'student cannot read items'; end if;
  begin
    insert into public.items (id, type, category_id, subtopic_id, difficulty, source, stem, explanation, content_hash)
      values ('i2', 'mcq', 'colour', 'colour.wheel', 2, 'Practice', 'x', 'x', 'h2');
    raise exception 'student wrote content';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.attempts (user_id, item_id, context) values ('00000000-0000-0000-0000-00000000000c', 'i1', 'daily');
    raise exception 'student wrote attempt for someone else';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set role = 'mentor' where id = auth.uid();
    if (select role from public.profiles where id = auth.uid()) = 'mentor' then raise exception 'student escalated role'; end if;
  exception when insufficient_privilege then null; end;
end $$;

-- Stranger (signed in, no profile) sees no personal data
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  if (select count(*) from public.attempts) <> 0 then raise exception 'stranger read attempts'; end if;
end $$;

-- Mentor reads student data and writes content
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.attempts) <> 1 then raise exception 'mentor cannot read attempts'; end if;
  insert into public.items (id, type, category_id, subtopic_id, difficulty, source, stem, explanation, content_hash)
    values ('i3', 'mcq', 'colour', 'colour.wheel', 2, 'Practice', 'Which colour is secondary?', 'Green.', 'h3');
  if (select count(*) from public.similar_items('Which is a primary colour ?', 0.6)) < 1 then raise exception 'trigram dedupe broken'; end if;
end $$;
reset role;
select 'RLS OK' as result;
