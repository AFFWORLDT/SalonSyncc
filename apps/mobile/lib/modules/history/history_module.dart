import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/report_api.dart';
import '../../models/role.dart';
import 'history_screen.dart';

/// My history: the barber's months, day by day, with commission.
final historyModule = FeatureModule(
  id: 'history',
  featureKey: 'core_sales',
  roles: {Role.barber},
  title: 'My history',
  icon: Icons.insights_outlined,
  tab: true,
  order: 20,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return HistoryScreen(me: auth.me.value!, report: ReportApi(auth.api));
  },
);
