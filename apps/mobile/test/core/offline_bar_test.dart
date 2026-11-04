import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/api/api_error.dart';
import 'package:salonkit/core/connectivity/connectivity_controller.dart';
import 'package:salonkit/core/connectivity/offline_bar.dart';


Future<ConnectivityController> setup(WidgetTester t, StreamController<bool> net, {required bool Function() pingOk}) async {
  final c = Get.put(ConnectivityController(changes: net.stream, ping: () async => pingOk()));
  await t.pumpWidget(const MaterialApp(home: OfflineBar(child: Scaffold(body: Text('BODY')))));
  return c;
}

void main() {
  tearDown(Get.reset);

  testWidgets('not shown while online', (t) async {
    final net = StreamController<bool>();
    await setup(t, net, pingOk: () => true);
    await t.pumpAndSettle();
    expect(find.text('No internet connection'), findsNothing);
    expect(find.text('Back online'), findsNothing);
  });

  testWidgets('goes offline shows the dark bar', (t) async {
    final net = StreamController<bool>();
    await setup(t, net, pingOk: () => false);
    net.add(false);
    await t.pumpAndSettle();
    expect(find.text('No internet connection'), findsOneWidget);
    Get.delete<ConnectivityController>(); // stops the retry timer
  });

  testWidgets('coming back shows Back online then hides after 2 s', (t) async {
    final net = StreamController<bool>();
    var ok = false;
    await setup(t, net, pingOk: () => ok);
    net.add(false);
    await t.pumpAndSettle();
    ok = true;
    net.add(true);
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('Back online'), findsOneWidget);
    expect(find.text('No internet connection'), findsNothing);
    await t.pump(const Duration(seconds: 2));
    await t.pumpAndSettle();
    expect(find.text('Back online'), findsNothing);
  });

  testWidgets('Offline error from a request flips the bar, retry brings it back', (t) async {
    final net = StreamController<bool>();
    var ok = false;
    final c = await setup(t, net, pingOk: () => ok);
    networkTrouble.value++; // what ApiClient does on a connection error (api_client_test)
    await t.pumpAndSettle();
    expect(c.online.value, isFalse);
    expect(find.text('No internet connection'), findsOneWidget);
    ok = true;
    await t.pump(kRetryEvery);
    await t.pump();
    expect(c.online.value, isTrue);
    await t.pump(const Duration(seconds: 3));
    await t.pumpAndSettle();
  });
}
