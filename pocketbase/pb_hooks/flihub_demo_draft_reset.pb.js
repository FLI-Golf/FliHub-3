// A deliberately destructive reset for active, paused, or completed seeded Codespace drafts only.
routerAdd('POST', '/api/flihub/demo/fantasy/drafts/{id}/reset', (e) => {
 if ($os.getenv('FLIHUB_DEMO_FANTASY') !== '1' || !$os.getenv('CODESPACE_NAME')) {
  throw new ForbiddenError('Demo draft reset is disabled. Start PocketBase with FLIHUB_DEMO_FANTASY=1 in your Codespace.');
 }
 const body = e.requestInfo().body || {};
 if (body.confirm !== 'RESET') throw new BadRequestError('Confirm that this demo draft can be cleared.');
 const pickSeconds = Number(body.pickSeconds ?? 30);
 if (![7, 15, 30].includes(pickSeconds)) throw new BadRequestError('Choose a 7, 15, or 30 second pick timer.');
 const draftId = String(e.request.pathValue('id') ?? '');
 let cleared = 0;
 e.app.runInTransaction((app) => {
  const draft = app.findRecordById('fantasy_drafts', draftId);
  const league = app.findRecordById('fantasy_leagues', draft.getString('league'));
  if (league.getString('owner') !== e.auth.id) throw new ForbiddenError('Only this league commissioner can reset a demo draft.');
  if (!['active', 'paused', 'complete'].includes(draft.getString('status'))) throw new BadRequestError('Only an active, paused, or completed demo draft can be reset.');
  const members = app.findRecordsByFilter('fantasy_members', 'league = {:league}', '', 100, 0, { league: league.id })
   .filter((member) => !['removed', 'declined'].includes(member.getString('status')));
  const participants = members.filter((member) => member.getString('user') !== e.auth.id);
  if (!participants.length) throw new BadRequestError('This reset is only for leagues filled with demo participants.');
  for (const member of participants) {
   const user = app.findRecordById('users', member.getString('user'));
   const prefix = `fantasy-demo-${league.id}-`;
   const email = user.getString('email');
   const suffix = email.startsWith(prefix) ? email.slice(prefix.length) : '';
   if (!/^([1-9]|10|11)@example\.com$/.test(suffix)) {
    throw new BadRequestError('Reset is blocked because this league includes a non-demo participant.');
   }
  }
  const picks = app.findRecordsByFilter('fantasy_picks', 'draft = {:draft}', '', 100, 0, { draft: draftId });
  for (const pick of picks) app.delete(pick);
  cleared = picks.length;
  draft.set('status', 'ready');
  draft.set('currentPick', 0);
  draft.set('deadline', '');
  draft.set('pausedRemainingMs', 0);
  draft.set('startedAt', '');
  draft.set('completedAt', '');
  draft.set('resolutionRequired', false);
  draft.set('pickSeconds', pickSeconds);
  app.save(draft);
 });
 return e.json(200, { reset: true, cleared, pickSeconds });
}, $apis.requireAuth());
