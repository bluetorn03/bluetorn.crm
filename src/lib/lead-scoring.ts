/**
 * BLUETORN CRM — Deterministic Lead Scoring Engine
 *
 * Calculates a 0–100 score from real CRM fields.
 * Pure function — no side effects, no database calls.
 * Score is computed client-side and recalculates automatically
 * when lead data changes via React Query invalidation.
 */
import type { Lead } from "./db-types";

export type ScoreCategory = "Low" | "Medium" | "High";

export interface ScoreBreakdownItem {
  factor: string;
  maxPoints: number;
  earnedPoints: number;
  reason: string;
}

export interface LeadScoreResult {
  total: number;
  category: ScoreCategory;
  breakdown: ScoreBreakdownItem[];
}

/**
 * Deterministic lead scoring function.
 *
 * Weighted factors (total = 100):
 *   Budget fit           20
 *   Requirement fit      15
 *   Location fit         15
 *   Timeline/urgency     15
 *   Engagement           15
 *   Stage/intent         10
 *   Follow-up response    5
 *   Data completeness     5
 *
 * Missing information receives 0 points — never invented.
 */
export function calculateLeadScore(lead: Lead): LeadScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];

  // 1. Budget fit (max 20)
  const budget = Number(lead.budget) || 0;
  let budgetPoints = 0;
  let budgetReason = "No budget specified";
  if (budget > 5000000) {
    budgetPoints = 20;
    budgetReason = `Budget ₹${(budget / 100000).toFixed(1)}L — strong buyer`;
  } else if (budget > 1000000) {
    budgetPoints = 15;
    budgetReason = `Budget ₹${(budget / 100000).toFixed(1)}L — solid range`;
  } else if (budget > 100000) {
    budgetPoints = 10;
    budgetReason = `Budget ₹${(budget / 1000).toFixed(0)}K — moderate range`;
  } else if (budget > 0) {
    budgetPoints = 5;
    budgetReason = `Budget ₹${budget.toLocaleString()} — entry level`;
  }
  breakdown.push({ factor: "Budget fit", maxPoints: 20, earnedPoints: budgetPoints, reason: budgetReason });

  // 2. Requirement fit (max 15)
  const req = (lead.requirement || "").trim();
  let reqPoints = 0;
  let reqReason = "No requirement specified";
  if (req.length > 80) {
    reqPoints = 15;
    reqReason = "Detailed requirement provided";
  } else if (req.length > 30) {
    reqPoints = 10;
    reqReason = "Moderate requirement provided";
  } else if (req.length > 0) {
    reqPoints = 5;
    reqReason = "Brief requirement provided";
  }
  breakdown.push({ factor: "Requirement fit", maxPoints: 15, earnedPoints: reqPoints, reason: reqReason });

  // 3. Location / Property fit (max 15)
  let locationPoints = 0;
  let locationReason = "No property interest specified";
  if (lead.property_id) {
    locationPoints = 15;
    locationReason = "Specific property interest linked";
  } else if (req.length > 0 && /(?:bhk|bed|flat|apartment|villa|plot|commercial|location|area|sector|city)/i.test(req)) {
    locationPoints = 8;
    locationReason = "Location/property hints in requirement";
  }
  breakdown.push({ factor: "Location fit", maxPoints: 15, earnedPoints: locationPoints, reason: locationReason });

  // 4. Timeline / Urgency (max 15)
  let timelinePoints = 0;
  let timelineReason = "No urgency signals";
  if (lead.next_follow_up) {
    const followUpDate = new Date(lead.next_follow_up);
    const now = new Date();
    const daysUntil = (followUpDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntil <= 0) {
      timelinePoints = 15;
      timelineReason = "Follow-up overdue — high urgency";
    } else if (daysUntil <= 2) {
      timelinePoints = 12;
      timelineReason = "Follow-up imminent (within 2 days)";
    } else if (daysUntil <= 7) {
      timelinePoints = 8;
      timelineReason = "Follow-up scheduled this week";
    } else {
      timelinePoints = 5;
      timelineReason = "Follow-up scheduled (future)";
    }
  } else if (lead.status === "Negotiation" || lead.status === "Visit / Meeting") {
    timelinePoints = 6;
    timelineReason = "Active stage suggests urgency";
  }
  breakdown.push({ factor: "Timeline/urgency", maxPoints: 15, earnedPoints: timelinePoints, reason: timelineReason });

  // 5. Engagement — based on stage progression (max 15)
  const engagementMap: Record<string, number> = {
    New: 2,
    Contacted: 5,
    Interested: 8,
    "Visit / Meeting": 11,
    Negotiation: 14,
    Won: 15,
    Lost: 1,
  };
  const engagementPoints = engagementMap[lead.status] ?? 0;
  const engagementReason =
    engagementPoints >= 10
      ? `${lead.status} — high engagement`
      : engagementPoints >= 5
        ? `${lead.status} — moderate engagement`
        : `${lead.status} — initial engagement`;
  breakdown.push({ factor: "Engagement", maxPoints: 15, earnedPoints: engagementPoints, reason: engagementReason });

  // 6. Stage / Intent (max 10)
  const intentMap: Record<string, number> = {
    New: 1,
    Contacted: 2,
    Interested: 4,
    "Visit / Meeting": 6,
    Negotiation: 8,
    Won: 10,
    Lost: 0,
  };
  const intentPoints = intentMap[lead.status] ?? 0;
  const intentReason =
    intentPoints >= 6
      ? `${lead.status} — strong purchase intent`
      : intentPoints >= 3
        ? `${lead.status} — growing intent`
        : `${lead.status} — early stage`;
  breakdown.push({ factor: "Stage/intent", maxPoints: 10, earnedPoints: intentPoints, reason: intentReason });

  // 7. Follow-up response (max 5)
  let followUpPoints = 0;
  let followUpReason = "No follow-up scheduled";
  if (lead.next_follow_up) {
    followUpPoints = 5;
    followUpReason = "Active follow-up scheduled";
  }
  breakdown.push({ factor: "Follow-up response", maxPoints: 5, earnedPoints: followUpPoints, reason: followUpReason });

  // 8. Data completeness (max 5) — 1 point per field
  let dataPoints = 0;
  const fields: string[] = [];
  if (lead.phone) { dataPoints++; fields.push("phone"); }
  if (lead.email) { dataPoints++; fields.push("email"); }
  if (req.length > 0) { dataPoints++; fields.push("requirement"); }
  if (budget > 0) { dataPoints++; fields.push("budget"); }
  if (lead.notes) { dataPoints++; fields.push("notes"); }
  const dataReason = dataPoints > 0
    ? `${dataPoints}/5 fields: ${fields.join(", ")}`
    : "No contact details or preferences";
  breakdown.push({ factor: "Data completeness", maxPoints: 5, earnedPoints: dataPoints, reason: dataReason });

  // Total
  const total = Math.min(100, breakdown.reduce((sum, b) => sum + b.earnedPoints, 0));

  // Category
  let category: ScoreCategory;
  if (total >= 70) category = "High";
  else if (total >= 40) category = "Medium";
  else category = "Low";

  return { total, category, breakdown };
}

/**
 * Returns a Tailwind-friendly color class for the score category.
 */
export function scoreColor(category: ScoreCategory): string {
  switch (category) {
    case "High":
      return "text-emerald-600 dark:text-emerald-400";
    case "Medium":
      return "text-amber-600 dark:text-amber-400";
    case "Low":
      return "text-red-500 dark:text-red-400";
  }
}

export function scoreBgColor(category: ScoreCategory): string {
  switch (category) {
    case "High":
      return "bg-emerald-500/10 border-emerald-500/30";
    case "Medium":
      return "bg-amber-500/10 border-amber-500/30";
    case "Low":
      return "bg-red-500/10 border-red-500/30";
  }
}
