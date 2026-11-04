import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/core/api/api_error.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/data/admin_reports_api.dart';
import 'package:salonkit/data/expenses_api.dart';
import 'package:salonkit/data/sales_api.dart';
import 'package:salonkit/data/staff_api.dart';

import 'support/fake_adapter.dart';
import 'support/me_fixture.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
ApiClient client(FakeAdapter a) => ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
final fmt = meWith().fmt;

void main() {
  test('reports: overview range, daily month, setup', () async {
    final a = FakeAdapter({
      'GET /api/reports/overview': (o) => raw('overview.json'),
      'GET /api/reports/daily': (o) => raw('daily.json'),
      'GET /api/settings/setup': (o) => raw('setup.json'),
    });
    final r = AdminReportsApi(client(a));
    await r.overview('2026-11-01', '2026-11-04');
    await r.daily('2026-11');
    await r.setup();
    expect(a.calls[0].queryParameters, {'from': '2026-11-01', 'to': '2026-11-04'});
    expect(a.calls[1].queryParameters, {'month': '2026-11'});
  });

  test('admin sale: barber and day go in the body', () async {
    final a = FakeAdapter({'POST /api/sales': (o) => FakeReply(201, raw('sale_admin.json'))});
    await SalesApi(client(a), fmt).create(const SaleDraft(amount: 6000, payment: 'card', barberId: 37, day: '2026-11-01'));
    expect(a.calls.single.data, {'amount': '60', 'payment_mode': 'card', 'customer_name': null, 'customer_phone': null, 'note': null, 'barber_id': 37, 'day': '2026-11-01'});
  });

  test('sales filters', () async {
    final a = FakeAdapter({'GET /api/sales': (o) => raw('sales_admin_page.json')});
    await SalesApi(client(a), fmt).search(day: '2026-11-04', barberId: 37, payment: 'card');
    expect(a.calls.single.queryParameters, {'day': '2026-11-04', 'barber_id': 37, 'payment_mode': 'card', 'page_size': 50});
  });

  test('staff: list, create, update, reset, delete outcome', () async {
    final a = FakeAdapter({
      'GET /api/users': (o) => raw('users.json'),
      'POST /api/users': (o) => FakeReply(201, (raw('users.json') as List).first),
      'PUT /api/users/36': (o) => (raw('users.json') as List).first,
      'POST /api/users/36/reset-password': (o) => {'ok': true},
      'DELETE /api/users/36': (o) => {'ok': true, 'deactivated': true},
    });
    final s = StaffApi(client(a));
    expect(await s.list(), hasLength(3));
    const form = StaffForm(name: 'Ali', username: 'ali', role: 'barber', commissionPct: '30', sortOrder: 1, canAddExpense: true);
    await s.create(form, password: 'pass1234');
    await s.update(36, form, active: false);
    await s.resetPassword(36, 'newpass1');
    expect(await s.delete(36), StaffDeleted.deactivated);
    expect(a.calls[1].data, {'name': 'Ali', 'username': 'ali', 'phone': null, 'role': 'barber', 'commission_pct': '30', 'sort_order': 1, 'can_add_expense': true, 'password': 'pass1234'});
    expect((a.calls[2].data as Map)['active'], false);
    expect((a.calls[2].data as Map).containsKey('password'), isFalse);
    expect(a.calls[3].data, {'password': 'newpass1'});
  });

  test('staff limit is its own error', () async {
    final a = FakeAdapter({'POST /api/users': (o) => const FakeReply(409, {'error': 'Staff limit reached for your plan', 'code': 'staff_limit'})});
    await expectLater(
      StaffApi(client(a)).create(const StaffForm(name: 'x', username: 'x', role: 'barber'), password: 'pass'),
      throwsA(isA<StaffLimit>()),
    );
  });

  test('expenses: barber list and save; company CRUD', () async {
    final a = FakeAdapter({
      'GET /api/expenses': (o) => raw('expenses.json'),
      'PUT /api/expenses': (o) => (raw('expenses.json') as List).first,
      'GET /api/company-expenses': (o) => raw('company_expenses.json'),
      'POST /api/company-expenses': (o) => FakeReply(201, (raw('company_expenses.json') as List).first),
      'PUT /api/company-expenses/5': (o) => (raw('company_expenses.json') as List).first,
      'DELETE /api/company-expenses/5': (o) => {'ok': true},
    });
    final e = ExpensesApi(client(a));
    await e.barber('2026-11', barberId: 36);
    await e.saveBarber(amount: '15', note: 'Tea', day: '2026-11-04', barberId: 36);
    await e.company('2026-11');
    await e.addCompany(amount: '200', note: 'Towels', paidFrom: 'bank', day: '2026-11-04');
    await e.editCompany(5, amount: '210', note: 'Towels', paidFrom: 'bank', day: '2026-11-04');
    await e.deleteCompany(5);
    expect(a.calls[0].queryParameters, {'month': '2026-11', 'barber_id': 36});
    expect(a.calls[1].data, {'amount': '15', 'note': 'Tea', 'day': '2026-11-04', 'barber_id': 36});
    expect(a.calls[3].data, {'amount': '200', 'note': 'Towels', 'paid_from': 'bank', 'day': '2026-11-04'});
    expect(a.calls.map((c) => c.method), ['GET', 'PUT', 'GET', 'POST', 'PUT', 'DELETE']);
  });

  test('a stale 409 keeps its server text', () async {
    final a = FakeAdapter({'PUT /api/expenses': (o) => const FakeReply(409, {'error': 'This expense was changed by someone else. Reload and try again.', 'code': 'stale'})});
    await expectLater(ExpensesApi(client(a)).saveBarber(amount: '1', note: '', day: '2026-11-04', barberId: 36), throwsA(isA<Validation>()));
  });
}
