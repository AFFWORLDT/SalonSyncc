import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/models/notice.dart';
import 'package:salonkit/models/paged.dart';
import 'package:salonkit/models/report.dart';
import 'package:salonkit/models/sale.dart';
import 'package:salonkit/models/service.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Map<String, dynamic> obj(String n) => raw(n) as Map<String, dynamic>;

void main() {
  test('sale with service and extra lines', () {
    final s = Sale.fromJson(obj('sale.json'));
    expect(s.billNo, 'E2E-20261104-001');
    expect(s.amount, 6500);
    expect(s.payment, 'card');
    expect(s.customerPhone, '0501234567');
    expect(s.items, hasLength(2));
    expect(s.items[0].serviceId, 109);
    expect(s.items[1].serviceId, isNull);
    expect(s.items[1].price, 1250);
    expect(s.items[1].qty, 2);
    expect(s.isWalkIn, isFalse);
  });

  test('walk-in sale: no items, Customer N', () {
    final s = Sale.fromJson(obj('sale_walkin.json'));
    expect(s.items, isEmpty);
    expect(s.isWalkIn, isTrue);
    expect(s.customerPhone, isNull);
  });

  test('a page of sales with its sum', () {
    final p = Paged.fromJson(obj('sales_page.json'), Sale.fromJson);
    expect(p.items, hasLength(2));
    expect(p.sum, 9000);
    expect(p.total, 2);
  });

  test('services', () {
    final l = Service.listFromJson(raw('services.json'));
    expect(l.map((s) => s.name), ['Haircut', 'Beard trim', 'Face mask']);
    expect(l.first.category, 'Hair');
    expect(l.last.price, 3550);
  });

  test('my report', () {
    final r = MyReport.fromJson(obj('report_me.json'));
    expect(r.month, '2026-11');
    expect(r.days.single.day, '2026-11-04');
    expect(r.days.single.count, 2);
    expect(r.totals.sales, 9000);
    expect(r.today.net, 9000);
    expect(r.today.expenseNote, isNull);
  });

  test('notifications feed', () {
    final f = NoticeFeed.fromJson(obj('notifications.json'));
    expect(f.unread, 1);
    expect(f.items.single.title, 'Shop closes at 9 tonight');
    expect(f.items.single.isRead, isFalse);
  });

  test('customer suggestions', () {
    final p = Paged.fromJson(obj('customers.json'), CustomerHint.fromJson);
    expect(p.items.single.name, 'Omar');
    expect(p.items.single.phone, '0501234567');
  });

  test('a missing field is a FormatException, not a TypeError', () {
    final j = obj('sale.json')..remove('amount');
    expect(() => Sale.fromJson(j), throwsFormatException);
  });
}
