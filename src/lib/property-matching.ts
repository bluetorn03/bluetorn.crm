/**
 * BLUETORN CRM — Declarative Property Matching Engine.
 *
 * Centralized, declarative matching architecture evaluating all applicable lead requirements:
 *   1. Property must be Available (hard filter)
 *   2. Budget: property price <= lead budget
 *   3. Location: canonical option or location keyword match
 *   4. Requirement (Property Type & Bedrooms/BHK)
 *   5. Purpose: residential vs commercial/investment compatibility
 *   6. Possession Timeline: immediate vs under construction alignment
 *   7. Phase: ready to move vs under construction alignment
 *   8. Transaction Timeline: readiness alignment
 *
 * Future-proof contract:
 *   - Any new lead requirement field registers in MATCHING_RULES.
 *   - Fields without a property-side counterpart have isMatchable: false and do not distort matching.
 *   - Unspecified lead fields never exclude valid properties (no false negatives).
 *   - Explicit mismatches disqualify properties (no false positives).
 *   - Prevents matching solely on budget when other specified criteria fail.
 */

import type { Lead, Property } from "./db-types";

export interface PropertyMatch {
  property: Property;
  matchReasons: string[];
  /** 0–100 weighted match score */
  score: number;
}

export interface MatchResult {
  matches: PropertyMatch[];
  /** True when the lead has no usable criteria to match against */
  insufficientCriteria: boolean;
}

export interface EvaluationResult {
  /** Whether this criterion was active/specified on the lead */
  active: boolean;
  /** Whether the property positively matched this criterion */
  matched: boolean;
  /** Whether the property violated an explicit requirement and must be disqualified */
  disqualified: boolean;
  /** User-friendly label for match reasons (e.g. "Budget ✓", "Location (Ulwe) ✓") */
  reason?: string | undefined;
  /** Points contributed to match score */
  scoreContribution: number;
}

export interface MatchingContractRule {
  id: string;
  label: string;
  leadField: keyof Lead | string;
  propertyField?: keyof Property | string;
  /** Explicit non-matchable flag for fields without a property-side representation */
  isMatchable: boolean;
  /** Evaluates this criterion for a given lead and property */
  evaluate: (lead: Lead, property: Property, context: MatchingContext) => EvaluationResult;
}

export interface MatchingContext {
  parsedBhk: number | null;
  parsedPropertyType: string | null;
  extractedLocationKeywords: string[];
}

/* ----------------------------- text parsing -------------------------------- */

const PROPERTY_TYPES = ["apartment", "villa", "plot", "commercial", "office", "warehouse"] as const;
const BHK_REGEX = /(\d)\s*(?:bhk|bed(?:room)?s?)/i;

const NON_LOCATION_WORDS = new Set([
  "bhk", "bed", "beds", "bedroom", "bedrooms",
  "apartment", "flat", "villa", "plot", "commercial", "office", "warehouse", "shop", "showroom",
  "house", "home", "floor", "facing", "sea", "road", "near", "with", "and", "or", "in", "at", "around",
  "for", "the", "looking", "want", "need", "require", "requirement", "requirements",
  "budget", "price", "max", "minimum", "maximum", "sqft", "sq", "ft", "area", "size",
  "carpet", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
  "no", "specified", "not", "any", "ready", "move", "possession",
  "luxury", "luxurious", "spacious", "space", "prime", "urgent", "good", "best", "affordable",
  "investment", "invest", "self", "use", "under", "construction", "immediate",
]);

function extractLocationKeywords(text: string): string[] {
  if (!text) return [];

  // 1. Try matching location phrases explicitly preceded by prepositions: "in <loc>", "at <loc>", "near <loc>", "around <loc>"
  const prepRegex = /\b(?:in|at|near|around|towards)\s+([a-zA-Z0-9\s-]+?)(?=[,.;·/|]|$|\b(?:with|for|budget|having|under|urgent|within)\b)/gi;
  const keywords: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = prepRegex.exec(text)) !== null) {
    const raw = m[1]?.trim() ?? "";
    const words = raw.split(/\s+/).filter((w) => w.length > 2 && !NON_LOCATION_WORDS.has(w.toLowerCase()));
    if (words.length > 0) {
      keywords.push(words.join(" "));
    }
  }

  if (keywords.length > 0) {
    return keywords.filter((k) => k.length > 2);
  }

  // 2. If no prepositions found, do not treat random descriptive words as locations to avoid false disqualifications
  return [];
}

