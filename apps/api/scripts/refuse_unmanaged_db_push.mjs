console.error([
  'Direct Drizzle db:push is disabled for Level CRE.',
  'The production schema contains checked, migration-managed constraints and indexes that are not safe to reconcile with db:push.',
  'Add an ordered SQL migration and run the appropriate checksummed migration command instead.',
].join('\n'))
process.exitCode = 1
