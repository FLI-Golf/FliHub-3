from pathlib import Path
import re

root = Path.cwd()
component = root / 'src/lib/components/CompetitionsManager.svelte'
route = root / 'src/routes/(app)/organizations/[id]/cap/[capability]/+page.server.ts'
ui = component.read_text()
server = route.read_text()
if 'purseAmountCents' in ui or 'parseSeasonPurse' in server:
    raise SystemExit('Season purse changes already exist. No changes made.')

def once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit('Expected source block not found exactly once. No changes saved:\n' + old)
    return text.replace(old, new, 1)

ui = once(ui, '<script lang="ts">', '<script lang="ts">\n import { formatSeasonPurse, seasonPurseInput } from \'$lib/season-purse\';')
ui = once(ui, 'endsOn: string | null;', 'endsOn: string | null;\n purseAmountCents: number | null;\n purseCurrency: string;')
ui = once(ui, '<span class="text-sm text-muted-foreground">{scheduleOf(season)}</span>', '<span class="text-sm text-muted-foreground">{scheduleOf(season)}</span>\n <span class="text-sm font-medium">{formatSeasonPurse(season)}</span>')

def field(prefix, editing=False):
    value = 'value={seasonPurseInput(editingSeason)}' if editing else ''
    return f"""
 <div class="flex flex-col gap-1.5">
  <Label for="{prefix}-purse">Season purse (USD, optional)</Label>
  <Input id="{prefix}-purse" name="purseAmount" type="text" inputmode="decimal"
   pattern={{'[0-9]+([.][0-9]{{1,2}})?'}} placeholder="6000000.00" {value}
   aria-describedby="{prefix}-purse-help" />
  <p id="{prefix}-purse-help" class="text-xs text-muted-foreground">
   Enter dollars with up to two decimal places, without commas. Leave blank for no purse set.
  </p>
 </div>
"""
start = ui.index('action="?/createSeason"')
end = ui.index('</form>', start)
block = ui[start:end]
button = block.index('Add season')
opening = block.rfind('<Button', 0, button)
container = block.rfind('<div>', 0, opening)
if container < 0:
    raise SystemExit('Add season controls not found. No changes saved.')
block = block[:container] + field('season') + block[container:]
ui = ui[:start] + block + ui[end:]
start = ui.index('action="?/updateSeason"')
end = ui.index('</form>', start)
block = ui[start:end]
block = once(block, '<Dialog.Footer>', field('edit-season', True) + '\n<Dialog.Footer>')
ui = ui[:start] + block + ui[end:]

server = "import { parseSeasonPurse } from '$lib/season-purse';\n" + server
start = server.index('competition = {')
end = server.index('let eventsData', start)
block = server[start:end]
needle = "endsOn: String(s.endsOn ?? '') || null"
block = once(block, needle, needle + ",\n purseAmountCents: String(s.purseCurrency ?? '') ? Number(s.purseAmountCents ?? 0) : null,\n purseCurrency: String(s.purseCurrency ?? '')")
server = server[:start] + block + server[end:]
for action, next_action in [('createSeason', 'updateSeason'), ('updateSeason', 'archiveSeason')]:
    start = server.index(action + ': async')
    end = server.index(next_action + ': async', start)
    block = server[start:end]
    block = once(block, 'const form = await request.formData();', """const form = await request.formData();
  const purse = parseSeasonPurse(String(form.get('purseAmount') ?? ''));
  if (!purse.ok) return fail(400, { message: purse.message });""")
    needle = "endsOn: String(form.get('endsOn') ?? '') || null"
    block = once(block, needle, needle + ",\n ...(form.has('purseAmount') ? purse.value : {})")
    server = server[:start] + block + server[end:]

helper = r"""export interface SeasonPurse {
 purseAmountCents: number | null;
 purseCurrency: string;
}
export function parseSeasonPurse(input: string):
 | { ok: true; value: { purseAmountCents: number; purseCurrency: string } }
 | { ok: false; message: string } {
 const value = input.trim();
 if (!value) return { ok: true, value: { purseAmountCents: 0, purseCurrency: '' } };
 if (!/^\d+(?:\.\d{1,2})?$/.test(value) || value.length > 32) {
  return { ok: false, message: 'Enter a nonnegative USD purse with up to two decimal places, without commas.' };
 }
 const [whole, fraction = ''] = value.split('.');
 const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
 if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
  return { ok: false, message: 'The purse amount is too large.' };
 }
 return { ok: true, value: { purseAmountCents: Number(cents), purseCurrency: 'USD' } };
}
export function seasonPurseInput(season: SeasonPurse): string {
 if (season.purseAmountCents === null) return '';
 const cents = BigInt(season.purseAmountCents);
 return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function formatSeasonPurse(season: SeasonPurse): string {
 if (season.purseAmountCents === null) return 'Purse not set';
 const cents = BigInt(season.purseAmountCents);
 return `Season purse: USD $${(cents / 100n).toLocaleString('en-US')}.${String(cents % 100n).padStart(2, '0')}`;
}
"""
migration = """migrate((app) => {
 const seasons = app.findCollectionByNameOrId('seasons');
 seasons.fields.add(new NumberField({
  name: 'purseAmountCents', required: false, min: 0,
  max: 9007199254740991, onlyInt: true
 }));
 seasons.fields.add(new TextField({
  name: 'purseCurrency', required: false, max: 3, pattern: '^(USD)?$'
 }));
 app.save(seasons);
}, (app) => {
 const seasons = app.findCollectionByNameOrId('seasons');
 seasons.fields.removeByName('purseAmountCents');
 seasons.fields.removeByName('purseCurrency');
 app.save(seasons);
});
"""
hook = """/// <reference path=\"../pb_data/types.d.ts\" />
onRecordCreateRequest((e) => {
 const amount = Number(e.record.get('purseAmountCents') || 0);
 const currency = e.record.getString('purseCurrency');
 if (!Number.isSafeInteger(amount) || amount < 0 ||
  (currency !== '' && currency !== 'USD') || (amount > 0 && currency !== 'USD')) {
  throw new BadRequestError('The season purse requires nonnegative integer cents and USD currency.');
 }
 e.next();
}, 'seasons');
onRecordUpdateRequest((e) => {
 const amount = Number(e.record.get('purseAmountCents') || 0);
 const currency = e.record.getString('purseCurrency');
 if (!Number.isSafeInteger(amount) || amount < 0 ||
  (currency !== '' && currency !== 'USD') || (amount > 0 && currency !== 'USD')) {
  throw new BadRequestError('The season purse requires nonnegative integer cents and USD currency.');
 }
 e.next();
}, 'seasons');
"""
# Keep migration ordering stable and avoid replacing any existing feature files.
folder = root / 'pocketbase/pb_migrations'
stamp = max(1794430800, max(int(p.name.split('_')[0]) for p in folder.glob('[0-9]*_*.js')) + 1)
files = {
 component: ui, route: server,
 root / 'src/lib/season-purse.ts': helper,
 folder / f'{stamp}_season_purse.js': migration,
 root / 'pocketbase/pb_hooks/flihub_season_purse.pb.js': hook
}
for path in list(files)[2:]:
    if path.exists():
        raise SystemExit(f'File already exists: {path}. No changes saved.')
for path, contents in files.items():
    path.write_text('\n'.join(line.rstrip() for line in contents.splitlines()) + '\n')
print('Added season purse fields, forms, validation, and migration.')
print('Migration:', next(str(path) for path in files if path.name.endswith('_season_purse.js')))
