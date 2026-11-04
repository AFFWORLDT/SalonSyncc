import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/auth/auth_controller.dart';
import '../core/auth/lock_controller.dart';
import '../core/ui/background.dart';
import '../core/ui/salon_logo.dart';

/// Covers the app until the fingerprint / Face ID check passes. Asks once on its own when shown.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key});
  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  final lock = Get.find<LockController>();
  final auth = Get.find<AuthController>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => lock.unlock());
  }

  @override
  Widget build(BuildContext context) {
    final s = auth.salon.value;
    return Scaffold(
      body: SkBackground(
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                if (s != null) SalonLogo(slug: s.slug, name: s.name, logoUrl: s.logoUrl, size: 80),
                const SizedBox(height: 16),
                Text(s?.name ?? 'SalonKit', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 28),
                FilledButton.icon(onPressed: lock.unlock, icon: const Icon(Icons.fingerprint), label: const Text('Unlock')),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () async {
                    lock.clear();
                    await auth.signOut();
                  },
                  child: const Text('Sign out'),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
