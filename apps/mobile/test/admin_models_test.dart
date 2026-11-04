import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/models/daily_sheet.dart';
import 'package:salonkit/models/expense.dart';
import 'package:salonkit/models/overview.dart';
import 'package:salonkit/models/setup.dart';
import 'package:salonkit/models/staff.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Map<String, dynamic> obj(String n) => raw(n) as Map<String, dynamic>;

void main() {
  test('overview', () {
    final o = Overview.fromJson(obj('overview.json'));
    expect(o.from, o.to);
    expect(o.totals.sales, 10000);
    expect(o.totals.companyExpense, 20000);
    expect(o.totals.profit, -13900);
    expect(o.prev.sales, 3000);
    expect(o.perBarber.map((b) => b.name), ['Barber Ali', 'Barber Sam']);
    expect(o.perBarber.last.expenseEntered, isFalse);
    expect(o.series.single.key, o.to);
    expect(o.seriesByMonth, isFalse);
    expect(o.recent, hasLength(2));
  });

  test('staff', () {
    final l = Staff.listFromJson(raw('users.json'));
    final sam = l.firstWhere((s) => s.username == 'sam');
    expect(sam.commissionPct, 40);
    expect(sam.isBarber, isTrue);
    expect(sam.active, isTrue);
    expect(l.firstWhere((s) => s.role == 'owner').isOwner, isTrue);
  });

  test('expenses', () {
    final e = Expense.listFromJson(raw('expenses.json')).single;
    expect(e.barberName, 'Barber Ali');
    expect(e.amount, 1500);
    expect(e.note, 'Tea');
    final c = CompanyExpense.listFromJson(raw('company_expenses.json')).single;
    expect(c.paidFrom, 'bank');
    expect(c.note, 'Towels');
    expect(c.amount, 20000);
  });

  test('daily sheet', () {
    final d = DailySheet.fromJson(obj('daily.json'));
    expect(d.barbers.map((b) => b.name), ['Barber Ali', 'Barber Sam']);
    final day = d.rows.firstWhere((r) => r.day.endsWith('-04'));
    expect(day.cells[37]!.commission, 2400);
    expect(day.cellFor(99).sales, 0);
    expect(d.totals.cellFor(37).sales, 9000);
    expect(d.totals.profit, -12100);
  });

  test('setup', () {
    final s = SetupState.fromJson(obj('setup.json'));
    expect(s.logo, isFalse);
    expect(s.services, isTrue);
  });
}
