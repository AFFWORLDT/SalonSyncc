import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/screen_cache.dart';

/// Runs around every test file: screens remember their last answer (ScreenCache), so each test starts empty.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  setUp(ScreenCache.clear);
  await testMain();
}
