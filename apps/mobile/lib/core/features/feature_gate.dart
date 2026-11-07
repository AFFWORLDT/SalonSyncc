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
      if (me != null && m != null && m.visibleFor(me)) return ModulePage(title: m.title, child: m.builder(context));
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
              FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst), child: const Text('Back to home')),
            ]),
          ),
        ),
      );
    });
  }
}

/// A screen opened on top of the tabs. The screen's own heading is the big title; the app bar shows the title only
/// once that heading has scrolled away (so it is never on screen twice).
class ModulePage extends StatefulWidget {
  const ModulePage({super.key, required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  State<ModulePage> createState() => _ModulePageState();
}

class _ModulePageState extends State<ModulePage> {
  bool _scrolled = false;

  bool _onScroll(ScrollNotification n) {
    if (n.depth == 0 && n.metrics.axis == Axis.vertical) {
      final s = n.metrics.pixels > 44;
      if (s != _scrolled) setState(() => _scrolled = s);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          scrolledUnderElevation: 0,
          title: AnimatedSwitcher(
            duration: const Duration(milliseconds: 150),
            child: _scrolled ? Text(widget.title, key: const ValueKey('bar-title')) : const SizedBox.shrink(),
          ),
        ),
        body: NotificationListener<ScrollNotification>(onNotification: _onScroll, child: widget.child),
      );
}
