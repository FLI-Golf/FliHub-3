/// <reference path="../pb_data/types.d.ts" />
// Existing rounds collection rules enforce Owner/Admin access and organization scope.
onRecordUpdateRequest((e) => {
  const readSchedule = (record) => {
    const value = record.get('teeSchedule');
    if (!value) return null;
    if (typeof value === 'object' && Array.isArray(value.slots)) return value;
    try {
      return JSON.parse(String(value));
    } catch (_) {
      throw new BadRequestError('Invalid tee schedule JSON.');
    }
  };
  const schedule = readSchedule(e.record);
  const previousSchedule = readSchedule(e.record.original());
  if (JSON.stringify(schedule) === JSON.stringify(previousSchedule)) return e.next();
  const org = e.app.findRecordById(
    "organizations",
    e.record.getString("organization"),
  );
  const caps = JSON.parse(String(org.get("capabilities") || "[]"));
  if (!Array.isArray(caps) || !caps.includes("events"))
    throw new BadRequestError("Events capability is disabled.");
  const eventId = e.record.getString("event");
  const event = e.app.findRecordById("events", eventId);
  if (
    e.record.getString("status") !== "active" ||
    event.getString("status") === "archived"
  )
    throw new BadRequestError(
      "Scheduling requires an active round and current event.",
    );
  const cards = e.app.findRecordsByFilter(
    "scorecards",
    "round = {:round}",
    "",
    1,
    0,
    { round: e.record.id },
  );
  if (cards.length)
    throw new BadRequestError(
      "Scoring has started for this round. Its tee schedule is locked.",
    );
  if (
    !schedule ||
    !Array.isArray(schedule.slots) ||
    typeof schedule.timeZone !== "string" ||
    !schedule.timeZone ||
    !Number.isInteger(schedule.intervalMinutes) ||
    schedule.intervalMinutes < 1 ||
    schedule.intervalMinutes > 240
  )
    throw new BadRequestError("Invalid tee schedule.");
  const groups = e.app.findRecordsByFilter(
    "event_groups",
    "event = {:event} && status = 'active'",
    "",
    0,
    0,
    { event: eventId },
  );
  if (!groups.length || schedule.slots.length !== groups.length)
    throw new BadRequestError(
      "Schedule every active group exactly once. Refresh after changing groups.",
    );
  const seen = new Set();
  let previous = -Infinity;
  for (const slot of schedule.slots) {
    if (
      !slot ||
      typeof slot.group !== "string" ||
      seen.has(slot.group) ||
      !groups.some((group) => group.id === slot.group)
    )
      throw new BadRequestError("Invalid or repeated group in the schedule.");
    const instant = new Date(slot.startsAt).getTime();
    if (
      !isFinite(instant) ||
      new Date(instant).toISOString() !== slot.startsAt ||
      instant <= previous
    )
      throw new BadRequestError(
        "Tee times must be valid and strictly increasing in group order.",
      );
    seen.add(slot.group);
    previous = instant;
  }
  e.next();
}, "rounds");

onRecordCreateRequest((e) => {
  const raw = e.record.get('teeSchedule');
  const empty = !raw || String(raw) === 'null' || String(raw) === '';
  if (!empty) {
    throw new BadRequestError('Create the round first, then save its tee schedule.');
  }
  e.next();
}, 'rounds');
