import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/api/api_error.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/account_api.dart';
import 'package:salonkit/data/notices_api.dart';
import 'package:salonkit/data/report_api.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/models/settings.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 'skm_t', adapter: a);
Fmt fmtFor(String cur, int minor) =>
    Fmt(SalonSettings.fromJson({...fx('me_barber.json')['settings'] as Map<String, dynamic>, 'currency': cur, 'currency_minor': minor}));

void main() {
  final aed = fmtFor('AED', 100);

  test('today: GET /api/sales for the day, 200 per page', () async {
    final a = FakeAdapter({'GET /api/sales': (o) => raw('sales_page.json')});
    final p = await SalesApi(client(a), aed).today('2026-11-04');
    expect(p.items, hasLength(2));
    expect(a.calls.single.queryParameters, {'day': '2026-11-04', 'page_size': 200});
  });

  test('search: q and day only when set', () async {
    final a = FakeAdapter({'GET /api/sales': (o) => raw('sales_page.json')});
    await SalesApi(client(a), aed).search(q: 'omar', pageSize: 100);
    expect(a.calls.single.queryParameters, {'q': 'omar', 'page_size': 100});
  });

  test('create with lines sends items in major units', () async {
    final a = FakeAdapter({'POST /api/sales': (o) => FakeReply(201, raw('sale.json'))});
    final d = SaleDraft(
      lines: [const DraftLine(serviceId: 109, name: 'Haircut', price: 4000, qty: 1), const DraftLine(name: 'Hair oil', price: 1250, qty: 2)],
      payment: 'card',
      customerName: 'Omar',
      customerPhone: '+971501234567',
    );
    final s = await SalesApi(client(a), aed).create(d);
    expect(s.billNo, 'E2E-20261104-001');
    expect(a.calls.single.data, {
      'items': [
        {'service_id': 109, 'price': '40', 'qty': 1},
        {'name': 'Hair oil', 'price': '12.5', 'qty': 2},
      ],
      'payment_mode': 'card',
      'customer_name': 'Omar',
      'customer_phone': '+971501234567',
      'note': null,
    });
  });

  test('amount only body', () async {
    final a = FakeAdapter({'POST /api/sales': (o) => FakeReply(201, raw('sale_walkin.json'))});
    await SalesApi(client(a), fmtFor('BHD', 1000)).create(const SaleDraft(amount: 12345, payment: 'cash'));
    expect(a.calls.single.data, {'amount': '12.345', 'payment_mode': 'cash', 'customer_name': null, 'customer_phone': null, 'note': null});
  });

  test('draft total: lines win over the typed amount', () {
    expect(const SaleDraft(lines: [DraftLine(name: 'x', price: 1250, qty: 2)], amount: 999, payment: 'cash').total, 2500);
    expect(const SaleDraft(amount: 999, payment: 'cash').total, 999);
  });

  test('update and delete hit the sale', () async {
    final a = FakeAdapter({'PUT /api/sales/17': (o) => raw('sale.json'), 'DELETE /api/sales/17': (o) => {'ok': true}});
    final api = SalesApi(client(a), aed);
    await api.update(17, const SaleDraft(amount: 2500, payment: 'cash'));
    await api.delete(17);
    expect(a.calls.map((c) => '${c.method} ${c.path}'), ['PUT /api/sales/17', 'DELETE /api/sales/17']);
  });

  test('a 400 surfaces the server text', () async {
    final a = FakeAdapter({'POST /api/sales': (o) => FakeReply(400, raw('error_400.json'))});
    await expectLater(
      SalesApi(client(a), aed).create(const SaleDraft(amount: 1, payment: 'cash')),
      throwsA(isA<Validation>().having((e) => e.message, 'message', 'Pick a service or enter the amount (e.g. 25)')),
    );
  });

  test('a 409 stale is a Validation with the server text', () async {
    final a = FakeAdapter({'PUT /api/sales/17': (o) => const FakeReply(409, {'error': 'This sale was changed by someone else. Reload and try again.', 'code': 'stale'})});
    await expectLater(
      SalesApi(client(a), aed).update(17, const SaleDraft(amount: 1, payment: 'cash')),
      throwsA(isA<Validation>().having((e) => e.message, 'message', contains('changed by someone else'))),
    );
  });

  test('services: active only', () async {
    final list = raw('services.json') as List;
    final a = FakeAdapter({'GET /api/services': (o) => [...list, {...list.first as Map, 'id': 999, 'active': false}]});
    expect((await SalesApi(client(a), aed).services()).map((s) => s.id), [109, 110, 111]);
  });

  test('customers: recent 8 when empty, else q with 6', () async {
    final a = FakeAdapter({'GET /api/customers': (o) => raw('customers.json')});
    final api = SalesApi(client(a), aed);
    await api.customers('');
    await api.customers('050');
    expect(a.calls[0].queryParameters, {'page_size': 8});
    expect(a.calls[1].queryParameters, {'q': '050', 'page_size': 6});
  });

  test('expense: PUT with the typed amount and note', () async {
    final a = FakeAdapter({'PUT /api/expenses': (o) => {'ok': true, 'deleted': true}});
    await SalesApi(client(a), aed).saveExpense('15.5', 'Tea');
    expect(a.calls.single.data, {'amount': '15.5', 'note': 'Tea'});
  });

  test('report, notices and password', () async {
    final a = FakeAdapter({
      'GET /api/reports/me': (o) => raw('report_me.json'),
      'GET /api/notifications': (o) => raw('notifications.json'),
      'POST /api/notifications/read': (o) => {'ok': true},
      'PUT /api/me/password': (o) => {'ok': true},
    });
    final c = client(a);
    expect((await ReportApi(c).me('2026-11')).totals.sales, 9000);
    expect((await NoticesApi(c).list()).unread, 1);
    await NoticesApi(c).markAllRead();
    await AccountApi(c).changePassword('pass1234', 'newpass99');
    expect(a.calls[0].queryParameters, {'month': '2026-11'});
    expect(a.calls[1].queryParameters, {'limit': 50});
    expect(a.calls[2].data, <String, Object?>{});
    expect(a.calls[3].data, {'current': 'pass1234', 'next': 'newpass99'});
  });
}
