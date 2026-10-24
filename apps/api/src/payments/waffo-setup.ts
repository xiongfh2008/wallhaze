import { TaxCategory, WaffoPancake } from "@waffo/pancake-ts";
import { loadEnv, loadEnvFile } from "../config/env.js";
import {
  createPgliteDatabase,
  createPostgresDatabase,
  type Database,
} from "../db/database.js";
import { migrate } from "../db/migrate.js";

/**
 * Waffo Pancake setup/check CLI.
 *
 *   npm run waffo:check   # read-only: verify credentials + store access
 *   npm run waffo:setup   # dry run: show packages, prices and mappings
 *   npm run waffo:setup -- --apply   # create missing test products + map them
 *   npm run waffo:setup -- --apply --publish  # prod only: publish products
 *
 * Products are created per credit package and mapped in payment_products.
 * Never run --publish against the test environment.
 */

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

function displayAmount(minor: number, currency: string): string {
  const exponent = ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2;
  if (exponent === 0) return String(minor);
  return (minor / 10 ** exponent).toFixed(exponent);
}

interface PackageRow {
  [key: string]: unknown;
  id: string;
  credits: number | string;
  price_minor: number | string;
  currency: string;
  label: string;
  product_id: string | null;
}

async function openDatabase(env: ReturnType<typeof loadEnv>): Promise<Database> {
  if (env.DATABASE_URL) return createPostgresDatabase(env.DATABASE_URL);
  if (env.PGLITE_DIR && env.NODE_ENV !== "production") {
    return createPgliteDatabase(env.PGLITE_DIR);
  }
  throw new Error("DATABASE_URL or PGLITE_DIR is required");
}

async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  if (!env.WAFFO_MERCHANT_ID || !env.WAFFO_PRIVATE_KEY) {
    console.error("[waffo] WAFFO_MERCHANT_ID and WAFFO_PRIVATE_KEY are required");
    process.exit(1);
  }
  if (!env.WAFFO_STORE_ID) {
    console.error("[waffo] WAFFO_STORE_ID is required");
    process.exit(1);
  }
  const client = new WaffoPancake({
    merchantId: env.WAFFO_MERCHANT_ID,
    privateKey: env.WAFFO_PRIVATE_KEY,
  });
  const checkOnly = process.argv.includes("--check");
  const apply = process.argv.includes("--apply");
  const publish = process.argv.includes("--publish");
  if (publish && env.PAYMENT_ENVIRONMENT !== "prod") {
    console.error("[waffo] --publish is refused outside PAYMENT_ENVIRONMENT=prod");
    process.exit(1);
  }

  // Read-only credential/store check (works without a database).
  const stores = await client.graphql.query<{
    stores: Array<{ id: string; name: string; status?: string }>;
  }>({ query: "query { stores { id name status } }" });
  if (stores.errors?.length) {
    console.error("[waffo] GraphQL errors:", stores.errors.map((e) => e.message).join("; "));
    process.exit(1);
  }
  const store = stores.data?.stores?.find((s) => s.id === env.WAFFO_STORE_ID);
  if (!store) {
    console.error(
      `[waffo] store ${env.WAFFO_STORE_ID} not visible to this merchant (found ${stores.data?.stores?.length ?? 0})`
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        environment: env.PAYMENT_ENVIRONMENT,
        merchant: env.WAFFO_MERCHANT_ID,
        store: { id: store.id, name: store.name, status: store.status ?? null },
      },
      null,
      2
    )
  );

  // Optional webhook registration: --webhook-url https://api.example/v1/payments/webhook
  const urlIndex = process.argv.indexOf("--webhook-url");
  if (urlIndex !== -1) {
    const url = process.argv[urlIndex + 1];
    if (!url || !/^https:\/\//i.test(url)) {
      console.error("[waffo] --webhook-url requires an https URL");
      process.exit(1);
    }
    const webhook = await client.webhooks.add({
      storeId: env.WAFFO_STORE_ID,
      channel: "http",
      url,
      events: ["order.completed", "refund.succeeded"],
      testMode: env.PAYMENT_ENVIRONMENT !== "prod",
    });
    console.log(
      JSON.stringify({
        webhookRegistered: {
          id: (webhook as { webhook?: { id?: string } }).webhook?.id ?? null,
          url,
          testMode: env.PAYMENT_ENVIRONMENT !== "prod",
        },
      })
    );
  }
  if (checkOnly) return;

  const db = await openDatabase(env);
  try {
    await migrate(db);
    const packages = (
      await db.query<PackageRow>(
        `SELECT p.id,p.credits,p.price_minor,p.currency,p.label,pp.product_id
         FROM credit_packages p
         LEFT JOIN payment_products pp ON pp.provider='waffo' AND pp.package_id=p.id
         WHERE p.active ORDER BY p.credits`
      )
    ).rows;

    const plan = packages.map((pkg) => ({
      packageId: pkg.id,
      label: pkg.label,
      credits: Number(pkg.credits),
      price: `${displayAmount(Number(pkg.price_minor), pkg.currency)} ${pkg.currency}`,
      productId: pkg.product_id,
      action: pkg.product_id ? "already mapped" : apply ? "create" : "would create",
    }));
    console.log(JSON.stringify({ packages: plan }, null, 2));
    if (!apply) return;

    for (const pkg of packages) {
      if (pkg.product_id) continue;
      const amount = displayAmount(Number(pkg.price_minor), pkg.currency);
      const { product } = await client.onetimeProducts.create({
        storeId: env.WAFFO_STORE_ID,
        name: `WallHaze ${pkg.label} — ${pkg.credits} Credits`,
        description: `${pkg.credits} Credits for WallHaze AI wallpaper generation`,
        prices: {
          [pkg.currency]: { amount, taxCategory: TaxCategory.DigitalGoods },
        },
        metadata: { packageId: pkg.id, credits: String(pkg.credits) },
      });
      if (publish) {
        await client.onetimeProducts.publish({ id: product.id });
      }
      await db.query(
        "INSERT INTO payment_products(provider,package_id,product_id) VALUES('waffo',$1,$2) ON CONFLICT (provider,package_id) DO NOTHING",
        [pkg.id, product.id]
      );
      console.log(
        JSON.stringify({
          created: { packageId: pkg.id, productId: product.id, published: publish },
        })
      );
    }
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(
    "[waffo] fatal:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