function parseLeadRequirementText(lead: Lead): MatchingContext {
  const req = (lead.requirement ?? "").trim().toLowerCase();
  const notes = (lead.notes ?? "").trim().toLowerCase();
  const combined = `${req} ${notes}`;

  const bhkMatch = BHK_REGEX.exec(combined);
  const parsedBhk = bhkMatch ? parseInt(bhkMatch[1]!, 10) : null;

  let parsedPropertyType: string | null = null;
  for (const t of PROPERTY_TYPES) {
    if (combined.includes(t)) {
      parsedPropertyType = t;
      break;
    }
  }

  const extractedLocationKeywords = extractLocationKeywords(req);

  return {
    parsedBhk,
    parsedPropertyType,
    extractedLocationKeywords,
  };
}

/* ----------------------- declarative matching rules ------------------------ */

export const MATCHING_RULES: MatchingContractRule[] = [
  // 1. Budget Rule
  {
    id: "budget",
    label: "Budget",
    leadField: "budget",
    propertyField: "price",
    isMatchable: true,
    evaluate: (lead, property) => {
      const hasBudget = lead.budget != null && lead.budget > 0;
      if (!hasBudget) {
        return { active: false, matched: false, disqualified: false, scoreContribution: 0 };
      }

      const budget = Number(lead.budget);
      const price = Number(property.price ?? 0);

      if (price > 0 && price <= budget) {
        return {
          active: true,
          matched: true,
          disqualified: false,
          reason: "Budget ✓",
          scoreContribution: 25,
        };
      }

      if (price > budget) {
        // Over budget — strict disqualification
        return {
          active: true,
          matched: false,
          disqualified: true,
          scoreContribution: 0,
        };
      }

      // Unpriced property (price === 0) — neutral, do not disqualify but no match reason
      return { active: true, matched: false, disqualified: false, scoreContribution: 0 };
    },
  },

  // 2. Location Rule (Canonical option name OR extracted keyword)
  {
    id: "location",
    label: "Location",
    leadField: "location_name",
    propertyField: "location",
    isMatchable: true,
    evaluate: (lead, property, context) => {
      const canonicalLoc = (lead.location_name ?? "").trim().toLowerCase();
      const keywords = canonicalLoc ? [canonicalLoc] : context.extractedLocationKeywords.map((k) => k.toLowerCase());

      if (keywords.length === 0) {
        return { active: false, matched: false, disqualified: false, scoreContribution: 0 };
      }

      const propLocation = (property.location ?? "").trim().toLowerCase();
      const propName = (property.name ?? "").trim().toLowerCase();
      const combinedPropText = `${propLocation} ${propName}`;

      if (!propLocation && !propName) {
        // Property has no location data — neutral (avoid false negative)
        return { active: true, matched: false, disqualified: false, scoreContribution: 0 };
      }

      const matches = keywords.some(
        (kw) =>
          combinedPropText.includes(kw) ||
          kw.includes(propLocation.split(",")[0]?.trim() ?? "") ||
          (propLocation && kw.split(/[-–\s]+/).some((sub) => sub.length > 2 && propLocation.includes(sub))),
      );

      if (matches) {
        const displayLoc = lead.location_name || keywords[0];
        return {
          active: true,
          matched: true,
          disqualified: false,
          reason: `Location (${displayLoc}) ✓`,
          scoreContribution: 25,
        };
      }

      // Explicit location mismatch
      return {
        active: true,
        matched: false,
        disqualified: true,
        scoreContribution: 0,
      };
    },
  },

  // 3. Requirement (Property Type & BHK) Rule
  {
    id: "requirement",
    label: "Requirement (Type & BHK)",
    leadField: "requirement",
    propertyField: "type",
    isMatchable: true,
    evaluate: (lead, property, context) => {
      const { parsedBhk, parsedPropertyType } = context;
      if (parsedBhk === null && parsedPropertyType === null) {
        return { active: false, matched: false, disqualified: false, scoreContribution: 0 };
      }

      let matched = false;
      let reason: string | undefined;
      let scoreContribution = 0;

      // Check Property Type if specified in requirement text
      if (parsedPropertyType) {
        const propType = (property.type ?? "").toLowerCase();
        if (propType === parsedPropertyType) {
          matched = true;
          reason = `${property.type} ✓`;
          scoreContribution += 15;
        } else {
          // Type explicitly specified and mismatched — disqualify
          return { active: true, matched: false, disqualified: true, scoreContribution: 0 };
        }
      }

      // Check Bedrooms / BHK if specified
      if (parsedBhk !== null) {
        if (property.bedrooms !== null && property.bedrooms === parsedBhk) {
          matched = true;
          reason = reason ? `${reason}, ${parsedBhk} BHK ✓` : `${parsedBhk} BHK ✓`;
          scoreContribution += 15;
        } else if (property.bedrooms !== null && property.bedrooms !== parsedBhk) {
          // BHK explicitly specified and mismatched — disqualify
          return { active: true, matched: false, disqualified: true, scoreContribution: 0 };
        }
        // bedrooms === null in property -> neutral
      }

      return {
        active: true,
        matched,
        disqualified: false,
        reason,
        scoreContribution,
      };
    },
  },

  // 4. Purpose Rule (Self Use vs Investment)
  {
    id: "purpose",
    label: "Purpose",
    leadField: "purpose_name",
    propertyField: "type",
    isMatchable: true,
    evaluate: (lead, property) => {
      const purpose = (lead.purpose_name ?? "").trim().toLowerCase();
      if (!purpose) {
        return { active: false, matched: false, disqualified: false, scoreContribution: 0 };
      }

      const propType = (property.type ?? "").toLowerCase();
      const propDesc = (property.description ?? "").toLowerCase();

      if (purpose === "self use") {
        // Self Use requires residential property; commercial or plot is incompatible
        if (propType === "commercial" || propType === "office" || propType === "warehouse") {
          return { active: true, matched: false, disqualified: true, scoreContribution: 0 };
        }
        return {
          active: true,
          matched: true,
          disqualified: false,
          reason: "Self Use ✓",
          scoreContribution: 10,
        };
      }

      if (purpose === "investment") {
        // Any property can be an investment (especially commercial, plots, and apartments)
        const isCommercialOrPlot = propType === "commercial" || propType === "office" || propType === "plot";
        return {
          active: true,
          matched: true,
          disqualified: false,
          reason: isCommercialOrPlot ? "Prime Investment ✓" : "Investment ✓",
          scoreContribution: 10,
        };
      }

      // Fallback for custom purpose options: check property description
      if (propDesc.includes(purpose)) {
        return {
          active: true,
          matched: true,
          disqualified: false,
          reason: `${lead.purpose_name} ✓`,
          scoreContribution: 10,
        };
      }

      return { active: true, matched: false, disqualified: false, scoreContribution: 0 };
    },
  },

  // 5. Phase Rule (Ready to move in vs Under Construction vs New Launch)
  {
    id: "phase",
    label: "Phase",
    leadField: "phase_name",
    propertyField: "description",
    isMatchable: true,
    evaluate: (lead, property) => {
      const phase = (lead.phase_name ?? "").trim().toLowerCase();
      if (!phase) {
        return { active: false, matched: false, disqualified: false, scoreContribution: 0 };
      }

      const desc = `${property.description ?? ""} ${property.name ?? ""}`.toLowerCase();
      const isReadyDesc = desc.includes("ready") || desc.includes("immediate");
      const isUnderConstructionDesc = desc.includes("under construction") || desc.includes("launch");

      if (phase.includes("ready")) {
        if (isUnderConstructionDesc && !isReadyDesc) {
          // Lead wants ready to move in, but property is under construction
          return { active: true, matched: false, disqualified: true, scoreContribution: 0 };
        }
        if (isReadyDesc) {
          return {
            active: true,
            matched: true,
            disqualified: false,
            reason: "Ready Phase ✓",
            scoreContribution: 15,
          };
        }
      } else if (phase.includes("under construction") || phase.includes("launch")) {
        if (isUnderConstructionDesc) {
          return {
            active: true,
            matched: true,
            disqualified: false,
            reason: "Under Construction ✓",
            scoreContribution: 15,
          };
        }
      }

      // If property does not specify phase in description, neutral (do not falsely exclude)
      return { active: true, matched: false, disqualified: false, scoreContribution: 0 };
    },
  },

  // 6. Possession Timeline Rule
  {
    id: "possession_timeline",
    label: "Possession Timeline",
    leadField: "possession_timeline_name",
    propertyField: "description",
    isMatchable: true,
    evaluate: (lead, property) => {
      const timeline = (lead.possession_timeline_name ?? "").trim().toLowerCase();
      if (!timeline) {
        return { active: false, matched: false, disqualified: false, scoreContribution: 0 };
      }

      const desc = `${property.description ?? ""} ${property.name ?? ""}`.toLowerCase();
      const isImmediateDesc = desc.includes("immediate") || desc.includes("ready");
      const isFutureDesc = desc.includes("under construction") || desc.includes("launch");

      if (timeline.includes("immediate")) {
        if (isFutureDesc && !isImmediateDesc) {
          return { active: true, matched: false, disqualified: true, scoreContribution: 0 };
        }
        if (isImmediateDesc) {
          return {
            active: true,
            matched: true,
            disqualified: false,
            reason: "Immediate Possession ✓",
            scoreContribution: 10,
          };
        }
      }

      return { active: true, matched: false, disqualified: false, scoreContribution: 0 };
    },
  },

  // 7. Transaction Timeline Rule
  {
    id: "transaction_timeline",
    label: "Transaction Timeline",
    leadField: "transaction_timeline_name",
    propertyField: "status",
    isMatchable: true,
    evaluate: (lead, property) => {
      const timeline = (lead.transaction_timeline_name ?? "").trim().toLowerCase();
      if (!timeline) {
        return { active: false, matched: false, disqualified: false, scoreContribution: 0 };
      }

      // If lead requires immediate or 15-30 days transaction, property must be available
      if (timeline.includes("immediate") || timeline.includes("15") || timeline.includes("30")) {
        if (property.status === "Available") {
          return {
            active: true,
            matched: true,
            disqualified: false,
            reason: "Ready for Deal ✓",
            scoreContribution: 5,
          };
        }
      }

      return { active: true, matched: false, disqualified: false, scoreContribution: 0 };
    },
  },
];

