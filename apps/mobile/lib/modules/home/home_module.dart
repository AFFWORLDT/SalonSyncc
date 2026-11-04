import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/glass.dart';
import '../../models/role.dart';

/// Stage 1 home: who and where. Stage 2 turns it into the barber's "Today" (add a bill, totals).
final homeModule = FeatureModule(
  id: 'home',
  roles: {Role.admin, Role.barber},
  title: 'Today',
  icon: Icons.home_outlined,
  tab: true,
  order: 0,
  builder: (_) => const HomeScreen(),
);

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
