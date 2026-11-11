from pathlib import Path

component = Path('src/lib/components/CompetitionsManager.svelte')
route = Path('src/routes/(app)/organizations/[id]/cap/[capability]/+page.server.ts')
hook_path = Path('pocketbase/pb_hooks/flihub_delete_empty_league.pb.js')
ui = component.read_text()
server = route.read_text()
if hook_path.exists() or 'deleteLeague: async' in server:
    raise SystemExit('League deletion already exists. No changes made.')

rename = ui.index('renamingLeague = league')
end = ui.index('</Button>', rename) + len('</Button>')
button = """
 <form method="POST" action="?/deleteLeague"
  onsubmit={(event) => {
   if (!confirm(`Permanently delete the empty league "${league.name}"?`)) {
    event.preventDefault();
   }
  }}>
  <input type="hidden" name="league" value={league.id} />
  <Button type="submit" size="sm" variant="outline"
   disabled={seasons.some((season) => season.league === league.id)}
   title={seasons.some((season) => season.league === league.id)
    ? 'This league contains seasons and cannot be deleted.' : 'Permanently delete this empty league'}
   style="color: #dc2626; border-color: #dc2626;">
   Delete
  </Button>
 </form>
"""
ui = ui[:end] + button + ui[end:]

action = """
 deleteLeague: async ({ locals, request, params }) => {
  if (!locals.pb || !locals.user) {
   return fail(503, { message: 'PocketBase is not configured.' });
  }
  const form = await request.formData();
  const leagueId = String(form.get('league') ?? '');
  if (!ID_PATTERN.test(leagueId)) return fail(400, { message: 'Invalid league.' });
  try {
   const league = await locals.pb.collection('leagues').getOne(leagueId);
   if (league.organization !== params.id) {
    return fail(403, { message: 'Choose a league in this organization.' });
   }
   await locals.pb.send(`/api/flihub/leagues/${leagueId}/delete-empty`, { method: 'POST' });
  } catch (err) {
   return fail(pbErrorStatus(err), { message: pbErrorMessage(err) });
  }
  return { deleted: true };
 },

"""
position = server.index('renameLeague: async')
position = server.rfind('\n', 0, position) + 1
server = server[:position] + action + server[position:]

hook = '/// <reference path="../pb_data/types.d.ts" />\nrouterAdd(\'POST\', \'/api/flihub/leagues/{id}/delete-empty\', (e) => {\n e.app.runInTransaction((app) => {\n  const league = app.findRecordById(\'leagues\', e.request.pathValue(\'id\'));\n  const orgId = league.getString(\'organization\');\n  const members = app.findRecordsByFilter(\'memberships\',\n   \'organization = {:org} && user = {:user}\', \'\', 1, 0,\n   { org: orgId, user: e.auth.id });\n  if (!members.length || ![\'owner\', \'admin\'].includes(members[0].getString(\'role\'))) {\n   throw new ForbiddenError(\'Only Owners and Admins can delete empty leagues.\');\n  }\n  const org = app.findRecordById(\'organizations\', orgId);\n  const caps = JSON.parse(String(org.get(\'capabilities\') || \'[]\'));\n  if (!Array.isArray(caps) || !caps.includes(\'leagues-seasons\')) {\n   throw new BadRequestError(\'The Leagues & seasons capability is disabled.\');\n  }\n  const seasons = app.findRecordsByFilter(\'seasons\', \'league = {:league}\', \'\', 1, 0,\n   { league: league.id });\n  if (seasons.length) {\n   throw new BadRequestError(\'This league contains seasons and cannot be deleted.\');\n  }\n  app.delete(league);\n });\n return e.json(200, { deleted: true });\n}, $apis.requireAuth());\n'

for path, text in [(component, ui), (route, server), (hook_path, hook)]:
    path.write_text('\n'.join(line.rstrip() for line in text.splitlines()) + '\n')
print('Added Delete buttons and the protected empty-league deletion endpoint.')
