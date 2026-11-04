import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:salonkit/core/theme/app_theme.dart';
import 'package:salonkit/core/theme/theme_controller.dart';
import 'package:salonkit/core/theme/tokens.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('light and dark palettes differ and primary matches web hex values', () {
    expect(SkTokens.light.primary, const Color(0xFF1F7A6A));
    expect(SkTokens.dark.primary, const Color(0xFF2A9D88));
    expect(SkTokens.light.background, const Color(0xFFF6F2E9));
    expect(SkTokens.dark.background, const Color(0xFF08110F));
    expect(SkTokens.light.background, isNot(SkTokens.dark.background));
  });

  test('theme uses Google Sans Flex', () {
    final t = buildTheme(SkTokens.light, Brightness.light);
    expect(t.textTheme.bodyMedium!.fontFamily, 'GoogleSansFlex');
    expect(t.colorScheme.primary, SkTokens.light.primary);
    expect(buildTheme(SkTokens.dark, Brightness.dark).brightness, Brightness.dark);
    expect(SkText.mono.fontFamily, 'GoogleSansCode');
  });

  test('ThemeController persists dark', () async {
    SharedPreferences.setMockInitialValues({});
    final c = ThemeController();
    await c.load();
    expect(c.mode.value, ThemeMode.system);
    await c.setMode(ThemeMode.dark);
    final again = ThemeController();
    await again.load();
    expect(again.mode.value, ThemeMode.dark);
    Get.reset();
  });
}
