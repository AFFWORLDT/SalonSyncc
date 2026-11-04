import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/format/fmt.dart';
import '../../data/customers_api.dart';
import '../../data/sales_api.dart';
import '../../models/role.dart';
import '../sale/bill_screen.dart';
import 'customers_screen.dart';

/// Customers and their visit history (admin).
final customersModule = FeatureModule(
  id: 'customers',
  featureKey: 'customers_crm',
  roles: {Role.admin},
  title: 'Customers',
  icon: Icons.people_outline_rounded,
  order: 45,
  builder: (context) {
    final auth = Get.find<AuthController>();
    final me = auth.me.value!;
    final api = CustomersApi(auth.api);
    final sales = SalesApi(auth.api, me.fmt);
    return CustomersScreen(
      me: me,
      api: api,
      onOpen: (c) => Navigator.of(context).push<void>(MaterialPageRoute(
        builder: (_) => CustomerProfile(me: me, api: api, id: c.id, onOpenSale: (s) => openBill(context, me: me, sales: sales, sale: s)),
      )),
    );
  },
);
