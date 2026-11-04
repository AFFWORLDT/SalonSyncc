import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/expenses_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/expenses/expenses_screen.dart';
import 'package:salonkit/modules/history/history_screen.dart' show prevMonth;

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_e2e.json') as Map<String, dynamic>);

void main() {
  Future<FakeAdapter> pump(WidgetTester t, {Map<String, Handler> extra = const {}}) async {
    final a = FakeAdapter({
      'GET /api/expenses': (o) => raw('expenses.json'),
      'PUT /api/expenses': (o) => (raw('expenses.json') as List).first,
      'GET /api/company-expenses': (o) => raw('company_expenses.json'),
      'POST /api/company-expenses': (o) => FakeReply(201, (raw('company_expenses.json') as List).first),
      'PUT /api/company-expenses/5': (o) => (raw('company_expenses.json') as List).first,
      'DELETE /api/company-expenses/5': (o) => {'ok': true},
      'GET /api/users': (o) => raw('users.json'),
      ...extra,
    });
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
    t.view.physicalSize = const Size(800, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ExpensesScreen(me: owner, api: ExpensesApi(c), staff: StaffApi(c)))));
    await t.pumpAndSettle();
    return a;
  }

  final month = owner.today.substring(0, 7);
  Iterable<Map<String, dynamic>> q(FakeAdapter a, String path) => a.calls.where((c) => c.path == path && c.method == 'GET').map((c) => c.queryParameters);

  testWidgets('barber expenses for the month; month back asks again', (t) async {
    final a = await pump(t);
    expect(find.text('Expenses'), findsWidgets);
    expect(find.text('Barber Ali'), findsOneWidget);
    expect(find.textContaining('Tea'), findsOneWidget);
    expect(q(a, '/api/expenses').first, {'month': month});
    await t.tap(find.byTooltip('Previous month'));
    await t.pumpAndSettle();
    expect(q(a, '/api/expenses').last, {'month': prevMonth(month)});
  });

  testWidgets('tap an entry: edit, Remove sends 0', (t) async {
    final a = await pump(t);
    await t.tap(find.text('Barber Ali'));
    await t.pumpAndSettle();
    expect(find.text('Edit expense'), findsOneWidget);
    expect(find.textContaining('one entry per day. Enter the total.'), findsOneWidget);
    await t.tap(find.text('Remove'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'PUT').data, {'amount': '0', 'note': 'Tea', 'day': '2026-11-04', 'barber_id': 36});
    expect(find.text('Expense removed'), findsOneWidget);
  });

  testWidgets('Add expense for a barber who already has today: opens the entry', (t) async {
    await pump(t);
    await t.tap(find.text('Add expense'));
    await t.pumpAndSettle();
    expect(find.text('Add expense for'), findsOneWidget);
    await t.tap(find.text('Barber Ali').last);
    await t.pumpAndSettle();
    await t.tap(find.text('Next'));
    await t.pumpAndSettle();
    expect(find.text('Edit expense'), findsOneWidget);
    expect(find.widgetWithText(TextField, '15'), findsOneWidget);
  });

  testWidgets('a 409 keeps the dialog with the server text', (t) async {
    await pump(t, extra: {'PUT /api/expenses': (o) => const FakeReply(409, {'error': 'This expense was changed by someone else. Reload and try again.', 'code': 'stale'})});
    await t.tap(find.text('Barber Ali'));
    await t.pumpAndSettle();
    await t.tap(find.text('Save expense'));
    await t.pumpAndSettle();
    expect(find.text('This expense was changed by someone else. Reload and try again.'), findsOneWidget);
    expect(find.text('Edit expense'), findsOneWidget);
  });

  testWidgets('company: list, add, edit, remove', (t) async {
    final a = await pump(t);
    await t.tap(find.text('Company'));
    await t.pumpAndSettle();
    expect(find.text('Towels'), findsOneWidget);
    expect(find.textContaining('Bank'), findsOneWidget);
    await t.tap(find.text('Add company expense'));
    await t.pumpAndSettle();
    expect(find.text('Shop costs like rent, electricity or supplies. They come off the shop profit.'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('cx-amount')), '120');
    await t.enterText(find.byKey(const ValueKey('cx-note')), 'Rent');
    await t.tap(find.text('Save expense'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'POST').data, {'amount': '120', 'note': 'Rent', 'paid_from': 'cash', 'day': owner.today});
    await t.tap(find.text('Towels'));
    await t.pumpAndSettle();
    expect(find.text('Edit company expense'), findsOneWidget);
    await t.tap(find.text('Remove'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.method == 'DELETE'), hasLength(1));
  });

  testWidgets('company: empty month text', (t) async {
    await pump(t, extra: {'GET /api/company-expenses': (o) => []});
    await t.tap(find.text('Company'));
    await t.pumpAndSettle();
    expect(find.text('No company expenses this month. Add rent, bills or supplies here.'), findsOneWidget);
  });
}
