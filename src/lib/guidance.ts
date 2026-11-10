// Model-specific examples and defaults. The framework's questions stay neutral;
// everything here changes with the business model the business is set to.

export type Guidance = {
  canvas: Record<string, string>;
  diagnosis: string;
  size: string;
  assumption: string;
  evidence: string;
  milestones: { name: string; description: string }[];
};

const GENERIC_MILESTONES = [
  { name: "Set up", description: "Company, bank, insurance, contracts and the systems to sell, deliver and invoice." },
  { name: "Demand proven", description: "First customer conversations turned into written interest or pre-orders." },
  { name: "Delivery proven", description: "The product or service can be delivered at a cost that works in the numbers." },
  { name: "First paying customer", description: "Signed or paid, with a start date and terms." },
  { name: "First delivery and payment", description: "Delivered to the customer and the first invoice paid." },
  { name: "Repeatable", description: "A second customer won and served without the founder doing everything personally." },
];

export const GUIDANCE: Record<string, Guidance> = {
  workforce_accommodation: {
    canvas: {
      customer_segments: "e.g. Engineering contractors on long projects; rail and grid maintenance crews",
      value_proposition: "e.g. Furnished homes near site, ready in 10 days, one monthly invoice",
      channels: "e.g. Direct sales to project managers, referrals, tender portals",
      customer_relationships: "e.g. Account manager per client, weekly occupancy report",
      revenue_streams: "e.g. Per bed per night on 3–12 month contracts, invoiced monthly",
      key_resources: "e.g. Leased properties, furniture, vehicles, booking system",
      key_activities: "e.g. Source and set up properties, fill beds, handle guest issues",
      key_partners: "e.g. Landlords, build-to-rent operators, cleaning firms",
      cost_structure: "e.g. Rent, utilities, cleaning, furniture, staff",
    },
    diagnosis: "\"We have contracts but can't secure beds fast enough\", not \"growth\".",
    size: "e.g. 1,200 beds",
    assumption: "e.g. We can lease 3-bed houses near the sites for under 9,000 kr a month",
    evidence: "e.g. Jones Engineering emailed to confirm 12 beds from March",
    milestones: [
      { name: "Set up", description: "Company, bank, insurance, contracts, booking and accounts systems." },
      { name: "Demand proven", description: "First client conversations; written interest or a letter of intent." },
      { name: "Supply proven", description: "First properties secured at a cost that works in the numbers." },
      { name: "First contract", description: "Signed, with start date and payment terms." },
      { name: "First occupancy", description: "Guests in beds and the first invoice paid." },
      { name: "Repeatable", description: "A second client and a second property won without the operator doing everything personally." },
    ],
  },
  booking_platform: {
    canvas: {
      customer_segments: "e.g. Guests booking stays; property owners listing them",
      value_proposition: "e.g. Guests find verified stays fast; owners fill empty nights",
      channels: "e.g. Search, paid ads, partner sites, owner referrals",
      customer_relationships: "e.g. Self-service booking, owner dashboard, support chat",
      revenue_streams: "e.g. Commission per booking, owner subscription",
      key_resources: "e.g. The platform, listings, payment processing, reviews",
      key_activities: "e.g. Sign up owners, market to guests, resolve disputes",
      key_partners: "e.g. Property owners, payment provider, channel managers",
      cost_structure: "e.g. Development, hosting, marketing, payment fees, support",
    },
    diagnosis: "\"Owners won't list until there are guests, and guests won't come until there are listings\", not \"growth\".",
    size: "e.g. 2,000 listings, 30,000 bookings a year",
    assumption: "e.g. Owners will pay 12% commission per booking",
    evidence: "e.g. 15 owners signed listing agreements in the first month",
    milestones: [
      { name: "Set up", description: "Company, payments, terms, and the platform able to take a booking." },
      { name: "Supply proven", description: "First owners have listed properties on the agreed terms." },
      { name: "Demand proven", description: "First guests found and booked without being hand-held." },
      { name: "First paid booking", description: "A booking completed and commission received." },
      { name: "Repeat bookings", description: "Guests and owners using it again without prompting." },
      { name: "Repeatable", description: "Owners and guests arriving through channels, not personal contacts." },
    ],
  },
  hospitality: {
    canvas: {
      customer_segments: "e.g. Leisure couples, walkers, business travellers",
      value_proposition: "e.g. Sea views, local breakfast, walking routes from the door",
      channels: "e.g. Booking.com, Airbnb, own website, repeat guests",
      customer_relationships: "e.g. Personal welcome, follow-up for reviews, return-guest offer",
      revenue_streams: "e.g. Room rate per night by season, breakfast, extras",
      key_resources: "e.g. The property, rooms, listings and reviews",
      key_activities: "e.g. Manage listings and pricing, cleaning, guest care",
      key_partners: "e.g. Booking sites, cleaners, laundry, local suppliers",
      cost_structure: "e.g. Mortgage or rent, platform fees, cleaning, utilities",
    },
    diagnosis: "\"We're full in summer and empty from November to March\", not \"growth\".",
    size: "e.g. 4 properties, 70% year-round occupancy",
    assumption: "e.g. We can achieve 65% occupancy outside the summer season",
    evidence: "e.g. October bookings report from the channel manager",
    milestones: [
      { name: "Set up", description: "Licences, insurance, listings, pricing and payment set up." },
      { name: "Ready to open", description: "Rooms finished, photographed and inspected." },
      { name: "First bookings", description: "First paid bookings taken." },
      { name: "First reviews", description: "First guests stayed and reviews received." },
      { name: "Season one", description: "Occupancy and rate measured across a full season." },
      { name: "Repeatable", description: "Bookings arriving without the owner chasing them." },
    ],
  },
  training_events: {
    canvas: {
      customer_segments: "e.g. New property investors, employers training staff",
      value_proposition: "e.g. A practical course that gets them to their first deal",
      channels: "e.g. Free webinars, social media, the book, referrals",
      customer_relationships: "e.g. Community group, follow-up coaching, alumni events",
      revenue_streams: "e.g. Course fees, coaching packages, corporate contracts",
      key_resources: "e.g. Course content, trainers, venue or platform, reputation",
      key_activities: "e.g. Fill courses, deliver training, keep content up to date",
      key_partners: "e.g. Venues, guest speakers, industry bodies",
      cost_structure: "e.g. Trainers, venues, marketing, platform fees",
    },
    diagnosis: "\"People attend the free webinar but don't buy the course\", not \"growth\".",
    size: "e.g. 40 courses and 800 delegates a year",
    assumption: "e.g. 10% of webinar attendees will buy the paid course",
    evidence: "e.g. 22 paid bookings from the September webinar",
    milestones: [
      { name: "Set up", description: "Company, course outline, booking and payment system." },
      { name: "Demand proven", description: "Free event or waiting list shows real interest." },
      { name: "First course sold", description: "First paid places booked." },
      { name: "First course delivered", description: "Course run and feedback collected." },
      { name: "Full course", description: "A course filled at the planned price." },
      { name: "Repeatable", description: "Courses fill through marketing, not personal contacts." },
    ],
  },
  professional_services: {
    canvas: {
      customer_segments: "e.g. Owner-managed businesses with 10–50 staff",
      value_proposition: "e.g. Fixed-fee advice that saves them a full-time hire",
      channels: "e.g. Referrals, LinkedIn, partner introductions",
      customer_relationships: "e.g. Named adviser, monthly review meetings",
      revenue_streams: "e.g. Monthly retainers, project fees, day rates",
      key_resources: "e.g. Expertise, people, reputation, case studies",
      key_activities: "e.g. Win clients, deliver projects, keep clients renewing",
      key_partners: "e.g. Accountants, lawyers, specialist freelancers",
      cost_structure: "e.g. Salaries, contractors, insurance, software",
    },
    diagnosis: "\"Every new client depends on the founder's time\", not \"growth\".",
    size: "e.g. 60 clients on retainer, a team of 12",
    assumption: "e.g. Clients will pay a monthly retainer rather than per project",
    evidence: "e.g. Signed engagement letter with ABC Ltd",
    milestones: GENERIC_MILESTONES,
  },
  retail_ecommerce: {
    canvas: {
      customer_segments: "e.g. Outdoor enthusiasts buying kit online",
      value_proposition: "e.g. Tested gear, next-day delivery, free returns",
      channels: "e.g. Own website, marketplaces, social ads, shop",
      customer_relationships: "e.g. Email list, loyalty discounts, reviews",
      revenue_streams: "e.g. Product sales, delivery charges, subscriptions",
      key_resources: "e.g. Stock, website, supplier relationships, brand",
      key_activities: "e.g. Buy stock, market, fulfil orders, handle returns",
      key_partners: "e.g. Suppliers, couriers, marketplaces",
      cost_structure: "e.g. Stock, delivery, advertising, platform fees",
    },
    diagnosis: "\"Advertising costs more than a new customer is worth\", not \"growth\".",
    size: "e.g. 50,000 orders a year",
    assumption: "e.g. Customers will buy again within 6 months",
    evidence: "e.g. Shopify report: 31% repeat purchase rate",
    milestones: GENERIC_MILESTONES,
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
    diagnosis: "Name the specific obstacle, not a goal like \"growth\".",
    size: "e.g. customers, sites, units or staff",
    assumption: "e.g. Customers will pay the planned price",
    evidence: "e.g. Signed order from a named customer",
    milestones: GENERIC_MILESTONES,
  },
};

export function guidanceFor(model: string | null | undefined): Guidance {
  return GUIDANCE[model ?? "other"] ?? GUIDANCE.other;
}
