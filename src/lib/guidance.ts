// Examples and defaults that follow how a business makes money (its revenue model).
// The framework's questions stay neutral; examples are drawn from a wide spread of sectors.

export type Guidance = {
  canvas: Record<string, string>;
  diagnosis: string;
  size: string;
  assumption: string;
  evidence: string;
  milestones: { name: string; description: string }[];
};

const m = (pairs: [string, string][]) => pairs.map(([name, description]) => ({ name, description }));

export const GUIDANCE: Record<string, Guidance> = {
  recurring_contract: {
    canvas: {
      customer_segments: "e.g. Firms with 10–50 staff and no in-house IT team",
      value_proposition: "e.g. Everything kept running for a fixed monthly fee, fixed within 4 hours",
      channels: "e.g. Referrals from accountants, LinkedIn, local business events",
      customer_relationships: "e.g. Named account manager, quarterly review meeting",
      revenue_streams: "e.g. Monthly fee per user on 12-month contracts",
      key_resources: "e.g. Engineers, monitoring software, service desk",
      key_activities: "e.g. Win contracts, resolve tickets, renew at the end of term",
      key_partners: "e.g. Software vendors, hardware suppliers, specialist contractors",
      cost_structure: "e.g. Engineer salaries, software licences, insurance",
    },
    diagnosis: "\"We lose clients at renewal faster than we win new ones\", not \"growth\".",
    size: "e.g. 120 clients on contract",
    assumption: "e.g. Clients will sign 12-month contracts rather than pay as they go",
    evidence: "e.g. Signed 12-month contract with a named client",
    milestones: m([
      ["Set up", "Company, insurance, contract terms, and the systems to deliver and invoice."],
      ["Demand proven", "Prospects confirm in writing they would sign on these terms."],
      ["First contract", "Signed, with start date and payment terms."],
      ["First month delivered", "Service delivered to standard and the first invoice paid."],
      ["First renewal or referral", "A client renews or refers another."],
      ["Repeatable", "Contracts won through marketing and partners, not only the founder's contacts."],
    ]),
  },
  capacity: {
    canvas: {
      customer_segments: "e.g. Working parents within 3 miles needing full-time childcare",
      value_proposition: "e.g. Open 7am to 7pm, outdoor learning, daily photo updates",
      channels: "e.g. Local search, parent groups, open days, word of mouth",
      customer_relationships: "e.g. Key worker per child, termly parent meetings",
      revenue_streams: "e.g. Fee per place per day, with funded hours",
      key_resources: "e.g. The premises, registered capacity, qualified staff",
      key_activities: "e.g. Fill places, keep staff ratios, pass inspections",
      key_partners: "e.g. Local authority, food supplier, training provider",
      cost_structure: "e.g. Staff, rent, food, insurance; staff rise with places filled",
    },
    diagnosis: "\"Places sit empty for weeks between one child leaving and the next starting\", not \"growth\".",
    size: "e.g. 3 sites, 180 places, 92% occupied",
    assumption: "e.g. We can fill 80% of places within 6 months of opening",
    evidence: "e.g. Waiting list of 40 families with deposits paid",
    milestones: m([
      ["Set up", "Company, premises, licences or registration, booking and payment systems."],
      ["Ready to open", "Capacity in place, inspected and able to take customers."],
      ["Demand proven", "Bookings, deposits or a waiting list before opening."],
      ["First paying customers", "Capacity in use and the first payments received."],
      ["Target occupancy", "Occupancy and price measured against the plan for a full period."],
      ["Repeatable", "Capacity fills through marketing, not personal contacts."],
    ]),
  },
  project_pipeline: {
    canvas: {
      customer_segments: "e.g. Marketing managers at mid-sized consumer brands",
      value_proposition: "e.g. Campaigns that prove their return, delivered in 6 weeks",
      channels: "e.g. Tenders, referrals, case studies, speaking at events",
      customer_relationships: "e.g. Project lead per client, post-project review",
      revenue_streams: "e.g. Fixed project fees in stages, plus day rates for changes",
      key_resources: "e.g. Specialist team, case studies, reputation",
      key_activities: "e.g. Build the pipeline, win pitches, deliver on time and budget",
      key_partners: "e.g. Freelancers, production companies, media buyers",
      cost_structure: "e.g. Salaries, freelancers, pitching time, software",
    },
    diagnosis: "\"We win work in bursts, then the team sits idle between projects\", not \"growth\".",
    size: "e.g. 40 projects a year, average value 35,000",
    assumption: "e.g. We win 1 in 4 pitches at our planned price",
    evidence: "e.g. Purchase order for phase 1 from a named client",
    milestones: m([
      ["Set up", "Company, insurance, terms of business, proposal and invoicing templates."],
      ["Pipeline built", "Named opportunities with value, stage and expected decision date."],
      ["First project won", "Signed proposal or purchase order."],
      ["First project delivered", "Delivered, signed off, and paid."],
      ["Win rate known", "Enough pitches to measure win rate and average value."],
      ["Repeatable", "Work arriving from referrals and marketing as well as the founder."],
    ]),
  },
  transactional: {
    canvas: {
      customer_segments: "e.g. Home coffee drinkers who buy specialty beans online",
      value_proposition: "e.g. Roasted to order, delivered within 3 days of roasting",
      channels: "e.g. Own website, marketplaces, social ads, local shops",
      customer_relationships: "e.g. Email list, reorder reminders, loyalty discount",
      revenue_streams: "e.g. Product sales, delivery charges",
      key_resources: "e.g. Stock, website, roasting equipment, brand",
      key_activities: "e.g. Buy stock, market, fulfil orders, handle returns",
      key_partners: "e.g. Suppliers, couriers, marketplaces",
      cost_structure: "e.g. Stock, packaging, delivery, advertising, platform fees",
    },
    diagnosis: "\"Advertising costs more than a new customer is worth\", not \"growth\".",
    size: "e.g. 50,000 orders a year",
    assumption: "e.g. 30% of customers will buy again within 3 months",
    evidence: "e.g. Shop report showing repeat purchase rate",
    milestones: m([
      ["Set up", "Company, supplier terms, website or premises, payments."],
      ["Product ready", "Stock or product available at a cost that leaves margin."],
      ["First sales", "First orders from people who aren't friends or family."],
      ["Unit economics known", "Cost to win a customer and margin per order measured."],
      ["Repeat customers", "Customers buying again without prompting."],
      ["Repeatable", "Sales arriving through channels that can be scaled."],
    ]),
  },
  subscription: {
    canvas: {
      customer_segments: "e.g. Independent salons that take bookings by phone",
      value_proposition: "e.g. Online booking and reminders that cut no-shows by half",
      channels: "e.g. Free trial, search, partnerships with suppliers",
      customer_relationships: "e.g. Self-service setup, in-app help, onboarding call",
      revenue_streams: "e.g. Monthly subscription per location, annual discount",
      key_resources: "e.g. The software, customer data, support team",
      key_activities: "e.g. Build product, convert trials, reduce cancellations",
      key_partners: "e.g. Payment provider, hosting, resellers",
      cost_structure: "e.g. Developers, hosting, marketing, support",
    },
    diagnosis: "\"Trials sign up but under 10% convert to paid\", not \"growth\".",
    size: "e.g. 2,000 paying subscribers",
    assumption: "e.g. 20% of trial users will convert to paid",
    evidence: "e.g. 30 paying subscribers after the first month",
    milestones: m([
      ["Set up", "Company, payments, terms, and the product usable end to end."],
      ["Demand proven", "Waiting list or pilot users actively using it."],
      ["First paying subscribers", "Customers paying without discounts or favours."],
      ["Retention known", "Monthly cancellation rate measured over at least 3 months."],
      ["Payback known", "Cost to win a subscriber against what they pay over time."],
      ["Repeatable", "Subscribers arriving through channels that can be scaled."],
    ]),
  },
  marketplace: {
    canvas: {
      customer_segments: "e.g. Homeowners needing small jobs done; local tradespeople wanting work",
      value_proposition: "e.g. Homeowners get vetted trades fast; trades fill gaps in their week",
      channels: "e.g. Search, local ads, trade associations, referrals",
      customer_relationships: "e.g. Self-service, reviews, dispute support",
      revenue_streams: "e.g. Commission per job, listing fee for trades",
      key_resources: "e.g. The platform, both sides of the market, reviews",
      key_activities: "e.g. Recruit supply, attract demand, keep quality high",
      key_partners: "e.g. Payment provider, vetting service, insurers",
      cost_structure: "e.g. Development, marketing to both sides, support, payment fees",
    },
    diagnosis: "\"Suppliers won't join until there are buyers, and buyers won't come until there are suppliers\", not \"growth\".",
    size: "e.g. 5,000 completed transactions a month",
    assumption: "e.g. Suppliers will pay 12% commission per transaction",
    evidence: "e.g. 25 suppliers signed up on the agreed terms",
    milestones: m([
      ["Set up", "Company, payments, terms, and the platform able to complete a transaction."],
      ["Supply proven", "First suppliers signed up on the agreed terms."],
      ["Demand proven", "First buyers transact without being hand-held."],
      ["First paid transaction", "A transaction completed and commission received."],
      ["Repeat use", "Both sides using it again without prompting."],
      ["Repeatable", "Both sides arriving through channels, not personal contacts."],
    ]),
  },
  courses_events: {
    canvas: {
      customer_segments: "e.g. Employers who must train staff in first aid",
      value_proposition: "e.g. Certified courses run on site, booked within a week",
      channels: "e.g. Search, HR networks, repeat clients, partnerships",
      customer_relationships: "e.g. Account manager for employers, renewal reminders",
      revenue_streams: "e.g. Fee per delegate or per course day",
      key_resources: "e.g. Certified trainers, course materials, accreditation",
      key_activities: "e.g. Fill courses, deliver training, keep accreditation",
      key_partners: "e.g. Accrediting body, venues, freelance trainers",
      cost_structure: "e.g. Trainers, venues, materials, certification fees",
    },
    diagnosis: "\"Courses run half-full, so most days barely cover the trainer\", not \"growth\".",
    size: "e.g. 300 course days and 3,000 delegates a year",
    assumption: "e.g. Courses will average 75% full at the planned price",
    evidence: "e.g. 22 paid bookings for the March course",
    milestones: m([
      ["Set up", "Company, course content, accreditation, booking and payment."],
      ["Demand proven", "Waiting list, enquiries or a free event showing real interest."],
      ["First course sold", "First paid places booked."],
      ["First course delivered", "Course run and feedback collected."],
      ["Full course", "A course filled at the planned price."],
      ["Repeatable", "Courses fill through marketing, not personal contacts."],
    ]),
  },
  other: {
    canvas: {
      customer_segments: "Who pays, largest group first",
      value_proposition: "The problem solved and why they'd choose you",
      channels: "How customers find you, buy, and receive it",
      customer_relationships: "How you win, keep and grow customers",
      revenue_streams: "What they pay for, how, and at what price",
      key_resources: "What you must have to deliver",
      key_activities: "What you must do well every week",
      key_partners: "Who you rely on outside the business",
      cost_structure: "The biggest costs, fixed and variable",
    },
    diagnosis: "name the specific obstacle, not a goal like \"growth\".",
    size: "e.g. customers, sites, units or staff",
    assumption: "e.g. Customers will pay the planned price",
    evidence: "e.g. Signed order from a named customer",
    milestones: m([
      ["Set up", "Company, insurance, contracts and the systems to sell, deliver and invoice."],
      ["Demand proven", "Customer interest turned into written commitments or pre-orders."],
      ["Delivery proven", "It can be delivered at a cost that works in the numbers."],
      ["First paying customer", "Signed or paid, with a start date and terms."],
      ["First delivery and payment", "Delivered and the first invoice paid."],
      ["Repeatable", "A second customer won without the founder doing everything personally."],
    ]),
  },
};

export function guidanceFor(model: string | null | undefined): Guidance {
  return GUIDANCE[model ?? "other"] ?? GUIDANCE.other;
}
