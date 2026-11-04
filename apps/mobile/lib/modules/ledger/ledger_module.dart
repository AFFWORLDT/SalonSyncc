import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/ledger_api.dart';
import '../../models/role.dart';
import 'ledger_screen.dart';

/// Ledger and payouts (admin).
final ledgerModule = FeatureModule(
  id: 'ledger',
  featureKey: 'ledger',
  roles: {Role.admin},
  title: 'Ledger',
  icon: Icons.account_balance_outlined,
  order: 35,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return LedgerScreen(me: auth.me.value!, api: LedgerApi(auth.api));
  },
);
