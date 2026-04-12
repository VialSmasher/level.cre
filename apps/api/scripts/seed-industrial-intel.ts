import { seedIndustrialIntelCore } from "../src/modules/industrial-intel/seed";

async function main() {
  try {
    const result = await seedIndustrialIntelCore();
    console.log(
      `Industrial Intel seed complete: ${result.sources} sources, ${result.runs} runs, ${result.listings} listings, ${result.changes} changes`,
    );
  } catch (error: any) {
    console.error("Industrial Intel seed failed:", error?.message || error);
    process.exitCode = 1;
  }
}

main();
