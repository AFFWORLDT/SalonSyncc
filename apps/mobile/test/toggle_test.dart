import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/ui/toggle.dart';

void main() {
  testWidgets('the thumb overshoots the end, then settles on it', (t) async {
    var on = false;
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: StatefulBuilder(builder: (_, set) => Center(child: SkToggle(value: on, onChanged: (v) => set(() => on = v))))),
    ));
    double x() => t.widget<Transform>(find.descendant(of: find.byType(SkToggle), matching: find.byType(Transform))).transform.getTranslation().x;
    expect(x(), 0); // no bounce on first build
    await t.tap(find.byType(SkToggle));
    await t.pump();
    var peak = 0.0;
    for (var i = 0; i < 35; i++) {
      await t.pump(const Duration(milliseconds: 10));
      if (x() > peak) peak = x();
    }
    await t.pumpAndSettle();
    expect(on, isTrue);
    expect(peak, greaterThan(SkToggle.travel));
    expect(x(), closeTo(SkToggle.travel, 0.001));
  });

  testWidgets('the whole row toggles, and a null onChanged is off', (t) async {
    var on = true;
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: StatefulBuilder(builder: (_, set) => SkSwitchTile(title: const Text('Alerts'), value: on, onChanged: (v) => set(() => on = v)))),
    ));
    await t.tap(find.text('Alerts'));
    await t.pumpAndSettle();
    expect(on, isFalse);
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: SkSwitchTile(title: Text('Alerts'), value: true, onChanged: null))));
    await t.tap(find.text('Alerts'), warnIfMissed: false);
    await t.pumpAndSettle();
  });
}
