import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../auth/auth_controller.dart';
import 'registry.dart';

/// Opens a module only while it is switched on for this user (a push or link can name one that isn't).
/// The server enforces every switch anyway; this keeps the screen clean.
class FeatureGate extends StatelessWidget {
  const FeatureGate({super.key, required this.registry, required this.id});
  final FeatureRegistry registry;
  final String id;

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();
    return Obx(() {
      final me = auth.me.value;
      final m = registry.byId(id);
      if (me != null && m != null && m.visibleFor(me)) return Scaffold(appBar: AppBar(title: Text(m.title)), body: m.builder(context));
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.lock_outline, size: 40, color: Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(height: 16),
              Text("This feature isn't on for your salon", textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 20),
              FilledButton(onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst), child: const Text('Back to home')),
            ]),
          ),
        ),
      );
    });
  }
}
