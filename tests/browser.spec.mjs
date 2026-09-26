import { test, expect } from '@playwright/test';

// All API requests are intercepted. The build uses a localhost placeholder;
// even a missing interception cannot reach production.
async function fixture(context) {
  const state = { online: true, lostReply: false, calls: 0, orders: new Map(), closed: false };
  await context.route('http://127.0.0.1:54399/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    if (!state.online) return route.abort('internetdisconnected');
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    let data;
    if (table === 'submit_order_once') {
      state.calls++;
      const o = request.postDataJSON().p_order;
      if (state.closed) return route.fulfill({ status:410,json:{code:'PT410',message:'closed'} });
      if (!state.orders.has(o.id)) state.orders.set(o.id, {
        id:o.id, customer_name:o.customerName, takeout:o.takeout, status:'preparing',
        created_at:o.createdAt, day_session_id:o.daySessionId, order_number:state.orders.size+1,
        order_items:o.items.map(i=>({id:i.id,order_id:o.id,product_id:i.productId,product_name:i.productName,product_price:i.productPrice,quantity:i.quantity,paid_quantity:0,added_batch:0})),
      });
      if (state.lostReply) { state.lostReply=false; return route.abort('failed'); }
      data={order_number:state.orders.get(o.id).order_number};
    } else {
      data = {
        categories:[{id:'fixture-category',name:'LOCAL FIXTURES',order:1}],
        products:[{id:'fixture-product',category_id:'fixture-category',name:'LOCAL FIXTURE',price:10,available:true}],
        orders:[...state.orders.values()],
        day_sessions:state.closed?[]:[{id:'fixture-day',opened_at:'2026-09-26T12:00:00Z',initial_cash:0,status:'open'}],
        expenses:[],
      }[table] ?? [];
    }
    return route.fulfill({ status:200, json:data, headers:{'access-control-allow-origin':'*'} });
  });
  return state;
}
async function capture(page) {
  await page.goto('/');
  await expect(page.getByText('LOCAL FIXTURE', {exact:true})).toBeVisible();
  await page.getByText('LOCAL FIXTURE', {exact:true}).click();
  await page.getByRole('button', {name:/Ver pedido/i}).click();
  await page.getByPlaceholder('Nombre obligatorio...').fill('ISOLATED LOCAL');
}

test('offline queue survives reload and two tabs drain it once with server confirmation', async ({page,context}) => {
  const state=await fixture(context);
  await capture(page);
  state.online=false;
  const offlineNavigator = () => {
    window.fixtureOnline=false;
    Object.defineProperty(navigator,'onLine',{get:()=>window.fixtureOnline,configurable:true});
  };
  await context.addInitScript(offlineNavigator);
  await page.evaluate(offlineNavigator);
  await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await page.getByRole('button',{name:'✅ Confirmar Pedido'}).click();
  await expect(page.getByText('Pedido guardado en este dispositivo',{exact:true})).toBeVisible();
  await expect(page.getByText('Pedido confirmado por el servidor',{exact:true})).toHaveCount(0);
  await expect(page.getByText('1 pedido(s) en este dispositivo sin confirmar',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 pedido(s) en este dispositivo sin confirmar',{exact:true})).toBeVisible();
  expect(state.orders.size).toBe(0);
  const other=await context.newPage(); await other.goto('/cocina');
  state.online=true;
  await Promise.all([page.evaluate(()=>{window.fixtureOnline=true;window.dispatchEvent(new Event('online'));}),other.evaluate(()=>{window.fixtureOnline=true;window.dispatchEvent(new Event('online'));})]);
  await expect.poll(()=>state.orders.size).toBe(1);
  await expect(page.getByText('1 pedido(s) en este dispositivo sin confirmar',{exact:true})).toHaveCount(0);
  await expect(other.getByText('ISOLATED LOCAL',{exact:true})).toBeVisible({timeout:10000});
  expect(state.calls).toBe(1);
  await expect(page).toHaveTitle('LA ISLA');
});

test('lost reply is retried with the same identifier; kitchen polling recovers without realtime',async ({page,context})=>{
  const state=await fixture(context);
  const kitchen=await context.newPage();await kitchen.goto('/cocina');
  await capture(page);state.lostReply=true;
  await page.getByRole('button',{name:'✅ Confirmar Pedido'}).click();
  await expect(page.getByText('Pedido guardado en este dispositivo',{exact:true})).toBeVisible();
  await expect(page.getByText('Pedido confirmado por el servidor',{exact:true})).toBeVisible({timeout:15000});
  await expect(kitchen.getByText('ISOLATED LOCAL',{exact:true})).toBeVisible({timeout:10000});
  expect(state.orders.size).toBe(1);expect(state.calls).toBe(2);
});

test('closed original day leaves a visible blocked order, never resubmits to another day',async ({page,context})=>{
  const state=await fixture(context);await capture(page);state.closed=true;
  await page.getByRole('button',{name:'✅ Confirmar Pedido'}).click();
  await expect(page.getByText('El día de este pedido ya se cerró.',{exact:false}).first()).toBeVisible({timeout:10000});
  await page.getByRole('button',{name:'Verificar ahora'}).click();
  expect(state.orders.size).toBe(0);expect(state.calls).toBe(1);
});
