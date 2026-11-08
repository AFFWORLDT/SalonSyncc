import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/models/me.dart';
import 'package:salonkit/shell/top_bar.dart';

final owner = Me.fromJson(jsonDecode(File('test/fixtures/me_owner_e2e.json').readAsStringSync()) as Map<String, dynamic>);

void main() {
  Future<void> pump(WidgetTester t, {VoidCallback? onBell, ValueNotifier<int>? n}) => t.pumpWidget(MaterialApp(
        home: Scaffold(body: SkTopBar(me: owner, onSearch: () {}, onAi: () {}, onProfile: () {}, onBell: onBell, bell: n)),
      ));

  testWidgets('the bell shows a red unread count, 99+ at most, and opens on tap', (t) async {
    final n = ValueNotifier(0);
    var opened = 0;
    await pump(t, onBell: () => opened++, n: n);
    expect(find.byKey(const ValueKey('top-bell')), findsOneWidget);
    expect(find.byTooltip('Notifications'), findsOneWidget);
    n.value = 3;
    await t.pump();
    expect(find.text('3'), findsOneWidget);
    expect(find.byTooltip('Notifications, 3 unread'), findsOneWidget);
    final badge = t.widget<Badge>(find.descendant(of: find.byKey(const ValueKey('top-bell')), matching: find.byType(Badge)));
    expect(badge.backgroundColor, Theme.of(t.element(find.byType(SkTopBar))).colorScheme.error);
    n.value = 250;
    await t.pump();
    expect(find.text('99+'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('top-bell')));
    expect(opened, 1);
  });

  testWidgets('no bell when notifications are off for the salon', (t) async {
    await pump(t);
    expect(find.byKey(const ValueKey('top-bell')), findsNothing);
  });
}
