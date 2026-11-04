import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/theme/theme_controller.dart';
import '../../models/role.dart';

/// My account: appearance, sign out, switch salon. (Stage 1 Task 14 adds the biometric lock toggle.)
final accountModule = FeatureModule(
  id: 'account',
  roles: {Role.admin, Role.barber},
  title: 'My account',
  icon: Icons.person_outline,
  order: 1000,
  builder: (_) => const AccountScreen(),
);

/// Extra rows other parts of the app add (the biometric toggle), so this screen needn't know them.
final accountExtras = <WidgetBuilder>[];

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();
    final theme = Get.find<ThemeController>();
    final me = auth.me.value!;
    return ListView(padding: const EdgeInsets.symmetric(vertical: 12), children: [
      ListTile(title: Text(me.user.name), subtitle: Text('${me.user.username} · ${me.salonName}')),
      const Divider(),
      Obx(() => ListTile(
            leading: const Icon(Icons.brightness_6_outlined),
            title: const Text('Appearance'),
            trailing: DropdownButton<ThemeMode>(
              value: theme.mode.value,
              underline: const SizedBox(),
              onChanged: (m) => m == null ? null : theme.setMode(m),
              items: const [
                DropdownMenuItem(value: ThemeMode.system, child: Text('Like my phone')),
                DropdownMenuItem(value: ThemeMode.light, child: Text('Light')),
                DropdownMenuItem(value: ThemeMode.dark, child: Text('Dark')),
              ],
            ),
          )),
      for (final b in accountExtras) b(context),
      const Divider(),
      ListTile(leading: const Icon(Icons.logout), title: const Text('Sign out'), onTap: () => auth.signOut()),
      ListTile(leading: const Icon(Icons.swap_horiz), title: const Text('Switch salon'), onTap: () => auth.switchSalon()),
    ]);
  }
}
