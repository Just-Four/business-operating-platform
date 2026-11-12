// How the business works: one customer followed from first hearing about the business to coming back.

export type Moment = {
  key: "find" | "win" | "deliver" | "paid" | "keep";
  title: string;
  question: string;
  example: string;
  processName: string;
};

export const MOMENTS: Moment[] = [
  {
    key: "find",
    title: "They find you",
    question: "How does a customer first hear about you?",
    example: "A parent sees the open-morning poster at the library and fills in the form on the website.",
    processName: "Find customers",
  },
  {
    key: "win",
    title: "They say yes",
    question: "What happens between that first contact and them agreeing to buy?",
    example: "We reply the same day, book a visit, show them round, then send an offer and the agreement to sign.",
    processName: "Win a customer",
  },
  {
    key: "deliver",
    title: "You deliver",
    question: "What do you do for them once they've said yes?",
    example: "We settle the child in over a week, then care for them on their booked days.",
    processName: "Deliver what was sold",
  },
  {
    key: "paid",
    title: "They pay",
    question: "How and when do they pay you, and what happens if they're late?",
    example: "We invoice on the 1st for the month ahead, taken by direct debit. A late payer gets a call on the 5th.",
    processName: "Get paid",
  },
  {
    key: "keep",
    title: "They come back",
    question: "What makes them stay, buy again or recommend you?",
    example: "A weekly note to each parent, a review each term, and a thank-you for every family they refer.",
    processName: "Look after the customer",
  },
];

export type StoryRow = { moment: string; what_happens: string | null; who: string | null; needs: string | null; process_id: string | null };

export function storyCount(rows: StoryRow[] | null | undefined) {
  return MOMENTS.filter((m) => (rows ?? []).some((r) => r.moment === m.key && (r.what_happens ?? "").trim().length > 0)).length;
}
