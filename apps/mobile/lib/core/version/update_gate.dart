import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';

import '../ui/background.dart';
import 'version_check.dart';

/// Below the minimum version: a full screen with no way past. Below the latest: a dismissible banner on top.
class UpdateGate extends StatelessWidget {
  const UpdateGate({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final u = Get.find<UpdateController>();
    return Obx(() {
      final n = u.need.value;
      if (n == UpdateNeed.required) return _UpdateScreen(storeUrl: u.config?.storeUrl);
      return Stack(children: [
        child,
        if (n == UpdateNeed.optional)
          Positioned(
            left: 12,
            right: 12,
            top: MediaQuery.paddingOf(context).top + 8,
            child: Material(
              elevation: 6,
              borderRadius: BorderRadius.circular(16),
              color: Theme.of(context).colorScheme.surface,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                child: Row(children: [
                  const Expanded(child: Text('A new version of SalonKit is available')),
                  TextButton(onPressed: u.dismiss, child: const Text('Not now')),
                  TextButton(onPressed: () => _open(u.config?.storeUrl), child: const Text('Update')),
                ]),
              ),
            ),
          ),
      ]);
    });
  }
}

Future<void> _open(String? url) async {
  if (url == null) return;
  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
}

class _UpdateScreen extends StatelessWidget {
  const _UpdateScreen({required this.storeUrl});
  final String? storeUrl;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SkBackground(
          child: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.system_update, size: 48),
                  const SizedBox(height: 16),
                  Text('Update SalonKit', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  const Text('This version is no longer supported. Update to keep using SalonKit.', textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: () => _open(storeUrl), child: const Text('Update')),
                ]),
              ),
            ),
          ),
        ),
      );
}
