import { db, seedDemo } from "@beast/db";

async function main() {
  console.log("Seeding Northwind Coffee demo company...");
  const counts = await seedDemo(db);
  console.log("Per-table row counts (scoped to demo company):");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(24)} ${count}`);
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
