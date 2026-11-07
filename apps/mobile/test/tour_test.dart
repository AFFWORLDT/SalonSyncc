import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/ui/tour.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Widget host(void Function(BuildContext) onReady) => MaterialApp(
        home: Builder(builder: (c) {
          return Scaffold(
            body: Column(children: [
              tourTarget('profile', const SizedBox(width: 40, height: 40, child: Text('PHOTO'))),
              const SizedBox(height: 300),
              Builder(builder: (cc) => TextButton(onPressed: () => onReady(cc), child: const Text('GO'))),
            ]),
          );
        }),
      );

  testWidgets('walks the steps on screen, skips missing targets, and plays once', (t) async {
    late BuildContext ctx;
    await t.pumpWidget(host((c) => ctx = c));
    await t.tap(find.text('GO'));
    final steps = [
      const TourStep(title: 'Welcome', text: 'Hi'),
      const TourStep(target: 'profile', title: 'Your photo', text: 'Settings live here'),
      const TourStep(target: 'not-here', title: 'Hidden', text: 'Skipped'),
    ];
    maybeShowTour(ctx, slug: 's', userId: 1, steps: steps);
    await t.pumpAndSettle();
    expect(find.text('Welcome'), findsOneWidget);
    expect(find.text('1 of 2'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('tour-next')));
    await t.pumpAndSettle();
    expect(find.text('Your photo'), findsOneWidget);
    expect(find.text('Hidden'), findsNothing);
    await t.tap(find.byKey(const ValueKey('tour-next')));
    await t.pumpAndSettle();
    expect(find.text('Your photo'), findsNothing);
    // Done once: not again unless forced.
    maybeShowTour(ctx, slug: 's', userId: 1, steps: steps);
    await t.pumpAndSettle();
    expect(find.text('Welcome'), findsNothing);
    maybeShowTour(ctx, slug: 's', userId: 1, steps: steps, force: true);
    await t.pumpAndSettle();
    expect(find.text('Welcome'), findsOneWidget);
  });

  test('admins get the setup steps, barbers the short one', () {
    expect(tourSteps(salonName: 'Fresh', admin: true).map((s) => s.target), [null, 'profile', 'profile', 'new-sale', 'tab-sheet', 'setup']);
    expect(tourSteps(salonName: 'Fresh', admin: false).first.title, 'Welcome to Fresh 👋');
  });
}
