import type { Category, Expense } from "../types";

/**
 * Suggests a spending category (and Schedule C line) for a transaction.
 *
 * Two sources, in priority order:
 *   1. Your own history — what you chose last time for this merchant. Always wins,
 *      because your corrections should stick.
 *   2. A built-in merchant table, so a brand-new account still gets useful guesses.
 *
 * Suggestions are never applied silently to saved data; the UI always shows the
 * result for review.
 */

/** Merchant key: lowercase, strip reference numbers/punctuation, keep the first few words. */
export function merchantKey(raw: string): string {
  const cleaned = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\b\d{3,}\b/g, " ")      // store / reference numbers
    .replace(/\b(pos|ach|debit|credit|purchase|payment|store|inc|llc|co|corp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").slice(0, 3).join(" ");
}

export interface CategoryRule {
  /** Matched against the normalized merchant key. */
  match: RegExp;
  /** Resolved against the user's own category names, case-insensitively. */
  categoryName: string;
  /** Schedule C line id, when the merchant type implies one. */
  taxCategory?: string;
}

/** Common US merchants. Deliberately conservative — a wrong guess is worse than none. */
export const MERCHANT_RULES: CategoryRule[] = [
  // Fuel & vehicle
  { match: /\b(shell|chevron|exxon|mobil|bp|sunoco|marathon|valero|texaco|arco|speedway|circle k|wawa|quiktrip|racetrac|sheetz|caseys|pilot|flying j|loves)\b/, categoryName: "Transportation", taxCategory: "car" },
  { match: /\b(jiffy lube|valvoline|discount tire|firestone|midas|autozone|oreilly|advance auto|napa)\b/, categoryName: "Transportation", taxCategory: "car" },
  // Trade & jobsite supply
  { match: /\b(home depot|lowes|menards|ace hardware|harbor freight|tractor supply|northern tool|fastenal|grainger|ferguson|sherwin williams|white cap)\b/, categoryName: "Miscellaneous", taxCategory: "supplies" },
  // Office, software, shipping
  { match: /\b(staples|office depot|officemax|fedex|ups|usps|dhl)\b/, categoryName: "Miscellaneous", taxCategory: "office" },
  { match: /\b(adobe|microsoft|dropbox|zoom|quickbooks|godaddy|squarespace|wix|canva|notion|slack|google workspace|intuit)\b/, categoryName: "Miscellaneous", taxCategory: "office" },
  // Advertising
  { match: /\b(google ads|facebook ads|meta platforms|yelp|mailchimp|constant contact)\b/, categoryName: "Miscellaneous", taxCategory: "advertising" },
  // Food
  { match: /\b(starbucks|dunkin|chipotle|mcdonalds|subway|panera|chick fil a|taco bell|wendys|burger king|kfc|popeyes|jimmy johns|jersey mikes|five guys|in n out|whataburger|sonic|arbys|dominos|pizza hut|papa johns|dutch bros)\b/, categoryName: "Food & Dining", taxCategory: "meals" },
  { match: /\b(kroger|safeway|publix|albertsons|heb|wegmans|trader joes|whole foods|aldi|food lion|meijer|winco|sprouts|vons|ralphs|stop shop|costco|sams club|bjs)\b/, categoryName: "Food & Dining" },
  // Utilities & telecom
  { match: /\b(comcast|xfinity|spectrum|cox|centurylink|frontier|at t|verizon|t mobile|sprint)\b/, categoryName: "Utilities", taxCategory: "utilities" },
  { match: /\b(duke energy|pg e|con edison|national grid|dominion|xcel|ameren|entergy|water dept|city of)\b/, categoryName: "Utilities", taxCategory: "utilities" },
  // Insurance & professional
  { match: /\b(state farm|geico|progressive|allstate|nationwide|farmers ins|liberty mutual|hiscox|next insurance)\b/, categoryName: "Miscellaneous", taxCategory: "insurance" },
  { match: /\b(legalzoom|rocket lawyer|h r block|turbotax)\b/, categoryName: "Miscellaneous", taxCategory: "legal" },
  // Travel
  { match: /\b(marriott|hilton|hyatt|airbnb|holiday inn|best western|delta air|united air|american air|southwest air|jetblue|alaska air)\b/, categoryName: "Transportation", taxCategory: "travel" },
  { match: /\b(uber|lyft|hertz|enterprise rent|avis|budget rent|national car)\b/, categoryName: "Transportation", taxCategory: "travel" },
  // Health
  { match: /\b(cvs|walgreens|rite aid|quest diagnostics|labcorp|pharmacy)\b/, categoryName: "Healthcare" },
  // Entertainment / subscriptions
  { match: /\b(netflix|spotify|hulu|disney|hbo|max|paramount|peacock|youtube premium|audible|steam|playstation|xbox)\b/, categoryName: "Entertainment" },
  // Fitness (relevant for a trainer's own facility costs)
  { match: /\b(planet fitness|la fitness|equinox|golds gym|anytime fitness|crossfit|lifetime fitness)\b/, categoryName: "Entertainment" },
  // General retail — category only, no tax line (too ambiguous to guess).
  // Bank descriptors abbreviate, so match what statements actually print (AMZN, WM SUPERCENTER).
  { match: /\b(amazon|amzn|walmart|wal mart|wm supercenter|target|best buy|ebay|etsy)\b/, categoryName: "Miscellaneous" },
  // Housing
  { match: /\b(rent|mortgage|property mgmt|apartments)\b/, categoryName: "Housing" },
];

export interface Suggestion {
  categoryId?: string;
  taxCategory?: string;
  business?: boolean;
  businessPct?: number;
  source: "history" | "rule" | "none";
  /** How many past transactions backed a history match. */
  seen: number;
}

interface HistoryEntry {
  categoryId: string; taxCategory?: string; business: boolean; businessPct?: number;
  count: number; lastDate: string;
}

export type MerchantIndex = Map<string, HistoryEntry>;

/**
 * Builds the merchant → choice index from past expenses. Later transactions win
 * ties, so changing your mind about a merchant takes effect immediately.
 */
export function buildMerchantIndex(expenses: Expense[]): MerchantIndex {
  const index: MerchantIndex = new Map();
  for (const e of expenses) {
    const key = merchantKey(e.merchant || e.title);
    if (!key) continue;
    const prev = index.get(key);
    if (!prev) {
      index.set(key, {
        categoryId: e.categoryId, taxCategory: e.taxCategory, business: !!e.business,
        businessPct: e.businessPct, count: 1, lastDate: e.date,
      });
      continue;
    }
    prev.count++;
    if (e.date >= prev.lastDate) {
      prev.categoryId = e.categoryId;
      prev.taxCategory = e.taxCategory;
      prev.business = !!e.business;
      prev.businessPct = e.businessPct;
      prev.lastDate = e.date;
    }
  }
  return index;
}

/** Suggests a category for a description, preferring your own history over the built-in table. */
export function suggestCategory(
  description: string,
  index: MerchantIndex,
  categories: Category[],
): Suggestion {
  const key = merchantKey(description);
  if (!key) return { source: "none", seen: 0 };

  // 1. Exact merchant match from history.
  const hit = index.get(key);
  if (hit) {
    return {
      categoryId: hit.categoryId, taxCategory: hit.taxCategory,
      business: hit.business, businessPct: hit.businessPct,
      source: "history", seen: hit.count,
    };
  }

  // 2. Partial history match — one key contains the other (e.g. "shell oil" vs "shell").
  for (const [k, v] of index) {
    if (k.length >= 4 && (key.startsWith(k) || k.startsWith(key))) {
      return {
        categoryId: v.categoryId, taxCategory: v.taxCategory,
        business: v.business, businessPct: v.businessPct,
        source: "history", seen: v.count,
      };
    }
  }

  // 3. Built-in merchant table, resolved against this user's own category names.
  for (const rule of MERCHANT_RULES) {
    if (!rule.match.test(key)) continue;
    const cat = categories.find((c) => c.name.toLowerCase() === rule.categoryName.toLowerCase());
    if (!cat) continue;
    return { categoryId: cat.id, taxCategory: rule.taxCategory, source: "rule", seen: 0 };
  }

  return { source: "none", seen: 0 };
}

/** Human-readable reason, shown next to an auto-filled field. */
export function suggestionLabel(s: Suggestion): string {
  if (s.source === "history") {
    return s.seen > 1 ? `from your last ${s.seen} transactions here` : "from a previous transaction here";
  }
  if (s.source === "rule") return "recognised merchant";
  return "";
}
