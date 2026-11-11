export type Stage = "launch" | "early_revenue" | "established";
export type PartState = "on" | "yearly" | "short" | "until_exit" | "reduced" | "off";

export const STAGES: Record<Stage, string> = {
  launch: "Launch (no revenue yet)",
  early_revenue: "Early revenue",
  established: "Established or scaling",
};

export const MODELS: Record<string, string> = {
  recurring_contract: "Contracts or retainers",
  capacity: "Capacity: places, rooms, seats or beds",
  project_pipeline: "Projects won from a pipeline",
  transactional: "Sales to customers: shop, online, food",
  subscription: "Subscriptions: software or memberships",
  marketplace: "Marketplace or platform",
  courses_events: "Courses or events",
  other: "Other",
};

export const STATE_LABELS: Record<PartState, string> = {
  on: "On",
  yearly: "Check yearly",
  short: "Short version",
  until_exit: "Until first sales",
  reduced: "Shorter for a new business",
  off: "Off",
};

export type Part = {
  num: number;
  slug: string;
  title: string;
  summary: string;
  built: boolean;
  stages: Record<Stage, PartState>;
};

export const PARTS: Part[] = [
  {
    num: 1,
    slug: "canvas",
    title: "Business model",
    summary: "Nine boxes that say what the business is and how it makes money.",
    built: true,
    stages: { launch: "on", early_revenue: "yearly", established: "yearly" },
  },
  {
    num: 2,
    slug: "diagnosis",
    title: "Diagnosis",
    summary: "The single biggest challenge, the guiding policy, and the coordinated actions.",
    built: true,
    stages: { launch: "on", early_revenue: "on", established: "on" },
  },
  {
    num: 3,
    slug: "direction",
    title: "Direction",
    summary: "Purpose, the long-term target and the 3–5 year targets.",
    built: true,
    stages: { launch: "short", early_revenue: "on", established: "on" },
  },
  {
    num: 4,
    slug: "launch",
    title: "Launch plan",
    summary: "Assumptions to test and milestones to first revenue, with spend limits.",
    built: true,
    stages: { launch: "on", early_revenue: "until_exit", established: "off" },
  },
  {
    num: 5,
    slug: "year",
    title: "This year",
    summary: "Must-Win Battles, where sales will come from, the numbers in three cases, team, risks.",
    built: true,
    stages: { launch: "reduced", early_revenue: "on", established: "on" },
  },
  {
    num: 6,
    slug: "quarter",
    title: "This quarter",
    summary: "Three to five priorities, each with an owner, a number that shows it's done, and tasks.",
    built: true,
    stages: { launch: "on", early_revenue: "on", established: "on" },
  },
  {
    num: 7,
    slug: "scorecards",
    title: "Scorecards",
    summary: "Lead and lag measures for every priority and role, fed from real systems.",
    built: true,
    stages: { launch: "on", early_revenue: "on", established: "on" },
  },
  {
    num: 8,
    slug: "team",
    title: "Roles and team",
    summary: "Role cards with scorecard, instructions, route, fallback and approval gates.",
    built: true,
    stages: { launch: "on", early_revenue: "on", established: "on" },
  },
  {
    num: 9,
    slug: "rhythm",
    title: "Operating rhythm",
    summary: "The standing meetings that keep the plan alive: weekly, monthly, quarterly, yearly.",
    built: true,
    stages: { launch: "on", early_revenue: "on", established: "on" },
  },
  {
    num: 10,
    slug: "reviews",
    title: "Monthly review",
    summary: "The month on one page, what you learned, and what you decided.",
    built: true,
    stages: { launch: "on", early_revenue: "on", established: "on" },
  },
];

export const CANVAS_BOXES: { key: string; title: string; question: string }[] = [
  { key: "customer_segments", title: "Customer segments", question: "Who pays us? Name the types of customer, largest first." },
  { key: "value_proposition", title: "Value proposition", question: "What problem do we solve for each segment, and why us rather than the alternative?" },
  { key: "channels", title: "Channels", question: "How do customers find us, buy from us, and receive what they bought?" },
  { key: "customer_relationships", title: "Customer relationships", question: "How do we win them, keep them and grow them? Personal, contract, self-service?" },
  { key: "revenue_streams", title: "Revenue streams", question: "What do they pay for, how (per unit, per month, per contract), and at what price?" },
  { key: "key_resources", title: "Key resources", question: "What must we have to deliver: assets, people, systems, cash, licences?" },
  { key: "key_activities", title: "Key activities", question: "What must we do well every week to deliver and win business?" },
  { key: "key_partners", title: "Key partners", question: "Who do we rely on outside the business to deliver?" },
  { key: "cost_structure", title: "Cost structure", question: "What are the biggest costs, which are fixed and which vary with volume?" },
];

