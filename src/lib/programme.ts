// The guided planning programme: sessions, why each matters, and scheduling.

export type Route = "guided" | "focused" | "board" | "partial";

export type Session = {
  key: string;
  seq: number;
  title: string;
  minutes: number;
  why: string;
  skipCost: string;
  output: string;
  checkpoint?: boolean;
  built: boolean;
  boxes?: string[];
  part?: string;
};

export const SESSIONS: Session[] = [
  {
    key: "commit",
    seq: 1,
    title: "Why we plan, and the commitment",
    minutes: 20,
    why: "A plan turns the hundred decisions you'd otherwise make in a panic into a few you make once, calmly, in advance. It also gives you a fair way to judge yourself: against what you said you'd do, not against how the week felt.",
    skipCost: "Without a commitment to dates, planning slips behind the day-to-day and never gets finished. Most plans that fail were never completed.",
    output: "Session dates in your calendar and a date to have the plan signed off.",
    built: true,
  },
  {
    key: "who_pays",
    seq: 2,
    title: "Who pays you, and why they'd choose you",
    minutes: 40,
    why: "Everything else in the plan exists to serve the people who pay. If you're vague about who they are and why they'd pick you, your marketing, pricing and hiring will be vague too.",
    skipCost: "Businesses that skip this try to sell to everyone, and end up being nobody's first choice.",
    output: "Your customers, why they'd choose you, and how you'll keep them.",
    built: true,
    boxes: ["customer_segments", "value_proposition", "customer_relationships"],
  },
  {
    key: "deliver_money",
    seq: 3,
    title: "How you deliver, and how the money works",
    minutes: 45,
    why: "Now that you know who pays, work out what it takes to serve them and whether the money adds up. This is where many ideas quietly fail: the customer exists, but serving them costs more than they'll pay.",
    skipCost: "Skipping it means finding out the numbers don't work after you've spent the money.",
    output: "How customers reach you, what you need, what you do, who you rely on, and the money in and out.",
    built: true,
    boxes: ["channels", "key_activities", "key_resources", "key_partners", "revenue_streams", "cost_structure"],
  },
  {
    key: "evidence",
    seq: 4,
    title: "What do you actually know?",
    minutes: 45,
    why: "Most of what you've just written is belief, not fact. That's normal. This session sorts one from the other, so you spend your money and effort testing the beliefs that matter, not discovering them the hard way.",
    skipCost: "Plans built on untested beliefs feel solid until the first one turns out to be wrong, and by then it's expensive.",
    output: "Evidence against each part of your business model, and a clear list of what's still assumed.",
    built: true,
  },
  {
    key: "diagnosis",
    seq: 5,
    title: "The one thing most likely to stop you",
    minutes: 40,
    why: "Most plans fail because they're a list of goals with no diagnosis behind them. If you can't name the one thing most likely to stop you, every goal looks equally important and you spread yourself across all of them.",
    skipCost: "Without it you'll be busy on everything and decisive about nothing.",
    output: "The biggest obstacle, your approach to it, and three to five actions that work together.",
    built: true,
    part: "diagnosis",
  },
  {
    key: "checkpoint_1",
    seq: 6,
    title: "Have it reviewed",
    minutes: 45,
    why: "A second pair of eyes catches what you can't see from inside the business. The point is to be challenged, not approved: is this really who pays, and is that really the biggest obstacle? Run it past someone you trust, or have the AI review it.",
    skipCost: "Errors in the business model or diagnosis flow into every target that follows.",
    output: "Business model and diagnosis challenged and agreed.",
    checkpoint: true,
    built: true,
  },
  {
    key: "direction",
    seq: 7,
    title: "Where you're going",
    minutes: 30,
    why: "A destination stops this year's plan being a list of good ideas. Every target you set later should move you measurably towards it.",
    skipCost: "Without a destination, each year's plan is a fresh start and progress doesn't compound.",
    output: "Your purpose and the targets for the next three to five years.",
    built: true,
    part: "direction",
  },
  {
    key: "launch_path",
    seq: 8,
    title: "The path to first revenue",
    minutes: 50,
    why: "A new business can't plan from history, so it plans from what must be true. This session lists those beliefs, riskiest first, and sets milestones where you only spend more once the last one is met.",
    skipCost: "Without milestones, money gets spent before the riskiest beliefs are tested.",
    output: "Your riskiest assumptions with tests, and milestones to first revenue with spend limits.",
    built: true,
    part: "launch",
  },
  { key: "battles", seq: 9, title: "The three battles that decide the year", minutes: 45, why: "Focus wins. Three priorities that answer your diagnosis beat ten that don't.", skipCost: "", output: "Up to three Must-Win Battles.", built: true, part: "year" },
  { key: "numbers", seq: 10, title: "The numbers", minutes: 60, why: "Turn the battles into money: what's likely, what you'll promise, and what's possible.", skipCost: "", output: "The numbers in three cases, with a stress test.", built: true, part: "year" },
  { key: "quarter", seq: 11, title: "This quarter, and how you'll know", minutes: 45, why: "A year is too long to steer by. Quarters and weekly numbers tell you early when you're drifting.", skipCost: "", output: "Quarterly priorities and scorecards.", built: true, part: "quarter" },
  { key: "roles", seq: 12, title: "Who does what", minutes: 45, why: "Every target needs one owner, whether that's a person, an automation or an AI.", skipCost: "", output: "Role cards.", built: true, part: "team" },
  { key: "sign_off", seq: 13, title: "Final review and sign-off", minutes: 60, why: "A plan nobody has challenged is a hope. This is the last look at the whole thing before you commit to it.", skipCost: "", output: "The whole plan challenged, and your response to each challenge.", checkpoint: true, built: true },
  { key: "lock", seq: 14, title: "Lock the plan", minutes: 20, why: "A locked budget gives you something fair to measure against all year.", skipCost: "", output: "The plan locked and the weekly rhythm started.", built: true, part: "year" },
];

