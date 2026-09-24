/**
 * BLUETORN CRM — Deterministic Property Matching Engine.
 *
 * Matches workspace properties against lead requirements using hard criteria:
 *   1. Property must be Active/Available
 *   2. Budget: property price <= lead budget (if specified)
 *   3. Location: case-insensitive substring match on location text
 *   4. Property Type: exact match against known types
 *   5. BHK / Bedrooms: numeric match from requirement text
 *   6. Excludes the lead's explicitly selected interested property (shown separately)
 *
 * Architecture supports future weighted scoring without rewrite.
 */

import type { Lead, Property } from "./db-types";

export interface PropertyMatch {
  property: Property;
  matchReasons: string[];
  /** 0–100 score for future ranking (currently binary: matched = 100) */
  score: number;
}

export interface MatchResult {
  matches: PropertyMatch[];
  /** True when the lead has no usable criteria to match against */
  insufficientCriteria: boolean;
}

/* ----------------------------- text parsing -------------------------------- */

const PROPERTY_TYPES = ["apartment", "villa", "plot", "commercial", "office", "warehouse"] as const;

const BHK_REGEX = /(\d)\s*(?:bhk|bed(?:room)?s?)/i;

/**
 * Extracts structured requirements from lead data.
 * Returns null for each field that the lead did not specify.
 */
function parseLeadRequirements(lead: Lead) {
  const req = (lead.requirement ?? "").trim().toLowerCase();
  const notes = (lead.notes ?? "").trim().toLowerCase();
  const combined = `${req} ${notes}`;

  // Budget
  const hasBudget = lead.budget != null && lead.budget > 0;

  // BHK
  const bhkMatch = BHK_REGEX.exec(combined);
  const bhk = bhkMatch ? parseInt(bhkMatch[1]!, 10) : null;

  // Property type
  let propertyType: string | null = null;
  for (const t of PROPERTY_TYPES) {
    if (combined.includes(t)) {
      propertyType = t;
      break;
    }
  }

  // Location keywords — extract meaningful location tokens from requirement text
  // Split on commas, "in", "at", "near" and filter out common non-location words
  const locationKeywords = extractLocationKeywords(req);

  return {
    hasBudget,
    budget: hasBudget ? lead.budget : null,
    bhk,
    propertyType,
    locationKeywords,
  };
}

const NON_LOCATION_WORDS = new Set([
  "bhk",
  "bed",
  "beds",
  "bedroom",
  "bedrooms",
  "apartment",
  "flat",
  "villa",
  "plot",
  "commercial",
  "office",
  "warehouse",
  "house",
  "home",
  "floor",
  "facing",
  "sea",
  "road",
  "near",
  "with",
  "and",
  "for",
  "the",
  "looking",
  "want",
  "need",
  "require",
  "requirement",
  "budget",
  "price",
  "max",
  "minimum",
  "maximum",
  "sqft",
  "sq",
  "ft",
  "area",
  "carpet",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "no",
  "requirement",
  "specified",
  "not",
  "any",
]);

function extractLocationKeywords(text: string): string[] {
  if (!text) return [];

  // Remove BHK patterns before extracting locations
  const cleaned = text.replace(BHK_REGEX, "").replace(/\d+/g, "");

  // Split on common delimiters
  const tokens = cleaned
    .split(/[,·;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const keywords: string[] = [];
  for (const token of tokens) {
    const words = token.split(/\s+/).filter((w) => w.length > 2 && !NON_LOCATION_WORDS.has(w));
    if (words.length > 0) {
      keywords.push(words.join(" "));
    }
  }

  return keywords.filter((k) => k.length > 2);
}

/* ----------------------------- matching core ------------------------------- */

/**
 * Match properties against a lead's requirements.
 *
 * Returns an empty matches array with `insufficientCriteria: true` when
 * the lead has no actionable criteria — preventing arbitrary property display.
 */
export function matchProperties(lead: Lead, allProperties: Property[]): MatchResult {
  const reqs = parseLeadRequirements(lead);

  // Check if the lead has ANY usable criteria
  const hasCriteria =
    reqs.hasBudget ||
    reqs.bhk !== null ||
    reqs.propertyType !== null ||
    reqs.locationKeywords.length > 0;

  if (!hasCriteria) {
    return { matches: [], insufficientCriteria: true };
  }

  const matches: PropertyMatch[] = [];

  for (const property of allProperties) {
    // Skip the lead's explicitly interested property (shown separately)
    if (lead.property_id && property.id === lead.property_id) continue;

    // Hard filter: must be Available
    if (property.status !== "Available") continue;

    const reasons: string[] = [];
    let disqualified = false;

    // Budget check
    if (reqs.hasBudget && reqs.budget !== null) {
      if (property.price > 0 && property.price <= reqs.budget) {
        reasons.push("Budget ✓");
      } else if (property.price > reqs.budget) {
        // Over budget — disqualified
        disqualified = true;
      }
      // price === 0 means price not set — don't disqualify but don't count as match reason
    }

    if (disqualified) continue;

    // Location check
    if (reqs.locationKeywords.length > 0) {
      const propLocation = (property.location ?? "").toLowerCase();
      if (propLocation) {
        const locationMatched = reqs.locationKeywords.some(
          (kw) =>
            propLocation.includes(kw) || kw.includes(propLocation.split(",")[0]?.trim() ?? ""),
        );
        if (locationMatched) {
          reasons.push("Location ✓");
        } else {
          // Location specified but doesn't match — disqualified
          disqualified = true;
        }
      }
    }

    if (disqualified) continue;

    // Property type check
    if (reqs.propertyType) {
      const propType = (property.type ?? "").toLowerCase();
      if (propType === reqs.propertyType) {
        reasons.push("Type ✓");
      } else {
        // Type specified but doesn't match — disqualified
        disqualified = true;
      }
    }

    if (disqualified) continue;

    // BHK check
    if (reqs.bhk !== null) {
      if (property.bedrooms !== null && property.bedrooms === reqs.bhk) {
        reasons.push(`${reqs.bhk} BHK ✓`);
      } else if (property.bedrooms !== null && property.bedrooms !== reqs.bhk) {
        // BHK specified and property has different BHK — disqualified
        disqualified = true;
      }
      // bedrooms null → don't disqualify (property doesn't have this info)
    }

    if (disqualified) continue;

    // Must have matched at least one positive reason
    if (reasons.length > 0) {
      matches.push({
        property,
        matchReasons: reasons,
        score: Math.min(100, reasons.length * 25),
      });
    }
  }

  // Sort by score descending, then by price ascending
  matches.sort((a, b) => b.score - a.score || a.property.price - b.property.price);

  return { matches, insufficientCriteria: false };
}
