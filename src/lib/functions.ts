// The seven parts of every business. Three do the work, two hold it up, two steer.
// The name is what is stored on a process, a role and an owner.

export type Tier = "steer" | "work" | "hold";
export type Fn = {
  key: string;
  name: string;
  tier: Tier;
  job: string;
  why: string;
  good: string;
  usual: string[];
  funder: string;
};

export const TIERS: { key: Tier; label: string }[] = [
  { key: "steer", label: "Steers the business" },
  { key: "work", label: "Does the work, from first contact to a customer who comes back" },
  { key: "hold", label: "Holds it up" },
];

export const FUNCTIONS: Fn[] = [
  {
    key: "leadership",
    name: "Leadership",
    tier: "steer",
    job: "Decides where the business is going",
    why: "Someone has to choose what the business will and won't do. Without that, everyone is busy and nothing adds up.",
    good: "You can say in a sentence what this year has to deliver, and what you have decided not to do.",
    usual: ["Set the plan for the year", "Decide the big commitments", "Reset the priorities each quarter"],
    funder: "Who makes the decisions, and what have they run before?",
  },
  {
    key: "management",
    name: "Management",
    tier: "steer",
    job: "Keeps the work to the plan",
    why: "A plan only happens if someone checks each week that the work is being done and fixes what is stuck.",
    good: "Every piece of work has one owner, and you find out within a week when something slips.",
    usual: ["Run the weekly check-in", "Hold the monthly review", "Approve spending and contracts"],
    funder: "How will you know, early, that the plan is going wrong?",
  },
  {
    key: "sales",
    name: "Sales and marketing",
    tier: "work",
    job: "Finds and wins customers",
    why: "Without a steady way to win customers, no other part of the business has work to do.",
    good: "You can say where the next ten customers will come from, and who follows up every enquiry within a day.",
    usual: ["Find customers", "Answer an enquiry", "Make the offer and agree the sale", "Hand the customer over to delivery"],
    funder: "What does it cost to win one customer, and how do you know?",
  },
  {
    key: "operations",
    name: "Operations",
    tier: "work",
    job: "Delivers what was sold and looks after the customer",
    why: "This is where the promise you made to the customer is kept or broken.",
    good: "The customer gets what they were promised, to the same standard, whoever does the work.",
    usual: ["Deliver what was sold", "Check the quality before it goes out", "Deal with a complaint", "Look after the customer"],
    funder: "Can you deliver at twice the volume without the quality dropping?",
  },
  {
    key: "finance",
    name: "Finance",
    tier: "work",
    job: "Gets the business paid and minds the cash",
    why: "Businesses fail when the cash runs out, even when they are busy and making a profit on paper.",
    good: "Invoices go out on the day, late payers are chased on a set day, and you know how many months of bills the cash covers.",
    usual: ["Send the invoice", "Chase a late payment", "Pay the bills", "Close the month and check the cash"],
    funder: "How long does the cash last if sales come in late?",
  },
  {
    key: "legal",
    name: "Legal",
    tier: "hold",
    job: "Protects the business: contracts, licences, insurance",
    why: "One bad contract or a missing licence can undo years of work, and it is cheap to prevent.",
    good: "Every customer and supplier is on written terms, and you know the date each licence and policy runs out.",
    usual: ["Agree and sign a contract", "Renew licences and insurance", "Keep customer information safe"],
    funder: "What could stop you trading, and what protects you from it?",
  },
  {
    key: "hr",
    name: "HR",
    tier: "hold",
    job: "The people and the agents who do the work",
    why: "The work is only as good as the people doing it, and a founder doing everything is the usual limit on growth.",
    good: "Every part of the business has an owner, new people can follow the written steps from day one, and you know who you need next.",
    usual: ["Take someone on", "Get a new person started", "Pay the team", "Review how someone is doing"],
    funder: "Who is in the team, what have they done before, and who is missing?",
  },
];

export const FUNCTION_NAMES = FUNCTIONS.map((f) => f.name);

