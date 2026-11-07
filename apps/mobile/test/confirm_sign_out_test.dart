import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/ui/confirm_sign_out.dart';

void main() {
  Future<bool?> ask(WidgetTester t, String button) async {
    bool? result;
    await t.pumpWidget(MaterialApp(
      home: Builder(builder: (c) => TextButton(onPressed: () async => result = await confirmSignOut(c), child: const Text('Sign out'))),
    ));
    await t.tap(find.text('Sign out'));
    await t.pumpAndSettle();
    expect(find.text('Sign out?'), findsOneWidget);
    await t.tap(find.byKey(ValueKey(button)));
    await t.pumpAndSettle();
    return result;
  }

  testWidgets('Yes signs out', (t) async => expect(await ask(t, 'signout-yes'), isTrue));
  testWidgets('Cancel keeps me signed in', (t) async => expect(await ask(t, 'signout-cancel'), isFalse));
}
