import 'package:flutter/material.dart';

import '../../core/theme/scale.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/motion.dart';
import '../../models/sale.dart';
import '../../models/settings.dart';
import 'bill_view.dart';

/// "Congrats! Bill generated": a success banner, the bill itself (as the customer gets it), sharing (when given),
/// and Done / New sale pinned at the bottom.
class SaleDone extends StatelessWidget {
  const SaleDone({super.key, required this.sale, required this.fmt, required this.settings, this.slug, this.onFillDetails, this.actions, required this.onDone, required this.onNew});
  final Sale sale;
  final Fmt fmt;
  final SalonSettings settings;
  final String? slug;
  final VoidCallback? onFillDetails;
  final Widget? actions;
  final VoidCallback onDone, onNew;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final success = skPalette(context).success;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 24), children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
            child: Row(children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0.5, end: 1),
                duration: skDuration(context, 420),
                curve: Curves.elasticOut,
                builder: (_, v, child) => Transform.scale(scale: v, child: child),
                child: CircleAvatar(radius: 22, backgroundColor: success, foregroundColor: Colors.white, child: Icon(Icons.check_rounded, size: 26)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Congrats! Bill generated', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Wrap(spacing: 6, children: [
                    Text(sale.billNo, style: SkText.mono.copyWith(fontSize: 12.5, color: cs.onSurfaceVariant)),
                    Text('· ${fmt.money(sale.amount)} · ${sale.payment == 'card' ? 'Card' : 'Cash'}', style: SkText.mono.copyWith(fontSize: 12.5, color: cs.onSurfaceVariant)),
                  ]),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          BillView(sale: sale, settings: settings, fmt: fmt, slug: slug, onFillDetails: onFillDetails),
          if (actions != null) ...[const SizedBox(height: 14), actions!],
        ]),
      ),
      // Always on screen, however tall the bill and sharing get.
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(children: [
            Expanded(
              child: OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)), onPressed: onDone, child: const Text('Done')),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)), onPressed: onNew, icon: const Icon(Icons.add_rounded), label: const Text('New sale')),
            ),
          ]),
        ),
      ),
    );
  }
}
