alter table transactions add column note varchar(140);
alter table transactions add column note_search varchar(140);

comment on column transactions.note is 'Optional customer-visible transaction note; untrusted free text.';
comment on column transactions.note_search is 'Lowercase note for owner-scoped transaction search.';
