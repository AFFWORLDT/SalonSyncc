import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/ui/range_sheet.dart';

void main() {
  Future<Future<DateTimeRange?> Function()> open(WidgetTester t, {DateTimeRange? initial}) async {
    DateTimeRange? out;
    var done = false;
    await t.pumpWidget(MaterialApp(
      home: Builder(
        builder: (c) => Scaffold(
          body: TextButton(
            onPressed: () async {
              out = await showSkRangeSheet(c, today: DateTime(2026, 11, 8), initial: initial);
              done = true;
            },
            child: const Text('open'),
          ),
        ),
      ),
    ));
    return () async {
      await t.pumpAndSettle();
      expect(done, isTrue);
      return out;
    };
  }

  testWidgets('opens on this month; first tap then last tap; future days are off', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    final result = await open(t);
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    expect(find.text('November 2026'), findsOneWidget);
    expect(find.text('Pick the first day'), findsOneWidget);
    await t.tap(find.text('20')); // after today: ignored
    await t.pump();
    expect(find.text('Pick the first day'), findsOneWidget);
    await t.tap(find.text('3'));
    await t.pump();
    expect(find.text('Show 3 Nov 2026'), findsOneWidget);
    await t.tap(find.text('7'));
    await t.pump();
    expect(find.text('7 Nov 2026'), findsOneWidget);
    await t.tap(find.text('Apply'));
    expect(await result(), DateTimeRange(start: DateTime(2026, 11, 3), end: DateTime(2026, 11, 7)));
  });

  testWidgets('quick choice and month arrows; next month is off on the current month', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    final result = await open(t, initial: DateTimeRange(start: DateTime(2026, 9, 1), end: DateTime(2026, 9, 10)));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    expect(find.text('September 2026'), findsOneWidget);
    await t.tap(find.text('Last month'));
    await t.pump();
    expect(find.text('October 2026'), findsOneWidget);
    await t.tap(find.byTooltip('Next month'));
    await t.pump();
    expect(find.text('November 2026'), findsOneWidget);
    await t.tap(find.byTooltip('Next month')); // already the current month
    await t.pump();
    expect(find.text('November 2026'), findsOneWidget);
    await t.tap(find.text('Apply'));
    expect(await result(), DateTimeRange(start: DateTime(2026, 10, 1), end: DateTime(2026, 10, 31)));
  });
}
