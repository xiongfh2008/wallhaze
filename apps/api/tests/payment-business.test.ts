import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';
import { AuthService } from '../src/business/auth.js';
import { PaymentService, MockPaymentAdapter, signMockEvent, retryReceivedEvents } from '../src/business/payment.js';
let db:Database; let service:PaymentService; let user:string;
const secret='test-only-payment-signature-secret';
beforeEach(async()=>{db=await createMemoryDatabase();await migrate(db);user=(await new AuthService(db).signUp('pay@example.test','example-password-long','1')).session.user.id;service=new PaymentService(db,new MockPaymentAdapter(secret),['https://web.example']);await db.query("INSERT INTO credit_packages(id,credits,price_minor,currency,label,active) VALUES('test',100,500,'USD','Test',true)");});
afterEach(async()=>{await db?.close();});
async function order(){return service.checkout(user,{packageId:'test',successUrl:'https://web.example/en/credits',cancelUrl:'https://web.example/en/credits'},'checkout-key-1');}
async function event(orderId:string,id:string,type='paid'){const raw=JSON.stringify({id,type,orderId,paymentId:'payment-1',amountMinor:500,currency:'USD'});return service.receive(raw,signMockEvent(raw,secret));}
it('credits exactly once for repeated checkout and distinct duplicate payment events',async()=>{
 const a=await order();expect((await order()).orderId).toBe(a.orderId);
 await event(a.orderId,'evt1');await event(a.orderId,'evt1');await event(a.orderId,'evt2');
 expect((await db.query('SELECT balance FROM credit_wallets WHERE user_id=$1',[user])).rows[0].balance).toBe(100);
});
it('refund before success never grants credits; validates signature and amount',async()=>{
 const a=await order();await event(a.orderId,'refund','refunded');await event(a.orderId,'late');
 expect((await db.query('SELECT balance FROM credit_wallets')).rows[0].balance).toBe(0);
 await expect(service.receive('{}','bad')).rejects.toMatchObject({code:'FORBIDDEN'});
 const raw=JSON.stringify({id:'bad-value',type:'paid',orderId:a.orderId,paymentId:'payment-1',amountMinor:1,currency:'USD'});
 await expect(service.receive(raw,signMockEvent(raw,secret))).rejects.toMatchObject({code:'CONFLICT'});
});
it('replays received-but-unprocessed notifications and enforces owner/redirect isolation',async()=>{
 const a=await order();const payload={id:'crash',type:'paid',orderId:a.orderId,paymentId:'payment-1',amountMinor:500,currency:'USD'};
 await db.query("INSERT INTO payment_webhook_events(provider,event_id,payload,status) VALUES('mock',$1,$2,'received')",['crash',JSON.stringify(payload)]);
 await service.retryReceived();expect((await service.getOrder(user,a.orderId)).status).toBe('paid');
 await expect(service.getOrder('other',a.orderId)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(service.checkout(user,{packageId:'test',successUrl:'https://evil.test',cancelUrl:'https://web.example'},'another-key')).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
it('pulls a pending order from the provider and credits exactly once',async()=>{
 const a=await order();
 const adapter=new MockPaymentAdapter(secret);
 adapter.syncOrder=async()=>({id:'sync:pay_1',kind:'paid',orderId:a.orderId,paymentId:'pay_1',amountMinor:500,currency:'USD'});
 const svc=new PaymentService(db,adapter,['https://web.example']);
 const first=await svc.syncOrder(user,a.orderId);
 expect(first.applied).toBe(true);
 expect(first.order.status).toBe('paid');
 const second=await svc.syncOrder(user,a.orderId);
 expect(second.applied).toBe(false);
 expect((await db.query('SELECT balance FROM credit_wallets WHERE user_id=$1',[user])).rows[0].balance).toBe(100);
 // A missing provider confirmation leaves the order pending.
 const b=await svc.checkout(user,{packageId:'test',successUrl:'https://web.example/en/credits',cancelUrl:'https://web.example/en/credits'},'checkout-key-2');
 adapter.syncOrder=async()=>null;
 const pending=await svc.syncOrder(user,b.orderId);
 expect(pending.applied).toBe(false);
 expect(pending.order.status).toBe('pending');
});
it('returns the order id to the success URL for post-checkout verification',async()=>{
 const adapter=new MockPaymentAdapter(secret);
 const spy=vi.spyOn(adapter,'createCheckout');
 const svc=new PaymentService(db,adapter,['https://web.example']);
 const created=await svc.checkout(user,{packageId:'test',successUrl:'https://web.example/en/credits?lang=en',cancelUrl:'https://web.example/en/credits'},'url-key');
 const input=spy.mock.calls[0][0];
 expect(input.successUrl).toContain('order='+created.orderId);
 expect(input.successUrl).toContain('lang=en');
});

it('replays stored NORMALIZED events (Waffo shape) through the ops path',async()=>{
 const a=await order();
 // A provider event recorded just before a crash: normalized shape, no raw provider payload.
 await db.query(
  "INSERT INTO payment_webhook_events(provider,event_id,payload,status) VALUES('mock','norm-1',$1,'received')",
  [JSON.stringify({id:'norm-1',kind:'paid',orderId:a.orderId,paymentId:'PAY_x',amountMinor:500,currency:'USD'})]
 );
 expect(await retryReceivedEvents(db,'mock')).toBe(1);
 expect((await service.getOrder(user,a.orderId)).status).toBe('paid');
 expect((await db.query('SELECT balance FROM credit_wallets WHERE user_id=$1',[user])).rows[0].balance).toBe(100);
 // Replay is safe once processed (nothing left to replay).
 expect(await retryReceivedEvents(db,'mock')).toBe(0);
});