export function sessionByKey(key: string) {
  return SESSIONS.find((s) => s.key === key);
}

export function nextSession(key: string) {
  const s = sessionByKey(key);
  return s ? SESSIONS.find((x) => x.seq === s.seq + 1) : undefined;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Spread the given sessions over working days from start to deadline (inclusive).
export function schedule(keys: string[], start: Date, deadline: Date): Record<string, string> {
  const days: Date[] = [];
  for (let d = new Date(start); d <= deadline; d = addDays(d, 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days.push(new Date(d));
  }
  if (days.length === 0) days.push(new Date(start));
  const out: Record<string, string> = {};
  keys.forEach((k, i) => {
    const idx = keys.length <= 1 ? 0 : Math.round((i * (days.length - 1)) / (keys.length - 1));
    out[k] = iso(days[Math.min(idx, days.length - 1)]);
  });
  return out;
}

export function defaultDeadline(route: Route, from: Date) {
  return addDays(from, route === "focused" ? 9 : route === "partial" ? 9 : 16);
}

export const CANVAS_PLAIN: Record<string, { question: string; help: string }> = {
  customer_segments: { question: "Who will pay you?", help: "Name the types of customer, biggest first. Be specific enough that you could find them." },
  value_proposition: { question: "Why would they choose you?", help: "What problem do you solve for them, and why you rather than what they do today?" },
  customer_relationships: { question: "How will you win them and keep them?", help: "Personal service, contracts, self-service? What makes them come back?" },
  channels: { question: "How will they find you, buy and receive it?", help: "The route from first hearing about you to getting what they paid for." },
  key_activities: { question: "What must you do well every week?", help: "The handful of things that, done badly, would sink the business." },
  key_resources: { question: "What do you need to have?", help: "Premises, equipment, people, systems, cash, licences." },
  key_partners: { question: "Who do you rely on outside the business?", help: "Suppliers and partners you couldn't deliver without." },
  revenue_streams: { question: "What will they pay for, and how much?", help: "How they pay (per item, per month, per contract) and the price." },
  cost_structure: { question: "What will it cost to run?", help: "The biggest costs, and which rise as you sell more." },
};

export const TECH_TERM: Record<string, string> = {
  customer_segments: "Customer segments",
  value_proposition: "Value proposition",
  customer_relationships: "Customer relationships",
  channels: "Channels",
  key_activities: "Key activities",
  key_resources: "Key resources",
  key_partners: "Key partners",
  revenue_streams: "Revenue streams",
  cost_structure: "Cost structure",
};

// Session 8 for businesses that are already trading: a look back instead of a launch path.
export const LOOKBACK_SESSION = {
  title: "What last year taught you",
  minutes: 50,
  why: "Last year's misses become next year's assumptions. Looking honestly at where the numbers landed, and why, stops you planning the same mistakes again with more confidence.",
  skipCost: "Plans that skip this repeat last year's optimism. The same assumption that was wrong last time quietly goes back into the budget.",
  output: "Budget against actual for the key measures, the reasons for each gap, and the single biggest lesson.",
};

export function sessionTitle(key: string, stage?: string | null) {
  if (key === "launch_path" && stage && stage !== "launch") return LOOKBACK_SESSION.title;
  return sessionByKey(key)?.title ?? key;
}

export const LOOKBACK_MEASURES = [
  "Revenue",
  "Gross margin (%)",
  "Overheads",
  "Profit before tax and interest",
  "Closing cash",
  "Customers or units at year end",
  "New customers or sales won",
  "Utilisation or occupancy (%)",
];

// Focused route: the same steps grouped into six sittings.
export const FOCUSED_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Set up and commit", keys: ["commit"] },
  { title: "Your business model", keys: ["who_pays", "deliver_money", "evidence"] },
  { title: "Diagnosis and challenge", keys: ["diagnosis", "checkpoint_1"] },
  { title: "Direction and the path ahead", keys: ["direction", "launch_path"] },
  { title: "The year ahead", keys: ["battles", "numbers", "quarter", "roles"] },
  { title: "Sign-off", keys: ["sign_off", "lock"] },
];

// Short programmes for users who only need part of the plan.
export const PARTIAL_KEYS: Record<string, string[]> = {
  quarter: ["commit", "diagnosis", "checkpoint_1", "quarter", "roles"],
  refresh: ["commit", "who_pays", "deliver_money", "evidence", "diagnosis", "checkpoint_1", "direction"],
};

export function keysForRoute(route: Route, need?: string | null): string[] {
  if (route === "partial") return PARTIAL_KEYS[need ?? "refresh"] ?? PARTIAL_KEYS.refresh;
  return SESSIONS.map((s) => s.key);
}

// Dates for a route: focused shares one date per sitting; others get one date per session.
export function scheduleForRoute(route: Route, keys: string[], start: Date, deadline: Date): Record<string, string> {
  if (route !== "focused") return schedule(keys, start, deadline);
  const groups = FOCUSED_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => keys.includes(k)) })).filter((g) => g.keys.length);
  const groupDates = schedule(groups.map((g) => g.title), start, deadline);
  const out: Record<string, string> = {};
  for (const g of groups) for (const k of g.keys) out[k] = groupDates[g.title];
  return out;
}
