const fs = require('node:fs');
const path = require('node:path');

class PanicRegistry {
  message = '';
  get() { return this.message; }
  set_message(message) { this.message = `RuntimeError: ${message}`; }
}

global.PRISMA_WASM_PANIC_REGISTRY = new PanicRegistry();
const prismaSchema = require('@prisma/prisma-schema-wasm');
const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');
const payload = JSON.stringify({ prismaSchema: schema });

try {
  prismaSchema.validate(payload);
  const dmmf = JSON.parse(prismaSchema.get_dmmf(payload));
  console.log(`Prisma schema valid: ${dmmf.datamodel.models.length} models, ${dmmf.datamodel.enums.length} enums.`);
} catch (error) {
  console.error(global.PRISMA_WASM_PANIC_REGISTRY.get() || error);
  process.exit(1);
}
