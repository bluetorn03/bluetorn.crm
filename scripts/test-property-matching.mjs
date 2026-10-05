/**
 * BLUETORN CRM — Automated Test Suite: Property Requirement Matching
 *
 * Verifies:
 * 1. Budget only match
 * 2. Requirement only (Type, BHK)
 * 3. Budget + Location
 * 4. Budget + Purpose
 * 5. Budget + Possession Timeline
 * 6. Budget + Transaction Timeline
 * 7. Budget + Phase
 * 8. All fields together
 * 9. One explicit mismatch disqualification (Critical: Budget matches but Location fails -> Disqualified)
 * 10. Multiple mismatches disqualification
 * 11. Unspecified optional fields behavior (no false negatives)
 * 12. Existing legacy leads (without lead_options)
 * 13. Existing properties (with description text)
 * 14. Future unmatchable requirement field
 * 15. Workspace isolation
 */

import assert from "node:assert";
import { matchProperties, MATCHING_RULES } from "../src/lib/property-matching.ts";

console.log("==================================================");
console.log("🏢 TEST: PROPERTY REQUIREMENT MATCHING ENGINE");
console.log("==================================================");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}:`, err.message);
    failed++;
  }
}

const mockProperties = [
  {
    id: "prop-1",
    workspace_id: "ws-1",
    name: "Azure Heights — 1204",
    location: "Ulwe, Navi Mumbai",
    type: "Apartment",
    status: "Available",
    price: 15000000, // 1.5 Cr
    currency: "INR",
    bedrooms: 3,
    area_sqft: 1450,
    image_url: null,
    description: "Ready to move in, sea-facing luxury apartment, immediate possession",
    assigned_to: "user-1",
    assigned_at: null,
    created_by: "user-1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "prop-2",
    workspace_id: "ws-1",
    name: "Green Palms Villa",
    location: "Panvel West",
    type: "Villa",
    status: "Available",
    price: 35000000, // 3.5 Cr
    currency: "INR",
    bedrooms: 4,
    area_sqft: 3200,
    image_url: null,
    description: "Under construction, new launch project, possession within 2 years",
    assigned_to: "user-1",
    assigned_at: null,
    created_by: "user-1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "prop-3",
    workspace_id: "ws-1",
    name: "Corporate Towers Suite 501",
    location: "Nerul-Seawoods",
    type: "Commercial",
    status: "Available",
    price: 25000000, // 2.5 Cr
    currency: "INR",
    bedrooms: null,
    area_sqft: 1800,
    image_url: null,
    description: "Grade A office space, ideal for commercial investment, ready possession",
    assigned_to: "user-1",
    assigned_at: null,
    created_by: "user-1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "prop-4",
    workspace_id: "ws-2", // Different workspace!
    name: "Cross-Workspace Property",
    location: "Ulwe, Navi Mumbai",
    type: "Apartment",
    status: "Available",
    price: 12000000,
    currency: "INR",
    bedrooms: 3,
    area_sqft: 1200,
    image_url: null,
    description: "Ready to move",
    assigned_to: "user-2",
    assigned_at: null,
    created_by: "user-2",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "prop-5",
    workspace_id: "ws-1",
    name: "Sold Luxury Flat",
    location: "Ulwe, Navi Mumbai",
    type: "Apartment",
    status: "Sold", // Sold property!
    price: 14000000,
    currency: "INR",
    bedrooms: 3,
    area_sqft: 1300,
    image_url: null,
    description: "Ready to move",
    assigned_to: "user-1",
    assigned_at: null,
    created_by: "user-1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

// Base lead factory
function createLead(overrides = {}) {
  return {
    id: "lead-test",
    workspace_id: "ws-1",
    name: "Amit Sharma",
    phone: "9876543210",
    email: "amit@example.com",
    source: "Website Forms",
    status: "New",
    requirement: null,
    budget: 0,
    currency: "INR",
    score: 50,
    location_name: null,
    purpose_name: null,
    possession_timeline_name: null,
    transaction_timeline_name: null,
    phase_name: null,
    ...overrides,
  };
}

// 1. Budget only
test("1. Budget only matches affordable properties", () => {
  const lead = createLead({ budget: 20000000 }); // 2.0 Cr
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.insufficientCriteria, false);
  // Prop-1 (1.5 Cr) matches. Prop-2 (3.5 Cr) and Prop-3 (2.5 Cr) are over budget.
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].property.id, "prop-1");
  assert(res.matches[0].matchReasons.includes("Budget ✓"));
});

// 2. Requirement only (Type, BHK)
test("2. Requirement only (Villa 4 BHK)", () => {
  const lead = createLead({ requirement: "Looking for a luxury 4 BHK villa" });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].property.id, "prop-2");
  assert(res.matches[0].matchReasons.some((r) => r.includes("Villa")));
  assert(res.matches[0].matchReasons.some((r) => r.includes("4 BHK")));
});

// 3. Budget + Location
test("3. Budget + Location matches exact criteria", () => {
  const lead = createLead({
    budget: 20000000,
    location_name: "Ulwe",
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].property.id, "prop-1");
  assert(res.matches[0].matchReasons.includes("Budget ✓"));
  assert(res.matches[0].matchReasons.some((r) => r.includes("Location (Ulwe)")));
});

// 4. Budget + Purpose
test("4. Budget + Purpose: Commercial investment", () => {
  const lead = createLead({
    budget: 30000000,
    purpose_name: "Investment",
    requirement: "Commercial office space",
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].property.id, "prop-3");
  assert(res.matches[0].matchReasons.some((r) => r.includes("Investment")));
});

// 5. Budget + Possession Timeline
test("5. Budget + Possession Timeline: Immediate", () => {
  const lead = createLead({
    budget: 40000000,
    possession_timeline_name: "Immediate",
  });
  const res = matchProperties(lead, mockProperties);
  // Prop-1 has immediate possession. Prop-2 is under construction (fails immediate).
  const matchedIds = res.matches.map((m) => m.property.id);
  assert(matchedIds.includes("prop-1"));
  assert(!matchedIds.includes("prop-2"), "Prop-2 is under construction and must NOT match immediate possession");
});

// 6. Budget + Transaction Timeline
test("6. Budget + Transaction Timeline: Immediate readiness", () => {
  const lead = createLead({
    budget: 20000000,
    transaction_timeline_name: "Immediate",
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  assert(res.matches[0].matchReasons.some((r) => r.includes("Ready for Deal")));
});

// 7. Budget + Phase
test("7. Budget + Phase: Ready to move in", () => {
  const lead = createLead({
    budget: 40000000,
    phase_name: "Ready to move in",
  });
  const res = matchProperties(lead, mockProperties);
  const matchedIds = res.matches.map((m) => m.property.id);
  assert(matchedIds.includes("prop-1"));
  assert(!matchedIds.includes("prop-2"), "Prop-2 is under construction, should be disqualified for Ready phase");
});

// 8. All fields together
test("8. All fields together (Budget, Location, Requirement, Purpose, Phase, Possession)", () => {
  const lead = createLead({
    budget: 20000000,
    location_name: "Ulwe",
    requirement: "3 BHK Apartment",
    purpose_name: "Self Use",
    phase_name: "Ready to move in",
    possession_timeline_name: "Immediate",
    transaction_timeline_name: "Immediate",
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  const match = res.matches[0];
  assert.strictEqual(match.property.id, "prop-1");
  assert(match.score >= 90, `Score should be high for full match (actual: ${match.score})`);
  assert(match.matchReasons.length >= 4);
});

// 9. CRITICAL TEST: One explicit mismatch must DISQUALIFY even if budget matches!
test("9. CRITICAL: Property matching budget but FAILING location MUST NOT match", () => {
  const lead = createLead({
    budget: 20000000, // Prop-1 price is 1.5 Cr (budget passes!)
    location_name: "Bandra", // Lead explicitly wants Bandra, but Prop-1 is in Ulwe!
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(
    res.matches.length,
    0,
    "Property MUST NOT appear as match merely because budget matches when location mismatches!",
  );
});

// 10. Multiple mismatches
test("10. Multiple mismatches strictly disqualify", () => {
  const lead = createLead({
    budget: 10000000, // 1 Cr (all props exceed)
    location_name: "Kharghar",
    requirement: "Plot",
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 0);
});

// 11. Unspecified optional fields do NOT disqualify (no false negatives)
test("11. Unspecified optional fields do not exclude properties", () => {
  const lead = createLead({
    location_name: "Ulwe",
    // Budget, Phase, Possession, Transaction, Purpose all unspecified
  });
  const res = matchProperties(lead, mockProperties);
  assert(res.matches.length >= 1);
  assert.strictEqual(res.matches[0].property.id, "prop-1");
});

// 12. Existing legacy leads (only free text requirement, no option IDs)
test("12. Existing legacy leads match from free text requirement", () => {
  const legacyLead = createLead({
    requirement: "Need 3 bhk apartment in Ulwe under 1.8 Cr",
    budget: 18000000,
    location_name: null,
    phase_name: null,
  });
  const res = matchProperties(legacyLead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].property.id, "prop-1");
});

// 13. Existing properties with descriptions match phase & possession
test("13. Existing properties match phase keywords from description", () => {
  const lead = createLead({
    phase_name: "Under Construction",
    requirement: "Villa",
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].property.id, "prop-2");
  assert(res.matches[0].matchReasons.some((r) => r.includes("Under Construction")));
});

// 14. Future unmatchable requirement field
test("14. Future unmatchable requirement field does not corrupt matching", () => {
  // Add a hypothetical future rule with isMatchable: false
  MATCHING_RULES.push({
    id: "future_amenity_score",
    label: "Future Amenity Score",
    leadField: "amenity_preference",
    isMatchable: false,
    evaluate: () => ({ active: true, matched: false, disqualified: false, scoreContribution: 0 }),
  });

  const lead = createLead({
    budget: 20000000,
    location_name: "Ulwe",
  });
  const res = matchProperties(lead, mockProperties);
  assert.strictEqual(res.matches.length, 1);
  assert.strictEqual(res.matches[0].property.id, "prop-1");

  // Cleanup
  const idx = MATCHING_RULES.findIndex((r) => r.id === "future_amenity_score");
  if (idx !== -1) MATCHING_RULES.splice(idx, 1);
});

// 15. Workspace isolation
test("15. Workspace isolation: Cross-workspace properties NEVER match", () => {
  const lead = createLead({
    workspace_id: "ws-1",
    location_name: "Ulwe",
    budget: 20000000,
  });
  const res = matchProperties(lead, mockProperties);
  const matchedWsIds = res.matches.map((m) => m.property.workspace_id);
  assert(!matchedWsIds.includes("ws-2"), "Cross-workspace property (ws-2) must never match ws-1 lead!");
});

// 16. Sold / unavailable properties excluded
test("16. Sold or unavailable properties are never matched", () => {
  const lead = createLead({
    workspace_id: "ws-1",
    location_name: "Ulwe",
    budget: 20000000,
  });
  const res = matchProperties(lead, mockProperties);
  const matchedIds = res.matches.map((m) => m.property.id);
  assert(!matchedIds.includes("prop-5"), "Sold property (prop-5) must never match!");
});

// 17. Insufficient criteria guard
test("17. Empty lead with zero actionable criteria returns insufficientCriteria", () => {
  const emptyLead = createLead();
  const res = matchProperties(emptyLead, mockProperties);
  assert.strictEqual(res.insufficientCriteria, true);
  assert.strictEqual(res.matches.length, 0);
});

console.log("\n==================================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("==================================================");

if (failed > 0) process.exit(1);
