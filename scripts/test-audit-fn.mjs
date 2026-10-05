import { listWorkspaceAuditLogsFn } from "../src/lib/crm.functions.ts";

async function testFn() {
  try {
    const res = await listWorkspaceAuditLogsFn({
      data: {
        page: 1,
        pageSize: 25,
        startDate: "2026-10-01",
      },
    });
    console.log("Result items count:", res.items.length);
    console.log("Total:", res.total);
    console.log("First item:", res.items[0]);
  } catch (err) {
    console.error("Error calling fn:", err);
  }
}

testFn();
