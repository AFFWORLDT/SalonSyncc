import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/api/api_client.dart';
import 'package:salonkit/data/announcements_api.dart';
import 'package:salonkit/data/staff_api.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/modules/announcements/send_screen.dart';

import 'support/fake_adapter.dart';

Object? raw(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync());
final owner = Me.fromJson(raw('me_owner_max.json') as Map<String, dynamic>);

void main() {
  Future<FakeAdapter> pump(WidgetTester t, {Object? history}) async {
    final sent = (raw('announcements.json') as List).first as Map<String, dynamic>;
    final a = FakeAdapter({
      'GET /api/announcements': (o) => history ?? raw('announcements.json'),
      'POST /api/announcements': (o) => FakeReply(201, {
            ...sent,
            'id': 9,
            'title': (o.data as Map)['title'],
            'body': (o.data as Map)['body'],
            'audience': (o.data as Map)['audience'],
            'target_name': (o.data as Map)['audience'] == 'barber' ? 'Barber Sam' : null,
            'recipients': (o.data as Map)['audience'] == 'barber' ? 1 : 2,
          }),
      'GET /api/users': (o) => raw('users.json'),
    });
    final c = ApiClient(Uri.parse('https://e2esalon.salonkit.online'), token: () => 't', adapter: a);
    t.view.physicalSize = const Size(800, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: SendAnnouncementScreen(me: owner, api: AnnouncementsApi(c), staff: StaffApi(c)))));
    await t.pumpAndSettle();
    return a;
  }

  testWidgets('history and compose card', (t) async {
    await pump(t);
    expect(find.text('New announcement'), findsOneWidget);
    expect(find.text('A push notification to your team’s devices.'), findsOneWidget);
    expect(find.text('Shop closed Friday'), findsOneWidget);
    expect(find.textContaining('2 people · by Owner'), findsOneWidget);
    expect(t.widget<FilledButton>(find.widgetWithText(FilledButton, 'Send to everyone')).onPressed, isNull);
  });

  testWidgets('send to everyone: clears and adds to history', (t) async {
    final a = await pump(t);
    await t.enterText(find.byKey(const ValueKey('ann-title')), 'Team meeting');
    await t.enterText(find.byKey(const ValueKey('ann-body')), '9 am sharp.');
    await t.pump();
    await t.tap(find.widgetWithText(FilledButton, 'Send to everyone'));
    await t.pumpAndSettle();
    expect(a.calls.singleWhere((c) => c.method == 'POST').data, {'title': 'Team meeting', 'body': '9 am sharp.', 'audience': 'all'});
    expect(find.text('Sent to everyone · 2 people'), findsOneWidget);
    expect(find.text('Team meeting'), findsOneWidget);
  });

  testWidgets('one barber needs a pick', (t) async {
    final a = await pump(t);
    await t.tap(find.text('One barber'));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('ann-title')), 'Your shift');
    await t.enterText(find.byKey(const ValueKey('ann-body')), 'Come at 2.');
    await t.pump();
    expect(t.widget<FilledButton>(find.widgetWithText(FilledButton, 'Send')).onPressed, isNull);
    await t.tap(find.text('Barber Sam'));
    await t.pump();
    await t.tap(find.widgetWithText(FilledButton, 'Send'));
    await t.pumpAndSettle();
    final body = a.calls.singleWhere((c) => c.method == 'POST').data as Map;
    expect(body['audience'], 'barber');
    expect(body['barber_id'], isA<int>());
    expect(find.text('Sent to Barber Sam · 1 person'), findsOneWidget);
  });

  testWidgets('empty history', (t) async {
    await pump(t, history: []);
    expect(find.text('No announcements yet'), findsOneWidget);
    expect(find.text('Your sent messages will show here.'), findsOneWidget);
  });
}
