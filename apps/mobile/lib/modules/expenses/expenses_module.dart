import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/expenses_api.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import 'expenses_screen.dart';

/// Barber and company expenses (admin).
final expensesModule = FeatureModule(
  id: 'expenses',
  featureKey: 'expenses',
  roles: {Role.admin},
  title: 'Expenses',
  icon: Icons.account_balance_wallet_outlined,
  order: 50,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return ExpensesScreen(me: auth.me.value!, api: ExpensesApi(auth.api), staff: StaffApi(auth.api));
  },
);