export const ASSUMPTION_STATUSES = ["untested", "testing", "proven", "disproven"] as const;
export const MILESTONE_STATUSES = ["not_started", "in_progress", "met", "missed"] as const;

export function label(value: string) {
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export type EvidenceStrength = "strong" | "medium" | "weak";

export const EVIDENCE_KINDS: { key: string; label: string; strength: EvidenceStrength; example: string; summary: string }[] = [
  { key: "signed_contract", label: "Signed contract", strength: "strong", example: "Customer or supplier agreement, signed by both sides", summary: "e.g. 12-month contract signed with a named customer" },
  { key: "booking_or_payment", label: "Order or payment", strength: "strong", example: "Purchase order, deposit or payment received", summary: "e.g. Purchase order received for the first 3 months" },
  { key: "own_trading_data", label: "Our own trading data", strength: "strong", example: "Sales, invoices, usage or accounts from our own records", summary: "e.g. Last quarter's sales report from the accounts" },
  { key: "written_commitment", label: "Written commitment", strength: "medium", example: "Letter of intent, or an email confirming they want to proceed", summary: "e.g. Email from a named customer confirming they will buy" },
  { key: "supplier_quote", label: "Written quote", strength: "medium", example: "A supplier's written price or terms", summary: "e.g. Supplier's written price for 12 months of supply" },
  { key: "independent_data", label: "Independent data", strength: "medium", example: "Market report, public statistics, industry data", summary: "e.g. Official statistics on the size of the market" },
  { key: "conversation", label: "Conversation", strength: "weak", example: "Call or meeting with no written follow-up", summary: "e.g. Call with a named buyer about what they need" },
  { key: "past_experience", label: "Past experience", strength: "weak", example: "What happened in a previous business or market", summary: "e.g. Results from a similar business we ran before" },
];

export const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  strong: "Strong",
  medium: "Medium",
  weak: "Weak",
};

export const STALE_DAYS: Record<EvidenceStrength, number> = { strong: 365, medium: 90, weak: 90 };

export function isStale(strength: EvidenceStrength, date: string) {
  const age = (Date.now() - new Date(date).getTime()) / 86_400_000;
  return age > STALE_DAYS[strength];
}

export type Grade = "empty" | "assumption" | "supported" | "proven";

export function gradeOf(hasAnswer: boolean, items: { strength: EvidenceStrength; evidence_date: string }[]): Grade {
  if (!hasAnswer) return "empty";
  const fresh = items.filter((i) => !isStale(i.strength, i.evidence_date));
  if (fresh.some((i) => i.strength === "strong")) return "proven";
  if (fresh.some((i) => i.strength === "medium")) return "supported";
  return "assumption";
}

export const ROUTES: Record<string, { label: string; help: string }> = {
  person: { label: "A person", help: "Someone in the team does it" },
  grok_bot: { label: "AI agent (Grok Bot)", help: "An always-on AI agent that can use a browser and apps" },
  claude: { label: "AI assistant (Claude)", help: "Drafting, analysis, research and reviews" },
  n8n: { label: "Automation (n8n)", help: "Routine steps with no judgement: data pulls, reminders, reports" },
  cheap_model: { label: "Low-cost AI model", help: "Small AI tasks inside automations: sorting, summarising, drafting" },
};

export const DEFAULT_GATES = [
  "Spend or commitment above the set limit",
  "Signing, accepting or changing any contract",
  "Contacting a client, supplier or partner for the first time or in a new way",
  "Changing prices, terms or published information",
];

export function weekStart(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - day + 1);
  return x.toISOString().slice(0, 10);
}

export function ragOf(value: number | null | undefined, target: number | null | undefined, betterWhen: string) {
  if (value === null || value === undefined || target === null || target === undefined || target === 0) return "none";
  const ratio = betterWhen === "lower" ? target / Math.max(value, 0.0001) : value / target;
  if (ratio >= 1) return "green";
  if (ratio >= 0.9) return "amber";
  return "red";
}