export function fnByKey(key: string) {
  return FUNCTIONS.find((f) => f.key === key);
}
export function fnByName(name: string | null | undefined) {
  return FUNCTIONS.find((f) => f.name === name);
}

// Which part of the business each moment of the customer's journey belongs to.
export const MOMENT_FUNCTION: Record<string, string> = {
  find: "Sales and marketing",
  win: "Sales and marketing",
  deliver: "Operations",
  paid: "Finance",
  keep: "Operations",
};

export type FnStatus = { tone: "go" | "wait" | "stop" | "quiet"; text: string };

// Ready means the part has a process, an owner and a number.
export function fnStatus(nProcesses: number, nOwners: number, nNumbers: number): FnStatus {
  if (nProcesses && nOwners && nNumbers) return { tone: "go", text: "Ready" };
  if (!nProcesses && !nOwners && !nNumbers) return { tone: "quiet", text: "Not started" };
  if (!nOwners) return { tone: "stop", text: "No owner" };
  if (!nProcesses) return { tone: "wait", text: "No process yet" };
  return { tone: "wait", text: "No numbers yet" };
}

type Sb = import("@supabase/supabase-js").SupabaseClient;

export type FnSummary = {
  fn: Fn;
  processes: { id: string; name: string }[];
  owners: string[];
  ownerIds: string[];
  roles: { id: string; name: string; holders: string[] }[];
  numbers: { id: string; name: string; target: number | null; unit: string | null; role: string }[];
  status: FnStatus;
};

// Everything known about each part of the business, read once.
export async function getFunctions(supabase: Sb, businessId: string): Promise<{ parts: FnSummary[]; people: { id: string; name: string }[] }> {
  const [{ data: procs }, { data: roles }, { data: links }, { data: people }, { data: owners }, { data: measures }] = await Promise.all([
    supabase.from("processes").select("id, name, function").eq("business_id", businessId).order("created_at"),
    supabase.from("roles").select("id, name, department").eq("business_id", businessId).eq("active", true).order("created_at"),
    supabase.from("role_assignments").select("role_id, member_id").eq("business_id", businessId),
    supabase.from("team_members").select("id, name").eq("business_id", businessId).eq("active", true).order("created_at"),
    supabase.from("function_owners").select("function, member_id").eq("business_id", businessId),
    supabase.from("measures").select("id, name, target, unit, role_id").eq("business_id", businessId).eq("active", true),
  ]);
  const nameOf = (id: string) => (people ?? []).find((p) => p.id === id)?.name;
  const parts = FUNCTIONS.map((fn) => {
    const fRoles = (roles ?? []).filter((r) => r.department === fn.name);
    const roleList = fRoles.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      holders: (links ?? []).filter((l) => l.role_id === r.id).map((l) => nameOf(l.member_id)).filter((n): n is string => !!n),
    }));
    const ownerIds = (owners ?? []).filter((o) => o.function === fn.name && nameOf(o.member_id)).map((o) => o.member_id as string);
    // Someone holding a role in this part is carrying it, even if no owner has been named.
    const names = Array.from(new Set([...ownerIds.map((id) => nameOf(id) as string), ...roleList.flatMap((r) => r.holders)]));
    const fProcs = (procs ?? []).filter((p) => p.function === fn.name).map((p) => ({ id: p.id as string, name: p.name as string }));
    const numbers = (measures ?? [])
      .filter((m) => fRoles.some((r) => r.id === m.role_id))
      .map((m) => ({ id: m.id as string, name: m.name as string, target: m.target as number | null, unit: m.unit as string | null, role: fRoles.find((r) => r.id === m.role_id)?.name ?? "" }));
    return { fn, processes: fProcs, owners: names, ownerIds, roles: roleList, numbers, status: fnStatus(fProcs.length, names.length, numbers.length) };
  });
  return { parts, people: (people ?? []).map((p) => ({ id: p.id as string, name: p.name as string })) };
}
