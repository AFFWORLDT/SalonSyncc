import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/auth/auth_controller.dart';
import '../core/auth/lock_controller.dart';
import 'lock_screen.dart';

/// Covers the signed-in app with the lock screen while locked, and tracks time in the background for re-locking.
class LockGate extends StatefulWidget {
  const LockGate({super.key, required this.child});
  final Widget child;
  @override
  State<LockGate> createState() => _LockGateState();
}

class _LockGateState extends State<LockGate> with WidgetsBindingObserver {
  final lock = Get.find<LockController>();
  final auth = Get.find<AuthController>();
  late final Worker _w;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Leaving the signed-in app (sign out, 401) ends any lock: the next password sign-in needs no unlock.
    _w = ever<AuthState>(auth.state, (s) => s == AuthState.signedIn ? null : lock.clear());
  }

  @override
  void dispose() {
    _w.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.paused) lock.onPaused(DateTime.now());
    if (s == AppLifecycleState.resumed) lock.onResumed(DateTime.now());
  }

  @override
  Widget build(BuildContext context) => Obx(() => Stack(children: [
        widget.child,
        if (auth.state.value == AuthState.signedIn && lock.locked.value) const Positioned.fill(child: LockScreen()),
      ]));
}

/// After the first password sign-in on a phone that has biometrics: a one-time "Unlock faster next time?" sheet.
Future<void> offerBiometricLock(BuildContext context) async {
  final lock = Get.find<LockController>();
  if (!await lock.shouldOffer()) return;
  await lock.markAsked();
  if (!context.mounted) return;
  final yes = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Icon(Icons.fingerprint, size: 44),
          const SizedBox(height: 12),
          Text('Unlock faster next time?', textAlign: TextAlign.center, style: Theme.of(c).textTheme.titleLarge),
          const SizedBox(height: 8),
          const Text('Use Face ID or your fingerprint to open SalonKit. You can change this in My account.', textAlign: TextAlign.center),
          const SizedBox(height: 20),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Turn on')),
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Not now')),
        ]),
      ),
    ),
  );
  if (yes == true) await lock.enable();
}
