import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Light / dark / follow the phone, remembered on the device. Light until the person picks otherwise.
class ThemeController extends GetxController {
  static const _key = 'sk.theme';
  final mode = ThemeMode.light.obs;

  Future<void> load() async {
    final v = (await SharedPreferences.getInstance()).getString(_key);
    mode.value = ThemeMode.values.firstWhere((m) => m.name == v, orElse: () => ThemeMode.light);
  }

  Future<void> setMode(ThemeMode m) async {
    mode.value = m;
    await (await SharedPreferences.getInstance()).setString(_key, m.name);
  }
}
