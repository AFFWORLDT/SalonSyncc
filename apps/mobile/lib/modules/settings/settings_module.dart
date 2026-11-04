import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/settings_api.dart';
import '../../models/role.dart';
import 'settings_screen.dart';

/// Salon settings (admin, no plan gate).
final settingsModule = FeatureModule(
  id: 'settings',
  roles: {Role.admin},
  title: 'Settings',
  icon: Icons.settings_outlined,
  order: 90,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return SettingsScreen(me: auth.me.value!, api: SettingsApi(auth.api), onSaved: () => auth.refreshMe().then((_) {}, onError: (_) {}));
  },
);
