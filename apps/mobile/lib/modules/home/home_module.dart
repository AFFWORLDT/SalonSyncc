import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/format/fmt.dart';
import '../../data/report_api.dart';
import '../../data/sales_api.dart';
import '../../models/role.dart';
import '../sale/bill_screen.dart';
import '../sale/sale_sheet.dart';
import '../sale/share_buttons.dart';
import '../today/today_screen.dart';

/// A barber's home: "Today" (totals, add a bill). Admins get the dashboard instead.
final homeModule = FeatureModule(
  id: 'home',
  roles: {Role.barber},
  title: 'Today',
  icon: Icons.today_outlined,
  tab: true,
  order: 0,
  builder: (_) => const BarberHome(),
);

class BarberHome extends StatelessWidget {
  const BarberHome({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();
    final me = auth.me.value!;
    final sales = SalesApi(auth.api, me.fmt);
    return TodayScreen(
      me: me,
      sales: sales,
      report: ReportApi(auth.api),
      onRefreshMe: () => auth.refreshMe().then((_) {}),
      // A bill saved on a later business day than this screen's means the day has moved on: re-read it.
      onNewSale: () => openSaleSheet(context, me: me, sales: sales, doneActions: shareActionsFor).then((r) async {
            if (r?.sale != null && r!.sale!.day != me.today) await auth.refreshMe().then((_) {}, onError: (_) {});
          }),
      onOpenSale: (s) => openBill(context, me: me, sales: sales, sale: s),
    );
  }
}
