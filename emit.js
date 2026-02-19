import Redis from "ioredis";

const redis = new Redis();

async function emit() {
  const invoice_id = "INV-1002";

  await redis.xadd(
    "invoice_events",
    "*",
    "invoice_id",
    invoice_id
  );

  console.log("Event emitted for:", invoice_id);
  process.exit(0);
}

emit();
