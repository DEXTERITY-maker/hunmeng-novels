import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const schema=readFileSync(new URL("./schema/anons-studio-manual-orders.sql",import.meta.url),"utf8");
const pricing=readFileSync(new URL("./pricing.html",import.meta.url),"utf8");
const auth=readFileSync(new URL("./auth-entry.js",import.meta.url),"utf8");
const provider=readFileSync(new URL("./functions/anons-billing/index.ts",import.meta.url),"utf8");
const manual=readFileSync(new URL("./manual-orders-entry.js",import.meta.url),"utf8");

test("ID #1 is reserved, and customer IDs depend on verified server-side auth users",()=>{
  assert.match(schema,/customer_no_seq[\s\S]*?start with 2\b/);
  assert.match(schema,/email_confirmed_at is not null/);
  assert.match(schema,/customer_no bigint not null unique check \(customer_no >= 1\)/);
  assert.match(schema,/on conflict \(user_id\) do nothing/);
  assert.doesNotMatch(manual,/setItem\(["'].*customer/);
});
test("clients may read only their own orders and cannot write entitlements",()=>{
  assert.match(schema,/alter table public\.anons_studio_manual_orders enable row level security/);
  assert.match(schema,/grant select on public\.anons_studio_manual_orders to authenticated/);
  assert.match(schema,/for select to authenticated using \(\(select auth\.uid\(\)\)=user_id\)/);
  assert.doesNotMatch(schema,/grant (?:update|insert|delete|all) on public\.anons_studio_memberships to authenticated/i);
  assert.match(schema,/revoke all on public\.anons_studio_manual_admins from public,anon,authenticated/);
  assert.match(schema,/if not public\.anons_studio_manual_is_admin\(\) then/);
  assert.match(schema,/status='payment_reported'/);
  assert.match(schema,/rec\.status<>'payment_reported'/);
  assert.match(schema,/create unique index anons_manual_one_open_order_per_customer/);
});
test("payment reported is not payment approved; only verified admin RPC activates Basic",()=>{
  const report=schema.slice(schema.indexOf("function public.anons_studio_manual_report_transfer"),schema.indexOf("function public.anons_studio_manual_cancel_order"));
  assert.doesNotMatch(report,/anons_studio_memberships|status='approved'/);
  const approve=schema.slice(schema.indexOf("function public.anons_studio_manual_review"),schema.indexOf("-- All RPCs enforce"));
  assert.match(approve,/if not public\.anons_studio_manual_is_admin/);
  assert.match(approve,/insert into public\.anons_studio_memberships/);
  assert.match(approve,/current_period_end/);
  assert.match(schema,/amount_kopecks integer not null default 29900 check \(amount_kopecks = 29900\)/);
  assert.match(schema,/plan text not null default 'basic' check \(plan = 'basic'\)/);
  assert.match(schema,/revoke all on function public\.anons_studio_manual_review\(bigint,boolean\) from public,anon,authenticated/);
});
test("manual request and existing YooKassa card checkout remain separate",()=>{
  assert.match(pricing,/id="manual-order-create"/);
  assert.match(pricing,/id="buy-basic"[^>]+disabled|disabled id="buy-basic"/);
  assert.match(pricing,/не являются подтверждением оплаты/);
  assert.match(provider,/const LIVE_CHECKOUT_REVIEWED=false/);
  assert.match(auth,/initManualOrders\(client\)/);
  assert.doesNotMatch(manual,/fetch\(['"].*yookassa|api\.yookassa/);
});
