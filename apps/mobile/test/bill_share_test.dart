import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/share/bill_share.dart';
import 'package:salonkit/models/sale.dart';
import 'package:salonkit/models/settings.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/modules/sale/bill_view.dart';

import 'support/me_fixture.dart';

Map<String, dynamic> raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;
SalonSettings settings([Map<String, Object?> over = const {}]) =>
    SalonSettings.fromJson({...fx('me_barber.json')['settings'] as Map<String, dynamic>, 'display_name': 'E2E Salon', ...over});

void main() {
  final named = Sale.fromJson(raw('sale.json'));
  final walkIn = Sale.fromJson({...raw('sale_walkin.json'), 'customer_phone': '0509998888'});
  final noPhone = Sale.fromJson(raw('sale_walkin.json'));
  final s = settings();
  final share = BillShare(slug: 'e2esalon', settings: s, fmt: Fmt(s));

  test('receipt link on the salon host', () {
    expect(share.receiptUrl(named), 'https://e2esalon.salonkit.online/r/?t=WuFRadji50wia8bl');
  });

  test('named template fills every token', () {
    expect(
      share.thankYouText(named),
      'Thank you Omar for visiting E2E Salon! Your bill: AED 65. https://e2esalon.salonkit.online/r/?t=WuFRadji50wia8bl',
    );
    final custom = BillShare(slug: 'e2esalon', settings: settings({'thank_you_text': '{barber} says hi {name}.  {amount} at {salon} {unknown}'}), fmt: Fmt(s));
    expect(custom.thankYouText(named), 'Barber Ali says hi Omar. AED 65 at E2E Salon {unknown}');
  });

  test('walk-in no name', () {
    expect(share.thankYouText(walkIn), startsWith('Thank you for visiting E2E Salon! Your bill: AED 25.'));
  });

  test('local number gets country', () {
    final u = Uri.parse(share.whatsAppLink(named));
    expect(u.host, 'wa.me');
    expect(u.path, '/971501234567');
    expect(u.queryParameters['text'], share.thankYouText(named));
    final intl = Sale.fromJson({...raw('sale.json'), 'customer_phone': '+447700900123'});
    expect(Uri.parse(share.whatsAppLink(intl)).path, '/447700900123');
  });

  test('no phone: WhatsApp asks for a chat, with the bill line', () {
    final u = Uri.parse(share.whatsAppLink(noPhone));
    expect(u.path, '/');
    expect(u.queryParameters['text'], 'E2E Salon bill E2E-20261104-002 · AED 25\nhttps://e2esalon.salonkit.online/r/?t=aJ3rz7B2-VP1Ibdi');
  });

  test('an empty thank-you template falls back to the bill line', () {
    final b = BillShare(slug: 'e2esalon', settings: settings({'thank_you_text': ''}), fmt: Fmt(s));
    expect(Uri.parse(b.whatsAppLink(named)).queryParameters['text'], startsWith('E2E Salon bill E2E-20261104-001'));
  });

  test('share sheet title and text', () {
    expect(share.shareTitle(named), 'Bill E2E-20261104-001 — E2E Salon');
    expect(share.shareText(named), 'Bill E2E-20261104-001 — E2E Salon · AED 65\nhttps://e2esalon.salonkit.online/r/?t=WuFRadji50wia8bl');
  });

  testWidgets('bill view: lines and totals, VAT rows only with VAT', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: BillView(sale: named, settings: s, fmt: Fmt(s))))));
    expect(find.text('BILL'), findsOneWidget);
    expect(find.text('Haircut'), findsOneWidget);
    expect(find.text('Hair oil'), findsOneWidget);
    expect(find.text('No: E2E-20261104-001', findRichText: true), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
    expect(find.textContaining('VAT'), findsNothing);
    expect(find.text('Thank you for visiting E2E Salon!'), findsOneWidget);

    final vat = Sale.fromJson({...raw('sale.json'), 'vat_rate': 5, 'vat_amount': 310});
    final sv = settings({'vat_enabled': true, 'trn': '100200300'});
    await t.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: BillView(sale: vat, settings: sv, fmt: Fmt(sv))))));
    expect(find.text('TAX INVOICE'), findsOneWidget);
    expect(find.text('Total (incl. VAT)'), findsOneWidget);
    expect(find.text('Taxable amount'), findsOneWidget);
    expect(find.text('VAT 5%'), findsOneWidget);
    expect(find.text('AED 61.90'), findsOneWidget);
  });

  testWidgets('amount-only bill shows one "Salon service" line', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: BillView(sale: noPhone, settings: s, fmt: Fmt(s))))));
    expect(find.text('Salon service'), findsOneWidget);
  });
}
