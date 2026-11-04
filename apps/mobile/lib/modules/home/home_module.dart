import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/glass.dart';
import '../../core/format/fmt.dart';
import '../../data/report_api.dart';
import '../../data/sales_api.dart';
import '../../models/role.dart';
import '../sale/bill_screen.dart';
import '../sale/sale_sheet.dart';
import '../sale/share_buttons.dart';
import '../today/today_screen.dart';

/// Home: a barber's "Today" (totals, add a bill); the admin's home is Stage 1's until the dashboard (Stage 3).
final homeModule = FeatureModule(
  id: 'home',
  roles: {Role.admin, Role.barber},
  title: 'Today',
  icon: Icons.today_outlined,
  tab: true,
  order: 0,
  builder: (_) => Get.find<AuthController>().me.value!.role == Role.barber ? const BarberHome() : const HomeScreen(),
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

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final me = Get.find<AuthController>().me.value!;
    final t = Theme.of(context).textTheme;
    return RefreshIndicator(
      onRefresh: () => Get.find<AuthController>().refreshMe().then((_) {}, onError: (_) {}),
      child: ListView(padding: const EdgeInsets.all(20), children: [
        Text(me.salonName, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(me.today, style: SkText.mono.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 20),
        SkGlass(child: Text('Hi ${me.user.name}', style: t.titleLarge)),
      ]),
    );
  }
}
