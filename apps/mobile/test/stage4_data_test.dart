import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/api/api_error.dart';
import 'package:salonkit/data/announcements_api.dart';
import 'package:salonkit/data/audit_api.dart';
import 'package:salonkit/data/billing_api.dart';
import 'package:salonkit/data/customers_api.dart';
import 'package:salonkit/data/ledger_api.dart';
import 'package:salonkit/data/monthly_api.dart';
import 'package:salonkit/data/ratings_api.dart';
import 'package:salonkit/data/services_admin_api.dart';
import 'package:salonkit/data/settings_api.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
String key(dynamic c) => '${c.method} ${c.path}';

void main() {
  test('monthly and ratings queries', () async {
    final a = FakeAdapter({'GET /api/reports/monthly': (o) => raw('monthly.json'), 'GET /api/ratings': (o) => raw('ratings.json')});
    await MonthlyApi(client(a)).year('2026');
    await RatingsApi(client(a)).report('2026-11-01', '2026-11-04');
    expect(a.calls[0].queryParameters, {'year': '2026'});
    expect(a.calls[1].queryParameters, {'from': '2026-11-01', 'to': '2026-11-04'});
  });

  test('ledger: reads, balances, transfers, payouts', () async {
    final a = FakeAdapter({
      'GET /api/ledger/balances': (o) => raw('balances.json'),
      'PUT /api/ledger/balances': (o) => raw('balances.json'),
      'GET /api/ledger/shop': (o) => raw('ledger_shop.json'),
      'GET /api/ledger/barbers': (o) => raw('ledger_barbers.json'),
      'GET /api/ledger/barbers/67': (o) => raw('ledger_statement.json'),
      'GET /api/transfers': (o) => raw('transfers.json'),
      'POST /api/transfers': (o) => FakeReply(201, raw('transfer.json')),
      'PUT /api/transfers/1': (o) => raw('transfer.json'),
      'DELETE /api/transfers/1': (o) => {'ok': true},
      'GET /api/payouts': (o) => raw('payouts.json'),
      'POST /api/payouts': (o) => FakeReply(201, raw('payout.json')),
      'DELETE /api/payouts/1': (o) => {'ok': true},
    });
    final l = LedgerApi(client(a));
    await l.balances();
    await l.setBalances(cash: '0', bank: '-5');
    await l.shop('2026-11-01', '2026-11-04', 'cash');
    await l.barbers();
    await l.statement(67, '2026-11-01', '2026-11-04');
    await l.transfers('2026-11');
    await l.saveTransfer(amount: '30', from: 'cash', to: 'bank', day: '2026-11-04', note: 'deposit');
    await l.saveTransfer(id: 1, amount: '31', from: 'cash', to: 'bank', day: '2026-11-04', note: '');
    await l.deleteTransfer(1);
    await l.payouts('2026-11', barberId: 67);
    await l.savePayout(barberId: 67, amount: '10', paidFrom: 'cash', day: '2026-11-04', note: 'advance');
    await l.deletePayout(1);
    expect(a.calls[1].data, {'cash': '0', 'bank': '-5'});
    expect(a.calls[2].queryParameters, {'from': '2026-11-01', 'to': '2026-11-04', 'account': 'cash'});
    expect(a.calls[6].data, {'amount': '30', 'from_account': 'cash', 'to_account': 'bank', 'day': '2026-11-04', 'note': 'deposit'});
    expect(key(a.calls[7]), 'PUT /api/transfers/1');
    expect(a.calls[9].queryParameters, {'month': '2026-11', 'barber_id': 67});
    expect(a.calls[10].data, {'barber_id': 67, 'amount': '10', 'paid_from': 'cash', 'day': '2026-11-04', 'note': 'advance'});
  });

  test('same account: the server text comes through', () async {
    final a = FakeAdapter({'POST /api/transfers': (o) => FakeReply(400, raw('error_transfer_same.json'))});
    await expectLater(
      LedgerApi(client(a)).saveTransfer(amount: '5', from: 'cash', to: 'cash', day: '2026-11-04', note: ''),
      throwsA(isA<Validation>().having((e) => e.message, 'message', 'Pick two different accounts')),
    );
  });

  test('audit: dates left out while searching', () async {
    final a = FakeAdapter({'GET /api/audit': (o) => raw('audit.json')});
    final api = AuditApi(client(a));
    await api.list(from: '2026-11-04', to: '2026-11-04', entity: 'sale', actorId: 65);
    await api.list(from: '2026-11-04', to: '2026-11-04', q: 'E2E-', page: 2);
    expect(a.calls[0].queryParameters, {'from': '2026-11-04', 'to': '2026-11-04', 'entity': 'sale', 'actor_id': 65, 'page_size': 50});
    expect(a.calls[1].queryParameters, {'q': 'E2E-', 'page': 2, 'page_size': 50});
  });

  test('services: all, add, edit (full body, major units), delete, starter', () async {
    final a = FakeAdapter({
      'GET /api/services': (o) => raw('services_all.json'),
      'POST /api/services': (o) => FakeReply(201, (raw('services_all.json') as List).first),
      'PUT /api/services/154': (o) => (raw('services_all.json') as List).first,
      'DELETE /api/services/154': (o) => {'ok': true},
      'POST /api/services/starter': (o) => raw('services_all.json'),
    });
    final s = ServicesAdminApi(client(a));
    await s.all();
    await s.save(const ServiceForm(category: 'Hair', name: 'Haircut', price: '40', sortOrder: 1));
    await s.save(const ServiceForm(category: 'Hair', name: 'Haircut', price: '12.345', sortOrder: 1, active: false), id: 154);
    await s.delete(154);
    await s.starter();
    expect(a.calls[0].queryParameters, {'all': 1});
    expect(a.calls[2].data, {'category': 'Hair', 'name': 'Haircut', 'description': null, 'price': '12.345', 'sort_order': 1, 'active': false});
    expect(a.calls.map(key).last, 'POST /api/services/starter');
  });

  test('customers: list, detail, opt-out, visits', () async {
    final a = FakeAdapter({
      'GET /api/customers': (o) => raw('customers_admin.json'),
      'GET /api/customers/3': (o) => raw('customer_detail.json'),
      'PUT /api/customers/3/whatsapp': (o) => raw('customer_detail.json'),
      'GET /api/sales': (o) => raw('sales_page.json'),
    });
    final c = CustomersApi(client(a));
    await c.list(q: 'om', page: 2);
    await c.detail(3);
    await c.setOptOut(3, true);
    await c.visits(3, pageSize: 30);
    expect(a.calls[0].queryParameters, {'q': 'om', 'page': 2, 'page_size': 50});
    expect(a.calls[2].data, {'opt_out': true});
    expect(a.calls[3].queryParameters, {'customer_id': 3, 'page_size': 30});
  });

  test('announcements: list and send', () async {
    final a = FakeAdapter({'GET /api/announcements': (o) => raw('announcements.json'), 'POST /api/announcements': (o) => FakeReply(201, (raw('announcements.json') as List).first)});
    final api = AnnouncementsApi(client(a));
    await api.list();
    await api.send(title: 'Hi', body: 'There', barberId: 66);
    await api.send(title: 'Hi', body: 'All');
    expect(a.calls[1].data, {'title': 'Hi', 'body': 'There', 'audience': 'barber', 'barber_id': 66, 'email': false});
    expect(a.calls[2].data, {'title': 'Hi', 'body': 'All', 'audience': 'all', 'email': false});
  });

  test('settings: save sends every input key from the loaded settings, nothing else', () async {
    final loaded = raw('settings.json') as Map<String, dynamic>;
    final a = FakeAdapter({'GET /api/settings': (o) => loaded, 'PUT /api/settings': (o) => loaded, 'PUT /api/settings/logo': (o) => {'logo_url': '/api/public/logo/1'}});
    final api = SettingsApi(client(a));
    final s = await api.get();
    await api.save({...s, 'receipt_footer': 'See you!'});
    final body = a.calls[1].data as Map;
    expect(body.keys.toSet(), kSettingsInputKeys.toSet());
    expect(body['receipt_footer'], 'See you!');
    expect(body['wa_bill_template'], loaded['wa_bill_template']);
    expect(body.containsKey('wa_ready'), isFalse);
    await api.uploadLogo(Uint8List.fromList([1, 2, 3]), 'image/jpeg');
    expect(a.calls[2].headers['content-type'], 'image/jpeg');
    expect(a.calls[2].data, [1, 2, 3]);
  });

  test('billing: checkout and portal return the url; free', () async {
    final a = FakeAdapter({
      'GET /api/billing': (o) => raw('billing.json'),
      'POST /api/billing/checkout': (o) => {'url': 'https://checkout.stripe.com/x'},
      'POST /api/billing/portal': (o) => {'url': 'https://billing.stripe.com/y'},
      'POST /api/billing/free': (o) => {'ok': true},
    });
    final b = BillingApi(client(a));
    await b.get();
    expect(await b.checkout('pro'), 'https://checkout.stripe.com/x');
    expect(await b.portal(), 'https://billing.stripe.com/y');
    await b.free();
    expect(a.calls[1].data, {'plan_id': 'pro'});
  });
}
