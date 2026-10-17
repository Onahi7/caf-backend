/* Real HTTP integration checks. Uses only a fresh, explicitly local database. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { JwtService } = require('@nestjs/jwt');
require('reflect-metadata');

const root = path.resolve(__dirname, '..');
const cacheBackend = process.env.API_VALIDATION_CACHE_BACKEND || 'redis';
if (!['redis', 'mongodb'].includes(cacheBackend)) throw new Error('Invalid test cache backend');
const runId = process.env.API_VALIDATION_RUN_ID || String(Date.now());
const database = `caf_api_validation_${runId}`;
if (!/^caf_api_validation_\d+$/.test(database)) throw new Error('Unsafe test database name');
const mongoUri = `mongodb://127.0.0.1:27017/${database}?replicaSet=rs0&directConnection=true`;
const port = 3109;
const base = `http://127.0.0.1:${port}`;
const output = path.join(root, 'test', 'results');
fs.mkdirSync(output, { recursive: true });
const records = [];
let server;
let redisContainer;
let redisPort;
let routes = [];
const fixtures = {};
const tokens = {};
const cleanup = [];
const secret = crypto.randomBytes(32).toString('hex');
const password = 'LocalApiTest123!';
const env = { ...process.env };
// Neutralize every configured local-file setting before choosing test settings.
for (const file of ['.env', '.env.production']) {
  const filename = path.join(root, file);
  if (fs.existsSync(filename)) {
    for (const key of Object.keys(require('dotenv').parse(fs.readFileSync(filename)))) env[key] = '';
  }
}
Object.assign(env, {
  NODE_ENV: 'test', PORT: String(port), MONGODB_URI: mongoUri,
  REDIS_URL: 'redis://127.0.0.1:6389', KV_URL: '', ENABLE_REDIS: cacheBackend === 'mongodb' ? 'false' : 'true', CACHE_BACKEND: cacheBackend,
  JWT_SECRET: secret, JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_EXPIRATION: '1h', JWT_ADMIN_EXPIRATION: '1h', JWT_REFRESH_EXPIRATION: '30d',
  CORS_ORIGIN: 'http://localhost:5173', EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '3199', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '',
  EMR_API_BASE_URL: '', EMR_API_USERNAME: '', EMR_API_PASSWORD: '',
  LAB_API_BASE_URL: '', LAB_API_USERNAME: '', LAB_API_PASSWORD: '',
  GEMINI_API_KEY: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
  WEBAUTHN_RP_ID: 'localhost', WEBAUTHN_RP_NAME: 'Local API validation',
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unwrap = (body) => body?.data ?? body;
const id = (body) => unwrap(body)?._id ?? unwrap(body)?.id;
function record(name, method, url, status, outcome, detail, phase = 'workflow') {
  if (detail !== undefined) detail = JSON.parse(JSON.stringify(detail, (key, value) => /token|password|signature|recoverycode/i.test(key) ? '[REDACTED]' : value));
  records.push({ name, method, url, status, outcome, detail, phase });
  if (outcome === 'fail') console.log(`FAIL ${name}: ${status} ${JSON.stringify(detail).slice(0, 350)}`);
}
async function call(name, method, url, body, role = 'admin', expected = [200, 201, 204], phase = 'workflow', headers = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + url, {
    method, headers: { ...(body === undefined || multipart ? {} : { 'content-type': 'application/json' }),
      ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}),
      ...(['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}), ...headers },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(18000),
  });
  const type = response.headers.get('content-type') || '';
  const bytes = Buffer.from(await response.arrayBuffer());
  const raw = bytes.toString('utf8');
  if (response.ok && type.includes('application/pdf')) assert(bytes.subarray(0, 5).toString() === '%PDF-', 'Invalid PDF bytes');
  let data;
  try { data = JSON.parse(raw); } catch { data = { contentType: type, bytes: raw.length }; }
  const ok = expected.includes(response.status);
  record(name, method, url, response.status, ok ? 'pass' : 'fail', ok ? undefined : data, phase);
  return { status: response.status, body: data, bytes, headers: response.headers };
}
async function scenario(name, run) {
  try { await run(); } catch (error) { record(name, '-', '', 0, 'fail', error.message); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

async function start() {
  redisContainer = execFileSync('docker', ['run', '--detach', '--rm', '--label', 'caf.api-validation=true', '--name', `caf-api-validation-redis-${runId}`, '--publish', '127.0.0.1::6379', 'redis:7-alpine'], { encoding: 'utf8', windowsHide: true }).trim();
  assert(/^[a-f0-9]{64}$/.test(redisContainer), 'Unexpected Docker container identity');
  const mapping = execFileSync('docker', ['port', redisContainer, '6379/tcp'], { encoding: 'utf8', windowsHide: true }).trim();
  assert(/^127\.0\.0\.1:\d+$/.test(mapping), 'Redis is not bound exclusively to loopback');
  redisPort = Number(mapping.split(':')[1]);
  env.REDIS_URL = `redis://127.0.0.1:${redisPort}`;
  await mongoose.connect(mongoUri);
  const { UserSchema } = require('../dist/users/schemas/user.schema');
  const User = mongoose.model('LocalApiUser', UserSchema, 'users');
  const admin = await User.create({ username: 'api_admin', email: 'admin@example.test', firstName: 'API', lastName: 'Admin', role: 'super_admin', passwordHash: password });
  fixtures.admin = admin._id.toString();
  const jwt = new JwtService({ secret });
  tokens.admin = jwt.sign({ sub: fixtures.admin, username: admin.username, role: admin.role }, { expiresIn: '2h' });
  const log = fs.openSync(path.join(output, 'local-api-server.log'), 'w');
  server = spawn(process.execPath, ['dist/main.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw new Error(`Test API exited ${server.exitCode}; inspect test/results/local-api-server.log`);
    try { ready = (await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await wait(500);
  }
  if (!ready) throw new Error('Local API startup timed out');
  const spec = await (await fetch(base + '/docs-json')).json();
  fs.writeFileSync(path.join(output, 'local-api-openapi.json'), JSON.stringify(spec, null, 2));
  for (const [url, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['get', 'post', 'patch', 'put', 'delete'].includes(method)) routes.push({ url, method: method.toUpperCase(), operation });
    }
  }
  function controllers(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { controllers(file); continue; }
      if (!entry.name.endsWith('.controller.ts')) continue;
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('RolesGuard')) continue;
      const prefix = source.match(/@Controller\(['"]([^'"]*)['"]\)/)?.[1];
      if (prefix === undefined) continue;
      const matches = [...source.matchAll(/@(Get|Post|Patch|Put|Delete)\((?:['"]([^'"]*)['"])?\)/g)];
      const rolesFrom = (text) => {
        const annotation = text.match(/@Roles\(([\s\S]*?)\)/)?.[1];
        if (!annotation) return undefined;
        let body = annotation;
        for (const spread of annotation.matchAll(/\.\.\.(\w+)/g)) {
          const declaration = source.match(new RegExp('const\\s+' + spread[1] + '\\s*=\\s*\\[([\\s\\S]*?)\\]'));
          body += declaration?.[1] || '';
        }
        return [...body.matchAll(/UserRole\.([A-Z_]+)/g)].map(x => x[1].toLowerCase());
      };
      const classRoles = rolesFrom(source.slice(0, matches[0]?.index ?? source.length));
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const roles = rolesFrom(source.slice(match.index, matches[i + 1]?.index ?? source.length)) || classRoles;
        const url = ('/api/' + [prefix, match[2]].filter(Boolean).join('/')).replace(/\/+/g, '/').replace(/\/$/, '').replace(/:([^/]+)/g, '{$1}');
        const route = routes.find(r => r.method === match[1].toUpperCase() && r.url === url);
        if (route) route.roles = roles;
      }
    }
  }
  controllers(path.join(root, 'src'));
  console.log(`API ready: ${routes.length} operations; MongoDB=${database}; Redis=127.0.0.1:${redisPort}`);
  fixtures.User = User;
  fixtures.jwt = jwt;
}

async function foundation() {
  for (const [name, isHeadquarters] of [['hq', true], ['branch', false], ['other', false]]) {
    const response = await call(`create ${name}`, 'POST', '/api/branches', { name: `API ${name}`, code: `API-${name}`, address: 'Local test address', phone: '5550001', email: `${name}@example.test`, isHeadquarters, currencyCode: 'SLE' });
    fixtures[name] = id(response.body);
    assert(fixtures[name], `Missing ${name} branch ID`);
  }
  for (const [name, role, branch] of [['manager', 'branch_manager', 'branch'], ['hqmanager', 'branch_manager', 'hq'], ['cashier', 'cashier', 'branch'], ['marketer', 'marketer', 'branch'], ['auditor', 'auditor', null], ['finance', 'finance_manager', null]]) {
    const response = await call(`create ${role} ${name}`, 'POST', '/api/users', { username: `api_${name}`, email: `${name}@example.test`, firstName: 'API', lastName: name, password, role, ...(branch ? { branchId: fixtures[branch] } : {}) });
    fixtures[name] = id(response.body);
    assert(fixtures[name], `Missing ${name} staff ID`);
    tokens[name] = fixtures.jwt.sign({ sub: fixtures[name], username: `api_${name}`, role, ...(branch ? { branchId: fixtures[branch] } : {}) }, { expiresIn: '2h' });
    assert(!JSON.stringify(response.body).includes('passwordHash'), 'Hash leaked on user creation');
  }
  const login = await call('login with password', 'POST', '/api/auth/login', { username: 'api_admin', password }, 'none', [200]);
  assert(login.body.accessToken, 'Login did not issue access token');
  tokens.admin = login.body.accessToken;
  fixtures.refreshToken = login.body.refreshToken;
  await call('refresh token through Redis', 'POST', '/api/auth/refresh', { refreshToken: fixtures.refreshToken }, 'none', [200]);
  if (cacheBackend === 'mongodb') {
    const stored = await mongoose.connection.collection('application_cache').findOne({ key: `keyv:refresh_token:${fixtures.admin}` });
    record('refresh session persisted in shared MongoDB cache', 'MONGO', 'session-store', 0, stored?.value && stored.expiresAt > new Date() ? 'pass' : 'fail', { exists: !!stored }, 'diagnostic');
    const previous = server;
    await new Promise(resolve => { previous.once('exit', resolve); previous.kill(); });
    const restartLog = fs.openSync(path.join(output, 'local-api-server.log'), 'a');
    server = spawn(process.execPath, ['dist/main.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', restartLog, restartLog] });
    fs.closeSync(restartLog);
    let restarted = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (server.exitCode !== null) throw new Error('Restarted API exited unexpectedly');
      try { restarted = (await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (restarted) break;
      await wait(500);
    }
    assert(restarted, 'Restarted API failed readiness');
    await call('refresh survives backend restart with MongoDB sessions', 'POST', '/api/auth/refresh', { refreshToken: fixtures.refreshToken }, 'none', [200]);
  } else {
    const redis = new (require('ioredis'))(env.REDIS_URL);
    try {
      const sessionKeys = await redis.keys(`*refresh_token:${fixtures.admin}*`);
      record('refresh session persisted in configured Redis', 'REDIS', 'session-store', 0, sessionKeys.length > 0 ? 'pass' : 'fail', { matchingKeys: sessionKeys.length }, 'diagnostic');
    } finally { redis.disconnect(); }
  }
  await call('reject wrong password', 'POST', '/api/auth/login', { username: 'api_admin', password: 'Incorrect123!' }, 'none', [401]);
  await call('reject branch manager creation', 'POST', '/api/branches', {}, 'manager', [403]);
  await call('reject cross-branch staff read', 'GET', `/api/users/branch/${fixtures.other}`, undefined, 'manager', [403]);
  await call('reject HQ promotion', 'PATCH', `/api/branches/${fixtures.branch}`, { isHeadquarters: true }, 'manager', [403]);
  await call('reject missing assignment', 'POST', '/api/users', { username: 'unassigned', email: 'unassigned@example.test', firstName: 'A', lastName: 'B', password, role: 'cashier' }, 'admin', [400]);
}

async function workflows() {
  await scenario('supplier workflow', async () => {
    const r = await call('create supplier', 'POST', '/api/suppliers', { name: 'API Supplier', contactPerson: 'Local', phone: '5550002', email: 'supplier@example.test', address: 'Local supplier', paymentTerms: 'net30' });
    fixtures.supplier = id(r.body); assert(fixtures.supplier, 'Supplier ID missing');
    await call('update supplier', 'PATCH', `/api/suppliers/${fixtures.supplier}`, { phone: '5550003' });
  });
  await scenario('customer workflow', async () => {
    const r = await call('create customer', 'POST', '/api/customers', { firstName: 'API', lastName: 'Customer', phone: '5550004', email: 'customer@example.test' });
    fixtures.customer = id(r.body); assert(fixtures.customer, 'Customer ID missing');
    await call('update customer', 'PATCH', `/api/customers/${fixtures.customer}`, { notes: 'API validation' });
  });
  await scenario('product and stock workflow', async () => {
    const r = await call('create stocked product', 'POST', '/api/products', { branchId: fixtures.branch, name: 'API Test Medicine', sku: 'API-MED-001', barcode: 'API000001', category: 'General', brand: 'API', unit: 'tablet', reorderLevel: 10, basePrice: 20, costPrice: 10, initialStock: 100, initialPurchasePrice: 10, initialSellingPrice: 20, initialLotNumber: 'API-LOT-1', initialExpiryDate: '2028-01-01', initialSupplierId: fixtures.supplier });
    fixtures.product = id(r.body); assert(fixtures.product, 'Product ID missing');
    await call('update product', 'PATCH', `/api/products/${fixtures.product}`, { reorderLevel: 12 });
    const batch = await call('create additional batch', 'POST', '/api/batches', { productId: fixtures.product, branchId: fixtures.branch, lotNumber: 'API-LOT-2', expiryDate: '2028-02-01', quantity: 50, purchasePrice: 11, sellingPrice: 20, supplierId: fixtures.supplier });
    fixtures.batch = id(batch.body);
    const product = await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(fixtures.product) });
    record('persisted stock after initial and additional batches', 'DB', 'products', 0, product?.quantityAvailable === 150 ? 'pass' : 'fail', { expected: 150, actual: product?.quantityAvailable });
  });
  await scenario('shift and checkout workflow', async () => {
    const shiftKey = crypto.randomUUID();
    const shiftBody = { branchId: fixtures.branch, cashierId: fixtures.cashier, terminalId: 'API-TERMINAL', openingCash: 100 };
    const r = await call('open cashier shift', 'POST', '/api/shifts/open', shiftBody, 'cashier', [200, 201], 'workflow', { 'X-Idempotency-Key': shiftKey });
    fixtures.shift = id(r.body); assert(fixtures.shift, 'Shift ID missing');
    const replay = await call('replay shift idempotency key', 'POST', '/api/shifts/open', shiftBody, 'cashier', [200, 201], 'workflow', { 'X-Idempotency-Key': shiftKey });
    record('idempotency returns the original shift', 'ASSERT', '/api/shifts/open', replay.status, id(replay.body) === fixtures.shift ? 'pass' : 'fail', { expectedId: fixtures.shift, actualId: id(replay.body) });
    const saleBody = { branchId: fixtures.branch, shiftId: fixtures.shift, terminalId: 'API-TERMINAL', items: [{ productId: fixtures.product, quantity: 2, unitPrice: 20 }], paymentMethod: 'cash', amountPaid: 40, customerId: fixtures.customer, acceptServerTotal: true };
    const sale = await call('cash checkout', 'POST', '/api/sales/checkout', saleBody, 'cashier');
    fixtures.sale = id(sale.body) || sale.body?.data?.sale?._id || sale.body?.sale?._id;
    const storedSale = await mongoose.connection.collection('sales').findOne({ branchId: new mongoose.Types.ObjectId(fixtures.branch) });
    fixtures.sale = storedSale?._id.toString() || fixtures.sale;
    fixtures.receipt = storedSale?.receiptNumber;
    assert(storedSale, 'Sale was not persisted');
    record('checkout persisted total and collected cash', 'DB', 'sales', 0, storedSale.total === 40 && storedSale.amountPaid === 40 ? 'pass' : 'fail', { total: storedSale.total, amountPaid: storedSale.amountPaid });
    const product = await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(fixtures.product) });
    record('checkout deducted inventory', 'DB', 'products', 0, product.quantityAvailable === 148 ? 'pass' : 'fail', { expected: 148, actual: product.quantityAvailable });
  });
}

async function extendedWorkflows() {
  const b = fixtures.branch;
  const p = fixtures.product;
  const c = fixtures.customer;
  const employeeId = fixtures.cashier;
  const date = '2026-10-17';
  async function create(name, url, body, patch) {
    const response = await call(`create ${name}`, 'POST', url, body);
    const entityId = id(response.body);
    assert(entityId, `${name} ID missing`);
    fixtures[name] = entityId;
    await call(`read ${name}`, 'GET', `${url}/${entityId}`);
    if (patch) await call(`update ${name}`, 'PATCH', `${url}/${entityId}`, patch);
    return entityId;
  }
  await scenario('settings configuration', async () => {
    await call('read system settings', 'GET', '/api/settings');
    await call('update system settings', 'PATCH', '/api/settings', {});
    for (const [name, url, body] of [
      ['tax', '/api/settings/taxes', { name: 'API Tax', rate: 5, type: 'percentage' }],
      ['payment', '/api/settings/payment-methods', { name: 'API Payment', type: 'cash' }],
    ]) {
      const r = await call(`create ${name}`, 'POST', url, body);
      fixtures[name] = id(r.body); assert(fixtures[name], `${name} ID missing`);
      await call(`update ${name}`, 'PATCH', `${url}/${fixtures[name]}`, { name: `API Updated ${name}` });
      await call(`toggle ${name}`, 'PATCH', `${url}/${fixtures[name]}/toggle-status`, {});
      cleanup.push([`delete ${name}`, 'DELETE', `${url}/${fixtures[name]}`]);
    }
  });
  await scenario('product pricing and inventory adjustments', async () => {
    await call('update product pricing', 'PATCH', `/api/products/${p}/pricing`, { basePrice: 20, suggestedRetailPrice: 20, costPrice: 10 });
    await call('sync batch prices', 'POST', `/api/products/${p}/sync-batch-prices?branchId=${b}`, {});
    await call('bulk price update', 'POST', '/api/products/bulk-price-update', { strategy: { useProductBasePrice: true, useLatestBatchPrice: false, useCostPlusMarkup: false }, applyToProducts: [p], newBasePrice: 20 });
    await call('inventory adjustment', 'POST', '/api/inventory/adjust', { branchId: b, productId: p, batchId: fixtures.batch, quantityChange: 1, reason: 'API stock adjustment' });
    await call('update batch', 'PATCH', `/api/batches/${fixtures.batch}`, { sellingPrice: 20 });
  });
  await scenario('email template workflow', async () => {
    const r = await call('create email template', 'POST', '/api/email/templates', { name: 'API template', subject: 'API subject', body: '<p>Local test</p>', type: 'receipt' });
    fixtures.emailTemplate = id(r.body); assert(fixtures.emailTemplate, 'Email template ID missing');
    await call('update email template', 'PATCH', `/api/email/templates/${fixtures.emailTemplate}`, { subject: 'Updated API subject' });
    await call('toggle email template', 'PATCH', `/api/email/templates/${fixtures.emailTemplate}/toggle-status`, {});
  });
  await scenario('printer configuration workflow', async () => {
    const net = require('node:net');
    const received = [];
    const sink = net.createServer(socket => socket.on('data', chunk => received.push(chunk)));
    await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
    const printerPort = sink.address().port;
    const printer = await create('printer', '/api/printers', { branchId: b, terminalId: 'API-TERMINAL', name: 'API Test Printer', model: 'generic_esc_pos', connectionType: 'network', paperWidth: 80, ipAddress: '127.0.0.1', port: printerPort }, { name: 'API Updated Printer' });
    try {
      const result = await call('printer TCP connection', 'POST', `/api/printers/${printer}/test`, {});
      assert(result.body.success, 'Printer TCP connection failed');
      const payload = [27, 64, 65, 80, 73, 10];
      const printed = await call('printer real TCP delivery', 'POST', '/api/printers/network/print', { ipAddress: '127.0.0.1', port: printerPort, data: payload }, 'cashier');
      await wait(100);
      assert(printed.body.success && Buffer.concat(received).equals(Buffer.from(payload)), 'Print bytes did not reach TCP receiver');
      record('printer TCP bytes match', 'ASSERT', '/api/printers/network/print', 200, 'pass');
    } finally { await new Promise(resolve => sink.close(resolve)); }
    cleanup.push(['delete printer configuration', 'DELETE', `/api/printers/${printer}`]);
  });
  await scenario('promotion workflow', async () => {
    const promotion = await create('promotion', '/api/promotions', { name: 'API Discount', type: 'percentage', scope: 'entire_transaction', value: 5, branchId: b, startDate: '2026-01-01', endDate: '2027-12-31', code: 'API5' }, { value: 6 });
    await call('disable promotion', 'PATCH', `/api/promotions/${promotion}/toggle-status`, {});
    await call('restore promotion', 'PATCH', `/api/promotions/${promotion}/toggle-status`, {});
    cleanup.push(['delete promotion', 'DELETE', `/api/promotions/${promotion}`]);
  });
  await scenario('purchase receipt workflow', async () => {
    const purchase = await create('purchase', '/api/purchase-orders', { supplierId: fixtures.supplier, branchId: b, items: [{ productId: p, quantity: 10, unitPrice: 10 }], expectedDeliveryDate: '2026-11-01', createdBy: fixtures.admin });
    await call('receive purchase order', 'POST', `/api/purchase-orders/${purchase}/receive`, { receivedItems: [{ productId: p, receivedQuantity: 10, expiryDate: '2028-03-01', sellingPrice: 20, purchasePrice: 10 }], receivedBy: fixtures.admin });
    const other = await call('create cancellable purchase', 'POST', '/api/purchase-orders', { supplierId: fixtures.supplier, branchId: b, items: [{ productId: p, quantity: 1, unitPrice: 10 }], expectedDeliveryDate: '2026-11-01', createdBy: fixtures.admin });
    if (id(other.body)) { await call('cancel purchase', 'PATCH', `/api/purchase-orders/${id(other.body)}/cancel`, {}); await call('reject deleting cancelled purchase', 'DELETE', `/api/purchase-orders/${id(other.body)}`, undefined, 'admin', [400]); }
    const deletable = await call('create deletable purchase', 'POST', '/api/purchase-orders', { supplierId: fixtures.supplier, branchId: b, items: [{ productId: p, quantity: 1, unitPrice: 10 }], expectedDeliveryDate: '2026-11-01', createdBy: fixtures.admin });
    if (id(deletable.body)) cleanup.push(['delete pending purchase', 'DELETE', `/api/purchase-orders/${id(deletable.body)}`]);
  });
  await scenario('transfer approval workflow', async () => {
    const transfer = await create('transfer', '/api/transfers', { sourceBranchId: b, destinationBranchId: fixtures.other, productId: p, quantity: 2, reason: 'API validation' });
    await call('approve transfer', 'PATCH', `/api/transfers/${transfer}/approve`, {});
    const reject = await call('create rejectable transfer', 'POST', '/api/transfers', { sourceBranchId: b, destinationBranchId: fixtures.other, productId: p, quantity: 1, reason: 'API reject validation' });
    if (id(reject.body)) await call('reject transfer', 'PATCH', `/api/transfers/${id(reject.body)}/reject`, { rejectionReason: 'Test rejection' });
  });
  await scenario('expense workflow', async () => {
    const expense = await create('expense', '/api/expenses', { branchId: b, shiftId: fixtures.shift, amount: 5, category: 'other', description: 'API expense' }, { description: 'API updated expense' });
    cleanup.push(['soft-delete expense', 'PATCH', `/api/expenses/${expense}/soft-delete`, {}]);
  });
  await scenario('finance ledger workflow', async () => {
    const r = await call('create finance transaction', 'POST', '/api/finance/transactions', { branchId: b, type: 'cash_in', amount: 25, category: 'other', description: 'API ledger transaction' });
    fixtures.financeTransaction = id(r.body);
  });
  await scenario('payroll workflow', async () => {
    const salary = await create('salary', '/api/finance-manager/salaries', { employeeId, branchId: b, period: '2026-10', baseSalary: 100, allowances: 10, deductions: 5 }, { allowances: 15 });
    await call('approve salary', 'PATCH', `/api/finance-manager/salaries/${salary}/approve`, {});
    await call('pay salary', 'PATCH', `/api/finance-manager/salaries/${salary}/pay`, { paymentMethod: 'cash', paymentDate: date });
    const doc = await mongoose.connection.collection('salaries').findOne({ _id: new mongoose.Types.ObjectId(salary) });
    record('payroll persisted status', 'DB', 'salaries', 0, doc?.status === 'paid' ? 'pass' : 'fail', { status: doc?.status, netSalary: doc?.netSalary });
  });
  await scenario('cashbook workflow', async () => {
    const cashEntry = await create('cashEntry', '/api/finance-manager/cash-entries', { branchId: b, type: 'income', category: 'other', amount: 20, description: 'API cashbook', entryDate: date });
    cleanup.push(['delete cash entry', 'PATCH', `/api/finance-manager/cash-entries/${cashEntry}/delete`, {}]);
  });
  await scenario('loan workflow', async () => {
    const loan = await create('loan', '/api/finance-manager/loans', { referenceNumber: 'API-LOAN', direction: 'received', branchId: b, counterpartyName: 'Local Test Lender', principalAmount: 100, interestRatePercent: 0, startDate: date, termMonths: 1 });
    await call('accrue loan interest', 'PATCH', `/api/finance-manager/loans/${loan}/accrue`, {});
    await call('repay loan', 'PATCH', `/api/finance-manager/loans/${loan}/repay`, { amount: 100, paymentDate: date });
    await call('close repaid loan', 'PATCH', `/api/finance-manager/loans/${loan}/close`, {});
  });
  await scenario('staff advance workflow', async () => {
    const advance = await create('advance', '/api/finance-manager/advances', { referenceNumber: 'API-ADVANCE', employeeId, branchId: b, type: 'cash', totalAmount: 20, advanceDate: date });
    await call('repay staff advance', 'PATCH', `/api/finance-manager/advances/${advance}/repay`, { amount: 20, type: 'cash_repayment', repaymentDate: date });
  });
  await scenario('reconciliation workflow', async () => {
    const reconciliation = await create('reconciliation', '/api/finance-manager/reconciliations', { source: 'caf', branchId: b, period: date, totalSales: 40, totalExpenses: 5, expectedCash: 135, actualCash: 135 });
    await call('review reconciliation', 'PATCH', `/api/finance-manager/reconciliations/${reconciliation}/review`, { status: 'approved', reviewNotes: 'API test' });
  });
  await scenario('saved report workflow', async () => {
    const saved = await create('savedReport', '/api/saved-reports', { name: 'API report', reportKey: 'sales', route: '/admin/reports', params: { branchId: b } }, { name: 'Updated API report' });
    await call('other user cannot read saved report', 'GET', `/api/saved-reports/${saved}`, undefined, 'manager', [404]);
    cleanup.push(['delete saved report', 'DELETE', `/api/saved-reports/${saved}`]);
  });
  await scenario('recurring invoice workflow', async () => {
    const recurring = await create('recurring', '/api/recurring-invoices', { branchId: b, customerId: c, customerName: 'API Customer', description: 'API recurring', items: [{ productId: p, productName: 'API Test Medicine', quantity: 1, unitPrice: 20, subtotal: 20 }], total: 20, cadence: 'monthly', nextRunAt: '2027-01-01' }, { description: 'API updated recurring' });
    await call('run recurring invoice', 'POST', `/api/recurring-invoices/${recurring}/run-now`, {});
    await call('other user cannot run recurring invoice', 'POST', `/api/recurring-invoices/${recurring}/run-now`, {}, 'manager', [404]);
    cleanup.push(['delete recurring invoice', 'DELETE', `/api/recurring-invoices/${recurring}`]);
  });
  await scenario('customer order persisted fixture lifecycle', async () => {
    // Upload delivery requires Cloudinary; seed only its persisted boundary locally.
    const { CustomerOrderSchema } = require('../dist/customer-orders/schemas/customer-order.schema');
    const Order = mongoose.models.LocalApiCustomerOrder || mongoose.model('LocalApiCustomerOrder', CustomerOrderSchema, 'customerorders');
    const order = await Order.create({ orderNumber: 'API-CUSTOMER-ORDER', branchId: b, createdBy: fixtures.admin, items: [{ extractedName: 'API Test Medicine', extractedQuantity: 1, status: 'unmatched' }] });
    fixtures.customerOrder = order._id.toString();
    await call('read customer order fixture', 'GET', `/api/customer-orders/${fixtures.customerOrder}`);
    await call('match customer order item', 'PATCH', `/api/customer-orders/${fixtures.customerOrder}/items`, { items: [{ index: 0, matchedProductId: p, status: 'matched' }] });
    record('cloud document upload delivery', 'EXTERNAL', '/api/customer-orders/upload', 0, 'blocked', 'Cloudinary credentials are unavailable; downstream persisted order read/update is tested with an explicit DB fixture.', 'external');
  });
  await scenario('proforma and delivery workflow', async () => {
    const proforma = await create('proforma', '/api/proforma-invoices', { customerId: c, branchId: b, items: [{ productId: p, productName: 'API Test Medicine', quantity: 1, unitPrice: 20 }], validUntil: '2027-01-01' });
    await call('submit proforma', 'PATCH', `/api/proforma-invoices/${proforma}/submit`, {});
    await call('approve proforma', 'PATCH', `/api/proforma-invoices/${proforma}/approve`, {});
    await call('pay proforma', 'POST', `/api/proforma-invoices/${proforma}/payments`, { amount: 20, method: 'cash' });
    const delivery = await create('delivery', '/api/delivery-notes', { proformaInvoiceId: proforma, customerId: c, branchId: b, items: [{ productId: p, productName: 'API Test Medicine', quantity: 1 }] });
    await call('mark delivered', 'PATCH', `/api/delivery-notes/${delivery}/deliver`, { notes: 'Local delivery test' });
  });
  await scenario('cycle count workflow', async () => {
    const count = await create('cycleCount', '/api/cycle-counts', { branchId: b, notes: 'API cycle' });
    const doc = await mongoose.connection.collection('cyclecounts').findOne({ _id: new mongoose.Types.ObjectId(count) });
    await call('submit cycle count', 'PATCH', `/api/cycle-counts/${count}/submit`, { lines: doc.lines.map(line => ({ batchId: line.batchId.toString(), countedQuantity: line.systemQuantity })) });
    await call('approve cycle count', 'PATCH', `/api/cycle-counts/${count}/approve`, {});
  });
  await scenario('marketer workflow', async () => {
    const r = await call('assign marketer stock', 'POST', '/api/marketer/assignments', { branchId: b, marketerId: fixtures.marketer, productId: p, assignedQuantity: 3, assignedUnitPrice: 20 });
    const assignment = id(r.body); fixtures.assignment = assignment; assert(assignment, 'Assignment ID missing');
    await call('accept marketer assignment', 'PATCH', `/api/marketer/assignments/${assignment}/accept`, {}, 'marketer');
    await call('record marketer sale', 'POST', '/api/marketer/sales', { assignmentId: assignment, quantity: 1, customerId: c }, 'marketer');
  });
  await scenario('WebAuthn challenge workflows', async () => {
    const registration = await call('start passkey registration', 'POST', '/api/webauthn/register/start', {}, 'cashier');
    // Standards-shaped, software-generated ES256 credential. This validates the
    // server ceremony without claiming that physical platform hardware was tested.
    const keypair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = keypair.publicKey.export({ format: 'jwk' });
    const credentialId = crypto.randomBytes(32);
    function cbor(value) {
      const header = (major, n) => n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
      if (Number.isInteger(value)) return value >= 0 ? header(0, value) : header(1, -value - 1);
      if (Buffer.isBuffer(value)) return Buffer.concat([header(2, value.length), value]);
      if (typeof value === 'string') { const bytes = Buffer.from(value); return Buffer.concat([header(3, bytes.length), bytes]); }
      if (value instanceof Map) return Buffer.concat([header(5, value.size), ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)])]);
      throw new Error('Unsupported test CBOR value');
    }
    const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
    const count = Buffer.alloc(4);
    const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
    const authData = Buffer.concat([crypto.createHash('sha256').update('localhost').digest(), Buffer.from([0x45]), count, Buffer.alloc(16), length, credentialId, cose]);
    const attestation = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: registration.body.challenge, origin: 'http://localhost:5173', crossOrigin: false }));
    await call('finish standards-shaped virtual passkey registration', 'POST', '/api/webauthn/register/finish', { id: credentialId.toString('base64url'), rawId: credentialId.toString('base64url'), type: 'public-key', response: { clientDataJSON: clientData.toString('base64url'), attestationObject: attestation.toString('base64url'), transports: ['internal'] } }, 'cashier', [200]);
    let counter = 0;
    function assertion(challenge, options = {}) {
      const count = Buffer.alloc(4); count.writeUInt32BE(++counter);
      const authData = Buffer.concat([crypto.createHash('sha256').update('localhost').digest(), Buffer.from([options.flags ?? 5]), count]);
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: options.origin || 'http://localhost:5173', crossOrigin: false }));
      const signed = Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]);
      return { id: credentialId.toString('base64url'), rawId: credentialId.toString('base64url'), type: 'public-key', response: { clientDataJSON: clientData.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: crypto.sign('sha256', signed, keypair.privateKey).toString('base64url') } };
    }
    const login = await call('start passkey login', 'POST', '/api/webauthn/login/start', { username: 'api_cashier' }, 'none');
    const proof = assertion(login.body.challenge);
    const loggedIn = await call('valid signed passkey login', 'POST', '/api/webauthn/login/finish', proof, 'none');
    assert(loggedIn.body.accessToken, 'Passkey did not issue access token');
    await call('passkey challenge replay rejected', 'POST', '/api/webauthn/login/finish', proof, 'none', [400, 401]);
    const unnamed = await call('start discoverable login', 'POST', '/api/webauthn/login/start', {}, 'none');
    await call('discoverable signed login', 'POST', '/api/webauthn/login/finish', assertion(unnamed.body.challenge), 'none');
    const foreign = await call('start foreign origin test', 'POST', '/api/webauthn/login/start', { username: 'api_cashier' }, 'none');
    await call('foreign origin assertion rejected', 'POST', '/api/webauthn/login/finish', assertion(foreign.body.challenge, { origin: 'https://untrusted.example' }), 'none', [401]);
    const step = await call('start passkey step-up', 'POST', '/api/webauthn/step-up/start', {}, 'cashier');
    await call('valid signed step-up', 'POST', '/api/webauthn/step-up/finish', { ...assertion(step.body.challenge), reason: 'API validation' }, 'cashier');
    const noUv = await call('start unverified step-up', 'POST', '/api/webauthn/step-up/start', {}, 'cashier');
    await call('step-up requires user verification', 'POST', '/api/webauthn/step-up/finish', { ...assertion(noUv.body.challenge, { flags: 1 }), reason: 'API validation' }, 'cashier', [400, 401]);
    const expired = await call('start expiry test', 'POST', '/api/webauthn/login/start', { username: 'api_cashier' }, 'none');
    await mongoose.connection.collection('webauthn_challenges').updateOne({ challenge: expired.body.challenge }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await call('expired passkey challenge rejected before TTL cleanup', 'POST', '/api/webauthn/login/finish', assertion(expired.body.challenge), 'none', [400, 401]);
    const tampered = await call('start signature rejection test', 'POST', '/api/webauthn/login/start', { username: 'api_cashier' }, 'none');
    const badSignature = assertion(tampered.body.challenge); badSignature.response.signature = crypto.randomBytes(70).toString('base64url');
    await call('invalid cryptographic signature rejected', 'POST', '/api/webauthn/login/finish', badSignature, 'none', [401]);
    const recovery = await call('generate recovery codes', 'POST', '/api/webauthn/recovery-codes/generate', {}, 'cashier');
    assert(recovery.body.codes?.length === 10, 'Expected ten recovery codes');
    await call('single-use recovery code login', 'POST', '/api/webauthn/login/recovery', { username: 'api_cashier', code: recovery.body.codes[0] }, 'none');
    await call('recovery code replay rejected', 'POST', '/api/webauthn/login/recovery', { username: 'api_cashier', code: recovery.body.codes[0] }, 'none', [401]);
    record('physical platform authenticator', 'EXTERNAL', '/api/webauthn', 0, 'blocked', 'Software P-256 registration, login and step-up exercised; physical hardware unavailable.', 'external');
  });
  await scenario('branch and user update lifecycle', async () => {
    await call('update branch details', 'PATCH', `/api/branches/${b}`, { phone: '5550099' });
    await call('update own branch configuration', 'PATCH', `/api/branches/${b}/configuration`, { reorderThreshold: 10, expiryAlertDays: [30, 60], allowNegativeStock: false }, 'manager');
    await call('reassign cashier to another active branch', 'PATCH', `/api/users/${employeeId}`, { branchId: fixtures.other });
    const profile = await call('old token sees current branch', 'GET', '/api/auth/me', undefined, 'cashier');
    record('current branch overrides stale JWT', 'ASSERT', '/api/auth/me', profile.status, profile.body.branchId === fixtures.other ? 'pass' : 'fail', { expected: fixtures.other, actual: profile.body.branchId });
    await call('restore cashier test assignment', 'PATCH', `/api/users/${employeeId}`, { branchId: b });
    await call('deactivate cashier', 'PATCH', `/api/users/${employeeId}/deactivate`, {});
    await call('inactive cashier token denied', 'GET', '/api/auth/me', undefined, 'cashier', [401]);
    await call('reactivate cashier', 'PATCH', `/api/users/${employeeId}`, { isActive: true });
    await call('toggle customer status', 'PATCH', `/api/customers/${c}/toggle-status`, {});
    await call('restore customer status', 'PATCH', `/api/customers/${c}/toggle-status`, {});
    await call('award customer loyalty', 'POST', `/api/customers/${c}/loyalty-points`, { points: 5 });
    await call('mark all notifications read', 'POST', '/api/notifications/read-all', {});
  });
}

async function finalChecks() {
  await scenario('real Redis background worker execution', async () => {
    if (cacheBackend === 'mongodb') {
      await call('job status remains available with Redis disabled', 'GET', '/api/jobs/stats');
      return;
    }
    const Queue = require('bull');
    const queue = new Queue('low-stock-alerts', env.REDIS_URL);
    try {
      const job = await queue.add('check-low-stock', { timestamp: new Date().toISOString(), manual: true });
      let state;
      for (let attempt = 0; attempt < 24; attempt++) {
        state = await job.getState();
        if (['completed', 'failed'].includes(state)) break;
        await wait(500);
      }
      const stored = await queue.getJob(job.id);
      record('background low-stock job executes to completion', 'REDIS', 'low-stock-alerts', 0, state === 'completed' ? 'pass' : 'fail', { state, error: stored?.failedReason }, 'diagnostic');
    } finally { await queue.close(); }
  });
  await scenario('refresh token revocation', async () => {
    await call('logout admin test session', 'POST', '/api/auth/logout', {}, 'admin', [204]);
    await call('logged-out refresh token must be rejected', 'POST', '/api/auth/refresh', { refreshToken: fixtures.refreshToken }, 'none', [401]);
  });
  await scenario('product and batch stock ledgers stay synchronized', async () => {
    for (const product of await mongoose.connection.collection('products').find({}).toArray()) {
      const batches = await mongoose.connection.collection('batches').find({ productId: product._id }).toArray();
      const total = batches.reduce((sum, batch) => sum + batch.quantityAvailable, 0);
      record('product stock equals batch ledger', 'DB', 'products/batches', 0, product.quantityAvailable === total ? 'pass' : 'fail', { productId: product._id, productQuantity: product.quantityAvailable, batchQuantity: total });
    }
  });
  await scenario('runtime reference schema diagnostics', async () => {
    const models = [
      ['Product', '../dist/products/schemas/product.schema', 'ProductSchema', ['branchId']],
      ['User', '../dist/users/schemas/user.schema', 'UserSchema', ['branchId']],
      ['Batch', '../dist/batches/schemas/batch.schema', 'BatchSchema', ['branchId', 'productId']],
      ['Salary', '../dist/finance-manager/schema/salary.schema', 'SalarySchema', ['employeeId', 'branchId']],
    ];
    for (const [name, file, exported, fields] of models) {
      const schema = require(file)[exported];
      for (const field of fields) {
        const type = schema.path(field)?.instance;
        record(`${name}.${field} runtime reference type`, 'SCHEMA', name, 0, type === 'ObjectId' ? 'pass' : 'fail', { expected: 'ObjectId', actual: type }, 'diagnostic');
      }
    }
  });
}

async function smoke() {
  const fake = new mongoose.Types.ObjectId().toString();
  function value(name, route) {
    const key = name.toLowerCase();
    if (key === 'branchid' || key === 'sourcebranchid') return fixtures.branch;
    if (key === 'destinationbranchid') return fixtures.other;
    if (key === 'cashierid') return fixtures.cashier;
    if (key === 'userid' || key === 'employeeid') return fixtures.cashier;
    if (key === 'productid') return fixtures.product || fake;
    if (key === 'supplierid') return fixtures.supplier || fake;
    if (key === 'customerid') return fixtures.customer || fake;
    if (key === 'shiftid') return fixtures.shift || fake;
    if (key === 'receiptnumber') return fixtures.receipt || 'NONE';
    if (key === 'sku') return 'API-MED-001';
    if (key === 'barcode') return 'API000001';
    if (key === 'code') return 'API5';
    if (key === 'terminalid') return 'API-TERMINAL';
    if (key === 'id') {
      for (const [prefix, fixture] of [['/api/finance-manager/reconciliations', 'reconciliation'], ['/api/finance-manager/salaries', 'salary'], ['/api/finance-manager/cash-entries', 'cashEntry'], ['/api/finance-manager/loans', 'loan'], ['/api/finance-manager/advances', 'advance'], ['/api/branches', 'branch'], ['/api/users', 'cashier'], ['/api/products', 'product'], ['/api/batches', 'batch'], ['/api/suppliers', 'supplier'], ['/api/customers', 'customer'], ['/api/customer-orders', 'customerOrder'], ['/api/shifts', 'shift'], ['/api/sales', 'sale'], ['/api/expenses', 'expense'], ['/api/promotions', 'promotion'], ['/api/purchase-orders', 'purchase'], ['/api/transfers', 'transfer'], ['/api/cycle-counts', 'cycleCount'], ['/api/proforma-invoices', 'proforma'], ['/api/delivery-notes', 'delivery'], ['/api/saved-reports', 'savedReport'], ['/api/recurring-invoices', 'recurring']]) if (route.url.startsWith(prefix)) return fixtures[fixture] || fake;
      return fake;
    }
    return fake;
  }
  for (const [index, route] of routes.entries()) {
    const url = route.url.replace(/\{([^}]+)\}/g, (_, name) => encodeURIComponent(value(name, route)));
    // Authentication sweep includes every operation, including write handlers.
    await scenario(`auth sweep ${route.method} ${route.url}`, async () => {
      const publicPath = ['/api', '/health', '/api/auth/login', '/api/auth/refresh', '/api/auth/biometric/verify', '/api/webauthn/login/start', '/api/webauthn/login/finish', '/api/webauthn/login/recovery'].includes(route.url);
      await call(`authentication ${route.method} ${route.url}`, route.method, url, ['POST', 'PATCH', 'PUT'].includes(route.method) ? {} : undefined, 'none', publicPath ? [200, 201, 400, 401, 404] : [401, 403], 'authentication');
    });
    if (route.method === 'GET') await scenario(`read ${route.url}`, async () => {
      const query = new URLSearchParams();
      for (const param of route.operation.parameters || []) {
        if (param.in !== 'query') continue;
        const name = param.name;
        const defaults = { branchId: fixtures.branch, cashierId: fixtures.cashier, employeeId: fixtures.cashier, productId: fixtures.product, batchId: fixtures.batch, supplierId: fixtures.supplier, customerId: fixtures.customer, shiftId: fixtures.shift, startDate: '2026-01-01', endDate: '2026-12-31', dateFrom: '2026-01-01', dateTo: '2026-12-31', days: '90', daysUntilExpiry: '90', date: '2026-10-17', year: '2026', month: '10', page: '1', limit: '10', name: 'API', items: JSON.stringify([{ productId: fixtures.product, quantity: 1 }]), search: 'API', query: 'API', q: 'API', format: 'pdf', terminalId: 'API-TERMINAL' };
        if (defaults[name]) query.set(name, defaults[name]);
        else if (param.required && param.schema?.enum) query.set(name, param.schema.enum[0]);
      }
      const endpoint = url + (query.size ? `?${query}` : '');
      const r = await call(`authenticated read ${route.url}`, 'GET', endpoint, undefined, 'admin', [200, 201, 204, 400, 404], 'read-probe');
      // A 400 or missing-resource 404 is recorded as reached, never a successful workflow.
      const last = records.at(-1);
      if ([400, 404].includes(r.status)) {
        // `format` is documented explicitly by export controllers. Rejecting it
        // is a contract failure, not a missing test fixture.
        const rejectsDocumentedFormat = /\/export(?:\?|$)/.test(endpoint) && JSON.stringify(r.body.message).includes('property format should not exist');
        last.outcome = rejectsDocumentedFormat ? 'fail' : 'needs-fixture';
        last.detail = r.body;
      }
    });
    if (index % 40 === 0) console.log(`Route sweep ${index + 1}/${routes.length}`);
  }
  // Validate the authenticated write boundary on every documented write route.
  // These probes are deliberately separate from successful business workflows.
  for (const route of routes.filter(r => r.method !== 'GET')) {
    const url = route.url.replace(/\{([^}]+)\}/g, () => fake);
    await scenario(`write boundary ${route.method} ${route.url}`, async () => {
      await call(`write boundary ${route.method} ${route.url}`, route.method, url, route.method === 'DELETE' ? undefined : {}, 'admin', [200, 201, 204, 400, 401, 403, 404, 409, 422, 429], 'write-boundary');
    });
  }
  const actors = { manager: 'branch_manager', cashier: 'cashier', marketer: 'marketer', auditor: 'auditor', finance: 'finance_manager' };
  for (const route of routes.filter(r => r.roles?.length)) {
    for (const [actor, role] of Object.entries(actors)) {
      if (route.roles.includes(role)) continue;
      const url = route.url.replace(/\{([^}]+)\}/g, () => fake);
      await scenario(`role guard ${actor} ${route.method} ${route.url}`, async () => {
        await call(`${actor} denied ${route.method} ${route.url}`, route.method, url, ['POST','PATCH','PUT'].includes(route.method) ? {} : undefined, actor, [403], 'authorization');
      });
    }
  }
}

function report() {
  const count = (outcome) => records.filter((r) => r.outcome === outcome).length;
  const covered = new Set(records.filter((r) => r.phase === 'authentication').map((r) => `${r.method} ${r.name.replace(/^authentication \S+ /, '')}`));
  const matchers = routes.map(route => ({ ...route, pattern: new RegExp('^' + route.url.replace(/\{[^}]+\}/g, '[^/]+') + '$'), parameters: (route.url.match(/\{/g) || []).length }))
    .sort((a, b) => a.parameters - b.parameters || b.url.length - a.url.length);
  const owners = new Map(records.map(r => [r, matchers.find(route => r.method === route.method && route.pattern.test(r.url.split('?')[0]))]));
  const matrix = routes.map(route => {
    const checks = records.filter(r => owners.get(r)?.url === route.url && r.method === route.method);
    return { method: route.method, path: route.url, tags: route.operation.tags,
      authenticatedSuccess: checks.some(r => ['workflow','read-probe'].includes(r.phase) && r.outcome === 'pass' && r.status >= 200 && r.status < 300),
      authenticationChecked: checks.some(r => r.phase === 'authentication'),
      writeBoundaryChecked: checks.some(r => r.phase === 'write-boundary'),
      failures: checks.filter(r => r.outcome === 'fail').length };
  });
  const result = { timestamp: new Date().toISOString(), database, base, cacheBackend, redisHostPort: redisPort, routes: matrix, summary: { documentedOperations: routes.length, authenticationChecks: covered.size, roleDenialChecks: records.filter(r => r.phase === 'authorization').length, authenticatedSuccessOperations: matrix.filter(r => r.authenticatedSuccess).length, checks: records.length, passed: count('pass'), failed: count('fail'), needsFixture: count('needs-fixture'), externalBlocked: count('blocked') }, records };
  fs.writeFileSync(path.join(output, 'local-api-validation.json'), JSON.stringify(result, null, 2));
  const lines = ['# Local API validation', '', `Generated: ${result.timestamp}`, `Database: ${database} (local Docker MongoDB)`, `Redis: dedicated disposable instance on 127.0.0.1:${redisPort}`, '', '## Summary', '', ...Object.entries(result.summary).map(([key, val]) => `- ${key}: ${val}`), '', 'Authentication/read probes establish route reachability, not complete business-operation correctness.', 'Workflow checks use real HTTP, guards, validation, MongoDB and Redis. External delivery and hardware are not proven by this run.', '', '## Failures / incomplete read fixtures', '', '| Phase | Check | Status | Detail |', '| --- | --- | --- | --- |', ...records.filter((r) => r.outcome !== 'pass').map((r) => `| ${r.phase} | ${r.name} | ${r.status} | ${JSON.stringify(r.detail).replace(/\|/g, '/').slice(0, 600)} |`), '', '## Operation matrix', '', '| Method | Route | Authentication checked | Authenticated success | Write boundary checked | Failing checks |', '| --- | --- | --- | --- | --- | --- |', ...matrix.map(r => `| ${r.method} | ${r.path} | ${r.authenticationChecked} | ${r.authenticatedSuccess} | ${r.writeBoundaryChecked} | ${r.failures} |`), ''];
  fs.writeFileSync(path.join(output, 'local-api-validation.md'), lines.join('\n'));
  console.log(JSON.stringify(result.summary));
}

(async () => {
  try { await start(); await foundation(); await workflows(); await extendedWorkflows(); await smoke(); for (const args of cleanup) await call(...args); await finalChecks(); }
  catch (error) { record('runner', '-', '', 0, 'fail', { message: error.message, cause: error.cause?.message, serverExit: server?.exitCode }); }
  finally {
    report();
    if (server && server.exitCode === null) { server.kill(); await wait(1000); }
    await mongoose.disconnect();
    if (redisContainer && /^[a-f0-9]{64}$/.test(redisContainer)) {
      try { execFileSync('docker', ['rm', '--force', redisContainer], { stdio: 'ignore', windowsHide: true }); } catch {}
    }
  }
})().then(() => process.exit(records.some((r) => r.outcome === 'fail') ? 1 : 0));