/* ----------------------------- matching core ------------------------------- */

/**
 * Match workspace properties against lead requirements using the declarative rule engine.
 *
 * Enforces:
 * - Immediate disqualification if any active required criterion fails.
 * - Missing lead fields are skipped and never exclude inventory.
 * - Properties matching only budget will NOT match if other specified criteria fail.
 * - Returns insufficientCriteria: true when lead has no actionable criteria.
 */
export function matchProperties(lead: Lead, allProperties: Property[]): MatchResult {
  const context = parseLeadRequirementText(lead);

  // Check if lead has ANY active actionable criteria
  const hasCriteria =
    (lead.budget != null && lead.budget > 0) ||
    Boolean(lead.location_name) ||
    context.extractedLocationKeywords.length > 0 ||
    context.parsedBhk !== null ||
    context.parsedPropertyType !== null ||
    Boolean(lead.purpose_name) ||
    Boolean(lead.phase_name) ||
    Boolean(lead.possession_timeline_name) ||
    Boolean(lead.transaction_timeline_name);

  if (!hasCriteria) {
    return { matches: [], insufficientCriteria: true };
  }

  const matches: PropertyMatch[] = [];

  for (const property of allProperties) {
    // 1. Workspace isolation: Skip properties from another workspace (safety guard)
    if (lead.workspace_id && property.workspace_id && property.workspace_id !== lead.workspace_id) {
      continue;
    }

    // 2. Skip the lead's explicitly interested property (shown separately in UI)
    if (lead.property_id && property.id === lead.property_id) {
      continue;
    }

    // 3. Hard filter: must be Available
    if (property.status !== "Available") {
      continue;
    }

    let isDisqualified = false;
    const reasons: string[] = [];
    let totalScore = 0;

    for (const rule of MATCHING_RULES) {
      if (!rule.isMatchable) continue;

      const res = rule.evaluate(lead, property, context);

      if (res.disqualified) {
        isDisqualified = true;
        break; // Hard disqualify
      }

      if (res.matched && res.reason) {
        reasons.push(res.reason);
        totalScore += res.scoreContribution;
      }
    }

    if (isDisqualified) {
      continue;
    }

    // Must have matched at least one positive criterion
    if (reasons.length > 0) {
      matches.push({
        property,
        matchReasons: reasons,
        score: Math.min(100, Math.max(25, totalScore)),
      });
    }
  }

  // Sort by score descending, then by price ascending
  matches.sort((a, b) => b.score - a.score || a.property.price - b.property.price);

  return { matches, insufficientCriteria: false };
}
