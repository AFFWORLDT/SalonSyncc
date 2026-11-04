import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/billing_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/plan/plan_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
Me me({String role = 'owner', String plan = 'pro_max', String status = 'active', int? trialEndsAt}) {
  final j = raw('me_owner_max.json') as Map<String, dynamic>;
  (j['user'] as Map)['role'] = role;
  (j['org'] as Map)['planId'] = plan;
  (j['org'] as Map)['status'] = status;
  (j['subscription'] as Map)['planId'] = plan;
  (j['subscription'] as Map)['status'] = status;
  (j['subscription'] as Map)['trialEndsAt'] = trialEndsAt;
  return Me.fromJson(j);
}

void main() {
  Future<(FakeAdapter, List<String>)> pump(WidgetTester t, Me m, {Map<String, dynamic>? billing, Map<String, Handler> extra = const {}}) async {
    final a = FakeAdapter({
      'GET /api/billing': (o) => billing ?? raw('billing.json'),
      'POST /api/billing/checkout': (o) => {'url': 'https://checkout.stripe.com/c'},
      'POST /api/billing/portal': (o) => {'url': 'https://billing.stripe.com/p'},
      'POST /api/billing/free': (o) => {'ok': true},
      ...extra,
    });
    final opened = <String>[];
    t.view.physicalSize = const Size(800, 3000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: PlanScreen(me: m, api: BillingApi(ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a)), open: (u) async => opened.add(u), onChanged: () async => opened.add('me')),
      ),
    ));
    await t.pumpAndSettle();
    return (a, opened);
  }

  Map<String, dynamic> stripe() => {...raw('billing.json') as Map<String, dynamic>, 'enabled': true, 'plans': [for (final p in (raw('billing.json') as Map)['plans'] as List) {...p as Map<String, dynamic>, 'can_checkout': p['id'] != 'free'}]};

  testWidgets('current plan, included features, billing off text', (t) async {
    await pump(t, me());
    expect(find.text('Plan'), findsOneWidget);
    expect(find.text("You're on Pro Max"), findsOneWidget);
    expect(find.text('Included in your plan'), findsOneWidget);
    expect(find.text('Ledger and payouts'), findsOneWidget);
    expect(find.text('AI connect (Claude and MCP) (on request)'), findsOneWidget);
    expect(find.text('Current'), findsOneWidget);
    expect(find.text('AED 499 / month'), findsOneWidget);
    expect(find.textContaining('To change your plan, contact us'), findsOneWidget);
  });

  testWidgets('trial banner', (t) async {
    final in3 = DateTime.now().add(const Duration(days: 3, hours: 1)).millisecondsSinceEpoch;
    await pump(t, me(status: 'trial', trialEndsAt: in3));
    expect(find.text("You're on Pro Max · 3 days left in your free trial"), findsOneWidget);
    expect(find.text('Your trial'), findsOneWidget);
  });

  testWidgets('during a trial the trial plan can be chosen (paid for)', (t) async {
    await pump(t, me(status: 'trial', trialEndsAt: DateTime.now().add(const Duration(days: 5)).millisecondsSinceEpoch), billing: stripe());
    expect(find.text('Your trial'), findsOneWidget);
    expect(find.text('Choose Pro Max'), findsOneWidget);
  });

  testWidgets('a cancelled card subscription can subscribe again', (t) async {
    await pump(t, me(plan: 'free'), billing: {...stripe(), 'provider': 'stripe', 'stripe_status': 'canceled'});
    expect(find.textContaining('Paid by card'), findsNothing);
    expect(find.text('Choose Pro'), findsOneWidget);
  });

  testWidgets('choose a plan opens checkout in the browser', (t) async {
    final (a, opened) = await pump(t, me(plan: 'free'), billing: stripe());
    await t.tap(find.text('Choose Pro'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.path == '/api/billing/checkout').data, {'plan_id': 'pro'});
    expect(opened, ['https://checkout.stripe.com/c']);
  });

  testWidgets('Stay on Free: owner only, with a confirm', (t) async {
    await pump(t, me(role: 'admin'), billing: stripe());
    expect(find.text('Stay on Free'), findsNothing);
    final (a, opened) = await pump(t, me(), billing: stripe());
    await t.tap(find.text('Stay on Free'));
    await t.pumpAndSettle();
    expect(find.text('Switch to Free?'), findsOneWidget);
    await t.tap(find.widgetWithText(FilledButton, 'Switch to Free'));
    await t.pumpAndSettle();
    expect(a.calls.where((c) => c.path == '/api/billing/free'), hasLength(1));
    expect(find.text("You're on Free"), findsOneWidget);
    expect(opened, ['me']);
  });

  testWidgets('a paying owner gets the server answer for Free', (t) async {
    await pump(t, me(), billing: stripe(), extra: {'POST /api/billing/free': (o) => const FakeReply(409, {'error': 'Cancel your paid plan in Manage billing first.'})});
    await t.tap(find.text('Stay on Free'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(FilledButton, 'Switch to Free'));
    await t.pumpAndSettle();
    expect(find.text('Cancel your paid plan in Manage billing first.'), findsOneWidget);
  });
}
