import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Light / dark / follow the phone, remembered on the device.
class ThemeController extends GetxController {
  static const _key = 'sk.theme';
  final mode = ThemeMode.system.obs;

  Future<void> load() async {
    final v = (await SharedPreferences.getInstance()).getString(_key);
    mode.value = ThemeMode.values.firstWhere((m) => m.name == v, orElse: () => ThemeMode.system);
  }

  Future<void> setMode(ThemeMode m) async {
    mode.value = m;
    await (await SharedPreferences.getInstance()).setString(_key, m.name);
  }
}
