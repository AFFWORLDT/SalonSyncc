import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/models/announcement.dart';
import 'package:salonkit/models/audit.dart';
import 'package:salonkit/models/billing.dart';
import 'package:salonkit/models/customer.dart';
import 'package:salonkit/models/ledger.dart';
import 'package:salonkit/models/monthly.dart';
import 'package:salonkit/models/ratings.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Map<String, dynamic> obj(String n) => raw(n) as Map<String, dynamic>;

void main() {
  test('monthly: months, cells, year totals over active months', () {
    final m = MonthlyReport.fromJson(obj('monthly.json'));
    expect(m.months, hasLength(12));
    final nov = m.months.firstWhere((r) => !r.isEmpty);
    expect(nov.totals.profit, 5600);
    expect(nov.cellFor(m.barbers.last.id).commission, 2400);
    expect(m.totals.sales, 10000);
    expect(m.totals.companyExpense, 2000);
  });

  test('ledger: balances, shop lines, barbers, statement, transfer and payout', () {
    expect(Balances.fromJson(obj('balances.json')).cash, -2000);
    final s = ShopLedger.fromJson(obj('ledger_shop.json'));
    expect(s.opening, 0);
    expect(s.closing, 7000);
    expect(s.lines.first.memo, startsWith('Bill E2E-'));
    // One transfer = two lines (out of cash, into bank), both opening the same money move.
    expect(s.lines.where((l) => l.openableTransfer).map((l) => l.sourceId).toSet(), hasLength(1));
    expect(BarberBalance.listFromJson(raw('ledger_barbers.json')).last.balance, 1400);
    final st = BarberStatement.fromJson(obj('ledger_statement.json'));
    expect(st.barber.name, 'Barber Sam');
    expect(st.lines.where((l) => l.openablePayout), hasLength(1));
    expect(Transfer.listFromJson(raw('transfers.json')).single.toAccount, 'bank');
    expect(Payout.listFromJson(raw('payouts.json')).single.note, 'advance');
  });

  test('ratings', () {
    final r = RatingsReport.fromJson(obj('ratings.json'));
    expect(r.count, 1);
    expect(r.average, 4);
    expect(r.ratings.single.comment, 'Great fade');
    expect(r.barbers.single.name, 'Barber Ali');
    expect(r.asked, 0);
  });

  test('audit', () {
    final items = (obj('audit.json')['items'] as List).map((x) => AuditEntry.fromJson(x as Map<String, dynamic>)).toList();
    expect(items.first.entity, 'payout');
    expect(items.first.after!['amount'], 1000);
    expect(items.first.changed, contains('amount'));
  });

  test('customers, announcements, billing', () {
    final d = CustomerDetail.fromJson(obj('customer_detail.json'));
    expect(d.name, 'Omar');
    expect(d.services.single, ('Haircut', 1));
    expect(d.cashVisits, 1);
    expect(Announcement.listFromJson(raw('announcements.json')).single.recipients, 2);
    final b = Billing.fromJson(obj('billing.json'));
    expect(b.enabled, isFalse);
    expect(b.plans.map((p) => p.priceMonthly), [0, 200, 499]);
    Billing st(String s) => Billing.fromJson({...obj('billing.json'), 'provider': 'stripe', 'stripe_status': s});
    expect([for (final s in ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete_expired']) st(s).paysByCard], [true, true, true, true, false, false]);
  });
}
